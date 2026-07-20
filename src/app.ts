import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from "./common/middleware/index.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests, please try again later",
          },
          requestId: req.requestId,
        });
      },
    })
  );

  app.get("/", (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        name: "Zoiko Mail API",
        version: "1.0.0",
      },
    });
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: "UP",
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
