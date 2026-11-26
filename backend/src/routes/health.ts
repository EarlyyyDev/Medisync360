import { Router } from "express";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/live", (_request, response) => {
  response.json({
    success: true,
    data: {
      status: "live",
      service: "medisync360-api",
    },
  });
});

healthRouter.get("/ready", (_request, response) => {
  const databaseConfigured = Boolean(env.DATABASE_URL);

  response.status(databaseConfigured ? 200 : 503).json({
    success: databaseConfigured,
    data: databaseConfigured
      ? { status: "ready", database: "configured" }
      : undefined,
    error: databaseConfigured
      ? undefined
      : {
          code: "DATABASE_NOT_CONFIGURED",
          message: "Set DATABASE_URL to a Neon PostgreSQL connection string.",
        },
  });
});
