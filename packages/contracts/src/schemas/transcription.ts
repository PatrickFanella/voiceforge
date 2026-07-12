import { Type, type Static } from '@sinclair/typebox';
import { Uuid, UtcDateTime } from './common.js';

export const CreateAudioUploadBody = Type.Object({
  workspaceId: Uuid,
  contentType: Type.Union([Type.Literal('audio/m4a'), Type.Literal('audio/mp4'), Type.Literal('audio/mpeg'), Type.Literal('audio/wav'), Type.Literal('audio/webm')]),
  bytes: Type.Integer({ minimum: 1, maximum: 104857600 }),
});
export const AudioUploadResponse = Type.Object({
  audioObjectId: Uuid, uploadUrl: Type.String({ format: 'uri' }), objectKey: Type.String(), expiresAt: UtcDateTime,
  requiredHeaders: Type.Record(Type.String(), Type.String()),
});
export const CreateTranscriptionBody = Type.Object({
  workspaceId: Uuid, voiceLogId: Uuid, audioObjectId: Uuid, jobId: Type.Optional(Uuid),
});
export const TranscriptionJob = Type.Object({
  id: Uuid, workspaceId: Uuid, voiceLogId: Uuid, audioObjectId: Uuid,
  status: Type.Union([Type.Literal('queued'), Type.Literal('processing'), Type.Literal('completed'), Type.Literal('failed')]),
  provider: Type.Union([Type.String(), Type.Null()]), attemptCount: Type.Integer(),
  errorCode: Type.Union([Type.String(), Type.Null()]), errorMessage: Type.Union([Type.String(), Type.Null()]),
  createdAt: UtcDateTime, updatedAt: UtcDateTime,
});
export const ReviewTranscriptBody = Type.Object({ workspaceId: Uuid, transcript: Type.String({ minLength: 1, maxLength: 100000 }) });
export const ReviewedTranscript = Type.Object({ id: Uuid, transcript: Type.String(), transcriptProvider: Type.String(), version: Type.Integer(), updatedAt: UtcDateTime });

export type CreateAudioUploadBody = Static<typeof CreateAudioUploadBody>;
export type AudioUploadResponse = Static<typeof AudioUploadResponse>;
export type CreateTranscriptionBody = Static<typeof CreateTranscriptionBody>;
export type TranscriptionJob = Static<typeof TranscriptionJob>;
export type ReviewTranscriptBody = Static<typeof ReviewTranscriptBody>;
