import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { VoiceForgeDatabase } from './client.js';
import { audioObjects, auditEvents, idempotencyKeys, transcriptionJobs, voiceLogs, workspaceChanges, workspaces } from './schema.js';
import { IdempotencyConflictError } from './job-repository.js';

export interface TranscriptionJobRecord {
  id: string; workspaceId: string; voiceLogId: string; audioObjectId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed'; provider: string | null;
  attemptCount: number; errorCode: string | null; errorMessage: string | null; createdAt: Date; updatedAt: Date;
}

const selection = {
  id: transcriptionJobs.id, workspaceId: transcriptionJobs.workspaceId, voiceLogId: transcriptionJobs.voiceLogId,
  audioObjectId: transcriptionJobs.audioObjectId, status: transcriptionJobs.status, provider: transcriptionJobs.provider,
  attemptCount: transcriptionJobs.attemptCount, errorCode: transcriptionJobs.errorCode,
  errorMessage: transcriptionJobs.errorMessage, createdAt: transcriptionJobs.createdAt, updatedAt: transcriptionJobs.updatedAt,
};

export class TranscriptionRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}

  async createAudioObject(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; contentType: string; bytes: number; expiresAt: Date }) {
    return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, {
      operation: 'audio.create', workspaceId: input.workspaceId, actorUserId: input.actorUserId,
      contentType: input.contentType, bytes: input.bytes,
    }, async (tx) => {
      const id = crypto.randomUUID();
      const objectKey = `workspaces/${input.workspaceId}/audio/${id}`;
      await tx.insert(audioObjects).values({
        id, workspaceId: input.workspaceId, objectKey, contentType: input.contentType,
        expectedBytes: input.bytes, expiresAt: input.expiresAt, createdBy: input.actorUserId,
      });
      return { id, objectKey };
    });
  }

  async createJob(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; voiceLogId: string; audioObjectId: string; jobId?: string }): Promise<TranscriptionJobRecord> {
    return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, {
      operation: 'transcription.create', workspaceId: input.workspaceId, actorUserId: input.actorUserId,
      voiceLogId: input.voiceLogId, audioObjectId: input.audioObjectId, jobId: input.jobId ?? null,
    }, async (tx) => {
      const [audio] = await tx.select({ id: audioObjects.id }).from(audioObjects).where(and(
        eq(audioObjects.id, input.audioObjectId), eq(audioObjects.workspaceId, input.workspaceId), isNull(audioObjects.uploadedAt),
      )).limit(1);
      if (!audio) throw new TranscriptionInputError('Audio upload is unavailable or already consumed.');
      await tx.update(audioObjects).set({ uploadedAt: new Date(), updatedAt: new Date() })
        .where(eq(audioObjects.id, input.audioObjectId));
      await tx.insert(voiceLogs).values({
        id: input.voiceLogId, workspaceId: input.workspaceId, jobId: input.jobId,
        createdBy: input.actorUserId, updatedBy: input.actorUserId,
      });
      const [record] = await tx.insert(transcriptionJobs).values({
        id: crypto.randomUUID(), workspaceId: input.workspaceId, voiceLogId: input.voiceLogId,
        audioObjectId: input.audioObjectId, createdBy: input.actorUserId,
      }).returning(selection);
      if (!record) throw new Error('Transcription job insert returned no row.');
      return record;
    }, hydrateJob);
  }

  async getAudioObject(workspaceId: string, id: string) {
    const [record] = await this.db.select({
      id: audioObjects.id, objectKey: audioObjects.objectKey, contentType: audioObjects.contentType,
      expectedBytes: audioObjects.expectedBytes, expiresAt: audioObjects.expiresAt, uploadedAt: audioObjects.uploadedAt,
    }).from(audioObjects).where(and(eq(audioObjects.workspaceId, workspaceId), eq(audioObjects.id, id))).limit(1);
    return record ?? null;
  }

  async getJob(workspaceId: string, id: string): Promise<TranscriptionJobRecord | null> {
    const [record] = await this.db.select(selection).from(transcriptionJobs)
      .where(and(eq(transcriptionJobs.workspaceId, workspaceId), eq(transcriptionJobs.id, id))).limit(1);
    return record ?? null;
  }

  async getWork(jobId: string) {
    const [record] = await this.db.select({
      id: transcriptionJobs.id, workspaceId: transcriptionJobs.workspaceId, voiceLogId: transcriptionJobs.voiceLogId,
      status: transcriptionJobs.status, objectKey: audioObjects.objectKey, contentType: audioObjects.contentType,
      expectedBytes: audioObjects.expectedBytes,
    }).from(transcriptionJobs).innerJoin(audioObjects, eq(transcriptionJobs.audioObjectId, audioObjects.id))
      .where(eq(transcriptionJobs.id, jobId)).limit(1);
    return record ?? null;
  }

  async markProcessing(id: string) {
    await this.db.update(transcriptionJobs).set({
      status: 'processing', attemptCount: sql`${transcriptionJobs.attemptCount} + 1`, startedAt: new Date(), updatedAt: new Date(),
    }).where(eq(transcriptionJobs.id, id));
  }

  async complete(input: { id: string; transcript: string; confidence: number; provider: string; metadata: Record<string, unknown> }) {
    await this.db.transaction(async (tx) => {
      const [job] = await tx.update(transcriptionJobs).set({
        status: 'completed', provider: input.provider, processingMetadata: input.metadata,
        errorCode: null, errorMessage: null, completedAt: new Date(), updatedAt: new Date(),
      }).where(eq(transcriptionJobs.id, input.id)).returning({
        voiceLogId: transcriptionJobs.voiceLogId, workspaceId: transcriptionJobs.workspaceId, actorUserId: transcriptionJobs.createdBy,
      });
      if (!job) throw new Error('Transcription job not found.');
      const [voiceLog] = await tx.update(voiceLogs).set({
        transcript: input.transcript, transcriptConfidence: Math.round(input.confidence * 10_000),
        transcriptProvider: input.provider, version: 2, updatedAt: new Date(),
      }).where(eq(voiceLogs.id, job.voiceLogId)).returning({
        id: voiceLogs.id, transcript: voiceLogs.transcript, transcriptConfidence: voiceLogs.transcriptConfidence,
        transcriptProvider: voiceLogs.transcriptProvider, version: voiceLogs.version, updatedAt: voiceLogs.updatedAt,
      });
      if (!voiceLog) throw new Error('Voice log not found.');
      await recordVoiceLogChange(tx, job.workspaceId, job.actorUserId, voiceLog, 'voice_log.transcribed');
    });
  }

  async reviewTranscript(input: { workspaceId: string; voiceLogId: string; actorUserId: string; idempotencyKey: string; transcript: string }) {
    return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, {
      operation: 'voice_log.review', workspaceId: input.workspaceId, voiceLogId: input.voiceLogId,
      actorUserId: input.actorUserId, transcript: input.transcript,
    }, async (tx) => {
      const [voiceLog] = await tx.update(voiceLogs).set({
        transcript: input.transcript, transcriptProvider: 'manual', reviewedAt: new Date(),
        version: sql`${voiceLogs.version} + 1`, updatedBy: input.actorUserId, updatedAt: new Date(),
      }).where(and(eq(voiceLogs.workspaceId, input.workspaceId), eq(voiceLogs.id, input.voiceLogId), isNull(voiceLogs.deletedAt)))
        .returning({ id: voiceLogs.id, transcript: voiceLogs.transcript, transcriptConfidence: voiceLogs.transcriptConfidence, transcriptProvider: voiceLogs.transcriptProvider, version: voiceLogs.version, updatedAt: voiceLogs.updatedAt });
      if (!voiceLog) throw new TranscriptionInputError('Voice log is unavailable.');
      await recordVoiceLogChange(tx, input.workspaceId, input.actorUserId, voiceLog, 'voice_log.reviewed');
      return voiceLog;
    }, hydrateReviewedVoiceLog);
  }

  async fail(input: { id: string; code: string; message: string; terminal: boolean }) {
    await this.db.update(transcriptionJobs).set({
      status: input.terminal ? 'failed' : 'queued', errorCode: input.code,
      errorMessage: input.message.slice(0, 1000), updatedAt: new Date(),
    }).where(eq(transcriptionJobs.id, input.id));
  }

  async listRecoverable(before: Date, limit = 100): Promise<string[]> {
    const rows = await this.db.select({ id: transcriptionJobs.id }).from(transcriptionJobs).where(and(
      eq(transcriptionJobs.status, 'queued'), lt(transcriptionJobs.updatedAt, before),
    )).limit(limit);
    return rows.map((row) => row.id);
  }

  private async mutate<T>(workspaceId: string, actorUserId: string, key: string, request: unknown, operation: (tx: Transaction) => Promise<T>, replay: (value: unknown) => T = (value) => value as T): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${key}`}, 0))`);
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
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
}

