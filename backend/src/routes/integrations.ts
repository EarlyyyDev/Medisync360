import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import multer from "multer";
import { and, eq, desc, inArray, sql, count } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import {
  dataQualityIssues,
  emrEncounters,
  importBatches,
  importRows,
  insurancePolicies,
  integrationEvents,
  invoices,
  labOrders,
  patients,
  sourcePatientIdentifiers,
  sourceSystems,
} from "../db/schema.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { recordAudit } from "../auth/audit.js";
import {
  parseImportCsv,
  duplicateRecordError,
  projectImportPreview,
  validateImportRow,
} from "./import-csv.js";

export const integrationRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const handleCsvUpload = upload.single("file");

const templateFiles: Record<string, string> = {
  patient: "patients-20-demo.csv",
  emr: "emr-demo.csv",
  lis: "lis-demo.csv",
  billing: "billing-demo.csv",
  insurance: "insurance-demo.csv",
};

async function findExistingRecordIds(
  db: ReturnType<typeof getDatabase>,
  sourceSystemId: string,
  sourceType: string,
  recordIds: string[],
) {
  if (recordIds.length === 0) return new Set<string>();

  let rows: { recordId: string }[] = [];
  if (sourceType === "PATIENT") {
    rows = await db
      .select({ recordId: patients.internalCode })
      .from(patients)
      .where(inArray(patients.internalCode, recordIds));
  } else if (sourceType === "EMR") {
    rows = await db
      .select({ recordId: emrEncounters.sourceRecordId })
      .from(emrEncounters)
      .where(and(
        eq(emrEncounters.sourceSystemId, sourceSystemId),
        inArray(emrEncounters.sourceRecordId, recordIds),
      ));
  } else if (sourceType === "LIS") {
    rows = await db
      .select({ recordId: labOrders.sourceRecordId })
      .from(labOrders)
      .where(and(
        eq(labOrders.sourceSystemId, sourceSystemId),
        inArray(labOrders.sourceRecordId, recordIds),
      ));
  } else if (sourceType === "BILLING") {
    rows = await db
      .select({ recordId: invoices.sourceRecordId })
      .from(invoices)
      .where(and(
        eq(invoices.sourceSystemId, sourceSystemId),
        inArray(invoices.sourceRecordId, recordIds),
      ));
  } else if (sourceType === "INSURANCE") {
    rows = await db
      .select({ recordId: insurancePolicies.sourceRecordId })
      .from(insurancePolicies)
      .where(and(
        eq(insurancePolicies.sourceSystemId, sourceSystemId),
        inArray(insurancePolicies.sourceRecordId, recordIds),
      ));
  }

  return new Set(rows.map((row) => row.recordId));
}

