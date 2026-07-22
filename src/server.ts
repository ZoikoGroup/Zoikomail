import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./config/prisma.js";
import { logger } from "./config/logger.js";

const app = createApp();
const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "Zoiko Mail API listening");
});

server.requestTimeout = env.HTTP_REQUEST_TIMEOUT_MS;
server.headersTimeout = env.HTTP_HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = env.HTTP_KEEP_ALIVE_TIMEOUT_MS;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Graceful shutdown started");

  server.close(async () => {
    await disconnectPrisma();
    logger.info("Server and database connections closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.fatal("Forced shutdown after timeout");
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
