import 'dotenv/config';

/**
 * Environment, read once and validated at boot.
 *
 * A missing DATABASE_URL should stop the process immediately rather than
 * surface as a connection error on the first sign-in attempt.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    console.error('Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),

  /** Comma-separated, so preview and local origins can coexist. */
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  isProduction: process.env.NODE_ENV === 'production',

  /** Runbook §6.4 — five consecutive failures lock the account. */
  maxFailedAttempts: 5,
  /** Lock duration, matching the countdown the frontend shows. */
  lockSeconds: 892,
} as const;
