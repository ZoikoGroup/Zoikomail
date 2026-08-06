import pg from 'pg';
import { config } from './config.js';

/**
 * One pool for the process. Route handlers borrow a connection per query and
 * return it immediately, so a slow client cannot exhaust the pool.
 */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An error on an idle client is not tied to any request, so it has nowhere to
// propagate. Logging it is the only useful response; without this handler the
// unhandled 'error' event takes the process down.
pool.on('error', (error) => {
  console.error('[db] idle client error:', error.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

/** Verifies the database is reachable and migrated before the server accepts traffic. */
export async function assertReady(): Promise<void> {
  const { rows } = await pool.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'app_user'
     ) AS present`,
  );

  if (!rows[0]?.present) {
    throw new Error('app_user table is missing — run: node db/migrate.mjs');
  }
}
