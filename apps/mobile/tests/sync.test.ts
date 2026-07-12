import { migrateDatabase } from '@/db/migrations';
import { applySyncTransaction, getPendingMutations, queueMutation } from '@/db/sync';
import { VoiceForgeRepository } from '@/db/repository';
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

  it('applies transcription completion as a voice-log delta without creating time or safety records', async () => {
    const voiceLogId = '01980f58-9b8d-7000-8000-000000000026';
    await applySyncTransaction(database, workspaceId, {
      cursor: 'signed-cursor-voice',
      changes: [{
        sequence: 3, entityType: 'voice_log', entityId: voiceLogId, operation: 'upsert', version: 2,
        payload: { transcript: 'Two hours on site.', transcriptConfidence: 9000, transcriptProvider: 'deepgram', updatedAt: '2026-07-12T00:00:00Z' },
      }],
    }, []);
    expect(await database.getFirstAsync('SELECT transcript, confidence, provider FROM voice_logs WHERE id = ?', voiceLogId))
      .toEqual({ transcript: 'Two hours on site.', confidence: 0.9, provider: 'deepgram' });
    expect(await database.getFirstAsync<{ count: number }>('SELECT count(*) AS count FROM time_entries')).toEqual({ count: 0 });
    expect(await database.getFirstAsync<{ count: number }>('SELECT count(*) AS count FROM safety_reports')).toEqual({ count: 0 });
  });

  it('queues and coalesces offline time drafts only after explicit workspace assignment', async () => {
    const repository = new VoiceForgeRepository(database);
    const timeId = '01980f58-9b8d-7000-8000-000000000027';
    await database.runAsync(
      `INSERT INTO jobs
       (id, title, client, address, status, trade, priority, start_date, due_date, hours_logged, hours_estimated, notes_json, crew_json, created_at, updated_at, workspace_id)
       VALUES (?, 'Server job', '', '', 'active', '', 'medium', '2026-07-12', '2026-07-12', 0, 0, '[]', '[]', ?, ?, ?)`,
      entityId, '2026-07-12T00:00:00Z', '2026-07-12T00:00:00Z', workspaceId,
    );
    await repository.setSetting('active_workspace_id', workspaceId);
    const entry = {
      id: timeId, jobId: entityId, jobTitle: 'Server job', date: '2026-07-12', startTime: '23:30', endTime: '00:30',
      hours: 1, type: 'regular' as const, notes: 'Initial', voiceLogged: false,
    };
    await repository.addTimeEntry(entry);
    await repository.updateTimeEntry({ ...entry, notes: 'Edited offline' });
    const pending = await getPendingMutations(database, workspaceId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entityType: 'time_entry', operation: 'create', baseVersion: 0, payload: { notes: 'Edited offline' } });
  });
});