export class TranscriptionInputError extends Error {}

type Transaction = Parameters<Parameters<VoiceForgeDatabase['transaction']>[0]>[0];
function hydrateJob(value: unknown): TranscriptionJobRecord {
  const job = value as Omit<TranscriptionJobRecord, 'createdAt' | 'updatedAt'> & { createdAt: string | Date; updatedAt: string | Date };
  return { ...job, createdAt: new Date(job.createdAt), updatedAt: new Date(job.updatedAt) };
}
function hydrateReviewedVoiceLog(value: unknown) {
  const record = value as { id: string; transcript: string | null; transcriptConfidence: number | null; transcriptProvider: string | null; version: number; updatedAt: string | Date };
  return { ...record, updatedAt: new Date(record.updatedAt) };
}
async function recordVoiceLogChange(tx: Transaction, workspaceId: string, actorUserId: string, payload: { id: string; version: number }, action: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${workspaceId}`}, 0))`);
  const [workspace] = await tx.update(workspaces).set({ currentChangeSequence: sql`${workspaces.currentChangeSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId)).returning({ sequence: workspaces.currentChangeSequence });
  if (!workspace) throw new Error('Workspace not found.');
  await tx.insert(workspaceChanges).values({
    workspaceId, sequence: workspace.sequence, entityType: 'voice_log', entityId: payload.id,
    operation: 'upsert', version: payload.version, payload,
  });
  const [previous] = await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents)
    .where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.sequence)).limit(1);
  const evidence = { workspaceId, sequence: workspace.sequence, actorUserId, action, entityType: 'voice_log', entityId: payload.id, version: payload.version };
  const eventHash = createHash('sha256').update(JSON.stringify({ previousHash: previous?.eventHash ?? null, ...evidence })).digest('hex');
  await tx.insert(auditEvents).values({
    id: crypto.randomUUID(), workspaceId, sequence: workspace.sequence, actorUserId, action,
    entityType: 'voice_log', entityId: payload.id, details: { version: payload.version }, previousHash: previous?.eventHash, eventHash,
  });
}
