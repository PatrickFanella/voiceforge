import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

const syncMetadata = () => ({
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps(),
});

export const workspaceKind = pgEnum('workspace_kind', ['personal', 'team']);
export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'supervisor', 'worker', 'auditor']);
export const membershipStatus = pgEnum('membership_status', ['invited', 'active', 'suspended', 'removed']);
export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'revoked', 'expired']);
export const changeOperation = pgEnum('change_operation', ['upsert', 'delete']);
export const transcriptionStatus = pgEnum('transcription_status', ['queued', 'processing', 'completed', 'failed']);
export const clockSessionStatus = pgEnum('clock_session_status', ['active', 'completed', 'cancelled']);
export const timeEntryStatus = pgEnum('time_entry_status', ['draft', 'submitted', 'approved', 'rejected', 'correction_requested']);
export const timeApprovalDecision = pgEnum('time_approval_decision', ['pending', 'approved', 'rejected', 'correction_requested', 'superseded']);
export const safetyReportStatus = pgEnum('safety_report_status', ['draft', 'submitted', 'acknowledged', 'investigating', 'mitigated', 'closed']);
export const safetySeverity = pgEnum('safety_severity', ['low', 'medium', 'high', 'critical']);
export const deliveryChannel = pgEnum('delivery_channel', ['push', 'email']);
export const deliveryStatus = pgEnum('delivery_status', ['queued', 'sent', 'failed', 'suppressed', 'dead_letter']);
export const subscriptionStatus = pgEnum('subscription_status', ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled']);
export const exportStatus = pgEnum('export_status', ['queued', 'processing', 'completed', 'failed', 'expired']);
export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', ['queued', 'delivering', 'delivered', 'retrying', 'dead_letter']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  primaryEmail: text('primary_email'),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  ...timestamps(),
}, (table) => [uniqueIndex('users_primary_email_unique').on(table.primaryEmail)]);

export const identities = pgTable('identities', {
  provider: text('provider').notNull(),
  providerSubject: text('provider_subject').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  ...timestamps(),
}, (table) => [primaryKey({ columns: [table.provider, table.providerSubject] }), index('identities_user_idx').on(table.userId)]);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  label: text('label'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps(),
});

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  expoToken: text('expo_token').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastError: text('last_error'),
  ...timestamps(),
}, (table) => [uniqueIndex('push_tokens_expo_unique').on(table.expoToken), index('push_tokens_user_idx').on(table.userId, table.enabled)]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  kind: workspaceKind('kind').notNull(),
  name: text('name').notNull(),
  slug: text('slug'),
  timeZone: text('time_zone').notNull().default('UTC'),
  currentChangeSequence: bigint('current_change_sequence', { mode: 'number' }).notNull().default(0),
  ...timestamps(),
}, (table) => [uniqueIndex('workspaces_slug_unique').on(table.slug)]);

export const workspacePolicies = pgTable('workspace_policies', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  safetyAcknowledgementSlaMinutes: integer('safety_acknowledgement_sla_minutes').notNull().default(15),
  safetyEscalationRepeatMinutes: integer('safety_escalation_repeat_minutes').notNull().default(15),
  emergencyInstructions: text('emergency_instructions').notNull().default('If anyone is in immediate danger, contact local emergency services now.'),
  ...timestamps(),
});

export const safetyEscalationContacts = pgTable('safety_escalation_contacts', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  escalationOrder: integer('escalation_order').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps(),
}, (table) => [uniqueIndex('safety_contacts_order_unique').on(table.workspaceId, table.escalationOrder)]);

export const workspaceMemberships = pgTable('workspace_memberships', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: workspaceRole('role').notNull(),
  status: membershipStatus('status').notNull().default('active'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  ...timestamps(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] }), index('memberships_user_idx').on(table.userId)]);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: workspaceRole('role').notNull(),
  status: invitationStatus('status').notNull().default('pending'),
  tokenDigest: text('token_digest').notNull(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedBy: uuid('accepted_by').references(() => users.id),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  ...timestamps(),
}, (table) => [index('invitations_workspace_status_idx').on(table.workspaceId, table.status)]);

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  address: text('address'),
  status: text('status').notNull().default('active'),
  ...syncMetadata(),
}, (table) => [index('jobs_workspace_updated_idx').on(table.workspaceId, table.updatedAt)]);

export const jobMembers = pgTable('job_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id),
  ...timestamps(),
}, (table) => [primaryKey({ columns: [table.jobId, table.userId] }), index('job_members_workspace_idx').on(table.workspaceId, table.userId)]);

export const audioObjects = pgTable('audio_objects', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull(),
  expectedBytes: bigint('expected_bytes', { mode: 'number' }).notNull(),
  uploadedBytes: bigint('uploaded_bytes', { mode: 'number' }),
  checksumSha256: text('checksum_sha256'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  ...timestamps(),
}, (table) => [uniqueIndex('audio_objects_key_unique').on(table.objectKey), index('audio_objects_workspace_idx').on(table.workspaceId)]);

