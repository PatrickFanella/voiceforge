import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { calculateDurationMinutes, canCorrect, decisionStatus, submitStatus, TimeWorkflowError, type TimeDecision } from '@voiceforge/workflows';
import type { VoiceForgeDatabase } from './client.js';
import { IdempotencyConflictError, EntityNotFoundError } from './job-repository.js';
import {
  auditEvents, clockSessions, idempotencyKeys, jobs, timeApprovals, timeEntries, timeEntryRevisions,
  workspaceChanges, workspaces,
} from './schema.js';

type Transaction = Parameters<Parameters<VoiceForgeDatabase['transaction']>[0]>[0];
export interface TimeEntryRecord {
  id: string; workspaceId: string; workerUserId: string; jobId: string; clockSessionId: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'correction_requested';
  version: number; revisionNumber: number; startedAt: Date; endedAt: Date; totalMinutes: number;
  entryType: string; notes: string; correctionReason: string | null; submittedAt: Date | null; approvedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}

const entrySelection = {
  id: timeEntries.id, workspaceId: timeEntries.workspaceId, workerUserId: timeEntries.workerUserId,
  jobId: timeEntries.jobId, clockSessionId: timeEntries.clockSessionId, status: timeEntries.status,
  version: timeEntries.version, revisionNumber: timeEntries.currentRevisionNumber,
  startedAt: timeEntryRevisions.startedAt, endedAt: timeEntryRevisions.endedAt,
  totalMinutes: timeEntryRevisions.totalMinutes, entryType: timeEntryRevisions.entryType,
  notes: timeEntryRevisions.notes, correctionReason: timeEntryRevisions.correctionReason,
  submittedAt: timeEntries.submittedAt, approvedAt: timeEntries.approvedAt,
  createdAt: timeEntries.createdAt, updatedAt: timeEntries.updatedAt,
};

