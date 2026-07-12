import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { escalationSchedule, requireSafetyReason, transitionSafety, type SafetySeverity, type SafetyStatus } from '@voiceforge/workflows';
import type { VoiceForgeDatabase } from './client.js';
import { EntityNotFoundError, IdempotencyConflictError } from './job-repository.js';
import {
  auditEvents, devices, emailDeliveries, idempotencyKeys, jobs, notificationDeliveries, pushTokens,
  safetyAcknowledgements, safetyAssignments, safetyEscalationContacts, safetyReports, safetyRevisions,
  users, workspaceChanges, workspaceMemberships, workspacePolicies, workspaces,
} from './schema.js';

type Transaction = Parameters<Parameters<VoiceForgeDatabase['transaction']>[0]>[0];
export interface SafetyRecord {
  id: string; workspaceId: string; reporterUserId: string; jobId: string; status: SafetyStatus; severity: SafetySeverity;
  version: number; revisionNumber: number; reportType: string; description: string; location: string | null;
  occurredAt: Date; correctionReason: string | null; submittedAt: Date | null; acknowledgementDueAt: Date | null;
  acknowledgedAt: Date | null; escalationLevel: number; nextEscalationAt: Date | null;
  escalationSilencedAt: Date | null; escalationSilenceReason: string | null; createdAt: Date; updatedAt: Date;
}
const selection = {
  id: safetyReports.id, workspaceId: safetyReports.workspaceId, reporterUserId: safetyReports.reporterUserId,
  jobId: safetyReports.jobId, status: safetyReports.status, severity: safetyReports.severity, version: safetyReports.version,
  revisionNumber: safetyReports.currentRevisionNumber, reportType: safetyRevisions.reportType,
  description: safetyRevisions.description, location: safetyRevisions.location, occurredAt: safetyRevisions.occurredAt,
  correctionReason: safetyRevisions.correctionReason, submittedAt: safetyReports.submittedAt,
  acknowledgementDueAt: safetyReports.acknowledgementDueAt, acknowledgedAt: safetyReports.acknowledgedAt,
  escalationLevel: safetyReports.escalationLevel, nextEscalationAt: safetyReports.nextEscalationAt,
  escalationSilencedAt: safetyReports.escalationSilencedAt, escalationSilenceReason: safetyReports.escalationSilenceReason,
  createdAt: safetyReports.createdAt, updatedAt: safetyReports.updatedAt,
};

