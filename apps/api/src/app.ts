import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { HealthResponse } from '@voiceforge/contracts';
import Fastify from 'fastify';

export async function buildApp() {
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