export class TimeRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}

  async startClock(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; jobId: string; startedAt: Date }) {
    return this.mutate(input, 'clock.start', async (tx) => {
      const [active] = await tx.select({ id: clockSessions.id }).from(clockSessions).where(and(
        eq(clockSessions.workspaceId, input.workspaceId), eq(clockSessions.workerUserId, input.actorUserId), eq(clockSessions.status, 'active'),
      )).limit(1).for('update');
      if (active) throw new TimeWorkflowError('A clock session is already active.');
      const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId), isNull(jobs.deletedAt))).limit(1);
      if (!job) throw new EntityNotFoundError('Job not found.');
      const [record] = await tx.insert(clockSessions).values({
        id: input.id, workspaceId: input.workspaceId, workerUserId: input.actorUserId, jobId: input.jobId,
        startedAt: input.startedAt, createdBy: input.actorUserId, updatedBy: input.actorUserId,
      }).returning();
      if (!record) throw new Error('Clock session insert returned no row.');
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'clock_session.started', 'clock_session', record.id, record.version, record);
      return record;
    }, hydrateDates(['startedAt', 'endedAt', 'createdAt', 'updatedAt']));
  }

  async stopClock(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; clockSessionId: string; timeEntryId: string; endedAt: Date; entryType: string; notes: string }): Promise<TimeEntryRecord> {
    return this.mutate(input, 'clock.stop', async (tx) => {
      const [clock] = await tx.select().from(clockSessions).where(and(
        eq(clockSessions.id, input.clockSessionId), eq(clockSessions.workspaceId, input.workspaceId),
        eq(clockSessions.workerUserId, input.actorUserId), eq(clockSessions.status, 'active'),
      )).limit(1).for('update');
      if (!clock) throw new TimeWorkflowError('No matching active clock session exists.');
      const totalMinutes = calculateDurationMinutes(clock.startedAt, input.endedAt);
      await tx.update(clockSessions).set({ status: 'completed', endedAt: input.endedAt, version: 2, updatedBy: input.actorUserId, updatedAt: new Date() })
        .where(eq(clockSessions.id, clock.id));
      await tx.insert(timeEntries).values({
        id: input.timeEntryId, workspaceId: input.workspaceId, workerUserId: input.actorUserId,
        jobId: clock.jobId, clockSessionId: clock.id, createdBy: input.actorUserId, updatedBy: input.actorUserId,
      });
      await tx.insert(timeEntryRevisions).values({
        timeEntryId: input.timeEntryId, revisionNumber: 1, startedAt: clock.startedAt, endedAt: input.endedAt,
        totalMinutes, entryType: input.entryType, notes: input.notes, createdBy: input.actorUserId,
      });
      const record = await getEntry(tx, input.workspaceId, input.timeEntryId);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'clock_session.completed', 'clock_session', clock.id, 2, { id: clock.id, status: 'completed', endedAt: input.endedAt });
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'time_entry.created', 'time_entry', record.id, record.version, record);
      return record;
    }, hydrateTimeEntry);
  }

  async createDraft(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; jobId: string; startedAt: Date; endedAt: Date; entryType: string; notes: string }): Promise<TimeEntryRecord> {
    return this.mutate(input, 'time.create', async (tx) => {
      const totalMinutes = calculateDurationMinutes(input.startedAt, input.endedAt);
      const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId), isNull(jobs.deletedAt))).limit(1);
      if (!job) throw new EntityNotFoundError('Job not found.');
      await tx.insert(timeEntries).values({
        id: input.id, workspaceId: input.workspaceId, workerUserId: input.actorUserId, jobId: input.jobId,
        createdBy: input.actorUserId, updatedBy: input.actorUserId,
      });
      await tx.insert(timeEntryRevisions).values({
        timeEntryId: input.id, revisionNumber: 1, startedAt: input.startedAt, endedAt: input.endedAt,
        totalMinutes, entryType: input.entryType, notes: input.notes, createdBy: input.actorUserId,
      });
      const record = await getEntry(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'time_entry.created', 'time_entry', record.id, record.version, record);
      return record;
    }, hydrateTimeEntry);
  }

  async submit(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; requiresApproval: boolean }): Promise<TimeEntryRecord> {
    return this.mutate(input, 'time.submit', async (tx) => {
      const current = await getEntryForUpdate(tx, input.workspaceId, input.id);
      if (current.workerUserId !== input.actorUserId) throw new TimeWorkflowError('Workers may submit only their own entries.');
      const next = submitStatus(current.status, input.requiresApproval);
      const now = new Date();
      await tx.update(timeEntries).set({
        status: next, submittedAt: now, ...(next === 'approved' ? { approvedAt: now } : {}),
        version: current.version + 1, updatedBy: input.actorUserId, updatedAt: now,
      }).where(eq(timeEntries.id, input.id));
      if (input.requiresApproval) await tx.insert(timeApprovals).values({
        id: crypto.randomUUID(), workspaceId: input.workspaceId, timeEntryId: input.id,
        revisionNumber: current.revisionNumber, decision: 'pending',
      });
      const record = await getEntry(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, next === 'approved' ? 'time_entry.self_finalized' : 'time_entry.submitted', 'time_entry', record.id, record.version, record);
      return record;
    }, hydrateTimeEntry);
  }

  async editDraft(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; baseVersion: number; startedAt: Date; endedAt: Date; entryType: string; notes: string }): Promise<TimeEntryRecord> {
    return this.mutate(input, 'time.edit_draft', async (tx) => {
      const current = await getEntryForUpdate(tx, input.workspaceId, input.id);
      if (current.workerUserId !== input.actorUserId || current.status !== 'draft') throw new TimeWorkflowError('Only the worker may edit a draft entry.');
      if (current.version !== input.baseVersion) throw new TimeWorkflowError('The draft changed on another device.');
      await tx.update(timeEntryRevisions).set({
        startedAt: input.startedAt, endedAt: input.endedAt,
        totalMinutes: calculateDurationMinutes(input.startedAt, input.endedAt), entryType: input.entryType, notes: input.notes,
      }).where(and(eq(timeEntryRevisions.timeEntryId, input.id), eq(timeEntryRevisions.revisionNumber, current.revisionNumber)));
      await tx.update(timeEntries).set({ version: current.version + 1, updatedBy: input.actorUserId, updatedAt: new Date() }).where(eq(timeEntries.id, input.id));
      const record = await getEntry(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'time_entry.draft_updated', 'time_entry', record.id, record.version, record);
      return record;
    }, hydrateTimeEntry);
  }

  async decide(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; decision: TimeDecision; reason?: string }): Promise<TimeEntryRecord> {
    return this.mutate(input, 'time.decide', async (tx) => {
      const current = await getEntryForUpdate(tx, input.workspaceId, input.id);
      const next = decisionStatus(current.status, input.decision, input.reason);
      const now = new Date();
      const [approval] = await tx.update(timeApprovals).set({
        decision: input.decision, decidedBy: input.actorUserId, reason: input.reason, decidedAt: now, updatedAt: now,
      }).where(and(eq(timeApprovals.timeEntryId, input.id), eq(timeApprovals.revisionNumber, current.revisionNumber), eq(timeApprovals.decision, 'pending')))
        .returning({ id: timeApprovals.id });
      if (!approval) throw new TimeWorkflowError('No pending approval exists for this revision.');
      await tx.update(timeEntries).set({
        status: next, ...(next === 'approved' ? { approvedAt: now } : { approvedAt: null }),
        version: current.version + 1, updatedBy: input.actorUserId, updatedAt: now,
      }).where(eq(timeEntries.id, input.id));
      const record = await getEntry(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, `time_entry.${input.decision}`, 'time_entry', record.id, record.version, { ...record, decisionReason: input.reason ?? null });
      return record;
    }, hydrateTimeEntry);
  }

  async correct(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; startedAt: Date; endedAt: Date; entryType: string; notes: string; reason: string; ownerAdjustment: boolean }): Promise<TimeEntryRecord> {
    return this.mutate(input, 'time.correct', async (tx) => {
      const current = await getEntryForUpdate(tx, input.workspaceId, input.id);
      if (!canCorrect(current.status, input.ownerAdjustment)) throw new TimeWorkflowError('This entry cannot be corrected in its current state.');
      if (!input.ownerAdjustment && current.workerUserId !== input.actorUserId) throw new TimeWorkflowError('Workers may correct only their own entries.');
      if (!input.reason.trim()) throw new TimeWorkflowError('A correction reason is required.');
      const revisionNumber = current.revisionNumber + 1;
      await tx.update(timeApprovals).set({ decision: 'superseded', updatedAt: new Date() })
        .where(and(eq(timeApprovals.timeEntryId, input.id), eq(timeApprovals.decision, 'pending')));
      await tx.insert(timeEntryRevisions).values({
        timeEntryId: input.id, revisionNumber, startedAt: input.startedAt, endedAt: input.endedAt,
        totalMinutes: calculateDurationMinutes(input.startedAt, input.endedAt), entryType: input.entryType,
        notes: input.notes, correctionReason: input.reason, createdBy: input.actorUserId,
      });
      const nextStatus = input.ownerAdjustment ? 'approved' : 'draft';
      await tx.update(timeEntries).set({
        currentRevisionNumber: revisionNumber, status: nextStatus, version: current.version + 1,
        ...(input.ownerAdjustment ? { approvedAt: new Date() } : { submittedAt: null, approvedAt: null }),
        updatedBy: input.actorUserId, updatedAt: new Date(),
      }).where(eq(timeEntries.id, input.id));
      if (input.ownerAdjustment) await tx.insert(timeApprovals).values({
        id: crypto.randomUUID(), workspaceId: input.workspaceId, timeEntryId: input.id, revisionNumber,
        decision: 'approved', decidedBy: input.actorUserId, reason: input.reason, decidedAt: new Date(),
      });
      const record = await getEntry(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, input.ownerAdjustment ? 'time_entry.owner_adjusted' : 'time_entry.corrected', 'time_entry', record.id, record.version, record);
      return record;
    }, hydrateTimeEntry);
  }

  async listApprovalQueue(workspaceId: string): Promise<TimeEntryRecord[]> {
    return this.db.select(entrySelection).from(timeEntries)
      .innerJoin(timeEntryRevisions, and(eq(timeEntryRevisions.timeEntryId, timeEntries.id), eq(timeEntryRevisions.revisionNumber, timeEntries.currentRevisionNumber)))
      .where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.status, 'submitted')))
      .orderBy(timeEntries.submittedAt);
  }

  async history(workspaceId: string, id: string) {
    const entry = await this.db.select().from(timeEntries).where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id))).limit(1);
    if (!entry[0]) throw new EntityNotFoundError('Time entry not found.');
    const revisions = await this.db.select().from(timeEntryRevisions).where(eq(timeEntryRevisions.timeEntryId, id)).orderBy(timeEntryRevisions.revisionNumber);
    const approvals = await this.db.select().from(timeApprovals).where(and(eq(timeApprovals.workspaceId, workspaceId), eq(timeApprovals.timeEntryId, id))).orderBy(timeApprovals.createdAt);
    return { entry: entry[0], revisions, approvals };
  }

  private async mutate<T>(input: { workspaceId: string; actorUserId: string; idempotencyKey: string }, operationName: string, operation: (tx: Transaction) => Promise<T>, replay: (value: unknown) => T): Promise<T> {
    return this.db.transaction(async (tx) => {
      const key = input.idempotencyKey;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.workspaceId}:${key}`}, 0))`);
      const requestHash = createHash('sha256').update(JSON.stringify({ operationName, ...input })).digest('hex');
      const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.workspaceId, input.workspaceId), eq(idempotencyKeys.key, key))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new IdempotencyConflictError('Key was used for another request.');
        if (existing.responseBody !== null) return replay(existing.responseBody);
        throw new IdempotencyConflictError('The original request is still in progress.');
      }
      await tx.insert(idempotencyKeys).values({ workspaceId: input.workspaceId, key, actorUserId: input.actorUserId, requestHash, expiresAt: new Date(Date.now() + 86_400_000) });
      const response = await operation(tx);
      await tx.update(idempotencyKeys).set({ responseStatus: 200, responseBody: response, locked: false, updatedAt: new Date() })
        .where(and(eq(idempotencyKeys.workspaceId, input.workspaceId), eq(idempotencyKeys.key, key)));
      return response;
    });
  }
}

