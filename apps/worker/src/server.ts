import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createDatabase, TranscriptionRepository } from '@voiceforge/database';
import { createDeepgramProvider, createTranscriptionProcessor, ProviderResponseError } from '@voiceforge/transcription';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { parseRedisConnection, recoverQueuedJobs, transcriptionJobOptions } from './runtime.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; };
const database = createDatabase(required('DATABASE_URL'));
const repository = new TranscriptionRepository(database.db);
const connection: ConnectionOptions = parseRedisConnection(required('REDIS_URL'));
const queue = new Queue<{ jobId: string }, void, 'transcribe'>('voiceforge-transcription', { connection });
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
});
const bucket = required('S3_AUDIO_BUCKET');
const processTranscription = createTranscriptionProcessor({
  repository,
  storage: { read: async (key) => {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new ProviderResponseError('Audio object is empty.', false, 'AUDIO_EMPTY');
    return { bytes: await object.Body.transformToByteArray(), contentType: object.ContentType ?? 'application/octet-stream' };
  } },
  provider: createDeepgramProvider({ apiKey: required('DEEPGRAM_API_KEY') }),
});
const worker = new Worker<{ jobId: string }, void, 'transcribe'>('voiceforge-transcription', async (job) => processTranscription(job.data.jobId), {
  connection, concurrency: Number(process.env.TRANSCRIPTION_CONCURRENCY ?? 4), maxStalledCount: 2,
});
worker.on('failed', (job, error) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void repository.fail({ id: job.data.jobId, code: error instanceof ProviderResponseError ? error.code : 'RETRIES_EXHAUSTED', message: error.message, terminal: true });
  }
});

await recoverQueuedJobs(repository, queue);
const recoveryTimer = setInterval(() => void recoverQueuedJobs(repository, queue), 60_000);

async function shutdown() {
  clearInterval(recoveryTimer);
  await worker.close(); await queue.close(); await database.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown().finally(() => process.exit(0)));