integrationRouter.get(
  "/templates/:source.csv",
  requirePermission("integrations.manage"),
  async (request, response, next) => {
    try {
      const source = String(request.params.source ?? "").trim().toLowerCase();
      const fileName = templateFiles[source];
      if (!fileName) {
        next(new ApiError(404, "TEMPLATE_NOT_FOUND", "CSV template was not found."));
        return;
      }
      const demoDirectory = process.cwd().toLowerCase().endsWith("backend")
        ? join(process.cwd(), "..", "demo-data")
        : join(process.cwd(), "demo-data");
      const filePath = join(demoDirectory, fileName);
      const csv = readFileSync(filePath, "utf8");
      response.setHeader("content-type", "text/csv; charset=utf-8");
      response.setHeader("content-disposition", `attachment; filename="${fileName}"`);
      response.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

integrationRouter.post(
  "/batches",
  requirePermission("integrations.manage"),
  (request, response, next) => {
    handleCsvUpload(request, response, (error) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        next(
          new ApiError(
            tooLarge ? 413 : 400,
            tooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
            tooLarge ? "CSV files must be 5 MB or smaller." : "Upload one CSV file at a time.",
          ),
        );
        return;
      }
      next(error);
    });
  },
  async (request, response, next) => {
    const sourceCode = String(request.body.sourceCode ?? "");
    const file = request.file;
    if (!file) {
      next(new ApiError(400, "FILE_REQUIRED", "A CSV file is required."));
      return;
    }
    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      next(new ApiError(400, "INVALID_FILE_TYPE", "Only CSV files are supported."));
      return;
    }

    try {
      const db = getDatabase();
      const [source] = await db
        .select()
        .from(sourceSystems)
        .where(eq(sourceSystems.code, sourceCode))
        .limit(1);
      if (!source) {
        next(new ApiError(404, "SOURCE_NOT_FOUND", "Source system was not found."));
        return;
      }

      const text = file.buffer.toString("utf8");
      if (text.includes("\uFFFD") || text.includes("\u0000")) {
        next(new ApiError(400, "INVALID_ENCODING", "CSV must be valid UTF-8."));
        return;
      }
      const rows = parseImportCsv(text, source.sourceType);
      if (rows.length > 5000) {
        next(new ApiError(413, "ROW_LIMIT_EXCEEDED", "CSV row limit is 5000."));
        return;
      }

      const batchId = randomUUID();
      const fileHash = createHash("sha256").update(file.buffer).digest("hex");
      const recordIds = [...new Set(rows.map((row) =>
        source.sourceType === "PATIENT"
          ? String(row.internal_code ?? "").trim()
          : String(row.source_record_id ?? "").trim(),
      ).filter(Boolean))];
      const existingRecordIds = await findExistingRecordIds(
        db,
        source.id,
        source.sourceType,
        recordIds,
      );
      await db.insert(importBatches).values({
        id: batchId,
        sourceSystemId: source.id,
        status: "validating",
        fileName: file.originalname,
        fileHash,
        totalRows: String(rows.length),
        createdBy: request.user?.id,
      });

      let accepted = 0;
      let rejected = 0;
      const seen = new Set<string>();
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const recordId =
          source.sourceType === "PATIENT"
            ? String(row.internal_code ?? "").trim()
            : String(row.source_record_id ?? "").trim();
        const patientId =
          source.sourceType === "PATIENT"
            ? String(row.internal_code ?? "").trim()
            : String(row.source_patient_id ?? "").trim();
        const validation = validateImportRow(row, source.sourceType);
        let status = validation ? "rejected" : "ready";
        let errorCode = validation?.errorCode ?? null;
        let errorMessage = validation?.errorMessage ?? null;

        if (status === "ready") {
          const duplicate = duplicateRecordError(
            source.sourceType,
            recordId,
            seen,
            existingRecordIds,
          );
          if (duplicate) {
            status = "rejected";
            errorCode = duplicate.errorCode;
            errorMessage = duplicate.errorMessage;
          } else {
            seen.add(recordId);
          }
        }

        if (status === "ready" && source.sourceType !== "PATIENT") {
          const [mapping] = await db
            .select()
            .from(sourcePatientIdentifiers)
            .where(
              and(
                eq(sourcePatientIdentifiers.sourceSystemId, source.id),
                eq(sourcePatientIdentifiers.sourcePatientId, patientId),
              ),
            )
            .limit(1);
          if (!mapping) {
            status = "rejected";
            errorCode = "UNMAPPED_SOURCE_PATIENT";
            errorMessage =
              "This source patient ID is not linked to a canonical patient. Import a Patient Registry CSV first.";
          }
        }

        if (status === "ready") accepted += 1;
        else rejected += 1;
        await db.insert(importRows).values({
          id: randomUUID(),
          batchId,
          rowNumber: String(index + 2),
          status,
          sourceRecordId: recordId || null,
          rawPayload: row,
          errorCode,
          errorMessage,
        });
        if (errorCode === "UNMAPPED_SOURCE_PATIENT") {
          await db.insert(dataQualityIssues).values({
            id: randomUUID(),
            issueType: "unmapped_source_patient",
            severity: "high",
            sourceSystemId: source.id,
            batchId,
            details: {
              rowNumber: String(index + 2),
              sourceRecordId: recordId || null,
              sourcePatientId: patientId || null,
              reason: errorMessage,
              recommendedAction:
                "Register or map this source patient ID in the Patient Registry, then revalidate the row.",
            },
          });
        }
      }

      await db
        .update(importBatches)
        .set({
          status: rejected === rows.length ? "completed_with_errors" : "ready",
          acceptedRows: String(accepted),
          rejectedRows: String(rejected),
        })
        .where(eq(importBatches.id, batchId));

      await recordAudit({
        actorUserId: request.user?.id,
        action: "integrations.validate",
        resourceType: "import_batch",
        resourceId: batchId,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });

      response.status(201).json({
        success: true,
        data: {
          batchId,
          status: rejected === rows.length ? "completed_with_errors" : "ready",
          totalRows: rows.length,
          acceptedRows: accepted,
          rejectedRows: rejected,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

integrationRouter.get(
  "/batches/:id/preview",
  requirePermission("integrations.manage"),
  async (request, response, next) => {
    try {
      const batchId = request.params.id;
      if (!batchId || Array.isArray(batchId)) {
        next(new ApiError(400, "VALIDATION_ERROR", "Batch ID is required."));
        return;
      }
      const db = getDatabase();
      const [batch] = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1);
      if (!batch) {
        next(new ApiError(404, "BATCH_NOT_FOUND", "Import batch was not found."));
        return;
      }
      const [source] = await db
        .select({
          name: sourceSystems.name,
          sourceType: sourceSystems.sourceType,
        })
        .from(sourceSystems)
        .where(eq(sourceSystems.id, batch.sourceSystemId))
        .limit(1);
      if (!source) {
        next(new ApiError(404, "SOURCE_NOT_FOUND", "Batch source system was not found."));
        return;
      }
      const rows = await db
        .select({
          rowNumber: importRows.rowNumber,
          status: importRows.status,
          sourceRecordId: importRows.sourceRecordId,
          errorCode: importRows.errorCode,
          errorMessage: importRows.errorMessage,
          rawPayload: importRows.rawPayload,
        })
        .from(importRows)
        .where(eq(importRows.batchId, batch.id))
        .limit(100);
      response.json({
        success: true,
        data: {
          batch: {
            id: batch.id,
            status: batch.status,
            fileName: batch.fileName,
            totalRows: batch.totalRows,
            acceptedRows: batch.acceptedRows,
            rejectedRows: batch.rejectedRows,
            createdAt: batch.createdAt,
            sourceSystemName: source.name,
            sourceType: source.sourceType,
          },
          rows: rows.map((row) => ({
            rowNumber: row.rowNumber,
            status: row.status,
            sourceRecordId: row.sourceRecordId,
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            details: projectImportPreview(
              row.rawPayload as Record<string, unknown>,
              source.sourceType,
            ),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

integrationRouter.get(
  "/batches/:id/errors.csv",
  requirePermission("integrations.manage"),
  async (request, response, next) => {
    try {
      const batchId = request.params.id;
      if (!batchId || Array.isArray(batchId)) {
        next(new ApiError(400, "VALIDATION_ERROR", "Batch ID is required."));
        return;
      }
      const db = getDatabase();
      const [batch] = await db
        .select()
        .from(importBatches)
        .where(sql`${importBatches.id} = ${batchId}`)
        .limit(1);
      if (!batch) {
        next(new ApiError(404, "BATCH_NOT_FOUND", "Import batch was not found."));
        return;
      }
      const rows = await db
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, batch.id));
      const rejected = rows.filter((row) => row.status === "rejected");
      const escape = (value: unknown) => {
        let text = String(value ?? "");
        if (/^[=+\-@\t\r]/.test(text) || /[\n\r]/.test(text)) {
          text = `'${text}`;
        }
        return `"${text.replaceAll('"', '""')}"`;
      };
      const csv = [
        ["row_number", "source_record_id", "error_code", "error_message"].map(escape).join(","),
        ...rejected.map((row) =>
          [row.rowNumber, row.sourceRecordId, row.errorCode, row.errorMessage]
            .map(escape)
            .join(","),
        ),
      ].join("\r\n");
      response.setHeader("content-type", "text/csv; charset=utf-8");
      response.setHeader(
        "content-disposition",
        `attachment; filename="batch-${batch.id}-errors.csv"`,
      );
      response.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

integrationRouter.get(
  "/batches",
  requirePermission("integrations.manage"),
  async (request, response, next) => {
    const pagination = z.object({
      page: z.coerce.number().int().positive().max(1_000_000).default(1),
      pageSize: z.coerce.number().int().positive().max(50).default(10),
    }).safeParse(request.query);
    if (!pagination.success) {
      next(new ApiError(400, "INVALID_PAGINATION", "Page must be between 1 and 1,000,000 and page size must be between 1 and 50."));
      return;
    }

    try {
      const { page, pageSize } = pagination.data;
      const db = getDatabase();
      const [batches, totalRows] = await Promise.all([
        db
          .select()
          .from(importBatches)
          .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(importBatches),
      ]);
      response.json({
        success: true,
        data: {
          items: batches,
          pagination: {
            page,
            pageSize,
            total: Number(totalRows[0]?.value ?? 0),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

integrationRouter.post(
  "/batches/:id/confirm",
  requirePermission("integrations.manage"),
  async (request, response, next) => {
    try {
      const batchId = request.params.id;
      if (!batchId || Array.isArray(batchId)) {
        next(new ApiError(400, "VALIDATION_ERROR", "Batch ID is required."));
        return;
      }
      const db = getDatabase();
      const [batch] = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1);
      if (!batch) {
        next(new ApiError(404, "BATCH_NOT_FOUND", "Import batch was not found."));
        return;
      }
      if (batch.status !== "ready") {
        next(new ApiError(409, "BATCH_NOT_CONFIRMABLE", "Import batch is not ready."));
        return;
      }

      const [claimedBatch] = await db
        .update(importBatches)
        .set({ status: "processing" })
        .where(and(eq(importBatches.id, batch.id), eq(importBatches.status, "ready")))
        .returning();
      if (!claimedBatch) {
        next(new ApiError(409, "BATCH_NOT_CONFIRMABLE", "Import batch is already being processed."));
        return;
      }

      const rows = await db
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, batch.id));
      let accepted = 0;
      let rejected = rows.filter((row) => row.status === "rejected").length;
      let conflicts = 0;

      const [source] = await db
        .select()
        .from(sourceSystems)
        .where(eq(sourceSystems.id, batch.sourceSystemId))
        .limit(1);

      for (const row of rows) {
        if (row.status !== "ready") continue;
        const payload = row.rawPayload as Record<string, string>;

        if (source?.sourceType === "PATIENT") {
          const internalCode = String(payload.internal_code ?? "").trim();
          const [existingPatient] = await db
            .select()
            .from(patients)
            .where(eq(patients.internalCode, internalCode))
            .limit(1);
          if (existingPatient) {
            rejected += 1;
            await db.update(importRows).set({
              status: "rejected",
              errorCode: "PATIENT_ALREADY_EXISTS",
              errorMessage: `Patient internal_code ${internalCode} already exists in the Patient Registry.`,
            }).where(eq(importRows.id, row.id));
            continue;
          }

          const mappings = [
            ["SIM_EMR", payload.emr_patient_id],
            ["SIM_LIS", payload.lis_patient_id],
            ["SIM_BILLING", payload.billing_patient_id],
            ["SIM_INSURANCE", payload.insurance_patient_id],
          ] as const;

          let mappingConflict: { sourceCode: string; sourcePatientId: string } | null = null;
          for (const [sourceCode, sourcePatientIdValue] of mappings) {
            const sourcePatientId = String(sourcePatientIdValue ?? "").trim();
            if (!sourcePatientId) continue;
            const [mappedSource] = await db
              .select()
              .from(sourceSystems)
              .where(eq(sourceSystems.code, sourceCode))
              .limit(1);
            if (!mappedSource) continue;
            const [existingMapping] = await db
              .select()
              .from(sourcePatientIdentifiers)
              .where(
                and(
                  eq(sourcePatientIdentifiers.sourceSystemId, mappedSource.id),
                  eq(sourcePatientIdentifiers.sourcePatientId, sourcePatientId),
                ),
              )
              .limit(1);
            if (existingMapping) {
              mappingConflict = { sourceCode, sourcePatientId };
              break;
            }
          }

          if (mappingConflict) {
            rejected += 1;
            await db.update(importRows).set({
              status: "rejected",
              errorCode: "SOURCE_PATIENT_MAPPING_CONFLICT",
              errorMessage:
                `Source patient ID ${mappingConflict.sourcePatientId} in ${mappingConflict.sourceCode} is already linked to a different patient.`,
            }).where(eq(importRows.id, row.id));
            await db.insert(dataQualityIssues).values({
              id: randomUUID(),
              issueType: "mapping_conflict",
              severity: "high",
              sourceSystemId: batch.sourceSystemId,
              batchId: batch.id,
              details: mappingConflict,
            });
            continue;
          }

          const [insertedPatient] = await db.insert(patients).values({
            id: randomUUID(),
            internalCode,
            firstName: String(payload.first_name).trim(),
            lastName: String(payload.last_name).trim(),
            dateOfBirth: String(payload.date_of_birth).trim(),
            sex: payload.sex?.trim() || null,
            active: true,
            createdBy: request.user?.id,
            updatedBy: request.user?.id,
          }).onConflictDoNothing().returning({ id: patients.id });
          if (!insertedPatient) {
            rejected += 1;
            await db.update(importRows).set({
              status: "rejected",
              errorCode: "PATIENT_ALREADY_EXISTS",
              errorMessage: `Patient internal_code ${internalCode} already exists in the Patient Registry.`,
            }).where(eq(importRows.id, row.id));
            continue;
          }
          const patientId = insertedPatient.id;

          for (const [sourceCode, sourcePatientIdValue] of mappings) {
            const sourcePatientId = String(sourcePatientIdValue ?? "").trim();
            if (!sourcePatientId) continue;
            const [mappedSource] = await db
              .select()
              .from(sourceSystems)
              .where(eq(sourceSystems.code, sourceCode))
              .limit(1);
            if (!mappedSource) continue;

            await db
              .insert(sourcePatientIdentifiers)
              .values({
                id: randomUUID(),
                sourceSystemId: mappedSource.id,
                patientId,
                sourcePatientId,
              })
              .onConflictDoNothing();
          }

          accepted += 1;
          await db.update(importRows).set({ status: "accepted" }).where(eq(importRows.id, row.id));
          await db.insert(integrationEvents).values({
            id: randomUUID(),
            entityType: "patient",
            entityId: patientId,
            operation: "upsert",
          });
          continue;
        }

        const [mapping] = await db
          .select()
          .from(sourcePatientIdentifiers)
          .where(
            and(
              eq(sourcePatientIdentifiers.sourceSystemId, batch.sourceSystemId),
              eq(sourcePatientIdentifiers.sourcePatientId, String(payload.source_patient_id)),
            ),
          );
        if (!mapping) {
          rejected += 1;
          await db.update(importRows).set({
            status: "rejected",
            errorCode: "UNMAPPED_SOURCE_PATIENT",
            errorMessage: "Source patient identifier is not mapped.",
          }).where(eq(importRows.id, row.id));
          await db.insert(dataQualityIssues).values({
            id: randomUUID(),
            issueType: "unmapped_source_patient",
            severity: "high",
            sourceSystemId: batch.sourceSystemId,
            batchId: batch.id,
            details: {
              rowNumber: row.rowNumber,
              sourceRecordId: row.sourceRecordId,
              sourcePatientId: payload.source_patient_id,
              reason: "Source patient identifier is not mapped.",
              recommendedAction:
                "Register or map this source patient ID in the Patient Registry, then revalidate the row.",
            },
          });
          continue;
        }

        let insertedRecordId: string | undefined;
        if (source?.sourceType === "EMR") {
          const [inserted] = await db.insert(emrEncounters).values({
            id: randomUUID(),
            patientId: mapping.patientId,
            sourceSystemId: batch.sourceSystemId,
            sourceRecordId: String(payload.source_record_id),
            encounterType: String(payload.encounter_type ?? "Imported encounter"),
            encounterAt: new Date(String(payload.encounter_at ?? new Date().toISOString())),
            status: String(payload.status ?? "imported"),
          }).onConflictDoNothing().returning({ id: emrEncounters.id });
          insertedRecordId = inserted?.id;
        } else if (source?.sourceType === "LIS") {
          const specimenCollectedAt = payload.specimen_collected_at
            ? new Date(payload.specimen_collected_at)
            : null;
          const [inserted] = await db.insert(labOrders).values({
            id: randomUUID(),
            patientId: mapping.patientId,
            sourceSystemId: batch.sourceSystemId,
            sourceRecordId: String(payload.source_record_id),
            testCode: String(payload.test_code ?? "UNSPECIFIED"),
            testName: String(payload.test_name ?? "Imported synthetic lab order"),
            specimenCollectedAt:
              specimenCollectedAt && !Number.isNaN(specimenCollectedAt.getTime())
                ? specimenCollectedAt
                : null,
            sourceStatus: String(payload.status ?? "imported"),
          }).onConflictDoNothing().returning({ id: labOrders.id });
          insertedRecordId = inserted?.id;
        } else if (source?.sourceType === "BILLING") {
          const total = String(payload.total_amount ?? "0");
          const paid = String(payload.paid_amount ?? "0");
          const balance = String(payload.balance_amount ?? "0");
          const [inserted] = await db.insert(invoices).values({
            id: randomUUID(),
            patientId: mapping.patientId,
            sourceSystemId: batch.sourceSystemId,
            sourceRecordId: String(payload.source_record_id),
            invoiceNumber: String(payload.invoice_number ?? payload.source_record_id),
            currency: String(payload.currency ?? "PHP"),
            totalAmount: total,
            paidAmount: paid,
            balanceAmount: balance,
            status: String(payload.status ?? "imported"),
            issuedAt: new Date(String(payload.issued_at ?? new Date().toISOString())),
          }).onConflictDoNothing().returning({ id: invoices.id });
          insertedRecordId = inserted?.id;
        } else if (source?.sourceType === "INSURANCE") {
          const [inserted] = await db.insert(insurancePolicies).values({
            id: randomUUID(),
            patientId: mapping.patientId,
            sourceSystemId: batch.sourceSystemId,
            sourceRecordId: String(payload.source_record_id),
            payerName: String(payload.payer_name ?? "Imported synthetic payer"),
            memberReference: String(payload.member_reference ?? payload.source_patient_id),
            coverageStatus: String(payload.coverage_status ?? "imported"),
            coverageStart: payload.coverage_start || null,
            coverageEnd: payload.coverage_end || null,
          }).onConflictDoNothing().returning({ id: insurancePolicies.id });
          insertedRecordId = inserted?.id;
        }

        if (!insertedRecordId) {
          rejected += 1;
          conflicts += 1;
          await db.update(importRows).set({
            status: "rejected",
            errorCode: "DUPLICATE_SOURCE_RECORD",
            errorMessage: `Source record ID ${row.sourceRecordId ?? ""} already exists in this source system.`,
          }).where(eq(importRows.id, row.id));
          continue;
        }

        accepted += 1;
        await db.update(importRows).set({ status: "accepted" }).where(eq(importRows.id, row.id));
        await db.insert(integrationEvents).values({
          id: randomUUID(),
          entityType: source?.sourceType?.toLowerCase() ?? "source",
          entityId: row.sourceRecordId ?? randomUUID(),
          operation: "upsert",
        });
      }

      const finalStatus = rejected > 0 ? "completed_with_errors" : "completed";
      await db.update(importBatches).set({
        status: finalStatus,
        acceptedRows: String(accepted),
        rejectedRows: String(rejected),
        conflictRows: String(conflicts),
        completedAt: new Date(),
      }).where(eq(importBatches.id, batch.id));

      await recordAudit({
        actorUserId: request.user?.id,
        action: "integrations.confirm",
        resourceType: "import_batch",
        resourceId: batch.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });

      response.json({
        success: true,
        data: { batchId: batch.id, status: finalStatus, accepted, rejected, conflicts },
      });
    } catch (error) {
      next(error);
    }
  },
);
