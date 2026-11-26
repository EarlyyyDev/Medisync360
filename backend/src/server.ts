import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import pino from "pino";

const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
});

const app = createApp();
const server: Server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "MediSync 360 API started");
});

function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown requested");
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Server shutdown failed");
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
