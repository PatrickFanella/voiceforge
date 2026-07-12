CREATE TYPE "public"."delivery_channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'suppressed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."safety_report_status" AS ENUM('draft', 'submitted', 'acknowledged', 'investigating', 'mitigated', 'closed');--> statement-breakpoint
CREATE TYPE "public"."safety_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notification_delivery_id" uuid NOT NULL,
	"ses_message_id" text,
	"subject" text NOT NULL,
	"template_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"safety_report_id" uuid,
	"recipient_user_id" uuid,
	"channel" "delivery_channel" NOT NULL,
	"destination" text NOT NULL,
	"event_type" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"expo_token" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_acknowledgements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"safety_report_id" uuid NOT NULL,
	"acknowledged_by" uuid NOT NULL,
	"note" text,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"safety_report_id" uuid NOT NULL,
	"assigned_to" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_escalation_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text,
	"escalation_order" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "safety_report_status" DEFAULT 'draft' NOT NULL,
	"severity" "safety_severity" NOT NULL,
	"current_revision_number" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"acknowledgement_due_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"next_escalation_at" timestamp with time zone,
	"escalation_silenced_at" timestamp with time zone,
	"escalation_silenced_by" uuid,
	"escalation_silence_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_revisions" (
	"safety_report_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"report_type" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"correction_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_revisions_safety_report_id_revision_number_pk" PRIMARY KEY("safety_report_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "workspace_policies" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"safety_acknowledgement_sla_minutes" integer DEFAULT 15 NOT NULL,
	"safety_escalation_repeat_minutes" integer DEFAULT 15 NOT NULL,
	"emergency_instructions" text DEFAULT 'If anyone is in immediate danger, contact local emergency services now.' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_notification_delivery_id_notification_deliveries_id_fk" FOREIGN KEY ("notification_delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_safety_report_id_safety_reports_id_fk" FOREIGN KEY ("safety_report_id") REFERENCES "public"."safety_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_safety_report_id_safety_reports_id_fk" FOREIGN KEY ("safety_report_id") REFERENCES "public"."safety_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_assignments" ADD CONSTRAINT "safety_assignments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_assignments" ADD CONSTRAINT "safety_assignments_safety_report_id_safety_reports_id_fk" FOREIGN KEY ("safety_report_id") REFERENCES "public"."safety_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_assignments" ADD CONSTRAINT "safety_assignments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_assignments" ADD CONSTRAINT "safety_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_escalation_contacts" ADD CONSTRAINT "safety_escalation_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_escalation_contacts" ADD CONSTRAINT "safety_escalation_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_escalation_silenced_by_users_id_fk" FOREIGN KEY ("escalation_silenced_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_revisions" ADD CONSTRAINT "safety_revisions_safety_report_id_safety_reports_id_fk" FOREIGN KEY ("safety_report_id") REFERENCES "public"."safety_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_revisions" ADD CONSTRAINT "safety_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_expo_unique" ON "push_tokens" USING btree ("expo_token");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE INDEX "safety_acknowledgements_report_idx" ON "safety_acknowledgements" USING btree ("workspace_id","safety_report_id");--> statement-breakpoint
CREATE INDEX "safety_assignments_report_idx" ON "safety_assignments" USING btree ("workspace_id","safety_report_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "safety_contacts_order_unique" ON "safety_escalation_contacts" USING btree ("workspace_id","escalation_order");--> statement-breakpoint
CREATE INDEX "safety_reports_triage_idx" ON "safety_reports" USING btree ("workspace_id","status","severity","next_escalation_at");