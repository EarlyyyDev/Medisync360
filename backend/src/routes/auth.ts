import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  authenticate,
  changeUserPassword,
  renewSessionCsrf,
  revokeSession,
} from "../auth/service.js";
import { recordAudit } from "../auth/audit.js";
import {
  readSessionCookie,
  requirePermission,
  SESSION_COOKIE,
} from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

authRouter.post("/login", async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    next(new ApiError(400, "VALIDATION_ERROR", "Enter a valid email and password."));
    return;
  }

  try {
    const result = await authenticate(parsed.data.email, parsed.data.password);
    if (!result) {
      await recordAudit({
        action: "auth.login",
        resourceType: "session",
        outcome: "failure",
        requestId: request.requestId,
        ipAddress: request.ip,
      });
      next(new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password."));
      return;
    }

    const maxAge =
      env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000;
    response.setHeader(
      "set-cookie",
      `${SESSION_COOKIE}=${result.sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}${env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );

    await recordAudit({
      actorUserId: result.user.id,
      action: "auth.login",
      resourceType: "session",
      outcome: "success",
      requestId: request.requestId,
      ipAddress: request.ip,
    });

    response.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName,
        },
        csrfToken: result.csrfToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  const token = readSessionCookie(request.header("cookie"));
  if (token) {
    await revokeSession(token);
  }

  response.setHeader(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );

  await recordAudit({
    actorUserId: request.user?.id,
    action: "auth.logout",
    resourceType: "session",
    outcome: "success",
    requestId: request.requestId,
    ipAddress: request.ip,
  });

  response.json({ success: true, data: { loggedOut: true } });
});

authRouter.post("/csrf", async (request, response, next) => {
  if (!request.user) {
    next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }
  const token = readSessionCookie(request.header("cookie"));
  if (!token) {
    next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }
  try {
    const csrfToken = await renewSessionCsrf(token);
    if (!csrfToken) {
      next(new ApiError(401, "SESSION_EXPIRED", "Your session has expired."));
      return;
    }
    response.json({ success: true, data: { csrfToken } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/password", async (request, response, next) => {
  if (!request.user) {
    next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }

  const parsed = passwordChangeSchema.safeParse(request.body);
  if (!parsed.success) {
    next(new ApiError(400, "VALIDATION_ERROR", "Enter your current password and a new password of at least 12 characters."));
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    next(new ApiError(400, "PASSWORD_UNCHANGED", "Choose a new password different from your current password."));
    return;
  }

  try {
    const changed = await changeUserPassword(
      request.user.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    if (!changed) {
      await recordAudit({
        actorUserId: request.user.id,
        action: "auth.password_change",
        resourceType: "user",
        resourceId: request.user.id,
        outcome: "failure",
        requestId: request.requestId,
        ipAddress: request.ip,
      });
      next(new ApiError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect."));
      return;
    }

    response.setHeader(
      "set-cookie",
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    await recordAudit({
      actorUserId: request.user.id,
      action: "auth.password_change",
      resourceType: "user",
      resourceId: request.user.id,
      outcome: "success",
      requestId: request.requestId,
      ipAddress: request.ip,
    });
    response.json({ success: true, data: { passwordChanged: true, signedOut: true } });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", (request, response) => {
  if (!request.user) {
    response.status(401).json({
      success: false,
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
        requestId: request.requestId,
      },
    });
    return;
  }

  response.json({
    success: true,
    data: { user: request.user },
  });
});

authRouter.get(
  "/admin-check",
  requirePermission("users.manage"),
  (request, response) => {
    response.json({
      success: true,
      data: {
        allowed: true,
        permission: "users.manage",
      },
    });
  },
);
