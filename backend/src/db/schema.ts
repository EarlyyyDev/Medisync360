import {
  boolean,
  date,
  decimal,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const roles = pgTable(
  "roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
  },
  (table) => [uniqueIndex("roles_name_unique").on(table.name)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
  },
  (table) => [uniqueIndex("permissions_name_unique").on(table.name)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: varchar("role_id", { length: 36 })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("user_roles_unique").on(table.userId, table.roleId),
    index("user_roles_role_idx").on(table.roleId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: varchar("role_id", { length: 36 })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: varchar("permission_id", { length: 36 })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("role_permissions_unique").on(table.roleId, table.permissionId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionTokenHash: varchar("session_token_hash", { length: 64 }).notNull(),
    csrfTokenHash: varchar("csrf_token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.sessionTokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    actorUserId: varchar("actor_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    action: varchar("action", { length: 150 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 36 }),
    outcome: varchar("outcome", { length: 30 }).notNull(),
    requestId: varchar("request_id", { length: 128 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorUserId),
    index("audit_events_action_idx").on(table.action),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

export const sourceSystems = pgTable(
  "source_systems",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    simulated: boolean("simulated").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("source_systems_code_unique").on(table.code)],
);

export const patients = pgTable(
  "patients",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    internalCode: varchar("internal_code", { length: 50 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    sex: varchar("sex", { length: 30 }),
    active: boolean("active").notNull().default(true),
    createdBy: varchar("created_by", { length: 36 }),
    updatedBy: varchar("updated_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("patients_internal_code_unique").on(table.internalCode),
    index("patients_name_idx").on(table.firstName, table.lastName),
  ],
);

export const sourcePatientIdentifiers = pgTable(
  "source_patient_identifiers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sourceSystemId: varchar("source_system_id", { length: 36 })
      .notNull()
      .references(() => sourceSystems.id, { onDelete: "cascade" }),
    patientId: varchar("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    sourcePatientId: varchar("source_patient_id", { length: 150 }).notNull(),
  },
  (table) => [
    uniqueIndex("source_patient_unique").on(table.sourceSystemId, table.sourcePatientId),
    index("source_patient_patient_idx").on(table.patientId),
  ],
);

export const emrEncounters = pgTable(
  "emr_encounters",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    patientId: varchar("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    sourceSystemId: varchar("source_system_id", { length: 36 })
      .notNull()
      .references(() => sourceSystems.id),
    sourceRecordId: varchar("source_record_id", { length: 150 }).notNull(),
    encounterType: varchar("encounter_type", { length: 100 }).notNull(),
    encounterAt: timestamp("encounter_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    sourceVersion: varchar("source_version", { length: 100 }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("emr_source_record_unique").on(table.sourceSystemId, table.sourceRecordId),
  ],
);

export const labOrders = pgTable(
  "lab_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    patientId: varchar("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    sourceSystemId: varchar("source_system_id", { length: 36 })
      .notNull()
      .references(() => sourceSystems.id),
    sourceRecordId: varchar("source_record_id", { length: 150 }).notNull(),
    testCode: varchar("test_code", { length: 100 }).notNull(),
    testName: varchar("test_name", { length: 200 }).notNull(),
    specimenCollectedAt: timestamp("specimen_collected_at", { withTimezone: true }),
    sourceStatus: varchar("source_status", { length: 50 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lab_order_source_record_unique").on(table.sourceSystemId, table.sourceRecordId),
  ],
);

export const labResults = pgTable(
  "lab_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    labOrderId: varchar("lab_order_id", { length: 36 })
      .notNull()
      .references(() => labOrders.id, { onDelete: "cascade" }),
    sourceRecordId: varchar("source_record_id", { length: 150 }).notNull(),
    valueText: text("value_text").notNull(),
    unitText: varchar("unit_text", { length: 100 }),
    resultAt: timestamp("result_at", { withTimezone: true }),
    sourceStatus: varchar("source_status", { length: 50 }).notNull(),
  },
  (table) => [uniqueIndex("lab_result_source_record_unique").on(table.sourceRecordId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    patientId: varchar("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    sourceSystemId: varchar("source_system_id", { length: 36 })
      .notNull()
      .references(() => sourceSystems.id),
    sourceRecordId: varchar("source_record_id", { length: 150 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("PHP"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull(),
    paidAmount: decimal("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    balanceAmount: decimal("balance_amount", { precision: 14, scale: 2 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoice_source_record_unique").on(table.sourceSystemId, table.sourceRecordId),
  ],
);

export const insurancePolicies = pgTable(
  "insurance_policies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    patientId: varchar("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    sourceSystemId: varchar("source_system_id", { length: 36 })
      .notNull()
      .references(() => sourceSystems.id),
    sourceRecordId: varchar("source_record_id", { length: 150 }).notNull(),
    payerName: varchar("payer_name", { length: 200 }).notNull(),
    memberReference: varchar("member_reference", { length: 150 }).notNull(),
    coverageStatus: varchar("coverage_status", { length: 50 }).notNull(),
    coverageStart: date("coverage_start"),
    coverageEnd: date("coverage_end"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("insurance_source_record_unique").on(table.sourceSystemId, table.sourceRecordId),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sourceSystemId: varchar("source_system_id", { length: 36 })
      .notNull()
      .references(() => sourceSystems.id),
    status: varchar("status", { length: 50 }).notNull().default("uploaded"),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    totalRows: varchar("total_rows", { length: 20 }).notNull().default("0"),
    acceptedRows: varchar("accepted_rows", { length: 20 }).notNull().default("0"),
    rejectedRows: varchar("rejected_rows", { length: 20 }).notNull().default("0"),
    skippedRows: varchar("skipped_rows", { length: 20 }).notNull().default("0"),
    updatedRows: varchar("updated_rows", { length: 20 }).notNull().default("0"),
    conflictRows: varchar("conflict_rows", { length: 20 }).notNull().default("0"),
    createdBy: varchar("created_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
);

export const importRows = pgTable(
  "import_rows",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    batchId: varchar("batch_id", { length: 36 })
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: varchar("row_number", { length: 20 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    sourceRecordId: varchar("source_record_id", { length: 150 }),
    rawPayload: jsonb("raw_payload").notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("import_rows_batch_idx").on(table.batchId),
  ],
);

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    operation: varchar("operation", { length: 30 }).notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attemptCount: varchar("attempt_count", { length: 20 }).notNull().default("0"),
    lastError: text("last_error"),
  },
  (table) => [
    index("integration_events_pending_idx").on(table.processedAt),
  ],
);

export const dataQualityIssues = pgTable(
  "data_quality_issues",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    issueType: varchar("issue_type", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("open"),
    sourceSystemId: varchar("source_system_id", { length: 36 }),
    batchId: varchar("batch_id", { length: 36 }),
    patientId: varchar("patient_id", { length: 36 }),
    details: jsonb("details"),
    resolvedBy: varchar("resolved_by", { length: 36 }),
    resolutionReason: text("resolution_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const reconciliationDecisions = pgTable(
  "reconciliation_decisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    issueId: varchar("issue_id", { length: 36 })
      .notNull()
      .references(() => dataQualityIssues.id, { onDelete: "cascade" }),
    decision: varchar("decision", { length: 50 }).notNull(),
    reason: text("reason").notNull(),
    reviewerId: varchar("reviewer_id", { length: 36 }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
