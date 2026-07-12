import { ProviderResponseError, type TranscriptionProvider } from './provider.js';

export interface TranscriptionWorkRepository {
  getWork(jobId: string): Promise<{ id: string; status: string; objectKey: string; contentType: string; expectedBytes: number } | null>;
  markProcessing(id: string): Promise<void>;
  complete(input: { id: string; transcript: string; confidence: number; provider: string; metadata: Record<string, unknown> }): Promise<void>;
  fail(input: { id: string; code: string; message: string; terminal: boolean }): Promise<void>;
}
export interface AudioStorage {
  read(key: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export function createTranscriptionProcessor(dependencies: {
  repository: TranscriptionWorkRepository; storage: AudioStorage; provider: TranscriptionProvider; maxBytes?: number;
}) {
  return async (jobId: string) => {
    const work = await dependencies.repository.getWork(jobId);
    if (!work) throw new Error('Transcription job not found.');
    if (work.status === 'completed') return;
    await dependencies.repository.markProcessing(jobId);
    try {
      if (work.expectedBytes > (dependencies.maxBytes ?? 100 * 1024 * 1024)) {
        throw new ProviderResponseError('Audio exceeds the configured size limit.', false, 'AUDIO_TOO_LARGE');
      }
      const object = await dependencies.storage.read(work.objectKey);
      if (object.bytes.byteLength !== work.expectedBytes) throw new ProviderResponseError('Uploaded audio size does not match the declared size.', false, 'AUDIO_SIZE_MISMATCH');
      if (object.contentType !== work.contentType) throw new ProviderResponseError('Uploaded audio type does not match the declared type.', false, 'AUDIO_TYPE_MISMATCH');
      const result = await dependencies.provider.transcribe({ audio: object.bytes, contentType: object.contentType });
      await dependencies.repository.complete({ id: jobId, ...result });
    } catch (error) {
      const failure = error instanceof ProviderResponseError ? error : new ProviderResponseError('Transcription failed unexpectedly.', true, 'TRANSCRIPTION_FAILED');
      await dependencies.repository.fail({ id: jobId, code: failure.code, message: failure.message, terminal: !failure.retryable });
      throw failure;
    }
  };
}
