import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/client.js";
import {
  dataQualityIssues,
  importBatches,
  reconciliationDecisions,
  sourceSystems,
} from "../db/schema.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { recordAudit } from "../auth/audit.js";

export const qualityRouter = Router();

qualityRouter.get(
  "/issues",
  requirePermission("quality.manage"),
  async (_request, response) => {
    const db = getDatabase();
    const issues = await db
      .select({
        id: dataQualityIssues.id,
        issueType: dataQualityIssues.issueType,
        severity: dataQualityIssues.severity,
        status: dataQualityIssues.status,
        sourceSystemId: dataQualityIssues.sourceSystemId,
        batchId: dataQualityIssues.batchId,
        details: dataQualityIssues.details,
        createdAt: dataQualityIssues.createdAt,
        sourceSystemName: sourceSystems.name,
        batchFileName: importBatches.fileName,
      })
      .from(dataQualityIssues)
      .leftJoin(
        sourceSystems,
        eq(dataQualityIssues.sourceSystemId, sourceSystems.id),
      )
      .leftJoin(importBatches, eq(dataQualityIssues.batchId, importBatches.id))
      .where(eq(dataQualityIssues.status, "open"))
      .orderBy(desc(dataQualityIssues.createdAt))
      .limit(200);
    response.json({ success: true, data: issues });
  },
);

const resolveSchema = z.object({
  decision: z.enum(["resolve", "dismiss"]),
  reason: z.string().trim().min(10).max(500),
});

qualityRouter.post(
  "/issues/:id/resolve",
  requirePermission("quality.manage"),
  async (request, response, next) => {
    const issueId = request.params.id;
    if (!issueId || Array.isArray(issueId)) {
      next(new ApiError(400, "VALIDATION_ERROR", "Issue ID is required."));
      return;
    }
    const parsed = resolveSchema.safeParse(request.body);
    if (!parsed.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "A valid decision and reason are required."));
      return;
    }
    try {
      const db = getDatabase();
      const [issue] = await db
        .select()
        .from(dataQualityIssues)
        .where(sql`${dataQualityIssues.id} = ${issueId}`)
        .limit(1);
      if (!issue) {
        next(new ApiError(404, "ISSUE_NOT_FOUND", "Data quality issue was not found."));
        return;
      }
      await db.insert(reconciliationDecisions).values({
        id: randomUUID(),
        issueId: issue.id,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
        reviewerId: request.user?.id ?? "",
      });
      await db
        .update(dataQualityIssues)
        .set({
          status: parsed.data.decision === "resolve" ? "resolved" : "dismissed",
          resolvedBy: request.user?.id,
          resolutionReason: parsed.data.reason,
          resolvedAt: new Date(),
        })
        .where(sql`${dataQualityIssues.id} = ${issue.id}`);
      await recordAudit({
        actorUserId: request.user?.id,
        action: "quality.reconcile",
        resourceType: "data_quality_issue",
        resourceId: issue.id,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
        metadata: { decision: parsed.data.decision },
      });
      response.json({ success: true, data: { id: issue.id, decision: parsed.data.decision } });
    } catch (error) {
      next(error);
    }
  },
);
