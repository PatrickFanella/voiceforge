import { describe, expect, it, vi } from 'vitest';
import { createDeepgramProvider } from './deepgram.js';
import { createTranscriptionProcessor } from './processor.js';
import { ProviderResponseError } from './provider.js';

describe('Deepgram provider adapter', () => {
  it('normalizes a valid provider response', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      metadata: { request_id: 'request-1', duration: 2.5 },
      results: { channels: [{ alternatives: [{ transcript: 'Site is secure.', confidence: 0.91 }] }] },
    }), { status: 200 }));
    const provider = createDeepgramProvider({ apiKey: 'secret', fetch });
    await expect(provider.transcribe({ audio: new Uint8Array([1]), contentType: 'audio/m4a' })).resolves.toEqual({
      transcript: 'Site is secure.', confidence: 0.91, provider: 'deepgram',
      metadata: { requestId: 'request-1', durationSeconds: 2.5 },
    });
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Token secret' });
  });

  it('classifies throttling as retryable and malformed success responses as retryable', async () => {
    const throttled = createDeepgramProvider({ apiKey: 'secret', fetch: vi.fn(async () => new Response('', { status: 429 })) });
    await expect(throttled.transcribe({ audio: new Uint8Array(), contentType: 'audio/m4a' }))
      .rejects.toMatchObject({ retryable: true, code: 'PROVIDER_429' });
    const malformed = createDeepgramProvider({ apiKey: 'secret', fetch: vi.fn(async () => new Response('{}', { status: 200 })) });
    await expect(malformed.transcribe({ audio: new Uint8Array(), contentType: 'audio/m4a' }))
      .rejects.toMatchObject({ retryable: true, code: 'PROVIDER_INVALID_RESPONSE' });
  });
});

describe('transcription processor', () => {
  it('is idempotent after completion and persists normalized results', async () => {
    const repository = {
      getWork: vi.fn(async () => ({ id: 'job-1', status: 'queued', objectKey: 'audio/1', contentType: 'audio/m4a', expectedBytes: 2 })),
      markProcessing: vi.fn(), complete: vi.fn(), fail: vi.fn(),
    };
    const processor = createTranscriptionProcessor({
      repository,
      storage: { read: async () => ({ bytes: new Uint8Array([1, 2]), contentType: 'audio/m4a' }) },
      provider: { transcribe: async () => ({ transcript: 'Reviewed manually.', confidence: 0.8, provider: 'test', metadata: {} }) },
    });
    await processor('job-1');
    expect(repository.complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', transcript: 'Reviewed manually.' }));
    repository.getWork.mockResolvedValue({ id: 'job-1', status: 'completed', objectKey: 'audio/1', contentType: 'audio/m4a', expectedBytes: 2 });
    await processor('job-1');
    expect(repository.complete).toHaveBeenCalledTimes(1);
  });

  it('fails invalid uploads terminally while leaving provider failures retryable', async () => {
    const repository = {
      getWork: vi.fn(async () => ({ id: 'job-1', status: 'queued', objectKey: 'audio/1', contentType: 'audio/m4a', expectedBytes: 2 })),
      markProcessing: vi.fn(), complete: vi.fn(), fail: vi.fn(),
    };
    const invalid = createTranscriptionProcessor({
      repository, storage: { read: async () => ({ bytes: new Uint8Array([1]), contentType: 'audio/m4a' }) },
      provider: { transcribe: vi.fn() },
    });
    await expect(invalid('job-1')).rejects.toMatchObject({ code: 'AUDIO_SIZE_MISMATCH', retryable: false });
    expect(repository.fail).toHaveBeenCalledWith(expect.objectContaining({ terminal: true }));

    repository.fail.mockClear();
    const retryable = createTranscriptionProcessor({
      repository, storage: { read: async () => ({ bytes: new Uint8Array([1, 2]), contentType: 'audio/m4a' }) },
      provider: { transcribe: async () => { throw new ProviderResponseError('timeout', true, 'PROVIDER_TIMEOUT'); } },
    });
    await expect(retryable('job-1')).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true });
    expect(repository.fail).toHaveBeenCalledWith(expect.objectContaining({ terminal: false }));
  });
});
