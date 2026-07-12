CREATE TYPE "public"."subject_request_status" AS ENUM('queued', 'processing', 'completed', 'partially_completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subject_request_type" AS ENUM('access', 'portability', 'erasure');--> statement-breakpoint
CREATE TABLE "audit_chain_checkpoints" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_pruned_sequence" bigint NOT NULL,
	"last_pruned_hash" text NOT NULL,
	"pruned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"reason" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"placed_by" uuid NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"time_days" integer DEFAULT 2555 NOT NULL,
	"safety_days" integer DEFAULT 2555 NOT NULL,
	"audit_days" integer DEFAULT 2555 NOT NULL,
	"voice_log_days" integer DEFAULT 365 NOT NULL,
	"audio_days" integer DEFAULT 30 NOT NULL,
	"configured_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"request_type" "subject_request_type" NOT NULL,
	"status" "subject_request_status" DEFAULT 'queued' NOT NULL,
	"requested_by" uuid NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"result" jsonb,
	"object_key" text,
	"expires_at" timestamp with time zone,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_chain_checkpoints" ADD CONSTRAINT "audit_chain_checkpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_placed_by_users_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_configured_by_users_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_requests" ADD CONSTRAINT "subject_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_requests" ADD CONSTRAINT "subject_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_holds_workspace_active_idx" ON "legal_holds" USING btree ("workspace_id","active");--> statement-breakpoint
CREATE INDEX "subject_requests_user_status_idx" ON "subject_requests" USING btree ("user_id","status");