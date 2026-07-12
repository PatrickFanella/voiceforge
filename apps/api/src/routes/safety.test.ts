import type { TokenVerifier } from '@voiceforge/auth';
import type { SafetyRecord, WorkspaceAccess } from '@voiceforge/database';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = '01980f58-9b8d-7000-8000-000000000071';
const workspaceId = '01980f58-9b8d-7000-8000-000000000072';
const jobId = '01980f58-9b8d-7000-8000-000000000073';
const reportId = '01980f58-9b8d-7000-8000-000000000074';
const verifier: TokenVerifier = { verify: async () => ({ subject: 'auth0|safety', email: 'safety@example.com', emailVerified: true }) };
const headers = { authorization: 'Bearer valid', 'idempotency-key': 'safety-mutation-key1' };

function fixture(role: WorkspaceAccess['role'] = 'worker') {
  const access: WorkspaceAccess = { id: workspaceId, kind: 'team', name: 'Crew', timeZone: 'UTC', role };
  const due = new Date('2026-01-01T00:00:00Z');
  const record: SafetyRecord = {
    id: reportId, workspaceId, reporterUserId: userId, jobId, status: 'draft', severity: 'critical', version: 1,
    revisionNumber: 1, reportType: 'hazard', description: 'Energized conductor', location: null,
    occurredAt: due, correctionReason: null, submittedAt: null, acknowledgementDueAt: null, acknowledgedAt: null,
    escalationLevel: 0, nextEscalationAt: null, escalationSilencedAt: null, escalationSilenceReason: null,
    createdAt: due, updatedAt: due,
  };
  const repository = {
    registerPushToken: vi.fn(), configurePolicy: vi.fn(), configureContacts: vi.fn(), createDraft: vi.fn(async () => record),
    submit: vi.fn(async () => ({ ...record, status: 'submitted' as const, submittedAt: due, acknowledgementDueAt: new Date(due.getTime() + 900_000), nextEscalationAt: due, version: 2 })),
    acknowledge: vi.fn(async () => ({ ...record, status: 'acknowledged' as const, acknowledgedAt: due, version: 3 })),
    transition: vi.fn(async (input: { status: SafetyRecord['status'] }) => ({ ...record, status: input.status, version: 4 })),
    correct: vi.fn(async () => ({ ...record, revisionNumber: 2, version: 3 })), assign: vi.fn(async () => record),
    silence: vi.fn(async () => ({ ...record, escalationSilencedAt: due, escalationSilenceReason: 'False alarm', version: 3 })),
    listTriage: vi.fn(async () => [record]), listDeliveries: vi.fn(async () => []),
  };
  const queue = { enqueue: vi.fn() };
  return {
    verifier,
    tenancy: {
      bootstrapIdentity: vi.fn(async () => ({ user: { id: userId, displayName: null, primaryEmail: 'safety@example.com' }, personalWorkspaceId: workspaceId, workspaces: [access] })),
      getAccess: vi.fn(async () => access), createTeam: vi.fn(), createInvitation: vi.fn(), acceptInvitation: vi.fn(),
    },
    safety: { repository, queue },
  };
}

describe('safety triage routes', () => {
  it('queues critical escalation immediately after durable submission', async () => {
    const deps = fixture('worker');
    const app = await buildApp(deps);
    const created = await app.inject({
      method: 'POST', url: '/v1/safety-reports', headers,
      payload: { workspaceId, id: reportId, jobId, severity: 'critical', reportType: 'hazard', description: 'Energized conductor', occurredAt: '2026-01-01T00:00:00Z' },
    });
    expect(created.statusCode).toBe(201);
    const submitted = await app.inject({ method: 'POST', url: `/v1/safety-reports/${reportId}/submit`, headers, payload: { workspaceId } });
    expect(submitted.statusCode).toBe(200);
    expect(deps.safety.queue.enqueue).toHaveBeenCalledWith(reportId, new Date('2026-01-01T00:00:00Z'));
    await app.close();
  });

  it('allows supervisors to acknowledge while denying workers triage authority', async () => {
    for (const [role, status] of [['supervisor', 200], ['worker', 403]] as const) {
      const deps = fixture(role);
      const app = await buildApp(deps);
      const response = await app.inject({
        method: 'POST', url: `/v1/safety-reports/${reportId}/acknowledgements`, headers,
        payload: { workspaceId, note: 'Seen' },
      });
      expect(response.statusCode).toBe(status);
      await app.close();
    }
  });

  it('restricts escalation silence to administrators and requires a reason', async () => {
    const worker = fixture('worker');
    const workerApp = await buildApp(worker);
    expect((await workerApp.inject({
      method: 'POST', url: `/v1/admin/safety-reports/${reportId}/silence`, headers,
      payload: { workspaceId, reason: 'False alarm' },
    })).statusCode).toBe(403);
    await workerApp.close();

    const owner = fixture('owner');
    const ownerApp = await buildApp(owner);
    expect((await ownerApp.inject({
      method: 'POST', url: `/v1/admin/safety-reports/${reportId}/silence`, headers,
      payload: { workspaceId, reason: '' },
    })).statusCode).toBe(400);
    await ownerApp.close();
  });
});
