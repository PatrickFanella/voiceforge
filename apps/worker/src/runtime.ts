import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import type { ConnectionOptions, JobsOptions } from 'bullmq';

export const webhookRetryDelay = (attempt: number) => Math.min(3_600_000, 1_000 * 2 ** attempt);
export const createWebhookSignature = (secret: string, timestamp: number, payload: string) => `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
export function decryptSecretEnvelope(value: string, masterKey: string) { const [iv, tag, encrypted] = value.split('.'); if (!iv || !tag || !encrypted) throw new Error('Invalid secret envelope.'); const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(masterKey).digest(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'); }
export function exportRowsToCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => { const text = value == null ? '' : String(value); return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => cell(row[header])).join(',')).join('\n')}\n`;
}

export function parseRedisConnection(value: string): ConnectionOptions {
  const url = new URL(value);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') throw new Error('REDIS_URL must use redis or rediss.');
  return {
    host: url.hostname, port: Number(url.port || 6379), maxRetriesPerRequest: null,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export const transcriptionJobOptions = (jobId: string): JobsOptions => ({
  jobId, attempts: 5, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1_000,
});

export async function recoverQueuedJobs(
  repository: { listRecoverable(before: Date): Promise<string[]> },
  queue: { add(name: 'transcribe', data: { jobId: string }, options: JobsOptions): Promise<unknown> },
  now = new Date(),
) {
  const ids = await repository.listRecoverable(new Date(now.getTime() - 5 * 60 * 1000));
  await Promise.all(ids.map((jobId) => queue.add('transcribe', { jobId }, transcriptionJobOptions(jobId))));
  return ids.length;
}
