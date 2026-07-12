import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AuthenticationError, AuthorizationError, type TokenVerifier } from '@voiceforge/auth';
import { HealthResponse } from '@voiceforge/contracts';
import { EntityNotFoundError, IdempotencyConflictError, VersionConflictError, type JobRepository, type SyncRepository, type TenancyRepository } from '@voiceforge/database';
import { InvalidCursorError } from '@voiceforge/sync';
import Fastify from 'fastify';
import { registerTenancyRoutes } from './routes/tenancy.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerSyncRoutes } from './routes/sync.js';
import { AudioUploadValidationError, type S3AudioStorage } from './services/audio-storage.js';
import { registerTranscriptionRoutes, type TranscriptionQueue } from './routes/transcription.js';
import { TranscriptionInputError, type TranscriptionRepository } from '@voiceforge/database';
import type { TimeRepository } from '@voiceforge/database';
import { TimeWorkflowError } from '@voiceforge/workflows';
import { registerTimeRoutes } from './routes/time.js';
import { SafetyWorkflowError } from '@voiceforge/workflows';
import type { SafetyRepository } from '@voiceforge/database';
import { registerSafetyRoutes, type SafetyQueue } from './routes/safety.js';
import rawBody from 'fastify-raw-body';
import { registerBillingRoutes, type StripeGateway } from './routes/billing.js';
import type { BillingRepository } from '@voiceforge/database';

export interface AppDependencies {
  verifier: TokenVerifier;
  tenancy: Pick<TenancyRepository, 'bootstrapIdentity' | 'createTeam' | 'getAccess' | 'createInvitation' | 'acceptInvitation' | 'listMembers' | 'listInvitations' | 'updateMemberRole' | 'removeMember'>;
  jobs?: Pick<JobRepository, 'list' | 'create' | 'update' | 'delete' | 'listMembers' | 'assignMember' | 'removeMember'>;
  sync?: Pick<SyncRepository, 'pull'>;
  cursorSecret?: string;
  transcription?: {
    repository: Pick<TranscriptionRepository, 'createAudioObject' | 'getAudioObject' | 'createJob' | 'getJob' | 'getWork' | 'reviewTranscript'>;
    storage: Pick<S3AudioStorage, 'signUpload' | 'requiredUploadHeaders' | 'verifyUpload'>;
    queue: TranscriptionQueue;
  };
  time?: Pick<TimeRepository, 'startClock' | 'stopClock' | 'createDraft' | 'editDraft' | 'submit' | 'decide' | 'correct' | 'listApprovalQueue' | 'history'>;
  safety?: {
    repository: Pick<SafetyRepository, 'registerPushToken' | 'configurePolicy' | 'configureContacts' | 'createDraft' | 'submit' | 'acknowledge' | 'transition' | 'correct' | 'assign' | 'silence' | 'listTriage' | 'listDeliveries'>;
    queue: SafetyQueue;
  };
  billing?: { repository: Pick<BillingRepository, 'get' | 'saveCustomer' | 'findCustomer' | 'setPendingSeatQuantity' | 'reconcile'>; stripe: StripeGateway };
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
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true });

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
    const billing = dependencies.billing;
    if (billing) app.addHook('preHandler', async (request) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || request.url.startsWith('/v1/billing/') || request.url === '/v1/auth/bootstrap' || request.url === '/v1/workspaces' || request.url === '/v1/invitations/accept') return;
      const params = request.params as { workspaceId?: string }; const body = request.body as { workspaceId?: string } | undefined; const workspaceId = params.workspaceId ?? body?.workspaceId;
      if (!workspaceId) return;
      const header = request.headers.authorization; if (!header?.startsWith('Bearer ')) return;
      const claims = await dependencies.verifier.verify(header.slice(7));
      const bootstrap = await dependencies.tenancy.bootstrapIdentity({ subject: claims.subject, ...(claims.email ? { email: claims.email } : {}) });
      const access = await dependencies.tenancy.getAccess(bootstrap.user.id, workspaceId); if (!access || access.kind !== 'team') return;
      const state = await billing.repository.get(workspaceId);
      if (!state.entitlement.mutationEnabled) throw new AuthorizationError('workspace:manage');
    });
    await registerTenancyRoutes(app, { verifier: dependencies.verifier, store: dependencies.tenancy });
    if (dependencies.jobs) await registerJobRoutes(app, { verifier: dependencies.verifier, tenancy: dependencies.tenancy, jobs: dependencies.jobs });
    if (dependencies.jobs && dependencies.sync && dependencies.cursorSecret) await registerSyncRoutes(app, {
      verifier: dependencies.verifier, tenancy: dependencies.tenancy, jobs: dependencies.jobs,
      sync: dependencies.sync, cursorSecret: dependencies.cursorSecret,
      ...(dependencies.time ? { time: dependencies.time } : {}),
      ...(dependencies.safety ? { safety: dependencies.safety.repository } : {}),
    });
    if (dependencies.transcription) await registerTranscriptionRoutes(app, {
      verifier: dependencies.verifier, tenancy: dependencies.tenancy, ...dependencies.transcription,
    });
    if (dependencies.time) await registerTimeRoutes(app, { verifier: dependencies.verifier, tenancy: dependencies.tenancy, repository: dependencies.time });
    if (dependencies.safety) await registerSafetyRoutes(app, { verifier: dependencies.verifier, tenancy: dependencies.tenancy, ...dependencies.safety });
    if (dependencies.billing) await registerBillingRoutes(app, { verifier: dependencies.verifier, tenancy: dependencies.tenancy, ...dependencies.billing });
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
    if (error instanceof InvalidCursorError) return reply.code(400).send({
      error: { code: 'BAD_REQUEST', message: 'The synchronization cursor is invalid.', requestId: request.id, details: {} },
    });
    if (error instanceof AudioUploadValidationError) return reply.code(400).send({
      error: { code: 'BAD_REQUEST', message: error.message, requestId: request.id, details: {} },
    });
    if (error instanceof TranscriptionInputError) return reply.code(409).send({
      error: { code: 'VERSION_CONFLICT', message: 'The audio upload is unavailable or already used.', requestId: request.id, details: {} },
    });
    if (error instanceof TimeWorkflowError) return reply.code(409).send({
      error: { code: 'VERSION_CONFLICT', message: error.message, requestId: request.id, details: {} },
    });
    if (error instanceof SafetyWorkflowError) return reply.code(409).send({
      error: { code: 'VERSION_CONFLICT', message: error.message, requestId: request.id, details: {} },
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
