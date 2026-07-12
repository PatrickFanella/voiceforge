export interface TranscriptionResult {
  transcript: string;
  confidence: number | null;
  provider: string;
}

export interface TranscriptionClient {
  transcribe(audioUri: string): Promise<TranscriptionResult>;
}

interface TranscriptionClientOptions {
  endpoint: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function validateResult(value: unknown): TranscriptionResult {
  if (!value || typeof value !== 'object') throw new Error('Transcription response was not an object');
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.transcript !== 'string' || !candidate.transcript.trim()) {
    throw new Error('Transcription response did not include a transcript');
  }
  if (candidate.confidence != null && (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1)) {
    throw new Error('Transcription confidence must be between 0 and 1');
  }
  return {
    transcript: candidate.transcript.trim(),
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : null,
    provider: typeof candidate.provider === 'string' && candidate.provider ? candidate.provider : 'configured-endpoint',
  };
}

export function createTranscriptionClient({ endpoint, timeoutMs = 20_000, fetchImpl = fetch }: TranscriptionClientOptions): TranscriptionClient {
  const normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint.startsWith('https://') && !normalizedEndpoint.startsWith('http://localhost')) {
    throw new Error('Transcription endpoint must use HTTPS');
  }

  return {
    async transcribe(audioUri: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const form = new FormData();
        if (audioUri.startsWith('blob:')) {
          const audio = await fetchImpl(audioUri).then((response) => response.blob());
          form.append('audio', audio, 'voice-note.webm');
        } else {
          form.append('audio', { uri: audioUri, name: 'voice-note.m4a', type: 'audio/mp4' } as unknown as Blob);
        }
        const response = await fetchImpl(normalizedEndpoint, { method: 'POST', body: form, signal: controller.signal });
        if (!response.ok) throw new Error(`Transcription failed with status ${response.status}`);
        return validateResult(await response.json());
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw new Error('Transcription timed out');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
