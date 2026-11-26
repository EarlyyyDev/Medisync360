CREATE TABLE "emr_encounters" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"patient_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"source_record_id" varchar(150) NOT NULL,
	"encounter_type" varchar(100) NOT NULL,
	"encounter_at" timestamp with time zone NOT NULL,
	"status" varchar(50) NOT NULL,
	"source_version" varchar(100),
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"patient_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"source_record_id" varchar(150) NOT NULL,
	"payer_name" varchar(200) NOT NULL,
	"member_reference" varchar(150) NOT NULL,
	"coverage_status" varchar(50) NOT NULL,
	"coverage_start" date,
	"coverage_end" date,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"patient_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"source_record_id" varchar(150) NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(14, 2) NOT NULL,
	"status" varchar(50) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"patient_id" varchar(36) NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"source_record_id" varchar(150) NOT NULL,
	"test_code" varchar(100) NOT NULL,
	"test_name" varchar(200) NOT NULL,
	"specimen_collected_at" timestamp with time zone,
	"source_status" varchar(50) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"lab_order_id" varchar(36) NOT NULL,
	"source_record_id" varchar(150) NOT NULL,
	"value_text" text NOT NULL,
	"unit_text" varchar(100),
	"result_at" timestamp with time zone,
	"source_status" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"internal_code" varchar(50) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date NOT NULL,
	"sex" varchar(30),
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(36),
	"updated_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_patient_identifiers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"source_system_id" varchar(36) NOT NULL,
	"patient_id" varchar(36) NOT NULL,
	"source_patient_id" varchar(150) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_systems" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emr_encounters" ADD CONSTRAINT "emr_encounters_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emr_encounters" ADD CONSTRAINT "emr_encounters_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_patient_identifiers" ADD CONSTRAINT "source_patient_identifiers_source_system_id_source_systems_id_fk" FOREIGN KEY ("source_system_id") REFERENCES "public"."source_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_patient_identifiers" ADD CONSTRAINT "source_patient_identifiers_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emr_source_record_unique" ON "emr_encounters" USING btree ("source_system_id","source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_source_record_unique" ON "insurance_policies" USING btree ("source_system_id","source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_source_record_unique" ON "invoices" USING btree ("source_system_id","source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_order_source_record_unique" ON "lab_orders" USING btree ("source_system_id","source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_result_source_record_unique" ON "lab_results" USING btree ("source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_internal_code_unique" ON "patients" USING btree ("internal_code");--> statement-breakpoint
CREATE INDEX "patients_name_idx" ON "patients" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "source_patient_unique" ON "source_patient_identifiers" USING btree ("source_system_id","source_patient_id");--> statement-breakpoint
CREATE INDEX "source_patient_patient_idx" ON "source_patient_identifiers" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_systems_code_unique" ON "source_systems" USING btree ("code");