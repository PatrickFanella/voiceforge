import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SafetyRepository, createDatabase, TranscriptionRepository } from '@voiceforge/database';
import { createExpoPushAdapter, createSafetyDeliveryProcessor, createSesEmailAdapter } from '@voiceforge/notifications';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { createDeepgramProvider, createTranscriptionProcessor, ProviderResponseError } from '@voiceforge/transcription';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { parseRedisConnection, recoverQueuedJobs, transcriptionJobOptions } from './runtime.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; };
const database = createDatabase(required('DATABASE_URL'));
const repository = new TranscriptionRepository(database.db);
const connection: ConnectionOptions = parseRedisConnection(required('REDIS_URL'));
const queue = new Queue<{ jobId: string }, void, 'transcribe'>('voiceforge-transcription', { connection });
const safetyQueue = new Queue<{ reportId: string }, void, 'escalate'>('voiceforge-safety', { connection });
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
});
const bucket = required('S3_AUDIO_BUCKET');
const safetyRepository = new SafetyRepository(database.db);
const ses = new SESv2Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
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
const scheduleSafety = async (reportId: string, at: Date) => {
  await safetyQueue.add('escalate', { reportId }, {
    jobId: `safety-${reportId}-${Math.floor(at.getTime() / 60_000)}`, delay: Math.max(0, at.getTime() - Date.now()),
    attempts: 5, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1_000,
  });
};
const processSafety = createSafetyDeliveryProcessor({
  repository: safetyRepository,
  push: createExpoPushAdapter({ ...(process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : {}) }),
  email: createSesEmailAdapter({ client: ses, from: required('SES_FROM_EMAIL') }),
  scheduleNext: scheduleSafety,
});
const safetyWorker = new Worker<{ reportId: string }, void, 'escalate'>('voiceforge-safety', async (job) => { await processSafety(job.data.reportId); }, {
  connection, concurrency: Number(process.env.SAFETY_NOTIFICATION_CONCURRENCY ?? 8), maxStalledCount: 2,
});
worker.on('failed', (job, error) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void repository.fail({ id: job.data.jobId, code: error instanceof ProviderResponseError ? error.code : 'RETRIES_EXHAUSTED', message: error.message, terminal: true });
  }
});

await recoverQueuedJobs(repository, queue);
const recoveryTimer = setInterval(() => void recoverQueuedJobs(repository, queue), 60_000);
async function recoverSafety() {
  const ids = await safetyRepository.listDueEscalations(new Date());
  await Promise.all(ids.map((id) => scheduleSafety(id, new Date())));
}
await recoverSafety();
const safetyRecoveryTimer = setInterval(() => void recoverSafety(), 5_000);

async function shutdown() {
  clearInterval(recoveryTimer);
  clearInterval(safetyRecoveryTimer);
  await Promise.all([worker.close(), safetyWorker.close()]);
  await Promise.all([queue.close(), safetyQueue.close()]);
  ses.destroy(); await database.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown().finally(() => process.exit(0)));