export const voiceLogs = pgTable('voice_logs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  transcript: text('transcript'),
  transcriptConfidence: integer('transcript_confidence_basis_points'),
  transcriptProvider: text('transcript_provider'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  ...syncMetadata(),
}, (table) => [index('voice_logs_workspace_updated_idx').on(table.workspaceId, table.updatedAt)]);

export const transcriptionJobs = pgTable('transcription_jobs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  voiceLogId: uuid('voice_log_id').notNull().references(() => voiceLogs.id, { onDelete: 'cascade' }),
  audioObjectId: uuid('audio_object_id').notNull().references(() => audioObjects.id, { onDelete: 'restrict' }),
  status: transcriptionStatus('status').notNull().default('queued'),
  provider: text('provider'),
  attemptCount: integer('attempt_count').notNull().default(0),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  processingMetadata: jsonb('processing_metadata').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  ...timestamps(),
}, (table) => [index('transcription_jobs_workspace_status_idx').on(table.workspaceId, table.status)]);

export const clockSessions = pgTable('clock_sessions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  workerUserId: uuid('worker_user_id').notNull().references(() => users.id),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  status: clockSessionStatus('status').notNull().default('active'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  ...syncMetadata(),
}, (table) => [
  index('clock_sessions_workspace_worker_idx').on(table.workspaceId, table.workerUserId, table.status),
  uniqueIndex('clock_sessions_one_active_worker').on(table.workspaceId, table.workerUserId).where(sql`${table.status} = 'active'`),
]);

export const timeEntries = pgTable('time_entries', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  workerUserId: uuid('worker_user_id').notNull().references(() => users.id),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  clockSessionId: uuid('clock_session_id').references(() => clockSessions.id, { onDelete: 'set null' }),
  status: timeEntryStatus('status').notNull().default('draft'),
  currentRevisionNumber: integer('current_revision_number').notNull().default(1),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  ...syncMetadata(),
}, (table) => [index('time_entries_workspace_status_idx').on(table.workspaceId, table.status, table.updatedAt)]);

export const timeEntryRevisions = pgTable('time_entry_revisions', {
  timeEntryId: uuid('time_entry_id').notNull().references(() => timeEntries.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  totalMinutes: integer('total_minutes').notNull(),
  entryType: text('entry_type').notNull(),
  notes: text('notes').notNull().default(''),
  correctionReason: text('correction_reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.timeEntryId, table.revisionNumber] })]);

export const timeApprovals = pgTable('time_approvals', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: uuid('time_entry_id').notNull().references(() => timeEntries.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  decision: timeApprovalDecision('decision').notNull().default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id),
  reason: text('reason'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  ...timestamps(),
}, (table) => [index('time_approvals_workspace_decision_idx').on(table.workspaceId, table.decision, table.createdAt)]);

export const safetyReports = pgTable('safety_reports', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  reporterUserId: uuid('reporter_user_id').notNull().references(() => users.id),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  status: safetyReportStatus('status').notNull().default('draft'),
  severity: safetySeverity('severity').notNull(),
  currentRevisionNumber: integer('current_revision_number').notNull().default(1),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  acknowledgementDueAt: timestamp('acknowledgement_due_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  escalationLevel: integer('escalation_level').notNull().default(0),
  nextEscalationAt: timestamp('next_escalation_at', { withTimezone: true }),
  escalationSilencedAt: timestamp('escalation_silenced_at', { withTimezone: true }),
  escalationSilencedBy: uuid('escalation_silenced_by').references(() => users.id),
  escalationSilenceReason: text('escalation_silence_reason'),
  ...syncMetadata(),
}, (table) => [index('safety_reports_triage_idx').on(table.workspaceId, table.status, table.severity, table.nextEscalationAt)]);

export const safetyRevisions = pgTable('safety_revisions', {
  safetyReportId: uuid('safety_report_id').notNull().references(() => safetyReports.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  reportType: text('report_type').notNull(),
  description: text('description').notNull(),
  location: text('location'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  correctionReason: text('correction_reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.safetyReportId, table.revisionNumber] })]);

export const safetyAssignments = pgTable('safety_assignments', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  safetyReportId: uuid('safety_report_id').notNull().references(() => safetyReports.id, { onDelete: 'cascade' }),
  assignedTo: uuid('assigned_to').notNull().references(() => users.id),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id),
  active: boolean('active').notNull().default(true),
  ...timestamps(),
}, (table) => [index('safety_assignments_report_idx').on(table.workspaceId, table.safetyReportId, table.active)]);

export const safetyAcknowledgements = pgTable('safety_acknowledgements', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  safetyReportId: uuid('safety_report_id').notNull().references(() => safetyReports.id, { onDelete: 'restrict' }),
  acknowledgedBy: uuid('acknowledged_by').notNull().references(() => users.id),
  note: text('note'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('safety_acknowledgements_report_idx').on(table.workspaceId, table.safetyReportId)]);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  safetyReportId: uuid('safety_report_id').references(() => safetyReports.id, { onDelete: 'set null' }),
  recipientUserId: uuid('recipient_user_id').references(() => users.id),
  channel: deliveryChannel('channel').notNull(),
  destination: text('destination').notNull(),
  eventType: text('event_type').notNull(),
  status: deliveryStatus('status').notNull().default('queued'),
  attemptCount: integer('attempt_count').notNull().default(0),
  providerMessageId: text('provider_message_id'),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  ...timestamps(),
}, (table) => [index('notification_deliveries_status_idx').on(table.workspaceId, table.status, table.createdAt)]);

export const emailDeliveries = pgTable('email_deliveries', {
  id: uuid('id').primaryKey(),
  notificationDeliveryId: uuid('notification_delivery_id').notNull().references(() => notificationDeliveries.id, { onDelete: 'cascade' }),
  sesMessageId: text('ses_message_id'),
  subject: text('subject').notNull(),
  templateName: text('template_name').notNull(),
  ...timestamps(),
});

export const workspaceChanges = pgTable('workspace_changes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sequence: bigint('sequence', { mode: 'number' }).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  operation: changeOperation('operation').notNull(),
  version: integer('version').notNull(),
  payload: jsonb('payload'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('workspace_changes_sequence_unique').on(table.workspaceId, table.sequence),
  index('workspace_changes_cursor_idx').on(table.workspaceId, table.sequence),
]);

export const entityTombstones = pgTable('entity_tombstones', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  version: integer('version').notNull(),
  deletedBy: uuid('deleted_by').notNull().references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.entityType, table.entityId] })]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  sequence: bigint('sequence', { mode: 'number' }).notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  details: jsonb('details').notNull().default({}),
  previousHash: text('previous_hash'),
  eventHash: text('event_hash').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('audit_events_sequence_unique').on(table.workspaceId, table.sequence)]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body'),
  locked: boolean('locked').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.key] })]);

