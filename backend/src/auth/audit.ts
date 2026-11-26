import { env } from "../config/env.js";
import { getDatabase } from "../db/client.js";
import { auditEvents } from "../db/schema.js";
import { uuid } from "./tokens.js";

export async function recordAudit(input: {
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: "success" | "failure";
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!env.DATABASE_URL) {
    return;
  }

  const db = getDatabase();
  await db.insert(auditEvents).values({
    id: uuid(),
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: input.outcome,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    metadata: input.metadata,
  });
}
