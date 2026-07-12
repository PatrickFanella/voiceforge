import type { DatabaseConnection } from '@/db/types';
import { applySyncTransaction, getPendingMutations, getSyncCursor, prepareReplicaRebuild, type MutationAcknowledgement, type PullPage } from '@/db/sync';

export interface SyncClientOptions {
  apiUrl: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
}

export class VoiceForgeSyncClient {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: SyncClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async synchronize(db: DatabaseConnection, workspaceId: string, rebuild = false): Promise<void> {
    if (rebuild) await prepareReplicaRebuild(db, workspaceId);
    const token = await this.options.getAccessToken();
    const pending = await getPendingMutations(db, workspaceId);
    let acknowledgements: MutationAcknowledgement[] = [];
    if (pending.length) {
      const response = await this.fetch(`${this.options.apiUrl}/v1/sync/push`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': pending[0]!.mutationId,
        },
        body: JSON.stringify({ workspaceId, deviceId: pending[0]!.deviceId, mutations: pending }),
      });
      acknowledgements = (await decodeJson<{ results: MutationAcknowledgement[] }>(response)).results;
    }

    let cursor = await getSyncCursor(db, workspaceId);
    do {
      const query = new URLSearchParams({ workspaceId, ...(cursor ? { cursor } : {}) });
      const response = await this.fetch(`${this.options.apiUrl}/v1/sync/pull?${query}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const page = await decodeJson<PullPage>(response);
      await applySyncTransaction(db, workspaceId, page, acknowledgements);
      acknowledgements = [];
      cursor = page.cursor;
      if (!page.hasMore) break;
    } while (true);
  }
}

async function decodeJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T | { error?: { message?: string } };
  if (!response.ok) {
    const message = 'error' in (body as object) ? (body as { error?: { message?: string } }).error?.message : undefined;
    throw new Error(message ?? `Synchronization failed with status ${response.status}.`);
  }
  return body as T;
}
