import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDatabase } from "../db/client.js";
import {
  emrEncounters,
  insurancePolicies,
  invoices,
  labOrders,
  labResults,
  sourceSystems,
} from "../db/schema.js";
import { requirePermission } from "../middleware/auth.js";

export const sourceRouter = Router();

sourceRouter.get(
  "/systems",
  requirePermission("integrations.manage"),
  async (_request, response) => {
    const db = getDatabase();
    response.json({ success: true, data: await db.select().from(sourceSystems) });
  },
);

sourceRouter.get(
  "/emr/encounters",
  requirePermission("emr.read"),
  async (request, response) => {
    const db = getDatabase();
    const patientId = typeof request.query.patientId === "string"
      ? request.query.patientId
      : undefined;
    const rows = patientId
      ? await db.select().from(emrEncounters).where(eq(emrEncounters.patientId, patientId))
      : await db.select().from(emrEncounters);
    response.json({ success: true, data: rows });
  },
);

sourceRouter.get(
  "/lis/orders",
  requirePermission("lis.read"),
  async (request, response) => {
    const db = getDatabase();
    const patientId = typeof request.query.patientId === "string"
      ? request.query.patientId
      : undefined;
    const rows = patientId
      ? await db.select().from(labOrders).where(eq(labOrders.patientId, patientId))
      : await db.select().from(labOrders);
    response.json({ success: true, data: rows });
  },
);

sourceRouter.get(
  "/lis/results",
  requirePermission("lis.read"),
  async (request, response) => {
    const db = getDatabase();
    const orderId = typeof request.query.orderId === "string"
      ? request.query.orderId
      : undefined;
    const rows = orderId
      ? await db.select().from(labResults).where(eq(labResults.labOrderId, orderId))
      : await db.select().from(labResults);
    response.json({ success: true, data: rows });
  },
);

sourceRouter.get(
  "/billing/invoices",
  requirePermission("billing.read"),
  async (request, response) => {
    const db = getDatabase();
    const patientId = typeof request.query.patientId === "string"
      ? request.query.patientId
      : undefined;
    const rows = patientId
      ? await db.select().from(invoices).where(eq(invoices.patientId, patientId))
      : await db.select().from(invoices);
    response.json({ success: true, data: rows });
  },
);

sourceRouter.get(
  "/insurance/policies",
  requirePermission("insurance.read"),
  async (request, response) => {
    const db = getDatabase();
    const patientId = typeof request.query.patientId === "string"
      ? request.query.patientId
      : undefined;
    const rows = patientId
      ? await db.select().from(insurancePolicies).where(eq(insurancePolicies.patientId, patientId))
      : await db.select().from(insurancePolicies);
    response.json({ success: true, data: rows });
  },
);
