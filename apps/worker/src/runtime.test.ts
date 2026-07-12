import { describe, expect, it, vi } from 'vitest';
import { parseRedisConnection, recoverQueuedJobs } from './runtime.js';
import { Queue, QueueEvents, Worker } from 'bullmq';

describe('worker runtime', () => {
  it('parses authenticated TLS Redis URLs without leaking credentials', () => {
    expect(parseRedisConnection('rediss://worker:secret@redis.example:6380')).toMatchObject({
      host: 'redis.example', port: 6380, username: 'worker', password: 'secret', tls: {}, maxRetriesPerRequest: null,
    });
    expect(() => parseRedisConnection('http://redis.example')).toThrow('redis or rediss');
  });

  it('re-enqueues durable orphaned jobs with bounded exponential retries', async () => {
    const repository = { listRecoverable: vi.fn(async () => ['job-1', 'job-2']) };
    const queue = { add: vi.fn(async () => undefined) };
    await expect(recoverQueuedJobs(repository, queue, new Date('2026-01-01T00:10:00Z'))).resolves.toBe(2);
    expect(repository.listRecoverable).toHaveBeenCalledWith(new Date('2026-01-01T00:05:00Z'));
    expect(queue.add).toHaveBeenCalledWith('transcribe', { jobId: 'job-1' }, expect.objectContaining({
      jobId: 'job-1', attempts: 5, backoff: { type: 'exponential', delay: 2000 },
    }));
  });
});

const redisSuite = process.env.TEST_REDIS_URL ? describe : describe.skip;
redisSuite('BullMQ against Redis', () => {
  it('retries a transient failure and completes the idempotent job', async () => {
    const connection = parseRedisConnection(process.env.TEST_REDIS_URL!);
    const name = `voiceforge-worker-test-${Date.now()}`;
    const queue = new Queue<{ jobId: string }>(name, { connection });
    const events = new QueueEvents(name, { connection });
    let attempts = 0;
    const worker = new Worker<{ jobId: string }>(name, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient');
      return { completed: true };
    }, { connection });
    try {
      await events.waitUntilReady();
      const job = await queue.add('transcribe', { jobId: 'job-1' }, { attempts: 2, backoff: { type: 'fixed', delay: 10 } });
      await expect(job.waitUntilFinished(events, 5_000)).resolves.toEqual({ completed: true });
      expect(attempts).toBe(2);
    } finally {
      await worker.close(); await events.close(); await queue.obliterate({ force: true }); await queue.close();
    }
  });
});
