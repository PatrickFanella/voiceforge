import type { DatabaseConnection } from './types';

export interface OutboxMutation {
  mutationId: string;
  workspaceId: string;
  deviceId: string;
  entityType: 'job';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  baseVersion: number;
  payload: Record<string, unknown>;
}

export interface PullPage {
  cursor: string;
  hasMore?: boolean;
  changes: Array<{
    sequence: number;
    entityType: string;
    entityId: string;
    operation: 'upsert' | 'delete';
    version: number;
    payload: Record<string, unknown> | null;
  }>;
}

export async function getSyncCursor(db: DatabaseConnection, workspaceId: string): Promise<string | undefined> {
  const row = await db.getFirstAsync<{ cursor: string }>('SELECT cursor FROM sync_cursors WHERE workspace_id = ?', workspaceId);
  return row?.cursor;
}

export async function prepareReplicaRebuild(db: DatabaseConnection, workspaceId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM jobs WHERE workspace_id = ? AND sync_status = 'synced'`, workspaceId);
    await db.runAsync('DELETE FROM sync_cursors WHERE workspace_id = ?', workspaceId);
  });
}

export interface MutationAcknowledgement {
  mutationId: string;
  status: 'applied' | 'conflict';
  errorCode?: string;
}

const now = () => new Date().toISOString();

export async function queueMutation(db: DatabaseConnection, mutation: OutboxMutation): Promise<void> {
  const timestamp = now();
  await db.runAsync(
    `INSERT INTO sync_outbox
      (mutation_id, workspace_id, device_id, entity_type, entity_id, operation, base_version, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    mutation.mutationId, mutation.workspaceId, mutation.deviceId, mutation.entityType, mutation.entityId,
    mutation.operation, mutation.baseVersion, JSON.stringify(mutation.payload), timestamp, timestamp,
  );
}

export async function getPendingMutations(db: DatabaseConnection, workspaceId: string, limit = 100): Promise<OutboxMutation[]> {
  const rows = await db.getAllAsync<{
    mutationId: string; workspaceId: string; deviceId: string; entityType: 'job'; entityId: string;
    operation: OutboxMutation['operation']; baseVersion: number; payloadJson: string;
  }>(
    `SELECT mutation_id AS mutationId, workspace_id AS workspaceId, device_id AS deviceId,
      entity_type AS entityType, entity_id AS entityId, operation, base_version AS baseVersion, payload_json AS payloadJson
     FROM sync_outbox WHERE workspace_id = ? ORDER BY created_at LIMIT ?`, workspaceId, limit,
  );
  return rows.map(({ payloadJson, ...row }) => ({ ...row, payload: JSON.parse(payloadJson) as Record<string, unknown> }));
}

export async function applySyncTransaction(
  db: DatabaseConnection,
  workspaceId: string,
  page: PullPage,
  acknowledgements: MutationAcknowledgement[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const acknowledgement of acknowledgements) {
      if (acknowledgement.status === 'applied') {
        await db.runAsync('DELETE FROM sync_outbox WHERE mutation_id = ? AND workspace_id = ?', acknowledgement.mutationId, workspaceId);
      } else {
        await db.runAsync(
          'UPDATE sync_outbox SET last_error = ?, attempts = attempts + 1, updated_at = ? WHERE mutation_id = ? AND workspace_id = ?',
          acknowledgement.errorCode ?? 'VERSION_CONFLICT', now(), acknowledgement.mutationId, workspaceId,
        );
      }
    }

    for (const change of page.changes) {
      if (change.entityType !== 'job') continue;
      const pending = await db.getFirstAsync<{ mutationId: string }>(
        'SELECT mutation_id AS mutationId FROM sync_outbox WHERE workspace_id = ? AND entity_id = ? LIMIT 1', workspaceId, change.entityId,
      );
      if (pending) {
        await db.runAsync(
          'UPDATE sync_outbox SET last_error = ?, conflict_payload_json = ?, updated_at = ? WHERE mutation_id = ?',
          'SERVER_CHANGE_CONFLICT', JSON.stringify(change), now(), pending.mutationId,
        );
        continue;
      }
      if (change.operation === 'delete') {
        await db.runAsync(
          `UPDATE jobs SET deleted_at = ?, server_version = ?, sync_status = 'synced', updated_at = ? WHERE id = ? AND workspace_id = ?`,
          now(), change.version, now(), change.entityId, workspaceId,
        );
        continue;
      }
      const payload = change.payload ?? {};
      const title = typeof payload.name === 'string' ? payload.name : 'Untitled job';
      const address = typeof payload.address === 'string' ? payload.address : '';
      const status = typeof payload.status === 'string' ? payload.status : 'active';
      const createdAt = typeof payload.createdAt === 'string' ? payload.createdAt : now();
      const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : now();
      await db.runAsync(
        `INSERT INTO jobs
          (id, title, client, address, status, trade, priority, start_date, due_date, hours_logged, hours_estimated,
           notes_json, crew_json, created_at, updated_at, workspace_id, server_version, sync_status, deleted_at)
         VALUES (?, ?, '', ?, ?, '', 'medium', ?, ?, 0, 0, '[]', '[]', ?, ?, ?, ?, 'synced', NULL)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, address = excluded.address, status = excluded.status,
           updated_at = excluded.updated_at, workspace_id = excluded.workspace_id, server_version = excluded.server_version,
           sync_status = 'synced', deleted_at = NULL`,
        change.entityId, title, address, status, createdAt.slice(0, 10), updatedAt.slice(0, 10), createdAt, updatedAt,
        workspaceId, change.version,
      );
    }

    await db.runAsync(
      `INSERT INTO sync_cursors (workspace_id, cursor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
      workspaceId, page.cursor, now(),
    );
  });
}
