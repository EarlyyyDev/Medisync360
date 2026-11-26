import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { getDatabase } from "../db/client.js";
import {
  permissions,
  rolePermissions,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { sha256, randomToken, uuid } from "./tokens.js";

export const permissionNames = [
  "users.manage",
  "patients.read",
  "patients.write",
  "emr.read",
  "emr.write",
  "lis.read",
  "lis.write",
  "billing.read",
  "billing.write",
  "insurance.read",
  "insurance.write",
  "integrations.manage",
  "quality.manage",
  "audit.read",
  "reports.export",
] as const;

export async function authenticate(email: string, password: string) {
  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user || !user.active) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(
    Date.now() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
  );

  await db.insert(sessions).values({
    id: uuid(),
    userId: user.id,
    sessionTokenHash: sha256(sessionToken),
    csrfTokenHash: sha256(csrfToken),
    expiresAt,
  });

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return { user, sessionToken, csrfToken };
}

export async function revokeSession(sessionToken: string) {
  const db = getDatabase();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.sessionTokenHash, sha256(sessionToken)));
}

export async function revokeUserSessions(userId: string) {
  const db = getDatabase();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    );
}

export async function changeUserPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
) {
    const db = getDatabase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.active || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return false;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await transaction
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    });
    return true;
}

export async function renewSessionCsrf(sessionToken: string) {
  const db = getDatabase();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionTokenHash, sha256(sessionToken)))
    .limit(1);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const idleDeadline =
    session.lastSeenAt.getTime() +
    env.SESSION_IDLE_MINUTES * 60 * 1000;
  if (idleDeadline <= Date.now()) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    return null;
  }

  const csrfToken = randomToken();
  await db
    .update(sessions)
    .set({
      csrfTokenHash: sha256(csrfToken),
      lastSeenAt: new Date(),
    })
    .where(eq(sessions.id, session.id));
  return csrfToken;
}

export async function loadSession(sessionToken: string) {
  const db = getDatabase();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionTokenHash, sha256(sessionToken)))
    .limit(1);

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const idleDeadline =
    session.lastSeenAt.getTime() +
    env.SESSION_IDLE_MINUTES * 60 * 1000;
  if (idleDeadline <= Date.now()) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || !user.active) {
    return null;
  }

  const permissionRows = await db
    .select({ name: permissions.name })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(
      permissions,
      eq(rolePermissions.permissionId, permissions.id),
    )
    .where(eq(userRoles.userId, user.id));

  await db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, session.id));

  return {
    session,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      permissions: [...new Set(permissionRows.map((row) => row.name))],
    },
  };
}
