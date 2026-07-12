import { AuthorizationError, type TokenVerifier } from '@voiceforge/auth';
import { AudioUploadResponse, CreateAudioUploadBody, CreateTranscriptionBody, IdempotencyKeyHeader, ReviewedTranscript, ReviewTranscriptBody, TranscriptionJob, type AudioUploadResponse as AudioUploadOutput, type CreateAudioUploadBody as CreateAudioUploadInput, type CreateTranscriptionBody as CreateTranscriptionInput, type ReviewTranscriptBody as ReviewTranscriptInput, type TranscriptionJob as TranscriptionOutput } from '@voiceforge/contracts';
import type { TranscriptionRepository } from '@voiceforge/database';
import type { FastifyInstance } from 'fastify';
import type { S3AudioStorage } from '../services/audio-storage.js';
import { identityFor, type TenancyStore } from './tenancy.js';

type TranscriptionStore = Pick<TranscriptionRepository, 'createAudioObject' | 'getAudioObject' | 'createJob' | 'getJob' | 'getWork' | 'reviewTranscript'>;
export interface TranscriptionQueue { enqueue(jobId: string): Promise<void>; }

export async function registerTranscriptionRoutes(app: FastifyInstance, dependencies: {
  verifier: TokenVerifier; tenancy: TenancyStore; repository: TranscriptionStore;
  storage: Pick<S3AudioStorage, 'signUpload' | 'requiredUploadHeaders' | 'verifyUpload'>; queue: TranscriptionQueue;
}) {
  const sessionFor = async (request: Parameters<typeof identityFor>[0], workspaceId: string) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, workspaceId);
    if (!access || access.role === 'auditor') throw new AuthorizationError('safety:submit');
    return session;
  };

  app.post<{ Headers: { 'idempotency-key': string }; Body: CreateAudioUploadInput; Reply: AudioUploadOutput }>('/v1/audio-uploads', {
    schema: { operationId: 'createAudioUpload', tags: ['transcription'], headers: IdempotencyKeyHeader, body: CreateAudioUploadBody, response: { 201: AudioUploadResponse } },
  }, async (request, reply) => {
    const session = await sessionFor(request, request.body.workspaceId);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const audio = await dependencies.repository.createAudioObject({
      workspaceId: request.body.workspaceId, actorUserId: session.user.id,
      idempotencyKey: request.headers['idempotency-key'], contentType: request.body.contentType, bytes: request.body.bytes, expiresAt,
    });
    const uploadUrl = await dependencies.storage.signUpload({
      key: audio.objectKey, contentType: request.body.contentType, bytes: request.body.bytes, expiresInSeconds: 900,
    });
    return reply.code(201).send({
      audioObjectId: audio.id, objectKey: audio.objectKey, uploadUrl, expiresAt: expiresAt.toISOString(),
      requiredHeaders: dependencies.storage.requiredUploadHeaders(request.body.contentType, request.body.bytes),
    });
  });

  app.post<{ Headers: { 'idempotency-key': string }; Body: CreateTranscriptionInput; Reply: TranscriptionOutput }>('/v1/transcriptions', {
    schema: { operationId: 'createTranscription', tags: ['transcription'], headers: IdempotencyKeyHeader, body: CreateTranscriptionBody, response: { 202: TranscriptionJob } },
  }, async (request, reply) => {
    const session = await sessionFor(request, request.body.workspaceId);
    const audio = await dependencies.repository.getAudioObject(request.body.workspaceId, request.body.audioObjectId);
    if (!audio || audio.uploadedAt || (audio.expiresAt && audio.expiresAt <= new Date())) throw new AuthorizationError('safety:submit');
    await dependencies.storage.verifyUpload({ key: audio.objectKey, contentType: audio.contentType, bytes: audio.expectedBytes });
    const record = await dependencies.repository.createJob({
      workspaceId: request.body.workspaceId, actorUserId: session.user.id, voiceLogId: request.body.voiceLogId,
      idempotencyKey: request.headers['idempotency-key'], audioObjectId: request.body.audioObjectId,
      ...(request.body.jobId ? { jobId: request.body.jobId } : {}),
    });
    await dependencies.queue.enqueue(record.id);
    return reply.code(202).send(serialize(record));
  });

  app.get<{ Params: { transcriptionId: string }; Querystring: { workspaceId: string }; Reply: TranscriptionOutput }>('/v1/transcriptions/:transcriptionId', {
    schema: {
      operationId: 'getTranscription', tags: ['transcription'],
      params: { type: 'object', required: ['transcriptionId'], properties: { transcriptionId: { type: 'string', format: 'uuid' } } },
      querystring: { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } },
      response: { 200: TranscriptionJob },
    },
  }, async (request) => {
    await sessionFor(request, request.query.workspaceId);
    const record = await dependencies.repository.getJob(request.query.workspaceId, request.params.transcriptionId);
    if (!record) throw new AuthorizationError('safety:submit');
    return serialize(record);
  });

  app.patch<{ Headers: { 'idempotency-key': string }; Params: { voiceLogId: string }; Body: ReviewTranscriptInput }>('/v1/voice-logs/:voiceLogId/transcript', {
    schema: {
      operationId: 'reviewVoiceTranscript', tags: ['transcription'], headers: IdempotencyKeyHeader,
      params: { type: 'object', required: ['voiceLogId'], properties: { voiceLogId: { type: 'string', format: 'uuid' } } },
      body: ReviewTranscriptBody, response: { 200: ReviewedTranscript },
    },
  }, async (request) => {
    const session = await sessionFor(request, request.body.workspaceId);
    const reviewed = await dependencies.repository.reviewTranscript({
      workspaceId: request.body.workspaceId, voiceLogId: request.params.voiceLogId,
      actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], transcript: request.body.transcript,
    });
    return { ...reviewed, updatedAt: reviewed.updatedAt.toISOString() };
  });
}

const serialize = (record: Awaited<ReturnType<TranscriptionStore['createJob']>>): TranscriptionOutput => ({
  ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
});
