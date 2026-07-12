import { createAuth0TokenVerifier } from '@voiceforge/auth';
import { createDatabase, JobRepository, SyncRepository, TenancyRepository, TranscriptionRepository } from '@voiceforge/database';
import { S3Client } from '@aws-sdk/client-s3';
import { Queue, type ConnectionOptions } from 'bullmq';
import { buildApp } from './app.js';
import { S3AudioStorage } from './services/audio-storage.js';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const database = createDatabase(required('DATABASE_URL'));
const redisUrl = new URL(required('REDIS_URL'));
const connection: ConnectionOptions = {
  host: redisUrl.hostname, port: Number(redisUrl.port || 6379), maxRetriesPerRequest: null,
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
};
const transcriptionQueue = new Queue<{ jobId: string }, void, 'transcribe'>('voiceforge-transcription', { connection });
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
});
const transcriptionRepository = new TranscriptionRepository(database.db);
const app = await buildApp({
  verifier: createAuth0TokenVerifier({ issuer: required('AUTH0_ISSUER'), audience: required('AUTH0_AUDIENCE') }),
  tenancy: new TenancyRepository(database.db),
  jobs: new JobRepository(database.db),
  sync: new SyncRepository(database.db),
  cursorSecret: required('SYNC_CURSOR_SECRET'),
  transcription: {
    repository: transcriptionRepository,
    storage: new S3AudioStorage(s3, required('S3_AUDIO_BUCKET'), process.env.S3_ENDPOINT ? null : 'AES256'),
    queue: {
      enqueue: async (jobId) => { await transcriptionQueue.add('transcribe', { jobId }, {
        jobId, attempts: 5, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1_000,
      }); },
    },
  },
});
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().then(() => transcriptionQueue.close()).then(database.close).finally(() => process.exit(0)));
}

await app.listen({ host: '0.0.0.0', port });
