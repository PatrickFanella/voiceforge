import type { ConnectionOptions, JobsOptions } from 'bullmq';

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
