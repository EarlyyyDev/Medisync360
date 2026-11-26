CREATE TABLE "data_quality_issues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_type" varchar(100) NOT NULL,
	"severity" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"source_system_id" varchar(36),
	"batch_id" varchar(36),
	"patient_id" varchar(36),
	"details" jsonb,
	"resolved_by" varchar(36),
	"resolution_reason" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"status" varchar(50) DEFAULT 'uploaded' NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"total_rows" varchar(20) DEFAULT '0' NOT NULL,
	"accepted_rows" varchar(20) DEFAULT '0' NOT NULL,
	"rejected_rows" varchar(20) DEFAULT '0' NOT NULL,
	"skipped_rows" varchar(20) DEFAULT '0' NOT NULL,
	"updated_rows" varchar(20) DEFAULT '0' NOT NULL,
	"conflict_rows" varchar(20) DEFAULT '0' NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"batch_id" varchar(36) NOT NULL,
	"row_number" varchar(20) NOT NULL,
	"status" varchar(50) NOT NULL,
	"source_record_id" varchar(150),
	"raw_payload" jsonb NOT NULL,
	"error_code" varchar(100),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"operation" varchar(30) NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" varchar(20) DEFAULT '0' NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "reconciliation_decisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"decision" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"reviewer_id" varchar(36) NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_decisions" ADD CONSTRAINT "reconciliation_decisions_issue_id_data_quality_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."data_quality_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_rows_batch_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "integration_events_pending_idx" ON "integration_events" USING btree ("processed_at");