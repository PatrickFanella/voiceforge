CREATE TYPE "public"."clock_session_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."time_approval_decision" AS ENUM('pending', 'approved', 'rejected', 'correction_requested', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."time_entry_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'correction_requested');--> statement-breakpoint
CREATE TABLE "clock_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"worker_user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "clock_session_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"decision" time_approval_decision DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"worker_user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"clock_session_id" uuid,
	"status" time_entry_status DEFAULT 'draft' NOT NULL,
	"current_revision_number" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry_revisions" (
	"time_entry_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"total_minutes" integer NOT NULL,
	"entry_type" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"correction_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entry_revisions_time_entry_id_revision_number_pk" PRIMARY KEY("time_entry_id","revision_number")
);
--> statement-breakpoint
ALTER TABLE "clock_sessions" ADD CONSTRAINT "clock_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_sessions" ADD CONSTRAINT "clock_sessions_worker_user_id_users_id_fk" FOREIGN KEY ("worker_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_sessions" ADD CONSTRAINT "clock_sessions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_approvals" ADD CONSTRAINT "time_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_approvals" ADD CONSTRAINT "time_approvals_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_approvals" ADD CONSTRAINT "time_approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_worker_user_id_users_id_fk" FOREIGN KEY ("worker_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_clock_session_id_clock_sessions_id_fk" FOREIGN KEY ("clock_session_id") REFERENCES "public"."clock_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_revisions" ADD CONSTRAINT "time_entry_revisions_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_revisions" ADD CONSTRAINT "time_entry_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clock_sessions_workspace_worker_idx" ON "clock_sessions" USING btree ("workspace_id","worker_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "clock_sessions_one_active_worker" ON "clock_sessions" USING btree ("workspace_id","worker_user_id") WHERE "clock_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "time_approvals_workspace_decision_idx" ON "time_approvals" USING btree ("workspace_id","decision","created_at");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_status_idx" ON "time_entries" USING btree ("workspace_id","status","updated_at");