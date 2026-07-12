import type { TokenVerifier } from '@voiceforge/auth';
import type { TimeEntryRecord, WorkspaceAccess } from '@voiceforge/database';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = '01980f58-9b8d-7000-8000-000000000061';
const workspaceId = '01980f58-9b8d-7000-8000-000000000062';
const jobId = '01980f58-9b8d-7000-8000-000000000063';
const entryId = '01980f58-9b8d-7000-8000-000000000064';
const verifier: TokenVerifier = { verify: async () => ({ subject: 'auth0|time', email: 'time@example.com', emailVerified: true }) };
const headers = { authorization: 'Bearer valid', 'idempotency-key': 'time-mutation-key-01' };

function fixture(role: WorkspaceAccess['role'] = 'worker', kind: WorkspaceAccess['kind'] = 'team') {
  const access: WorkspaceAccess = { id: workspaceId, kind, name: 'Crew', timeZone: 'UTC', role };
  const record: TimeEntryRecord = {
    id: entryId, workspaceId, workerUserId: userId, jobId, clockSessionId: null, status: 'draft', version: 1,
    revisionNumber: 1, startedAt: new Date('2026-01-01T08:00:00Z'), endedAt: new Date('2026-01-01T09:00:00Z'),
    totalMinutes: 60, entryType: 'regular', notes: '', correctionReason: null, submittedAt: null, approvedAt: null,
    createdAt: new Date('2026-01-01T09:00:00Z'), updatedAt: new Date('2026-01-01T09:00:00Z'),
  };
  const time = {
    startClock: vi.fn(), stopClock: vi.fn(), createDraft: vi.fn(async () => record), editDraft: vi.fn(async () => ({ ...record, version: 2 })),
    submit: vi.fn(async (input: { requiresApproval: boolean }) => ({ ...record, status: input.requiresApproval ? 'submitted' as const : 'approved' as const, version: 2 })),
    decide: vi.fn(async (input: { decision: TimeEntryRecord['status'] }) => ({ ...record, status: input.decision, version: 3 })),
    correct: vi.fn(async () => ({ ...record, revisionNumber: 2, version: 4 })),
    listApprovalQueue: vi.fn(async () => [{ ...record, status: 'submitted' as const }]),
    history: vi.fn(async () => ({
      entry: {
        id: entryId, workspaceId, workerUserId: userId, jobId, clockSessionId: null, status: 'approved' as const,
        currentRevisionNumber: 1, submittedAt: record.updatedAt, approvedAt: record.updatedAt, version: 2,
        createdBy: userId, updatedBy: userId, deletedAt: null, createdAt: record.createdAt, updatedAt: record.updatedAt,
      },
      revisions: [{ timeEntryId: entryId, revisionNumber: 1, startedAt: record.startedAt, endedAt: record.endedAt, totalMinutes: 60, entryType: 'regular', notes: 'Worked', correctionReason: null, createdBy: userId, createdAt: record.createdAt }],
      approvals: [{ id: crypto.randomUUID(), workspaceId, timeEntryId: entryId, revisionNumber: 1, decision: 'approved' as const, decidedBy: userId, reason: null, decidedAt: record.updatedAt, createdAt: record.createdAt, updatedAt: record.updatedAt }],
    })),
  };
  return {
    verifier,
    tenancy: {
      bootstrapIdentity: vi.fn(async () => ({ user: { id: userId, displayName: null, primaryEmail: 'time@example.com' }, personalWorkspaceId: workspaceId, workspaces: [access] })),
      getAccess: vi.fn(async () => access), createTeam: vi.fn(), createInvitation: vi.fn(), acceptInvitation: vi.fn(),
    }, time,
  };
}

describe('time workflow routes', () => {
  it('derives team approval versus personal finalization from server workspace kind', async () => {
    for (const [kind, expected] of [['team', true], ['personal', false]] as const) {
      const deps = fixture(kind === 'team' ? 'worker' : 'owner', kind);
      const app = await buildApp(deps);
      const response = await app.inject({ method: 'POST', url: `/v1/time-entries/${entryId}/submit`, headers, payload: { workspaceId } });
      expect(response.statusCode).toBe(200);
      expect(deps.time.submit).toHaveBeenCalledWith(expect.objectContaining({ requiresApproval: expected }));
      await app.close();
    }
  });

  it('allows supervisors to decide team entries but denies workers and personal workspaces', async () => {
    for (const [role, kind, expected] of [['supervisor', 'team', 200], ['worker', 'team', 403], ['owner', 'personal', 403]] as const) {
      const deps = fixture(role, kind);
      const app = await buildApp(deps);
      const response = await app.inject({
        method: 'POST', url: `/v1/time-approvals/${entryId}`, headers,
        payload: { workspaceId, decision: 'approved' },
      });
      expect(response.statusCode).toBe(expected);
      await app.close();
    }
  });

  it('exports revision and approval history as quoted CSV', async () => {
    const deps = fixture('supervisor');
    const app = await buildApp(deps);
    const response = await app.inject({
      method: 'GET', url: `/v1/time-entries/${entryId}/history?workspaceId=${workspaceId}&format=csv`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body).toContain('record_type,revision_number');
    expect(response.body).toContain('"approval"');
    await app.close();
  });
});
