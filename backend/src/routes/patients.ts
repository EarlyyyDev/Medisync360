import { Router } from "express";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../auth/audit.js";
import { uuid } from "../auth/tokens.js";
import { getDatabase } from "../db/client.js";
import {
  emrEncounters,
  insurancePolicies,
  invoices,
  labOrders,
  labResults,
  patients,
} from "../db/schema.js";
import { ApiError } from "../middleware/errors.js";
import { requirePermission } from "../middleware/auth.js";

export const patientRouter = Router();

function patientIdOrCode(patientId: string | string[]) {
  const id = Array.isArray(patientId) ? (patientId[0] ?? "") : patientId;
  return or(eq(patients.id, id), eq(patients.internalCode, id));
}

export const patientSchema = z.object({
  internalCode: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.string().trim().pipe(z.enum(["Male", "Female"])),
});

patientRouter.get(
  "/",
  requirePermission("patients.read"),
  async (request, response, next) => {
    try {
      const page = Math.max(1, Number(request.query.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 20)));
      const query = String(request.query.q ?? "").trim();
      const status = String(request.query.status ?? "active");
      const db = getDatabase();
      const activeFilter =
        status === "inactive"
          ? eq(patients.active, false)
          : status === "all"
            ? undefined
            : eq(patients.active, true);
      const searchFilter = query
        ? or(
            ilike(patients.firstName, `%${query}%`),
            ilike(patients.lastName, `%${query}%`),
            ilike(patients.internalCode, `%${query}%`),
          )
        : undefined;
      const where = and(activeFilter, searchFilter);

      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(patients)
          .where(where)
          .orderBy(desc(patients.updatedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(patients).where(where),
      ]);

      response.json({
        success: true,
        data: {
          items: rows,
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

patientRouter.get(
  "/:id",
  requirePermission("patients.read"),
  async (request, response, next) => {
    try {
      const patientId = request.params.id;
      if (!patientId) {
        next(new ApiError(400, "VALIDATION_ERROR", "Patient ID is required."));
        return;
      }
      const db = getDatabase();
      const [patient] = await db
        .select()
        .from(patients)
        .where(patientIdOrCode(patientId))
        .limit(1);
      if (!patient) {
        next(new ApiError(404, "PATIENT_NOT_FOUND", "Patient was not found."));
        return;
      }
      await recordAudit({
        actorUserId: request.user?.id,
        action: "patients.read",
        resourceType: "patient",
        resourceId: patient.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });
      response.json({ success: true, data: patient });
    } catch (error) {
      next(error);
    }
  },
);

patientRouter.post(
  "/",
  requirePermission("patients.write"),
  async (request, response, next) => {
    const parsed = patientSchema.safeParse(request.body);
    if (!parsed.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Patient fields are invalid."));
      return;
    }

    try {
      const db = getDatabase();
      const patient = {
        id: uuid(),
        ...parsed.data,
        active: true,
        createdBy: request.user?.id,
        updatedBy: request.user?.id,
      };
      await db.insert(patients).values(patient);
      await recordAudit({
        actorUserId: request.user?.id,
        action: "patients.create",
        resourceType: "patient",
        resourceId: patient.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });
      response.status(201).json({ success: true, data: patient });
    } catch (error) {
      next(error);
    }
  },
);

patientRouter.get(
  "/:id/360",
  requirePermission("patients.read"),
  async (request, response, next) => {
    try {
      const patientId = request.params.id;
      if (!patientId) {
        next(new ApiError(400, "VALIDATION_ERROR", "Patient ID is required."));
        return;
      }
      const db = getDatabase();
      const [patient] = await db
        .select()
        .from(patients)
        .where(patientIdOrCode(patientId))
        .limit(1);
      if (!patient) {
        next(new ApiError(404, "PATIENT_NOT_FOUND", "Patient was not found."));
        return;
      }

      const [emr, lis, billing, insurance] = await Promise.all([
        db.select().from(emrEncounters).where(sql`${emrEncounters.patientId} = ${patient.id}`),
        db.select().from(labOrders).where(sql`${labOrders.patientId} = ${patient.id}`),
        db.select().from(invoices).where(sql`${invoices.patientId} = ${patient.id}`),
        db.select().from(insurancePolicies).where(sql`${insurancePolicies.patientId} = ${patient.id}`),
      ]);

      await recordAudit({
        actorUserId: request.user?.id,
        action: "patients.view_360",
        resourceType: "patient",
        resourceId: patient.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });

      response.json({
        success: true,
        data: {
          patient,
          domains: {
            emr,
            lis,
            billing,
            insurance,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

patientRouter.patch(
  "/:id",
  requirePermission("patients.write"),
  async (request, response, next) => {
    const parsed = patientSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Patient fields are invalid."));
      return;
    }

    try {
      const patientId = request.params.id;
      if (!patientId) {
        next(new ApiError(400, "VALIDATION_ERROR", "Patient ID is required."));
        return;
      }
      const db = getDatabase();
      const [existing] = await db
        .select()
        .from(patients)
        .where(patientIdOrCode(patientId))
        .limit(1);
      if (!existing) {
        next(new ApiError(404, "PATIENT_NOT_FOUND", "Patient was not found."));
        return;
      }

      await db
        .update(patients)
        .set({ ...parsed.data, updatedBy: request.user?.id, updatedAt: new Date() })
        .where(sql`${patients.id} = ${existing.id}`);
      await recordAudit({
        actorUserId: request.user?.id,
        action: "patients.update",
        resourceType: "patient",
        resourceId: existing.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });
      response.json({ success: true, data: { id: existing.id } });
    } catch (error) {
      next(error);
    }
  },
);

patientRouter.post(
  "/:id/archive",
  requirePermission("patients.write"),
  async (request, response, next) => {
    try {
      const patientId = request.params.id;
      if (!patientId) {
        next(new ApiError(400, "VALIDATION_ERROR", "Patient ID is required."));
        return;
      }
      const db = getDatabase();
      const [existing] = await db
        .select()
        .from(patients)
        .where(patientIdOrCode(patientId))
        .limit(1);
      if (!existing) {
        next(new ApiError(404, "PATIENT_NOT_FOUND", "Patient was not found."));
        return;
      }
      await db
        .update(patients)
        .set({ active: false, updatedBy: request.user?.id, updatedAt: new Date() })
        .where(sql`${patients.id} = ${existing.id}`);
      await recordAudit({
        actorUserId: request.user?.id,
        action: "patients.archive",
        resourceType: "patient",
        resourceId: existing.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
      });
      response.json({ success: true, data: { id: existing.id, active: false } });
    } catch (error) {
      next(error);
    }
  },
);
