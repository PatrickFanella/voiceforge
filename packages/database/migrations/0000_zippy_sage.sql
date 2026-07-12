CREATE TYPE "public"."change_operation" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."workspace_kind" AS ENUM('personal', 'team');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'supervisor', 'worker', 'auditor');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"previous_hash" text,
	"event_hash" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"label" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_tombstones" (
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"deleted_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_tombstones_workspace_id_entity_type_entity_id_pk" PRIMARY KEY("workspace_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"locked" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_provider_provider_subject_pk" PRIMARY KEY("provider","provider_subject")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"token_digest" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"primary_email" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"operation" "change_operation" NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "workspace_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"current_change_sequence" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tombstones" ADD CONSTRAINT "entity_tombstones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tombstones" ADD CONSTRAINT "entity_tombstones_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_changes" ADD CONSTRAINT "workspace_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_sequence_unique" ON "audit_events" USING btree ("workspace_id","sequence");--> statement-breakpoint
CREATE INDEX "identities_user_idx" ON "identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_workspace_status_idx" ON "invitations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "jobs_workspace_updated_idx" ON "jobs" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_primary_email_unique" ON "users" USING btree ("primary_email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_changes_sequence_unique" ON "workspace_changes" USING btree ("workspace_id","sequence");--> statement-breakpoint
CREATE INDEX "workspace_changes_cursor_idx" ON "workspace_changes" USING btree ("workspace_id","sequence");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "workspace_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_unique" ON "workspaces" USING btree ("slug");