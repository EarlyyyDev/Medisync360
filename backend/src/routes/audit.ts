import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "../db/client.js";
import { auditEvents } from "../db/schema.js";
import { requirePermission } from "../middleware/auth.js";

export const auditRouter = Router();

auditRouter.get(
  "/",
  requirePermission("audit.read"),
  async (request, response) => {
    const db = getDatabase();
    const action = typeof request.query.action === "string" ? request.query.action : undefined;
    const outcome = typeof request.query.outcome === "string" ? request.query.outcome : undefined;
    const from = typeof request.query.from === "string" ? new Date(request.query.from) : undefined;
    const to = typeof request.query.to === "string" ? new Date(request.query.to) : undefined;
    const where = and(
      action ? eq(auditEvents.action, action) : undefined,
      outcome ? eq(auditEvents.outcome, outcome) : undefined,
      from && !Number.isNaN(from.getTime()) ? gte(auditEvents.createdAt, from) : undefined,
      to && !Number.isNaN(to.getTime()) ? lte(auditEvents.createdAt, to) : undefined,
    );
    const rows = await db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
    response.json({ success: true, data: rows });
  },
);