export class SafetyRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}

  async registerPushToken(input: { userId: string; deviceId: string; platform: string; expoToken: string }) {
    await this.db.transaction(async (tx) => {
      await tx.insert(devices).values({ id: input.deviceId, userId: input.userId, platform: input.platform })
        .onConflictDoUpdate({ target: devices.id, set: { userId: input.userId, platform: input.platform, revokedAt: null, lastSeenAt: new Date(), updatedAt: new Date() } });
      await tx.insert(pushTokens).values({ id: crypto.randomUUID(), userId: input.userId, deviceId: input.deviceId, expoToken: input.expoToken })
        .onConflictDoUpdate({ target: pushTokens.expoToken, set: { userId: input.userId, deviceId: input.deviceId, enabled: true, lastError: null, updatedAt: new Date() } });
    });
  }

  async configurePolicy(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; acknowledgementSlaMinutes: number; escalationRepeatMinutes: number; emergencyInstructions: string }) {
    return this.mutate(input, 'safety.policy.configure', async (tx) => {
      const [policy] = await tx.insert(workspacePolicies).values({
        workspaceId: input.workspaceId, safetyAcknowledgementSlaMinutes: input.acknowledgementSlaMinutes,
        safetyEscalationRepeatMinutes: input.escalationRepeatMinutes, emergencyInstructions: input.emergencyInstructions,
      }).onConflictDoUpdate({ target: workspacePolicies.workspaceId, set: {
        safetyAcknowledgementSlaMinutes: input.acknowledgementSlaMinutes,
        safetyEscalationRepeatMinutes: input.escalationRepeatMinutes, emergencyInstructions: input.emergencyInstructions, updatedAt: new Date(),
      } }).returning();
      await recordAdministrativeEvidence(tx, input.workspaceId, input.actorUserId, 'safety_policy.configured', 'workspace_policy', input.workspaceId, policy!);
      return policy!;
    }, hydrateObjectDates);
  }

  async configureContacts(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; contacts: Array<{ userId?: string; email?: string }> }) {
    return this.mutate(input, 'safety.contacts.configure', async (tx) => {
      if (input.contacts.some((contact) => !contact.userId && !contact.email)) throw new Error('Each safety contact requires a user or email.');
      await tx.delete(safetyEscalationContacts).where(eq(safetyEscalationContacts.workspaceId, input.workspaceId));
      const values = input.contacts.map((contact, index) => ({
        id: crypto.randomUUID(), workspaceId: input.workspaceId, userId: contact.userId,
        email: contact.email?.toLowerCase(), escalationOrder: index,
      }));
      const contacts = await tx.insert(safetyEscalationContacts).values(values).returning();
      await recordAdministrativeEvidence(tx, input.workspaceId, input.actorUserId, 'safety_contacts.configured', 'safety_contacts', input.workspaceId, { count: contacts.length });
      return contacts;
    }, (value) => (value as Array<Record<string, unknown>>).map(hydrateObjectDates));
  }

  async createDraft(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; jobId: string; severity: SafetySeverity; reportType: string; description: string; location?: string; occurredAt: Date }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.create', async (tx) => {
      const [job] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId), isNull(jobs.deletedAt))).limit(1);
      if (!job) throw new EntityNotFoundError('Job not found.');
      await tx.insert(safetyReports).values({
        id: input.id, workspaceId: input.workspaceId, reporterUserId: input.actorUserId, jobId: input.jobId,
        severity: input.severity, createdBy: input.actorUserId, updatedBy: input.actorUserId,
      });
      await tx.insert(safetyRevisions).values({
        safetyReportId: input.id, revisionNumber: 1, reportType: input.reportType,
        description: input.description, location: input.location, occurredAt: input.occurredAt, createdBy: input.actorUserId,
      });
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'safety_report.created', record);
      return record;
    }, hydrateSafety);
  }

  async submit(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.submit', async (tx) => {
      const current = await getReportForUpdate(tx, input.workspaceId, input.id);
      if (current.reporterUserId !== input.actorUserId || current.status !== 'draft') throw new Error('Only the reporter may submit a draft safety report.');
      const [policy] = await tx.select().from(workspacePolicies).where(eq(workspacePolicies.workspaceId, input.workspaceId)).limit(1);
      const sla = policy?.safetyAcknowledgementSlaMinutes ?? 15;
      const submittedAt = new Date();
      const nextEscalationAt = escalationSchedule({ severity: current.severity, submittedAt, acknowledgementSlaMinutes: sla });
      await tx.update(safetyReports).set({
        status: transitionSafety('draft', 'submitted'), submittedAt, acknowledgementDueAt: new Date(submittedAt.getTime() + sla * 60_000),
        nextEscalationAt, version: current.version + 1, updatedBy: input.actorUserId, updatedAt: submittedAt,
      }).where(eq(safetyReports.id, input.id));
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'safety_report.submitted', record);
      return record;
    }, hydrateSafety);
  }

  async acknowledge(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; note?: string }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.acknowledge', async (tx) => {
      const current = await getReportForUpdate(tx, input.workspaceId, input.id);
      const now = new Date();
      await tx.insert(safetyAcknowledgements).values({
        id: crypto.randomUUID(), workspaceId: input.workspaceId, safetyReportId: input.id,
        acknowledgedBy: input.actorUserId, note: input.note, acknowledgedAt: now,
      });
      await tx.update(safetyReports).set({
        status: transitionSafety(current.status, 'acknowledged'), acknowledgedAt: now, nextEscalationAt: null,
        version: current.version + 1, updatedBy: input.actorUserId, updatedAt: now,
      }).where(eq(safetyReports.id, input.id));
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'safety_report.acknowledged', record);
      return record;
    }, hydrateSafety);
  }

  async transition(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; status: 'investigating' | 'mitigated' | 'closed' }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.transition', async (tx) => {
      const current = await getReportForUpdate(tx, input.workspaceId, input.id);
      const next = transitionSafety(current.status, input.status);
      await tx.update(safetyReports).set({ status: next, version: current.version + 1, updatedBy: input.actorUserId, updatedAt: new Date() })
        .where(eq(safetyReports.id, input.id));
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, `safety_report.${next}`, record);
      return record;
    }, hydrateSafety);
  }

  async correct(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; severity: SafetySeverity; reportType: string; description: string; location?: string; occurredAt: Date; reason: string; allowOtherReporter: boolean }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.correct', async (tx) => {
      const current = await getReportForUpdate(tx, input.workspaceId, input.id);
      if (current.status === 'closed') throw new Error('Closed safety evidence cannot be corrected.');
      if (current.reporterUserId !== input.actorUserId && !input.allowOtherReporter) throw new Error('Workers may correct only their own safety reports.');
      const revisionNumber = current.revisionNumber + 1;
      await tx.insert(safetyRevisions).values({
        safetyReportId: input.id, revisionNumber, reportType: input.reportType, description: input.description,
        location: input.location, occurredAt: input.occurredAt, correctionReason: requireSafetyReason('correct', input.reason), createdBy: input.actorUserId,
      });
      await tx.update(safetyReports).set({
        severity: input.severity, currentRevisionNumber: revisionNumber, version: current.version + 1,
        updatedBy: input.actorUserId, updatedAt: new Date(),
      }).where(eq(safetyReports.id, input.id));
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'safety_report.corrected', record);
      return record;
    }, hydrateSafety);
  }

  async assign(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; assignedTo: string }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.assign', async (tx) => {
      await getReportForUpdate(tx, input.workspaceId, input.id);
      await tx.update(safetyAssignments).set({ active: false, updatedAt: new Date() })
        .where(and(eq(safetyAssignments.workspaceId, input.workspaceId), eq(safetyAssignments.safetyReportId, input.id), eq(safetyAssignments.active, true)));
      await tx.insert(safetyAssignments).values({
        id: crypto.randomUUID(), workspaceId: input.workspaceId, safetyReportId: input.id,
        assignedTo: input.assignedTo, assignedBy: input.actorUserId,
      });
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'safety_report.assigned', record);
      return record;
    }, hydrateSafety);
  }

  async silence(input: { workspaceId: string; actorUserId: string; idempotencyKey: string; id: string; reason: string }): Promise<SafetyRecord> {
    return this.mutate(input, 'safety.silence', async (tx) => {
      const current = await getReportForUpdate(tx, input.workspaceId, input.id);
      if (current.status !== 'submitted') throw new Error('Only an unacknowledged submitted report can be silenced.');
      await tx.update(safetyReports).set({
        escalationSilencedAt: new Date(), escalationSilencedBy: input.actorUserId,
        escalationSilenceReason: requireSafetyReason('silence', input.reason), nextEscalationAt: null,
        version: current.version + 1, updatedBy: input.actorUserId, updatedAt: new Date(),
      }).where(eq(safetyReports.id, input.id));
      const record = await getReport(tx, input.workspaceId, input.id);
      await recordEvidence(tx, input.workspaceId, input.actorUserId, 'safety_report.escalation_silenced', record);
      return record;
    }, hydrateSafety);
  }

  async listTriage(workspaceId: string): Promise<SafetyRecord[]> {
    return this.db.select(selection).from(safetyReports)
      .innerJoin(safetyRevisions, and(eq(safetyRevisions.safetyReportId, safetyReports.id), eq(safetyRevisions.revisionNumber, safetyReports.currentRevisionNumber)))
      .where(and(eq(safetyReports.workspaceId, workspaceId), isNull(safetyReports.deletedAt)))
      .orderBy(desc(safetyReports.severity), asc(safetyReports.acknowledgementDueAt));
  }

  async listDeliveries(workspaceId: string, limit = 200) {
    return this.db.select({
      id: notificationDeliveries.id, safetyReportId: notificationDeliveries.safetyReportId,
      channel: notificationDeliveries.channel, destination: notificationDeliveries.destination,
      eventType: notificationDeliveries.eventType, status: notificationDeliveries.status,
      attemptCount: notificationDeliveries.attemptCount, providerMessageId: notificationDeliveries.providerMessageId,
      lastError: notificationDeliveries.lastError, sentAt: notificationDeliveries.sentAt,
      createdAt: notificationDeliveries.createdAt, updatedAt: notificationDeliveries.updatedAt,
    }).from(notificationDeliveries).where(eq(notificationDeliveries.workspaceId, workspaceId))
      .orderBy(desc(notificationDeliveries.createdAt)).limit(limit);
  }

  async listDueEscalations(now: Date, limit = 100): Promise<string[]> {
    const rows = await this.db.select({ id: safetyReports.id }).from(safetyReports).where(and(
      eq(safetyReports.status, 'submitted'), isNull(safetyReports.escalationSilencedAt), lte(safetyReports.nextEscalationAt, now),
    )).limit(limit);
    return rows.map((row) => row.id);
  }

  async prepareEscalation(id: string, now = new Date()) {
    return this.db.transaction(async (tx) => {
      const [report] = await tx.select().from(safetyReports).where(eq(safetyReports.id, id)).limit(1).for('update');
      if (!report || report.status !== 'submitted' || report.acknowledgedAt || report.escalationSilencedAt || !report.nextEscalationAt || report.nextEscalationAt > now) {
        return { deliveries: [], nextEscalationAt: null };
      }
      const [policy] = await tx.select().from(workspacePolicies).where(eq(workspacePolicies.workspaceId, report.workspaceId)).limit(1);
      const repeatMinutes = policy?.safetyEscalationRepeatMinutes ?? 15;
      const contacts = await tx.select().from(safetyEscalationContacts).where(and(
        eq(safetyEscalationContacts.workspaceId, report.workspaceId), eq(safetyEscalationContacts.enabled, true),
      )).orderBy(safetyEscalationContacts.escalationOrder);
      let recipientUserIds: string[] = [];
      let directEmails: string[] = [];
      if (contacts.length) {
        const contact = contacts[Math.min(report.escalationLevel, contacts.length - 1)]!;
        if (contact.userId) recipientUserIds.push(contact.userId);
        if (contact.email) directEmails.push(contact.email);
      } else {
        const members = await tx.select({ userId: workspaceMemberships.userId }).from(workspaceMemberships).where(and(
          eq(workspaceMemberships.workspaceId, report.workspaceId), eq(workspaceMemberships.status, 'active'),
          inArray(workspaceMemberships.role, ['owner', 'admin', 'supervisor']),
        ));
        recipientUserIds = members.map((member) => member.userId);
      }
      const deliveryInputs: Array<{ channel: 'push' | 'email'; destination: string; userId?: string }> = [];
      if (recipientUserIds.length) {
        const tokens = await tx.select({ userId: pushTokens.userId, destination: pushTokens.expoToken }).from(pushTokens)
          .where(and(inArray(pushTokens.userId, recipientUserIds), eq(pushTokens.enabled, true)));
        deliveryInputs.push(...tokens.map((token) => ({ channel: 'push' as const, destination: token.destination, userId: token.userId })));
        const emails = await tx.select({ id: users.id, email: users.primaryEmail }).from(users).where(inArray(users.id, recipientUserIds));
        deliveryInputs.push(...emails.filter((user) => user.email).map((user) => ({ channel: 'email' as const, destination: user.email!, userId: user.id })));
      }
      deliveryInputs.push(...directEmails.map((email) => ({ channel: 'email' as const, destination: email })));
      const deliveries = [];
      for (const target of dedupeTargets(deliveryInputs)) {
        const deliveryId = crypto.randomUUID();
        await tx.insert(notificationDeliveries).values({
          id: deliveryId, workspaceId: report.workspaceId, safetyReportId: report.id,
          recipientUserId: target.userId, channel: target.channel, destination: target.destination,
          eventType: report.escalationLevel === 0 ? 'safety.submitted' : 'safety.escalated',
        });
        if (target.channel === 'email') await tx.insert(emailDeliveries).values({
          id: crypto.randomUUID(), notificationDeliveryId: deliveryId,
          subject: `VoiceForge ${report.severity} safety report requires acknowledgement`, templateName: 'critical-safety',
        });
        deliveries.push({ id: deliveryId, ...target, safetyReportId: report.id, workspaceId: report.workspaceId, severity: report.severity, emergencyInstructions: policy?.emergencyInstructions ?? 'If anyone is in immediate danger, contact local emergency services now.' });
      }
      if (!deliveries.length) {
        const deliveryId = crypto.randomUUID();
        await tx.insert(notificationDeliveries).values({
          id: deliveryId, workspaceId: report.workspaceId, safetyReportId: report.id,
          channel: 'email', destination: 'unconfigured', eventType: 'safety.delivery_unconfigured',
          status: 'dead_letter', lastError: 'No on-call safety recipient is configured.', attemptCount: 1,
        });
      }
      const nextEscalationAt = new Date(now.getTime() + repeatMinutes * 60_000);
      await tx.update(safetyReports).set({
        escalationLevel: report.escalationLevel + 1, nextEscalationAt, updatedAt: now,
      }).where(eq(safetyReports.id, report.id));
      return { deliveries, nextEscalationAt };
    });
  }

  async markDelivery(input: { id: string; success: boolean; providerMessageId?: string; error?: string }) {
    const [current] = await this.db.select({ attempts: notificationDeliveries.attemptCount }).from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, input.id)).limit(1);
    const attempts = (current?.attempts ?? 0) + 1;
    await this.db.update(notificationDeliveries).set({
      status: input.success ? 'sent' : attempts >= 5 ? 'dead_letter' : 'failed', attemptCount: attempts,
      providerMessageId: input.providerMessageId, lastError: input.error?.slice(0, 1000),
      sentAt: input.success ? new Date() : null, updatedAt: new Date(),
    }).where(eq(notificationDeliveries.id, input.id));
  }

  private async mutate<T>(input: { workspaceId: string; actorUserId: string; idempotencyKey: string }, name: string, operation: (tx: Transaction) => Promise<T>, replay: (value: unknown) => T): Promise<T> {
    return this.db.transaction(async (tx) => {
      const key = input.idempotencyKey;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.workspaceId}:${key}`}, 0))`);
      const requestHash = createHash('sha256').update(JSON.stringify({ name, ...input })).digest('hex');
      const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.workspaceId, input.workspaceId), eq(idempotencyKeys.key, key))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new IdempotencyConflictError('Key was used for another request.');
        if (existing.responseBody !== null) return replay(existing.responseBody);
        throw new IdempotencyConflictError('The original request is still in progress.');
      }
      await tx.insert(idempotencyKeys).values({ workspaceId: input.workspaceId, key, actorUserId: input.actorUserId, requestHash, expiresAt: new Date(Date.now() + 86_400_000) });
      const response = await operation(tx);
      await tx.update(idempotencyKeys).set({ responseStatus: 200, responseBody: response, locked: false, updatedAt: new Date() })
        .where(and(eq(idempotencyKeys.workspaceId, input.workspaceId), eq(idempotencyKeys.key, key)));
      return response;
    });
  }
}

