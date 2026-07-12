import type { TokenVerifier } from '@voiceforge/auth';
import { VersionConflictError, type WorkspaceAccess } from '@voiceforge/database';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = '01980f58-9b8d-7000-8000-000000000041';
const workspaceId = '01980f58-9b8d-7000-8000-000000000042';
const entityId = '01980f58-9b8d-7000-8000-000000000043';
const mutationId = '01980f58-9b8d-7000-8000-000000000044';
const access: WorkspaceAccess = { id: workspaceId, kind: 'team', name: 'Crew', timeZone: 'UTC', role: 'owner' };
const verifier: TokenVerifier = { verify: async () => ({ subject: 'auth0|owner', email: 'owner@example.com', emailVerified: true }) };

function dependencies() {
  return {
    verifier,
    tenancy: {
      bootstrapIdentity: vi.fn(async () => ({ user: { id: userId, displayName: null, primaryEmail: 'owner@example.com' }, personalWorkspaceId: workspaceId, workspaces: [access] })),
      getAccess: vi.fn(async () => access), createTeam: vi.fn(), createInvitation: vi.fn(), acceptInvitation: vi.fn(),
    },
    jobs: {
      list: vi.fn(async () => []), create: vi.fn(),
      update: vi.fn(async () => { throw new VersionConflictError('stale'); }), delete: vi.fn(),
    },
    sync: { pull: vi.fn(async (_workspaceId: string, after: number) => ({
      changes: after ? [] : [{ sequence: 1, entityType: 'job', entityId, operation: 'upsert' as const, version: 1, payload: { id: entityId, version: 1 } }],
      hasMore: false,
    })) },
    cursorSecret: 'test-cursor-secret-at-least-32-bytes',
  };
}

describe('sync routes', () => {
  it('returns workspace-bound signed cursors and rejects tampering', async () => {
    const app = await buildApp(dependencies());
    const first = await app.inject({ method: 'GET', url: `/v1/sync/pull?workspaceId=${workspaceId}`, headers: { authorization: 'Bearer valid' } });
    expect(first.statusCode).toBe(200);
    expect(first.json().changes).toHaveLength(1);
    const cursor = first.json().cursor as string;
    const second = await app.inject({ method: 'GET', url: `/v1/sync/pull?workspaceId=${workspaceId}&cursor=${encodeURIComponent(`${cursor}x`)}`, headers: { authorization: 'Bearer valid' } });
    expect(second.statusCode).toBe(400);
    expect(second.json().error.code).toBe('BAD_REQUEST');
    await app.close();
  });

  it('reports stale mutations as explicit conflicts without aborting the batch contract', async () => {
    const app = await buildApp(dependencies());
    const response = await app.inject({
      method: 'POST', url: '/v1/sync/push',
      headers: { authorization: 'Bearer valid', 'idempotency-key': mutationId },
      payload: {
        workspaceId, deviceId: '01980f58-9b8d-7000-8000-000000000045',
        mutations: [{ mutationId, entityType: 'job', entityId, operation: 'update', baseVersion: 1, payload: { name: 'stale' } }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [{ mutationId, entityId, status: 'conflict', errorCode: 'VERSION_CONFLICT' }] });
    await app.close();
  });
});
