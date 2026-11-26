import { Router } from "express";
import { count, desc } from "drizzle-orm";
import { getDatabase } from "../db/client.js";
import {
  auditEvents,
  emrEncounters,
  importBatches,
  insurancePolicies,
  invoices,
  labOrders,
  patients,
} from "../db/schema.js";
import { requirePermission } from "../middleware/auth.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/summary",
  requirePermission("audit.read"),
  async (_request, response) => {
    const db = getDatabase();
    const [
      patientCount,
      emrCount,
      lisCount,
      invoiceCount,
      insuranceCount,
      batchCount,
      recentAudit,
      batches,
    ] = await Promise.all([
      db.select({ value: count() }).from(patients),
      db.select({ value: count() }).from(emrEncounters),
      db.select({ value: count() }).from(labOrders),
      db.select({ value: count() }).from(invoices),
      db.select({ value: count() }).from(insurancePolicies),
      db.select({ value: count() }).from(importBatches),
      db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(10),
      db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(10),
    ]);
    response.json({
      success: true,
      data: {
        counts: {
          patients: Number(patientCount[0]?.value ?? 0),
          emrEncounters: Number(emrCount[0]?.value ?? 0),
          labOrders: Number(lisCount[0]?.value ?? 0),
          invoices: Number(invoiceCount[0]?.value ?? 0),
          insurancePolicies: Number(insuranceCount[0]?.value ?? 0),
          importBatches: Number(batchCount[0]?.value ?? 0),
        },
        recentAudit,
        recentBatches: batches,
      },
    });
  },
);
