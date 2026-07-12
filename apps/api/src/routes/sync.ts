import { AuthorizationError, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import { IdempotencyKeyHeader, SyncPullResponse, SyncPushBody, SyncPushResponse, type SyncPushBody as SyncPushInput } from '@voiceforge/contracts';
import { VersionConflictError, type JobRepository, type SyncRepository } from '@voiceforge/database';
import { decodeCursor, encodeCursor } from '@voiceforge/sync';
import type { FastifyInstance } from 'fastify';
import { identityFor, type TenancyStore } from './tenancy.js';

export async function registerSyncRoutes(app: FastifyInstance, dependencies: {
  verifier: TokenVerifier;
  tenancy: TenancyStore;
  jobs: Pick<JobRepository, 'create' | 'update' | 'delete'>;
  sync: Pick<SyncRepository, 'pull'>;
  cursorSecret: string;
}) {
  app.get<{ Querystring: { workspaceId: string; cursor?: string }; Reply: { cursor: string; hasMore: boolean; changes: Awaited<ReturnType<SyncRepository['pull']>>['changes'] } }>('/v1/sync/pull', {
    schema: {
      operationId: 'pullSyncChanges', tags: ['sync'],
      querystring: { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' }, cursor: { type: 'string' } } },
      response: { 200: SyncPullResponse },
    },
  }, async (request) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, request.query.workspaceId);
    if (!access) throw new AuthorizationError('audit:read');
    const after = decodeCursor(request.query.cursor, access.id, dependencies.cursorSecret);
    const page = await dependencies.sync.pull(access.id, after);
    const last = page.changes.at(-1)?.sequence ?? after;
    return { ...page, cursor: encodeCursor(access.id, last, dependencies.cursorSecret) };
  });

  app.post<{ Headers: { 'idempotency-key': string }; Body: SyncPushInput }>('/v1/sync/push', {
    schema: {
      operationId: 'pushSyncMutations', tags: ['sync'], headers: IdempotencyKeyHeader, body: SyncPushBody,
      response: { 200: SyncPushResponse },
    },
  }, async (request) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, request.body.workspaceId);
    if (!access) throw new AuthorizationError('job:manage');
    requirePermission(access.role, 'job:manage', access.kind);
    const results = [];
    for (const mutation of request.body.mutations) {
      try {
        let result: { version: number };
        if (mutation.operation === 'create') {
          const name = mutation.payload.name;
          if (typeof name !== 'string' || !name.trim()) throw new Error('Job name is required.');
          result = await dependencies.jobs.create({
            workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: mutation.mutationId,
            id: mutation.entityId, name,
            ...(typeof mutation.payload.description === 'string' ? { description: mutation.payload.description } : {}),
            ...(typeof mutation.payload.address === 'string' ? { address: mutation.payload.address } : {}),
          });
        } else if (mutation.operation === 'update') {
          const allowed = mutation.payload as { name?: unknown; description?: unknown; address?: unknown; status?: unknown };
          result = await dependencies.jobs.update({
            workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: mutation.mutationId,
            id: mutation.entityId, baseVersion: mutation.baseVersion,
            changes: {
              ...(typeof allowed.name === 'string' ? { name: allowed.name } : {}),
              ...(typeof allowed.description === 'string' || allowed.description === null ? { description: allowed.description } : {}),
              ...(typeof allowed.address === 'string' || allowed.address === null ? { address: allowed.address } : {}),
              ...(typeof allowed.status === 'string' ? { status: allowed.status } : {}),
            },
          });
        } else {
          result = await dependencies.jobs.delete({
            workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: mutation.mutationId,
            id: mutation.entityId, baseVersion: mutation.baseVersion,
          });
        }
        results.push({ mutationId: mutation.mutationId, entityId: mutation.entityId, status: 'applied' as const, version: result.version });
      } catch (error) {
        if (!(error instanceof VersionConflictError)) throw error;
        results.push({ mutationId: mutation.mutationId, entityId: mutation.entityId, status: 'conflict' as const, errorCode: 'VERSION_CONFLICT' });
      }
    }
    return { results };
  });
}
