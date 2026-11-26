import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import pino from "pino";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { requestContext } from "./middleware/request-context.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { authenticateRequest } from "./middleware/auth.js";
import { patientRouter } from "./routes/patients.js";
import { sourceRouter } from "./routes/sources.js";
import { integrationRouter } from "./routes/integrations.js";
import { qualityRouter } from "./routes/quality.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { auditRouter } from "./routes/audit.js";
import { adminRouter } from "./routes/admin.js";

const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.token",
      "DATABASE_URL",
    ],
    censor: "[REDACTED]",
  },
});

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "X-CSRF-TOKEN",
      ],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use(requestContext);
  app.use(authenticateRequest);

  app.get("/", (_request, response) => {
    response.json({
      success: true,
      data: {
        service: "medisync360-api",
        health: "/health/live",
      },
    });
  });

  app.use(
    "/api/v1/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many authentication requests.",
        },
      },
    }),
    authRouter,
  );

  app.use("/health", healthRouter);
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/patients", patientRouter);
  app.use("/api/v1/sources", sourceRouter);
  app.use("/api/v1/integrations", integrationRouter);
  app.use("/api/v1/quality", qualityRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/audit", auditRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