async function getReport(tx: Transaction, workspaceId: string, id: string): Promise<SafetyRecord> {
  const [record] = await tx.select(selection).from(safetyReports)
    .innerJoin(safetyRevisions, and(eq(safetyRevisions.safetyReportId, safetyReports.id), eq(safetyRevisions.revisionNumber, safetyReports.currentRevisionNumber)))
    .where(and(eq(safetyReports.workspaceId, workspaceId), eq(safetyReports.id, id), isNull(safetyReports.deletedAt))).limit(1);
  if (!record) throw new EntityNotFoundError('Safety report not found.');
  return record;
}
async function getReportForUpdate(tx: Transaction, workspaceId: string, id: string) {
  const [record] = await tx.select().from(safetyReports).where(and(eq(safetyReports.workspaceId, workspaceId), eq(safetyReports.id, id), isNull(safetyReports.deletedAt))).limit(1).for('update');
  if (!record) throw new EntityNotFoundError('Safety report not found.');
  return { ...record, revisionNumber: record.currentRevisionNumber };
}
async function recordEvidence(tx: Transaction, workspaceId: string, actorUserId: string, action: string, record: SafetyRecord) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${workspaceId}`}, 0))`);
  const [workspace] = await tx.update(workspaces).set({ currentChangeSequence: sql`${workspaces.currentChangeSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId)).returning({ sequence: workspaces.currentChangeSequence });
  if (!workspace) throw new EntityNotFoundError('Workspace not found.');
  await tx.insert(workspaceChanges).values({ workspaceId, sequence: workspace.sequence, entityType: 'safety_report', entityId: record.id, operation: 'upsert', version: record.version, payload: record });
  const [previous] = await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.sequence)).limit(1);
  const evidence = { workspaceId, sequence: workspace.sequence, actorUserId, action, entityType: 'safety_report', entityId: record.id, version: record.version };
  const eventHash = createHash('sha256').update(JSON.stringify({ previousHash: previous?.eventHash ?? null, ...evidence })).digest('hex');
  await tx.insert(auditEvents).values({ id: crypto.randomUUID(), workspaceId, sequence: workspace.sequence, actorUserId, action, entityType: 'safety_report', entityId: record.id, details: { version: record.version }, previousHash: previous?.eventHash, eventHash });
}
function hydrateSafety(value: unknown): SafetyRecord {
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of ['occurredAt', 'submittedAt', 'acknowledgementDueAt', 'acknowledgedAt', 'nextEscalationAt', 'escalationSilencedAt', 'createdAt', 'updatedAt']) {
    if (typeof copy[key] === 'string') copy[key] = new Date(copy[key] as string);
  }
  return copy as unknown as SafetyRecord;
}
function dedupeTargets<T extends { channel: string; destination: string }>(targets: T[]): T[] {
  const seen = new Set<string>();
  return targets.filter((target) => { const key = `${target.channel}:${target.destination.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function hydrateObjectDates<T>(value: T): T {
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of ['createdAt', 'updatedAt']) if (typeof copy[key] === 'string') copy[key] = new Date(copy[key] as string);
  return copy as T;
}
async function recordAdministrativeEvidence(tx: Transaction, workspaceId: string, actorUserId: string, action: string, entityType: string, entityId: string, payload: unknown) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${workspaceId}`}, 0))`);
  const [workspace] = await tx.update(workspaces).set({ currentChangeSequence: sql`${workspaces.currentChangeSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId)).returning({ sequence: workspaces.currentChangeSequence });
  if (!workspace) throw new EntityNotFoundError('Workspace not found.');
  await tx.insert(workspaceChanges).values({ workspaceId, sequence: workspace.sequence, entityType, entityId, operation: 'upsert', version: 1, payload });
  const [previous] = await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.sequence)).limit(1);
  const evidence = { workspaceId, sequence: workspace.sequence, actorUserId, action, entityType, entityId, version: 1 };
  const eventHash = createHash('sha256').update(JSON.stringify({ previousHash: previous?.eventHash ?? null, ...evidence })).digest('hex');
  await tx.insert(auditEvents).values({ id: crypto.randomUUID(), workspaceId, sequence: workspace.sequence, actorUserId, action, entityType, entityId, details: {}, previousHash: previous?.eventHash, eventHash });
}
