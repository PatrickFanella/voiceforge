import { createHash } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { VoiceForgeDatabase } from './client.js';
import { IdempotencyConflictError } from './job-repository.js';
import { auditEvents, exportJobs, idempotencyKeys, safetyReports, safetyRevisions, timeApprovals, timeEntries, timeEntryRevisions, webhookDeliveries, webhookEndpoints } from './schema.js';
type Transaction = Parameters<Parameters<VoiceForgeDatabase['transaction']>[0]>[0];

export class IntegrationRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}
  async createExport(input: { workspaceId: string; requestedBy: string; idempotencyKey: string; format: 'csv' | 'json'; scope: 'approved_time' | 'safety' | 'all' }) {
    return this.mutate(input.workspaceId, input.requestedBy, input.idempotencyKey, { operation: 'export.create', ...input }, async (tx) => { const [job] = await tx.insert(exportJobs).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, requestedBy: input.requestedBy, format: input.format, scope: input.scope }).returning(); return job!; });
  }
  async getExport(workspaceId: string, id: string) { const [job] = await this.db.select().from(exportJobs).where(and(eq(exportJobs.workspaceId, workspaceId), eq(exportJobs.id, id))).limit(1); return job ?? null; }
  async listExports(workspaceId: string) { return this.db.select().from(exportJobs).where(eq(exportJobs.workspaceId, workspaceId)).orderBy(desc(exportJobs.createdAt)).limit(100); }
  async claimExport(id: string) { const [job] = await this.db.update(exportJobs).set({ status: 'processing', updatedAt: new Date() }).where(and(eq(exportJobs.id, id), eq(exportJobs.status, 'queued'))).returning(); return job ?? null; }
  async exportRows(workspaceId: string, scope: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    if (scope === 'approved_time' || scope === 'all') {
      const time = await this.db.select({ id: timeEntries.id, workerUserId: timeEntries.workerUserId, jobId: timeEntries.jobId, status: timeEntries.status, revision: timeEntryRevisions.revisionNumber, startedAt: timeEntryRevisions.startedAt, endedAt: timeEntryRevisions.endedAt, totalMinutes: timeEntryRevisions.totalMinutes, entryType: timeEntryRevisions.entryType, notes: timeEntryRevisions.notes, correctionReason: timeEntryRevisions.correctionReason })
        .from(timeEntries).innerJoin(timeEntryRevisions, eq(timeEntryRevisions.timeEntryId, timeEntries.id))
        .where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.status, 'approved')));
      const approvals = await this.db.select({ id: timeApprovals.id, timeEntryId: timeApprovals.timeEntryId, revision: timeApprovals.revisionNumber, decision: timeApprovals.decision, reason: timeApprovals.reason, decidedBy: timeApprovals.decidedBy, decidedAt: timeApprovals.decidedAt }).from(timeApprovals).where(eq(timeApprovals.workspaceId, workspaceId));
      rows.push(...time.map((row) => ({ recordType: 'time_entry_revision', ...row })), ...approvals.map((row) => ({ recordType: 'time_approval', ...row })));
    }
    if (scope === 'safety' || scope === 'all') {
      const safety = await this.db.select({ id: safetyReports.id, jobId: safetyReports.jobId, severity: safetyReports.severity, status: safetyReports.status, revision: safetyRevisions.revisionNumber, reportType: safetyRevisions.reportType, description: safetyRevisions.description, location: safetyRevisions.location, occurredAt: safetyRevisions.occurredAt, correctionReason: safetyRevisions.correctionReason })
        .from(safetyReports).innerJoin(safetyRevisions, eq(safetyRevisions.safetyReportId, safetyReports.id)).where(eq(safetyReports.workspaceId, workspaceId));
      rows.push(...safety.map((row) => ({ recordType: 'safety_report_revision', ...row })));
    }
    return rows;
  }
  async completeExport(id: string, input: { objectKey: string; rowCount: number; expiresAt: Date }) { await this.db.update(exportJobs).set({ status: 'completed', ...input, completedAt: new Date(), updatedAt: new Date() }).where(eq(exportJobs.id, id)); }
  async failExport(id: string, error: string) { await this.db.update(exportJobs).set({ status: 'failed', errorMessage: error.slice(0, 1000), updatedAt: new Date() }).where(eq(exportJobs.id, id)); }
  async createEndpoint(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; url: string; secretEncrypted: string; eventTypes: string[] }) { return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, { operation: 'webhook.create', workspaceId: input.workspaceId, url: input.url, eventTypes: input.eventTypes }, async (tx) => { const [endpoint] = await tx.insert(webhookEndpoints).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, url: input.url, secretEncrypted: input.secretEncrypted, eventTypes: input.eventTypes }).returning(); return endpoint!; }); }
  async listEndpoints(workspaceId: string) { return this.db.select({ id: webhookEndpoints.id, workspaceId: webhookEndpoints.workspaceId, url: webhookEndpoints.url, enabled: webhookEndpoints.enabled, eventTypes: webhookEndpoints.eventTypes, createdAt: webhookEndpoints.createdAt, updatedAt: webhookEndpoints.updatedAt }).from(webhookEndpoints).where(eq(webhookEndpoints.workspaceId, workspaceId)).orderBy(desc(webhookEndpoints.createdAt)); }
  async listDeliveries(workspaceId: string) { return this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.workspaceId, workspaceId)).orderBy(desc(webhookDeliveries.createdAt)).limit(200); }
  async setEndpointEnabled(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; enabled: boolean }) { return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, { operation: 'webhook.set_enabled', ...input }, async (tx) => { const [endpoint] = await tx.update(webhookEndpoints).set({ enabled: input.enabled, updatedAt: new Date() }).where(and(eq(webhookEndpoints.workspaceId, input.workspaceId), eq(webhookEndpoints.id, input.id))).returning(); return endpoint ?? null; }); }
  async fanOutAuditEvents() {
    const endpoints = await this.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.enabled, true)); let created = 0;
    for (const endpoint of endpoints) await this.db.transaction(async (tx) => {
      const events = await tx.select().from(auditEvents).where(and(eq(auditEvents.workspaceId, endpoint.workspaceId), sql`${auditEvents.sequence} > ${endpoint.lastAuditSequence}`)).orderBy(asc(auditEvents.sequence)).limit(100);
      for (const event of events) if (endpoint.eventTypes.includes(event.action)) { await tx.insert(webhookDeliveries).values({ id: crypto.randomUUID(), workspaceId: endpoint.workspaceId, endpointId: endpoint.id, eventType: event.action, entityType: event.entityType, entityId: event.entityId, payload: { id: event.id, sequence: event.sequence, type: event.action, entityType: event.entityType, entityId: event.entityId, occurredAt: event.occurredAt.toISOString(), data: event.details } }); created += 1; }
      const latest = events.at(-1); if (latest) await tx.update(webhookEndpoints).set({ lastAuditSequence: latest.sequence, updatedAt: new Date() }).where(eq(webhookEndpoints.id, endpoint.id));
    }); return created;
  }
  async claimDueDelivery(now = new Date()) {
    const rows = await this.db.execute(sql`with candidate as (select id from webhook_deliveries where status in ('queued','retrying') and next_attempt_at <= ${now.toISOString()}::timestamptz order by next_attempt_at for update skip locked limit 1) update webhook_deliveries d set status = 'delivering', attempt_count = attempt_count + 1, updated_at = now() from candidate where d.id = candidate.id returning d.id, d.endpoint_id as "endpointId", d.payload, d.attempt_count as "attemptCount"`);
    return rows[0] as { id: string; endpointId: string; payload: unknown; attemptCount: number } | undefined ?? null;
  }
  async deliveryTarget(endpointId: string) { const [target] = await this.db.select({ url: webhookEndpoints.url, secretEncrypted: webhookEndpoints.secretEncrypted, enabled: webhookEndpoints.enabled }).from(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId)).limit(1); return target ?? null; }
  async markDelivered(id: string, responseStatus: number, responseBody: string) { await this.db.update(webhookDeliveries).set({ status: 'delivered', responseStatus, responseBody: responseBody.slice(0, 2000), deliveredAt: new Date(), updatedAt: new Date() }).where(eq(webhookDeliveries.id, id)); }
  async retryDelivery(id: string, input: { dead: boolean; nextAttemptAt: Date; responseStatus?: number; error: string }) { await this.db.update(webhookDeliveries).set({ status: input.dead ? 'dead_letter' : 'retrying', nextAttemptAt: input.nextAttemptAt, responseStatus: input.responseStatus, lastError: input.error.slice(0, 1000), updatedAt: new Date() }).where(eq(webhookDeliveries.id, id)); }
  async replayDelivery(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string }) { return this.mutate(input.workspaceId, input.actorUserId, input.idempotencyKey, { operation: 'webhook.replay', ...input }, async (tx) => { const [delivery] = await tx.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.workspaceId, input.workspaceId), eq(webhookDeliveries.id, input.id))).limit(1); if (!delivery) return null; const [copy] = await tx.insert(webhookDeliveries).values({ id: crypto.randomUUID(), workspaceId: input.workspaceId, endpointId: delivery.endpointId, eventType: delivery.eventType, entityType: delivery.entityType, entityId: delivery.entityId, payload: delivery.payload }).returning(); return copy!; }); }

  private async mutate<T>(workspaceId: string, actorUserId: string, key: string, request: unknown, operation: (tx: Transaction) => Promise<T>): Promise<T> { return this.db.transaction(async (tx) => { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${key}`}, 0))`); const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex'); const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key))).limit(1); if (existing) { if (existing.requestHash !== requestHash) throw new IdempotencyConflictError('Idempotency key conflicts with another request.'); return existing.responseBody as T; } await tx.insert(idempotencyKeys).values({ workspaceId, key, actorUserId, requestHash, expiresAt: new Date(Date.now() + 86_400_000) }); const response = await operation(tx); await tx.update(idempotencyKeys).set({ responseStatus: 200, responseBody: response, locked: false, updatedAt: new Date() }).where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key))); return response; }); }
}