async function getEntry(tx: Transaction, workspaceId: string, id: string): Promise<TimeEntryRecord> {
  const [record] = await tx.select(entrySelection).from(timeEntries)
    .innerJoin(timeEntryRevisions, and(eq(timeEntryRevisions.timeEntryId, timeEntries.id), eq(timeEntryRevisions.revisionNumber, timeEntries.currentRevisionNumber)))
    .where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id), isNull(timeEntries.deletedAt))).limit(1);
  if (!record) throw new EntityNotFoundError('Time entry not found.');
  return record;
}
async function getEntryForUpdate(tx: Transaction, workspaceId: string, id: string) {
  const [entry] = await tx.select().from(timeEntries).where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id), isNull(timeEntries.deletedAt))).limit(1).for('update');
  if (!entry) throw new EntityNotFoundError('Time entry not found.');
  return { ...entry, revisionNumber: entry.currentRevisionNumber };
}

async function recordEvidence(tx: Transaction, workspaceId: string, actorUserId: string, action: string, entityType: string, entityId: string, version: number, payload: unknown) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${workspaceId}`}, 0))`);
  const [workspace] = await tx.update(workspaces).set({ currentChangeSequence: sql`${workspaces.currentChangeSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId)).returning({ sequence: workspaces.currentChangeSequence });
  if (!workspace) throw new EntityNotFoundError('Workspace not found.');
  await tx.insert(workspaceChanges).values({ workspaceId, sequence: workspace.sequence, entityType, entityId, operation: 'upsert', version, payload });
  const [previous] = await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.sequence)).limit(1);
  const evidence = { workspaceId, sequence: workspace.sequence, actorUserId, action, entityType, entityId, version };
  const eventHash = createHash('sha256').update(JSON.stringify({ previousHash: previous?.eventHash ?? null, ...evidence })).digest('hex');
  await tx.insert(auditEvents).values({
    id: crypto.randomUUID(), workspaceId, sequence: workspace.sequence, actorUserId, action, entityType, entityId,
    details: { version }, previousHash: previous?.eventHash, eventHash,
  });
}

function hydrateTimeEntry(value: unknown): TimeEntryRecord {
  const record = value as TimeEntryRecord;
  return hydrateDates(['startedAt', 'endedAt', 'submittedAt', 'approvedAt', 'createdAt', 'updatedAt'])(record) as TimeEntryRecord;
}
function hydrateDates(keys: string[]) {
  return <T>(value: T): T => {
    const copy = { ...(value as Record<string, unknown>) };
    for (const key of keys) if (typeof copy[key] === 'string') copy[key] = new Date(copy[key]);
    return copy as T;
  };
}
