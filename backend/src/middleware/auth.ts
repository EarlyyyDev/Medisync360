import type { RequestHandler } from "express";
import { sha256 } from "../auth/tokens.js";
import { loadSession } from "../auth/service.js";
import { ApiError } from "./errors.js";

export const SESSION_COOKIE = "medisync_session";

export function readSessionCookie(header: string | undefined) {
  if (!header) {
    return undefined;
  }

  const cookie = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));

  return cookie?.slice(SESSION_COOKIE.length + 1);
}

export const authenticateRequest: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const token = readSessionCookie(request.header("cookie"));
  if (!token) {
    next();
    return;
  }

  try {
    const loaded = await loadSession(token);
    if (!loaded) {
      next();
      return;
    }

    request.user = loaded.user;
    const authPath = request.originalUrl.split("?")[0];
    const publicAuthAction =
      authPath === "/api/v1/auth/login" ||
      authPath === "/api/v1/auth/logout" ||
      authPath === "/api/v1/auth/csrf";
    const stateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method,
    );
    if (stateChanging && !publicAuthAction) {
      const submittedCsrf = request.header("x-csrf-token");
      if (
        !submittedCsrf ||
        sha256(submittedCsrf) !== loaded.session.csrfTokenHash
      ) {
        next(new ApiError(403, "CSRF_VALIDATION_FAILED", "CSRF validation failed."));
        return;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(permission: string): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }

    if (!request.user.permissions.includes(permission)) {
      next(new ApiError(403, "PERMISSION_DENIED", "You do not have permission for this action."));
      return;
    }

    next();
  };
}
