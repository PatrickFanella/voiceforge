import { migrateDatabase } from '@/db/migrations';
import { getPendingMutations, queueMutation } from '@/db/sync';
import { VoiceForgeSyncClient } from '@/features/sync/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BunDatabaseConnection } from './support/bun-database';

const workspaceId = '01980f58-9b8d-7000-8000-000000000031';
const mutationId = '01980f58-9b8d-7000-8000-000000000032';
const entityId = '01980f58-9b8d-7000-8000-000000000033';

describe('VoiceForgeSyncClient', () => {
  let database: BunDatabaseConnection;
  beforeEach(async () => { database = new BunDatabaseConnection(); await migrateDatabase(database); });
  afterEach(() => database.close());

  it('pushes the outbox before pulling and applies both in one local transaction', async () => {
    await queueMutation(database, {
      mutationId, workspaceId, deviceId: '01980f58-9b8d-7000-8000-000000000034', entityType: 'job', entityId,
      operation: 'create', baseVersion: 0, payload: { name: 'Offline' },
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ mutationId, entityId, status: 'applied', version: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        cursor: 'cursor-1', hasMore: false,
        changes: [{ sequence: 1, entityType: 'job', entityId, operation: 'upsert', version: 1, payload: { name: 'Offline' } }],
      }), { status: 200 }));
    const client = new VoiceForgeSyncClient({ apiUrl: 'https://api.test', getAccessToken: async () => 'token', fetch });
    await client.synchronize(database, workspaceId);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await getPendingMutations(database, workspaceId)).toEqual([]);
  });

  it('leaves the outbox untouched when the network request fails', async () => {
    await queueMutation(database, {
      mutationId, workspaceId, deviceId: '01980f58-9b8d-7000-8000-000000000034', entityType: 'job', entityId,
      operation: 'create', baseVersion: 0, payload: { name: 'Offline' },
    });
    const client = new VoiceForgeSyncClient({
      apiUrl: 'https://api.test', getAccessToken: async () => 'token',
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    await expect(client.synchronize(database, workspaceId)).rejects.toThrow('offline');
    expect(await getPendingMutations(database, workspaceId)).toHaveLength(1);
  });
});
