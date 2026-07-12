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

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  kind: workspaceKind('kind').notNull(),
  name: text('name').notNull(),
  slug: text('slug'),
  timeZone: text('time_zone').notNull().default('UTC'),
  currentChangeSequence: bigint('current_change_sequence', { mode: 'number' }).notNull().default(0),
  ...timestamps(),
}, (table) => [uniqueIndex('workspaces_slug_unique').on(table.slug)]);

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
