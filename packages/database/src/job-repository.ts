import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { VoiceForgeDatabase } from './client.js';
import { auditEvents, entityTombstones, idempotencyKeys, jobs, workspaceChanges, workspaces } from './schema.js';

type Transaction = Parameters<Parameters<VoiceForgeDatabase['transaction']>[0]>[0];
export interface JobRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class VersionConflictError extends Error {}
export class IdempotencyConflictError extends Error {}
export class EntityNotFoundError extends Error {}

const jobSelection = {
  id: jobs.id, workspaceId: jobs.workspaceId, name: jobs.name, description: jobs.description,
  address: jobs.address, status: jobs.status, version: jobs.version, createdAt: jobs.createdAt, updatedAt: jobs.updatedAt,
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class JobRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}

  async list(workspaceId: string): Promise<JobRecord[]> {
    return this.db.select(jobSelection).from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.updatedAt));
  }

  async create(input: {
    workspaceId: string; actorUserId: string; idempotencyKey: string; id: string;
    name: string; description?: string; address?: string;
  }): Promise<JobRecord> {
    const request = { operation: 'job.create', ...input };
    return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, request, async (tx) => {
      const now = new Date();
      const [job] = await tx.insert(jobs).values({
        id: input.id, workspaceId: input.workspaceId, name: input.name,
        description: input.description, address: input.address,
        createdBy: input.actorUserId, updatedBy: input.actorUserId, createdAt: now, updatedAt: now,
      }).returning(jobSelection);
      if (!job) throw new Error('Job insert returned no row.');
      await this.recordEvidence(tx, input.workspaceId, input.actorUserId, 'job.created', job, 'upsert');
      return job;
    }, hydrateJob);
  }

  async update(input: {
    workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; baseVersion: number;
    changes: { name?: string; description?: string | null; address?: string | null; status?: string };
  }): Promise<JobRecord> {
    const request = { operation: 'job.update', ...input };
    return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, request, async (tx) => {
      const [job] = await tx.update(jobs).set({
        ...input.changes, version: input.baseVersion + 1, updatedBy: input.actorUserId, updatedAt: new Date(),
      }).where(and(
        eq(jobs.id, input.id), eq(jobs.workspaceId, input.workspaceId), eq(jobs.version, input.baseVersion), isNull(jobs.deletedAt),
      )).returning(jobSelection);
      if (!job) await this.throwMutationMiss(tx, input.workspaceId, input.id);
      await this.recordEvidence(tx, input.workspaceId, input.actorUserId, 'job.updated', job!, 'upsert');
      return job!;
    }, hydrateJob);
  }

  async delete(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; baseVersion: number }): Promise<{ id: string; version: number }> {
    const request = { operation: 'job.delete', ...input };
    return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, request, async (tx) => {
      const deletedAt = new Date();
      const [job] = await tx.update(jobs).set({
        version: input.baseVersion + 1, updatedBy: input.actorUserId, updatedAt: deletedAt, deletedAt,
      }).where(and(
        eq(jobs.id, input.id), eq(jobs.workspaceId, input.workspaceId), eq(jobs.version, input.baseVersion), isNull(jobs.deletedAt),
      )).returning({ id: jobs.id, version: jobs.version });
      if (!job) await this.throwMutationMiss(tx, input.workspaceId, input.id);
      await tx.insert(entityTombstones).values({
        workspaceId: input.workspaceId, entityType: 'job', entityId: input.id, version: job!.version,
        deletedBy: input.actorUserId, deletedAt,
      });
      await this.recordEvidence(tx, input.workspaceId, input.actorUserId, 'job.deleted', job!, 'delete');
      return job!;
    });
  }

  private async mutate<T>(workspaceId: string, actorUserId: string, key: string, request: unknown, operation: (tx: Transaction) => Promise<T>, replay: (value: unknown) => T = (value) => value as T): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${key}`}, 0))`);
      const requestHash = digest(request);
      const [existing] = await tx.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new IdempotencyConflictError('Key was used for another request.');
        if (existing.responseBody !== null) return replay(existing.responseBody);
        throw new IdempotencyConflictError('The original request is still in progress.');
      }
      await tx.insert(idempotencyKeys).values({
        workspaceId, key, actorUserId, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const response = await operation(tx);
      await tx.update(idempotencyKeys).set({ responseStatus: 200, responseBody: response, locked: false, updatedAt: new Date() })
        .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key)));
      return response;
    });
  }

  private async recordEvidence(tx: Transaction, workspaceId: string, actorUserId: string, action: string, payload: { id: string; version: number }, operation: 'upsert' | 'delete') {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${workspaceId}`}, 0))`);
    const [workspace] = await tx.update(workspaces)
      .set({ currentChangeSequence: sql`${workspaces.currentChangeSequence} + 1`, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId)).returning({ sequence: workspaces.currentChangeSequence });
    if (!workspace) throw new EntityNotFoundError('Workspace not found.');
    const sequence = workspace.sequence;
    await tx.insert(workspaceChanges).values({
      workspaceId, sequence, entityType: 'job', entityId: payload.id, operation, version: payload.version,
      payload: operation === 'upsert' ? payload : null,
    });
    const [previous] = await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.sequence)).limit(1);
    const evidence = { workspaceId, sequence, actorUserId, action, entityType: 'job', entityId: payload.id, version: payload.version };
    const eventHash = digest({ previousHash: previous?.eventHash ?? null, ...evidence });
    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(), workspaceId, sequence, actorUserId, action, entityType: 'job', entityId: payload.id,
      details: { version: payload.version }, previousHash: previous?.eventHash, eventHash,
    });
  }

  private async throwMutationMiss(tx: Transaction, workspaceId: string, id: string): Promise<never> {
    const [record] = await tx.select({ version: jobs.version }).from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, id), isNull(jobs.deletedAt))).limit(1);
    if (record) throw new VersionConflictError(`Expected another version; current version is ${record.version}.`);
    throw new EntityNotFoundError('Job not found.');
  }
}

function hydrateJob(value: unknown): JobRecord {
  const job = value as Omit<JobRecord, 'createdAt' | 'updatedAt'> & { createdAt: string | Date; updatedAt: string | Date };
  return { ...job, createdAt: new Date(job.createdAt), updatedAt: new Date(job.updatedAt) };
}
