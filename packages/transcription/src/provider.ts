export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  provider: string;
  metadata: Record<string, unknown>;
}

export interface TranscriptionProvider {
  transcribe(input: { audio: Uint8Array; contentType: string; signal?: AbortSignal }): Promise<TranscriptionResult>;
}

export class ProviderResponseError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code: string) { super(message); }
}
