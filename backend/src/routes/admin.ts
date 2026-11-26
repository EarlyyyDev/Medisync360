import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { users } from "../db/schema.js";
import { requirePermission } from "../middleware/auth.js";
import { revokeUserSessions } from "../auth/service.js";
import { ApiError } from "../middleware/errors.js";
import { recordAudit } from "../auth/audit.js";

export const adminRouter = Router();

adminRouter.get(
  "/users",
  requirePermission("users.manage"),
  async (_request, response) => {
    const db = getDatabase();
    const rows = await db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
    }).from(users);
    response.json({ success: true, data: rows });
  },
);

const statusSchema = z.object({ active: z.boolean() });

adminRouter.patch(
  "/users/:id/status",
  requirePermission("users.manage"),
  async (request, response, next) => {
    const userId = request.params.id;
    if (!userId || Array.isArray(userId)) {
      next(new ApiError(400, "VALIDATION_ERROR", "User ID is required."));
      return;
    }
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Active status is required."));
      return;
    }
    if (userId === request.user?.id) {
      next(new ApiError(403, "SELF_STATUS_CHANGE_DENIED", "You cannot disable your own account."));
      return;
    }
    try {
      const db = getDatabase();
      await db
        .update(users)
        .set({ active: parsed.data.active, updatedAt: new Date() })
        .where(sql`${users.id} = ${userId}`);
      if (!parsed.data.active) {
        await revokeUserSessions(userId);
      }
      await recordAudit({
        actorUserId: request.user?.id,
        action: "users.status_change",
        resourceType: "user",
        resourceId: userId,
        outcome: "success",
        requestId: request.requestId,
        ipAddress: request.ip,
        metadata: { active: parsed.data.active },
      });
      response.json({ success: true, data: { id: userId, active: parsed.data.active } });
    } catch (error) {
      next(error);
    }
  },
);
