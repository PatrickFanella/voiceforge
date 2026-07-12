import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AuthenticationError, AuthorizationError, type TokenVerifier } from '@voiceforge/auth';
import { HealthResponse } from '@voiceforge/contracts';
import { EntityNotFoundError, IdempotencyConflictError, VersionConflictError, type JobRepository, type TenancyRepository } from '@voiceforge/database';
import Fastify from 'fastify';
import { registerTenancyRoutes } from './routes/tenancy.js';
import { registerJobRoutes } from './routes/jobs.js';

export interface AppDependencies {
  verifier: TokenVerifier;
  tenancy: Pick<TenancyRepository, 'bootstrapIdentity' | 'createTeam' | 'getAccess' | 'createInvitation' | 'acceptInvitation'>;
  jobs?: Pick<JobRepository, 'list' | 'create' | 'update' | 'delete'>;
}

export async function buildApp(dependencies?: AppDependencies) {
  const app = Fastify({ logger: false, genReqId: () => `req_${crypto.randomUUID()}` })
    .withTypeProvider<TypeBoxTypeProvider>();

  await app.register(swagger, {
    openapi: {
      info: { title: 'VoiceForge API', version: '0.1.0' },
      servers: [{ url: '/' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  app.get('/v1/health', {
    schema: {
      operationId: 'getHealth',
      tags: ['operations'],
      response: { 200: HealthResponse },
    },
  }, async () => ({
    status: 'ok' as const,
    service: 'voiceforge-api' as const,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  if (dependencies) {
    await registerTenancyRoutes(app, { verifier: dependencies.verifier, store: dependencies.tenancy });
    if (dependencies.jobs) await registerJobRoutes(app, { verifier: dependencies.verifier, tenancy: dependencies.tenancy, jobs: dependencies.jobs });
  }

  app.setNotFoundHandler((request, reply) => reply.code(404).send({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      requestId: request.id,
      details: {},
    },
  }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    if (error instanceof AuthenticationError) return reply.code(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.', requestId: request.id, details: {} },
    });
    if (error instanceof AuthorizationError) return reply.code(403).send({
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.', requestId: request.id, details: {} },
    });
    if (error instanceof EntityNotFoundError) return reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', requestId: request.id, details: {} },
    });
    if (error instanceof VersionConflictError) return reply.code(409).send({
      error: { code: 'VERSION_CONFLICT', message: 'The record changed on another device.', requestId: request.id, details: {} },
    });
    if (error instanceof IdempotencyConflictError) return reply.code(409).send({
      error: { code: 'IDEMPOTENCY_CONFLICT', message: 'The idempotency key conflicts with another request.', requestId: request.id, details: {} },
    });
    const candidateStatus = error instanceof Error && 'statusCode' in error
      ? Number(error.statusCode)
      : 500;
    const status = candidateStatus >= 400 && candidateStatus < 500 ? candidateStatus : 500;
    return reply.code(status).send({
      error: {
        code: status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: status === 500
          ? 'An unexpected error occurred.'
          : error instanceof Error ? error.message : 'The request was invalid.',
        requestId: request.id,
        details: {},
      },
    });
  });

  return app;
}
