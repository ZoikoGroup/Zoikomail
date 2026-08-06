import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { assertReady, pool } from './db.js';
import { errorHandler, notFound, requestContext } from './http.js';
import { authRouter } from './routes/auth.js';

const app = express();

// Behind one trusted proxy in deployment; makes req.ip and X-Forwarded-For
// trustworthy for exactly one hop rather than any hop a client claims.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/**
 * Allow-list, never a wildcard — these endpoints accept credentials.
 *
 * Development additionally accepts any localhost port, because the frontend
 * gets started on whatever port is free and a mismatch fails as a CORS error
 * the frontend swallows into its offline fallback. That looks like the app
 * working while nothing reaches the database, which is worse than a hard
 * failure. Production honours the configured list only.
 */
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, health checks, same-origin
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      if (!config.isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin not allowed: ${origin}`));
    },
  }),
);

// Capped deliberately. An auth payload is a few hundred bytes; accepting
// megabytes only gives an attacker a cheap way to occupy the process.
app.use(express.json({ limit: '16kb' }));
app.use(requestContext);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});

// API §4 sets the base path.
app.use('/api/v1/auth', authRouter);

app.use(notFound);
app.use(errorHandler);

// Fail at boot, not on the first request, if the schema is missing.
try {
  await assertReady();
} catch (error) {
  console.error(`[boot] ${(error as Error).message}`);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`Zoiko Mail API listening on http://localhost:${config.port}`);
  console.log(`  CORS origins: ${config.corsOrigins.join(', ')}${config.isProduction ? '' : ' (+ any localhost port in dev)'}`);
  console.log(`  health      : http://localhost:${config.port}/health`);
});

/** Finish in-flight requests and close the pool before exiting. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} — shutting down`);
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
