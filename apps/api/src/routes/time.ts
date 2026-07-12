import { AuthorizationError, can, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import {
  ClockSession, CorrectTimeEntryBody, CreateTimeEntryBody, DecideTimeEntryBody, IdempotencyKeyHeader,
  StartClockBody, StopClockBody, SubmitTimeEntryBody, TimeApprovalQueue, TimeEntry, TimeHistory,
  type ClockSession as ClockOutput, type CorrectTimeEntryBody as CorrectInput,
  type CreateTimeEntryBody as CreateInput, type DecideTimeEntryBody as DecideInput,
  type StartClockBody as StartInput, type StopClockBody as StopInput,
  type SubmitTimeEntryBody as SubmitInput, type TimeEntry as TimeOutput,
} from '@voiceforge/contracts';
import type { TimeEntryRecord, TimeRepository } from '@voiceforge/database';
import type { FastifyInstance } from 'fastify';
import { identityFor, type TenancyStore } from './tenancy.js';

type TimeStore = Pick<TimeRepository, 'startClock' | 'stopClock' | 'createDraft' | 'editDraft' | 'submit' | 'decide' | 'correct' | 'listApprovalQueue' | 'history'>;

export async function registerTimeRoutes(app: FastifyInstance, dependencies: { verifier: TokenVerifier; tenancy: TenancyStore; repository: TimeStore }) {
  const accessFor = async (request: Parameters<typeof identityFor>[0], workspaceId: string) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, workspaceId);
    if (!access) throw new AuthorizationError('time:submit');
    return { session, access };
  };

  app.post<{ Headers: MutationHeaders; Body: StartInput; Reply: ClockOutput }>('/v1/clock-sessions', {
    schema: { operationId: 'startClockSession', tags: ['time'], headers: IdempotencyKeyHeader, body: StartClockBody, response: { 201: ClockSession } },
  }, async (request, reply) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (!can(access.role, 'time:submit', access.kind) && access.role !== 'owner') throw new AuthorizationError('time:submit');
    const record = await dependencies.repository.startClock({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.body.id, jobId: request.body.jobId, startedAt: new Date(request.body.startedAt),
    });
    return reply.code(201).send(serializeClock(record as Record<string, unknown>));
  });

  app.post<{ Headers: MutationHeaders; Params: { clockSessionId: string }; Body: StopInput; Reply: TimeOutput }>('/v1/clock-sessions/:clockSessionId/stop', {
    schema: { operationId: 'stopClockSession', tags: ['time'], headers: IdempotencyKeyHeader, params: idParam('clockSessionId'), body: StopClockBody, response: { 201: TimeEntry } },
  }, async (request, reply) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    const record = await dependencies.repository.stopClock({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      clockSessionId: request.params.clockSessionId, timeEntryId: request.body.timeEntryId,
      endedAt: new Date(request.body.endedAt), entryType: request.body.entryType, notes: request.body.notes,
    });
    return reply.code(201).send(serializeTime(record));
  });

  app.post<{ Headers: MutationHeaders; Body: CreateInput; Reply: TimeOutput }>('/v1/time-entries', {
    schema: { operationId: 'createTimeEntry', tags: ['time'], headers: IdempotencyKeyHeader, body: CreateTimeEntryBody, response: { 201: TimeEntry } },
  }, async (request, reply) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (!can(access.role, 'time:submit', access.kind) && access.role !== 'owner') throw new AuthorizationError('time:submit');
    const record = await dependencies.repository.createDraft({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.body.id, jobId: request.body.jobId, startedAt: new Date(request.body.startedAt), endedAt: new Date(request.body.endedAt),
      entryType: request.body.entryType, notes: request.body.notes,
    });
    return reply.code(201).send(serializeTime(record));
  });

  app.post<{ Headers: MutationHeaders; Params: { timeEntryId: string }; Body: SubmitInput; Reply: TimeOutput }>('/v1/time-entries/:timeEntryId/submit', {
    schema: { operationId: 'submitTimeEntry', tags: ['time'], headers: IdempotencyKeyHeader, params: idParam('timeEntryId'), body: SubmitTimeEntryBody, response: { 200: TimeEntry } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    return serializeTime(await dependencies.repository.submit({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.params.timeEntryId, requiresApproval: access.kind === 'team',
    }));
  });

  app.post<{ Headers: MutationHeaders; Params: { timeEntryId: string }; Body: DecideInput; Reply: TimeOutput }>('/v1/time-approvals/:timeEntryId', {
    schema: { operationId: 'decideTimeEntry', tags: ['time'], headers: IdempotencyKeyHeader, params: idParam('timeEntryId'), body: DecideTimeEntryBody, response: { 200: TimeEntry } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    requirePermission(access.role, 'time:approve', access.kind);
    return serializeTime(await dependencies.repository.decide({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.params.timeEntryId, decision: request.body.decision, ...(request.body.reason ? { reason: request.body.reason } : {}),
    }));
  });

  app.post<{ Headers: MutationHeaders; Params: { timeEntryId: string }; Body: CorrectInput; Reply: TimeOutput }>('/v1/time-entries/:timeEntryId/corrections', {
    schema: { operationId: 'correctTimeEntry', tags: ['time'], headers: IdempotencyKeyHeader, params: idParam('timeEntryId'), body: CorrectTimeEntryBody, response: { 200: TimeEntry } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    return serializeTime(await dependencies.repository.correct({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.timeEntryId,
      startedAt: new Date(request.body.startedAt), endedAt: new Date(request.body.endedAt), entryType: request.body.entryType,
      notes: request.body.notes, reason: request.body.reason, ownerAdjustment: false,
    }));
  });

  app.post<{ Headers: MutationHeaders; Params: { timeEntryId: string }; Body: CorrectInput; Reply: TimeOutput }>('/v1/admin/time-entries/:timeEntryId/adjustments', {
    schema: { operationId: 'adjustApprovedTimeEntry', tags: ['time', 'admin'], headers: IdempotencyKeyHeader, params: idParam('timeEntryId'), body: CorrectTimeEntryBody, response: { 200: TimeEntry } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (access.role !== 'owner') throw new AuthorizationError('time:approve');
    return serializeTime(await dependencies.repository.correct({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.timeEntryId,
      startedAt: new Date(request.body.startedAt), endedAt: new Date(request.body.endedAt), entryType: request.body.entryType,
      notes: request.body.notes, reason: request.body.reason, ownerAdjustment: true,
    }));
  });

  app.get<{ Querystring: { workspaceId: string }; Reply: { data: TimeOutput[]; nextCursor: null } }>('/v1/time-approvals', {
    schema: { operationId: 'listTimeApprovalQueue', tags: ['time'], querystring: workspaceQuery, response: { 200: TimeApprovalQueue } },
  }, async (request) => {
    const { access } = await accessFor(request, request.query.workspaceId);
    requirePermission(access.role, 'time:approve', access.kind);
    return { data: (await dependencies.repository.listApprovalQueue(access.id)).map(serializeTime), nextCursor: null };
  });

  app.get<{ Params: { timeEntryId: string }; Querystring: { workspaceId: string; format?: 'json' | 'csv' } }>('/v1/time-entries/:timeEntryId/history', {
    schema: { operationId: 'getTimeEntryHistory', tags: ['time'], params: idParam('timeEntryId'), querystring: { ...workspaceQuery, properties: { ...workspaceQuery.properties, format: { type: 'string', enum: ['json', 'csv'] } } } },
  }, async (request, reply) => {
    await accessFor(request, request.query.workspaceId);
    const history = await dependencies.repository.history(request.query.workspaceId, request.params.timeEntryId);
    if (request.query.format === 'csv') {
      const csv = historyToCsv(history);
      return reply.type('text/csv; charset=utf-8').send(csv);
    }
    return { exportVersion: 1, generatedAt: new Date().toISOString(), ...history };
  });
}

type MutationHeaders = { 'idempotency-key': string };
const idParam = (name: string) => ({ type: 'object', required: [name], properties: { [name]: { type: 'string', format: 'uuid' } } } as const);
const workspaceQuery = { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } } as const;
const serializeTime = (record: TimeEntryRecord): TimeOutput => ({
  ...record, startedAt: new Date(record.startedAt).toISOString(), endedAt: new Date(record.endedAt).toISOString(),
  submittedAt: record.submittedAt ? new Date(record.submittedAt).toISOString() : null,
  approvedAt: record.approvedAt ? new Date(record.approvedAt).toISOString() : null,
  createdAt: new Date(record.createdAt).toISOString(), updatedAt: new Date(record.updatedAt).toISOString(),
});
const serializeClock = (record: Record<string, unknown>): ClockOutput => ({
  ...(record as Omit<ClockOutput, 'startedAt' | 'endedAt' | 'deletedAt' | 'createdAt' | 'updatedAt'>),
  startedAt: new Date(record.startedAt as string | Date).toISOString(), endedAt: record.endedAt ? new Date(record.endedAt as string | Date).toISOString() : null,
  deletedAt: record.deletedAt ? new Date(record.deletedAt as string | Date).toISOString() : null,
  createdAt: new Date(record.createdAt as string | Date).toISOString(), updatedAt: new Date(record.updatedAt as string | Date).toISOString(),
});
function historyToCsv(history: Awaited<ReturnType<TimeStore['history']>>) {
  const rows = ['# voiceforge-time-export-version,1', 'record_type,revision_number,status,started_at,ended_at,total_minutes,entry_type,notes,decision,reason,actor_id,occurred_at'];
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  for (const revision of history.revisions) rows.push(['revision', revision.revisionNumber, history.entry.status, revision.startedAt.toISOString(), revision.endedAt.toISOString(), revision.totalMinutes, revision.entryType, revision.notes, '', revision.correctionReason, revision.createdBy, revision.createdAt.toISOString()].map(quote).join(','));
  for (const approval of history.approvals) rows.push(['approval', approval.revisionNumber, history.entry.status, '', '', '', '', '', approval.decision, approval.reason, approval.decidedBy, approval.decidedAt?.toISOString() ?? approval.createdAt.toISOString()].map(quote).join(','));
  return `${rows.join('\n')}\n`;
}
