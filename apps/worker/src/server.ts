import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GovernanceRepository, IntegrationRepository, SafetyRepository, createDatabase, TranscriptionRepository } from '@voiceforge/database';
import { createExpoPushAdapter, createSafetyDeliveryProcessor, createSesEmailAdapter } from '@voiceforge/notifications';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { createDeepgramProvider, createTranscriptionProcessor, ProviderResponseError } from '@voiceforge/transcription';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { createWebhookSignature, decryptSecretEnvelope, exportRowsToCsv, parseRedisConnection, recoverQueuedJobs, transcriptionJobOptions, webhookRetryDelay } from './runtime.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; };
const database = createDatabase(required('DATABASE_URL'));
const repository = new TranscriptionRepository(database.db);
const connection: ConnectionOptions = parseRedisConnection(required('REDIS_URL'));
const queue = new Queue<{ jobId: string }, void, 'transcribe'>('voiceforge-transcription', { connection });
const safetyQueue = new Queue<{ reportId: string }, void, 'escalate'>('voiceforge-safety', { connection });
const exportQueue = new Queue<{ exportId: string }, void, 'export'>('voiceforge-exports', { connection });
const subjectQueue = new Queue<{ requestId: string }, void, 'subject-request'>('voiceforge-subject-requests', { connection });
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
});
const bucket = required('S3_AUDIO_BUCKET');
const safetyRepository = new SafetyRepository(database.db);
const integrationRepository = new IntegrationRepository(database.db);
const governanceRepository = new GovernanceRepository(database.db);
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
const exportBucket = required('S3_EXPORT_BUCKET');
const exportWorker = new Worker<{ exportId: string }, void, 'export'>('voiceforge-exports', async (job) => {
  const record = await integrationRepository.claimExport(job.data.exportId); if (!record) return;
  try { const rows = await integrationRepository.exportRows(record.workspaceId, record.scope); const body = record.format === 'csv' ? exportRowsToCsv(rows) : JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2); const objectKey = `exports/${record.workspaceId}/${record.id}.${record.format}`; await s3.send(new PutObjectCommand({ Bucket: exportBucket, Key: objectKey, Body: body, ContentType: record.format === 'csv' ? 'text/csv' : 'application/json', ServerSideEncryption: process.env.S3_ENDPOINT ? undefined : 'AES256' })); await integrationRepository.completeExport(record.id, { objectKey, rowCount: rows.length, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }); } catch (error) { await integrationRepository.failExport(record.id, error instanceof Error ? error.message : 'Export failed.'); throw error; }
}, { connection, concurrency: Number(process.env.EXPORT_CONCURRENCY ?? 2) });
const subjectWorker = new Worker<{ requestId: string }, void, 'subject-request'>('voiceforge-subject-requests', async (job) => { const request = await governanceRepository.claimSubjectRequest(job.data.requestId); if (!request) return; try { if (request.requestType === 'erasure') { const result = await governanceRepository.eraseSubject(request.userId); await governanceRepository.completeSubjectRequest(request.id, { result, partial: result.exceptions.length > 0 }); return; } const data = await governanceRepository.collectSubjectData(request.userId); const objectKey = `subject-exports/${request.userId}/${request.id}.json`; await s3.send(new PutObjectCommand({ Bucket: exportBucket, Key: objectKey, Body: JSON.stringify({ formatVersion: '1.0', generatedAt: new Date().toISOString(), retentionNotice: 'Submitted time, safety, and audit evidence may be retained under workspace policy or legal hold.', data }, null, 2), ContentType: 'application/json', ...(process.env.S3_ENDPOINT ? {} : { ServerSideEncryption: 'AES256' }) })); await governanceRepository.completeSubjectRequest(request.id, { result: { categories: Object.keys(data) }, objectKey, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }); } catch (error) { await governanceRepository.failSubjectRequest(request.id, error instanceof Error ? error.message : 'Subject request failed.'); throw error; } }, { connection, concurrency: 2 });
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
async function processIntegrations() {
  await integrationRepository.fanOutAuditEvents();
  for (let count = 0; count < 20; count += 1) { const delivery = await integrationRepository.claimDueDelivery(); if (!delivery) break; const target = await integrationRepository.deliveryTarget(delivery.endpointId); if (!target?.enabled) { await integrationRepository.retryDelivery(delivery.id, { dead: true, nextAttemptAt: new Date(), error: 'Endpoint is disabled.' }); continue; } const payload = JSON.stringify(delivery.payload); const timestamp = Math.floor(Date.now() / 1000); try { const secret = decryptSecretEnvelope(target.secretEncrypted, required('WEBHOOK_SECRET_ENCRYPTION_KEY')); const response = await fetch(target.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'VoiceForge-Webhooks/1.0', 'x-voiceforge-delivery': delivery.id, 'x-voiceforge-signature': createWebhookSignature(secret, timestamp, payload) }, body: payload, signal: AbortSignal.timeout(10_000) }); const responseBody = await response.text(); if (response.ok) await integrationRepository.markDelivered(delivery.id, response.status, responseBody); else await integrationRepository.retryDelivery(delivery.id, { dead: delivery.attemptCount >= 8, nextAttemptAt: new Date(Date.now() + webhookRetryDelay(delivery.attemptCount)), responseStatus: response.status, error: `HTTP ${response.status}: ${responseBody}` }); } catch (error) { await integrationRepository.retryDelivery(delivery.id, { dead: delivery.attemptCount >= 8, nextAttemptAt: new Date(Date.now() + webhookRetryDelay(delivery.attemptCount)), error: error instanceof Error ? error.message : 'Delivery failed.' }); } }
}
await processIntegrations(); const integrationTimer = setInterval(() => void processIntegrations(), 5_000);
const retentionTimer = setInterval(() => void governanceRepository.enforceRetention(), 60 * 60 * 1000);

async function shutdown() {
  clearInterval(recoveryTimer);
  clearInterval(safetyRecoveryTimer);
  clearInterval(integrationTimer);
  clearInterval(retentionTimer);
  await Promise.all([worker.close(), safetyWorker.close(), exportWorker.close(), subjectWorker.close()]);
  await Promise.all([queue.close(), safetyQueue.close(), exportQueue.close(), subjectQueue.close()]);
  ses.destroy(); await database.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown().finally(() => process.exit(0)));
