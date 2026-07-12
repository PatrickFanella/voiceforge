import { ProviderResponseError, type TranscriptionProvider } from './provider.js';

export function createDeepgramProvider(options: { apiKey: string; fetch?: typeof globalThis.fetch; timeoutMs?: number }): TranscriptionProvider {
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async transcribe({ audio, contentType, signal }) {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await fetcher('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
          method: 'POST', headers: { authorization: `Token ${options.apiKey}`, 'content-type': contentType },
          body: Buffer.from(audio), signal: combined,
        });
      } catch (error) {
        throw new ProviderResponseError(error instanceof Error ? error.message : 'Deepgram request failed.', true, 'PROVIDER_NETWORK');
      }
      if (!response.ok) {
        throw new ProviderResponseError(`Deepgram returned ${response.status}.`, response.status === 429 || response.status >= 500, `PROVIDER_${response.status}`);
      }
      const body = await response.json() as {
        metadata?: { request_id?: string; duration?: number };
        results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
      };
      const alternative = body.results?.channels?.[0]?.alternatives?.[0];
      if (!alternative || typeof alternative.transcript !== 'string' || typeof alternative.confidence !== 'number') {
        throw new ProviderResponseError('Deepgram response did not contain a transcript.', true, 'PROVIDER_INVALID_RESPONSE');
      }
      return {
        transcript: alternative.transcript, confidence: alternative.confidence, provider: 'deepgram',
        metadata: { requestId: body.metadata?.request_id, durationSeconds: body.metadata?.duration },
      };
    },
  };
}
