import { and, asc, eq, gt } from 'drizzle-orm';
import type { VoiceForgeDatabase } from './client.js';
import { workspaceChanges } from './schema.js';

export class SyncRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}

  async pull(workspaceId: string, afterSequence: number, limit = 500) {
    const rows = await this.db.select({
      sequence: workspaceChanges.sequence, entityType: workspaceChanges.entityType, entityId: workspaceChanges.entityId,
      operation: workspaceChanges.operation, version: workspaceChanges.version, payload: workspaceChanges.payload,
    }).from(workspaceChanges)
      .where(and(eq(workspaceChanges.workspaceId, workspaceId), gt(workspaceChanges.sequence, afterSequence)))
      .orderBy(asc(workspaceChanges.sequence)).limit(limit + 1);
    return { changes: rows.slice(0, limit), hasMore: rows.length > limit };
  }
}
