import { describe, expect, it, vi } from 'vitest';

import { createTranscriptionClient } from '@/features/voice/transcription';

describe('createTranscriptionClient', () => {
  it('requires HTTPS outside localhost', () => {
    expect(() => createTranscriptionClient({ endpoint: 'http://example.com/transcribe' })).toThrow('must use HTTPS');
  });

  it('uploads audio and validates a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      transcript: '  Safety check complete.  ', confidence: 0.92, provider: 'test-provider',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createTranscriptionClient({ endpoint: 'https://voice.example/transcribe', fetchImpl });

    await expect(client.transcribe('file:///voice.m4a')).resolves.toEqual({
      transcript: 'Safety check complete.', confidence: 0.92, provider: 'test-provider',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects invalid responses and HTTP errors', async () => {
    const invalid = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(createTranscriptionClient({ endpoint: 'https://voice.example', fetchImpl: invalid }).transcribe('file:///x')).rejects.toThrow(
      'did not include a transcript',
    );

    const failed = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    await expect(createTranscriptionClient({ endpoint: 'https://voice.example', fetchImpl: failed }).transcribe('file:///x')).rejects.toThrow(
      'status 503',
    );
  });
});
