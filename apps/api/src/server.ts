import { createAuth0TokenVerifier } from '@voiceforge/auth';
import { BillingRepository, createDatabase, GovernanceRepository, IntegrationRepository, JobRepository, SafetyRepository, SyncRepository, TenancyRepository, TimeRepository, TranscriptionRepository } from '@voiceforge/database';
import Stripe from 'stripe';
import { StripeBillingGateway } from './services/stripe-gateway.js';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
const safetyQueue = new Queue<{ reportId: string }, void, 'escalate'>('voiceforge-safety', { connection });
const exportQueue = new Queue<{ exportId: string }, void, 'export'>('voiceforge-exports', { connection });
const subjectQueue = new Queue<{ requestId: string }, void, 'subject-request'>('voiceforge-subject-requests', { connection });
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
  time: new TimeRepository(database.db),
  safety: {
    repository: new SafetyRepository(database.db),
    queue: { enqueue: async (reportId, at) => { await safetyQueue.add('escalate', { reportId }, {
      jobId: `safety-${reportId}-${Math.floor(at.getTime() / 60_000)}`,
      delay: Math.max(0, at.getTime() - Date.now()), attempts: 5, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1_000,
    }); } },
  },
  billing: { repository: new BillingRepository(database.db), stripe: new StripeBillingGateway(new Stripe(required('STRIPE_SECRET_KEY')), required('STRIPE_TEAM_PRICE_ID'), required('STRIPE_WEBHOOK_SECRET')) },
  integrations: { repository: new IntegrationRepository(database.db), exportQueue: { enqueue: async (exportId) => { await exportQueue.add('export', { exportId }, { jobId: exportId, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }); } }, exportStorage: { signDownload: async (key, expiresIn) => getSignedUrl(s3, new GetObjectCommand({ Bucket: required('S3_EXPORT_BUCKET'), Key: key }), { expiresIn }) }, secretKey: required('WEBHOOK_SECRET_ENCRYPTION_KEY') },
  governance: { repository: new GovernanceRepository(database.db), queue: { enqueue: async (requestId) => { await subjectQueue.add('subject-request', { requestId }, { jobId: requestId, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }); } }, storage: { signDownload: async (key, expiresIn) => getSignedUrl(s3, new GetObjectCommand({ Bucket: required('S3_EXPORT_BUCKET'), Key: key }), { expiresIn }) } },
});
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().then(() => Promise.all([transcriptionQueue.close(), safetyQueue.close(), exportQueue.close(), subjectQueue.close()])).then(database.close).finally(() => process.exit(0)));
}

await app.listen({ host: '0.0.0.0', port });
