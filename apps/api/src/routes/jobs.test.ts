import type { TokenVerifier } from '@voiceforge/auth';
import type { JobRecord, WorkspaceAccess } from '@voiceforge/database';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = '01980f58-9b8d-7000-8000-000000000011';
const workspaceId = '01980f58-9b8d-7000-8000-000000000012';
const jobId = '01980f58-9b8d-7000-8000-000000000013';
const headers = { authorization: 'Bearer valid', 'idempotency-key': 'job-mutation-key-0001' };
const verifier: TokenVerifier = { verify: async () => ({ subject: 'auth0|owner', email: 'owner@example.com', emailVerified: true }) };

function dependencies(role: WorkspaceAccess['role'] = 'owner') {
  const access: WorkspaceAccess = { id: workspaceId, kind: 'team', name: 'Crew', timeZone: 'UTC', role };
  const record: JobRecord = {
    id: jobId, workspaceId, name: 'Job', description: null, address: null, status: 'active', version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  return {
    verifier,
    tenancy: {
      bootstrapIdentity: vi.fn(async () => ({ user: { id: userId, displayName: null, primaryEmail: 'owner@example.com' }, personalWorkspaceId: workspaceId, workspaces: [access] })),
      getAccess: vi.fn(async (_userId: string, id: string) => id === workspaceId ? access : null),
      createTeam: vi.fn(), createInvitation: vi.fn(), acceptInvitation: vi.fn(),
      listMembers: vi.fn(async () => []), listInvitations: vi.fn(async () => []), updateMemberRole: vi.fn(), removeMember: vi.fn(),
    },
    jobs: {
      listMembers: vi.fn(async () => []), assignMember: vi.fn(async () => ({ workspaceId, jobId, userId, assignedBy: userId, createdAt: new Date(), updatedAt: new Date() })), removeMember: vi.fn(async () => undefined),
      list: vi.fn(async () => [record]), create: vi.fn(async () => record), update: vi.fn(async () => ({ ...record, version: 2 })),
      delete: vi.fn(async () => ({ id: jobId, version: 2 })),
    },
  };
}

describe('job routes', () => {
  it('creates a job only through authorized workspace access', async () => {
    const deps = dependencies();
    const app = await buildApp(deps);
    const response = await app.inject({
      method: 'POST', url: `/v1/workspaces/${workspaceId}/jobs`, headers,
      payload: { id: jobId, name: 'Job' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: jobId, workspaceId, version: 1 });
    expect(deps.jobs.create).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: userId, idempotencyKey: headers['idempotency-key'] }));
    await app.close();
  });

  it('denies worker mutation and cross-workspace reads', async () => {
    const deps = dependencies('worker');
    const app = await buildApp(deps);
    const mutation = await app.inject({
      method: 'POST', url: `/v1/workspaces/${workspaceId}/jobs`, headers,
      payload: { id: jobId, name: 'Job' },
    });
    const foreign = await app.inject({ method: 'GET', url: '/v1/workspaces/01980f58-9b8d-7000-8000-000000000099/jobs', headers });
    expect(mutation.statusCode).toBe(403);
    expect(foreign.statusCode).toBe(403);
    expect(deps.jobs.create).not.toHaveBeenCalled();
    expect(deps.jobs.list).not.toHaveBeenCalled();
    await app.close();
  });

  it('manages job crews only through authorized team membership', async () => {
    const deps = dependencies('supervisor');
    const app = await buildApp(deps);
    const assigned = await app.inject({ method: 'PUT', url: `/v1/workspaces/${workspaceId}/jobs/${jobId}/members/${userId}`, headers });
    const listed = await app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/jobs/${jobId}/members`, headers });
    const removed = await app.inject({ method: 'DELETE', url: `/v1/workspaces/${workspaceId}/jobs/${jobId}/members/${userId}`, headers });
    expect(assigned.statusCode).toBe(200);
    expect(listed.statusCode).toBe(200);
    expect(removed.statusCode).toBe(204);
    expect(deps.jobs.assignMember).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, jobId, userId, actorUserId: userId }));
    expect(deps.jobs.removeMember).toHaveBeenCalledWith({ workspaceId, jobId, userId });
    await app.close();
  });
});
