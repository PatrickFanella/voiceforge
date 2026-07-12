import type { TokenVerifier } from '@voiceforge/auth';
import type { TranscriptionJobRecord, WorkspaceAccess } from '@voiceforge/database';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = '01980f58-9b8d-7000-8000-000000000051';
const workspaceId = '01980f58-9b8d-7000-8000-000000000052';
const audioObjectId = '01980f58-9b8d-7000-8000-000000000053';
const voiceLogId = '01980f58-9b8d-7000-8000-000000000054';
const transcriptionId = '01980f58-9b8d-7000-8000-000000000055';
const verifier: TokenVerifier = { verify: async () => ({ subject: 'auth0|worker', email: 'worker@example.com', emailVerified: true }) };

function dependencies(role: WorkspaceAccess['role'] = 'worker') {
  const access: WorkspaceAccess = { id: workspaceId, kind: 'team', name: 'Crew', timeZone: 'UTC', role };
  const record: TranscriptionJobRecord = {
    id: transcriptionId, workspaceId, voiceLogId, audioObjectId, status: 'queued', provider: null,
    attemptCount: 0, errorCode: null, errorMessage: null, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  return {
    verifier,
    tenancy: {
      bootstrapIdentity: vi.fn(async () => ({ user: { id: userId, displayName: null, primaryEmail: 'worker@example.com' }, personalWorkspaceId: workspaceId, workspaces: [access] })),
      getAccess: vi.fn(async () => access), createTeam: vi.fn(), createInvitation: vi.fn(), acceptInvitation: vi.fn(),
    },
    transcription: {
      repository: {
        createAudioObject: vi.fn(async () => ({ id: audioObjectId as ReturnType<typeof crypto.randomUUID>, objectKey: `workspaces/${workspaceId}/audio/${audioObjectId}` })),
        getAudioObject: vi.fn(async () => ({ id: audioObjectId, objectKey: 'audio/key', contentType: 'audio/m4a', expectedBytes: 12, expiresAt: new Date(Date.now() + 60_000), uploadedAt: null })),
        createJob: vi.fn(async () => record), getJob: vi.fn(async () => record), getWork: vi.fn(),
        reviewTranscript: vi.fn(async () => ({ id: voiceLogId, transcript: 'Manual transcript', transcriptConfidence: null, transcriptProvider: 'manual', version: 2, updatedAt: new Date() })),
      },
      storage: {
        signUpload: vi.fn(async () => 'https://storage.test/upload'),
        requiredUploadHeaders: vi.fn(() => ({ 'content-type': 'audio/m4a', 'content-length': '12', 'x-amz-server-side-encryption': 'AES256' })),
        verifyUpload: vi.fn(),
      },
      queue: { enqueue: vi.fn() },
    },
  };
}
const headers = { authorization: 'Bearer valid', 'idempotency-key': 'transcription-key-0001' };

describe('transcription routes', () => {
  it('issues a short-lived private upload and queues only after object validation', async () => {
    const deps = dependencies();
    const app = await buildApp(deps);
    const upload = await app.inject({ method: 'POST', url: '/v1/audio-uploads', headers, payload: { workspaceId, contentType: 'audio/m4a', bytes: 12 } });
    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({ audioObjectId, requiredHeaders: { 'x-amz-server-side-encryption': 'AES256' } });
    const transcription = await app.inject({ method: 'POST', url: '/v1/transcriptions', headers, payload: { workspaceId, voiceLogId, audioObjectId } });
    expect(transcription.statusCode).toBe(202);
    expect(deps.transcription.storage.verifyUpload).toHaveBeenCalledBefore(deps.transcription.queue.enqueue);
    expect(deps.transcription.queue.enqueue).toHaveBeenCalledWith(transcriptionId);
    const reviewed = await app.inject({
      method: 'PATCH', url: `/v1/voice-logs/${voiceLogId}/transcript`,
      headers: { ...headers, 'idempotency-key': 'transcript-review-key-01' },
      payload: { workspaceId, transcript: 'Manual transcript' },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({ id: voiceLogId, transcript: 'Manual transcript', transcriptProvider: 'manual' });
    await app.close();
  });

  it('denies auditors any upload mutation', async () => {
    const deps = dependencies('auditor');
    const app = await buildApp(deps);
    const response = await app.inject({ method: 'POST', url: '/v1/audio-uploads', headers, payload: { workspaceId, contentType: 'audio/m4a', bytes: 12 } });
    expect(response.statusCode).toBe(403);
    expect(deps.transcription.repository.createAudioObject).not.toHaveBeenCalled();
    await app.close();
  });
});