export const subscriptions = pgTable('subscriptions', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeSubscriptionItemId: text('stripe_subscription_item_id'),
  stripePriceId: text('stripe_price_id'),
  status: subscriptionStatus('status').notNull().default('incomplete'),
  seatQuantity: integer('seat_quantity').notNull().default(1),
  pendingSeatQuantity: integer('pending_seat_quantity'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  graceUntil: timestamp('grace_until', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  lastStripeEventCreated: timestamp('last_stripe_event_created', { withTimezone: true }),
  ...timestamps(),
}, (table) => [uniqueIndex('subscriptions_customer_unique').on(table.stripeCustomerId), uniqueIndex('subscriptions_stripe_id_unique').on(table.stripeSubscriptionId)]);

export const entitlements = pgTable('entitlements', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  readEnabled: boolean('read_enabled').notNull().default(true),
  exportEnabled: boolean('export_enabled').notNull().default(true),
  mutationEnabled: boolean('mutation_enabled').notNull().default(false),
  seatLimit: integer('seat_limit').notNull().default(1),
  ...timestamps(),
});

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  eventCreated: timestamp('event_created', { withTimezone: true }).notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usageCounters = pgTable('usage_counters', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  activeSeats: integer('active_seats').notNull().default(0),
  audioMinutes: integer('audio_minutes').notNull().default(0),
  exportCount: integer('export_count').notNull().default(0),
  ...timestamps(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.period] })]);

export const exportJobs = pgTable('export_jobs', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').notNull().references(() => users.id), format: text('format').notNull(), scope: text('scope').notNull(),
  status: exportStatus('status').notNull().default('queued'), objectKey: text('object_key'), rowCount: integer('row_count'),
  errorMessage: text('error_message'), expiresAt: timestamp('expires_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }), ...timestamps(),
}, (table) => [index('export_jobs_workspace_status_idx').on(table.workspaceId, table.status, table.createdAt)]);

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), secretEncrypted: text('secret_encrypted').notNull(), enabled: boolean('enabled').notNull().default(true),
  eventTypes: jsonb('event_types').$type<string[]>().notNull().default([]), lastAuditSequence: bigint('last_audit_sequence', { mode: 'number' }).notNull().default(0), ...timestamps(),
}, (table) => [index('webhook_endpoints_workspace_idx').on(table.workspaceId, table.enabled)]);

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  endpointId: uuid('endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }), eventType: text('event_type').notNull(),
  entityType: text('entity_type').notNull(), entityId: uuid('entity_id'), payload: jsonb('payload').notNull(), status: webhookDeliveryStatus('status').notNull().default('queued'),
  attemptCount: integer('attempt_count').notNull().default(0), nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  responseStatus: integer('response_status'), responseBody: text('response_body'), lastError: text('last_error'), deliveredAt: timestamp('delivered_at', { withTimezone: true }), ...timestamps(),
}, (table) => [index('webhook_deliveries_due_idx').on(table.status, table.nextAttemptAt), index('webhook_deliveries_workspace_idx').on(table.workspaceId, table.createdAt)]);
