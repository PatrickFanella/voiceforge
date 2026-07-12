import { migrateDatabase } from '@/db/migrations';
import { applySyncTransaction, getPendingMutations, queueMutation } from '@/db/sync';
import { BunDatabaseConnection } from './support/bun-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const workspaceId = '01980f58-9b8d-7000-8000-000000000021';
const deviceId = '01980f58-9b8d-7000-8000-000000000022';
const entityId = '01980f58-9b8d-7000-8000-000000000023';

describe('mobile synchronization replica', () => {
  let database: BunDatabaseConnection;

  beforeEach(async () => {
    database = new BunDatabaseConnection();
    await migrateDatabase(database);
  });
  afterEach(() => database.close());

  it('queues offline mutations and atomically applies acknowledgement, server changes, and cursor', async () => {
    await queueMutation(database, {
      mutationId: '01980f58-9b8d-7000-8000-000000000024', workspaceId, deviceId,
      entityType: 'job', entityId, operation: 'create', baseVersion: 0, payload: { name: 'Offline job' },
    });
    expect(await getPendingMutations(database, workspaceId)).toHaveLength(1);

    await applySyncTransaction(database, workspaceId, {
      cursor: 'signed-cursor-1',
      changes: [{
        sequence: 1, entityType: 'job', entityId, operation: 'upsert', version: 1,
        payload: { name: 'Offline job', address: '1 Main St', status: 'active', createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z' },
      }],
    }, [{ mutationId: '01980f58-9b8d-7000-8000-000000000024', status: 'applied' }]);

    expect(await getPendingMutations(database, workspaceId)).toEqual([]);
    expect(await database.getFirstAsync('SELECT title, server_version AS serverVersion, sync_status AS syncStatus FROM jobs WHERE id = ?', entityId))
      .toEqual({ title: 'Offline job', serverVersion: 1, syncStatus: 'synced' });
    expect(await database.getFirstAsync('SELECT cursor FROM sync_cursors WHERE workspace_id = ?', workspaceId))
      .toEqual({ cursor: 'signed-cursor-1' });
  });

  it('preserves an unsent mutation and server conflict payload during replica rebuild', async () => {
    const mutationId = '01980f58-9b8d-7000-8000-000000000025';
    await queueMutation(database, {
      mutationId, workspaceId, deviceId, entityType: 'job', entityId, operation: 'update', baseVersion: 1,
      payload: { name: 'Local edit' },
    });
    await applySyncTransaction(database, workspaceId, {
      cursor: 'signed-cursor-2',
      changes: [{ sequence: 2, entityType: 'job', entityId, operation: 'upsert', version: 2, payload: { name: 'Server edit' } }],
    }, [{ mutationId, status: 'conflict', errorCode: 'VERSION_CONFLICT' }]);

    expect(await getPendingMutations(database, workspaceId)).toHaveLength(1);
    const conflict = await database.getFirstAsync<{ lastError: string; conflictPayload: string }>(
      'SELECT last_error AS lastError, conflict_payload_json AS conflictPayload FROM sync_outbox WHERE mutation_id = ?', mutationId,
    );
    expect(conflict?.lastError).toBe('SERVER_CHANGE_CONFLICT');
    expect(JSON.parse(conflict?.conflictPayload ?? '{}')).toMatchObject({ version: 2, payload: { name: 'Server edit' } });
    expect(await database.getFirstAsync('SELECT cursor FROM sync_cursors WHERE workspace_id = ?', workspaceId))
      .toEqual({ cursor: 'signed-cursor-2' });
  });
});
