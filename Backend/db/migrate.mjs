/**
 * Migration runner.
 *
 * Applies every .sql file in db/migrations in filename order, once each,
 * recording what ran in schema_migrations. Each file runs inside a transaction,
 * so a failure half-way leaves nothing behind.
 *
 *   node db/migrate.mjs           apply pending migrations
 *   node db/migrate.mjs --status  list what has and has not run
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'migrations');

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

// Bootstrapped here rather than in a migration — the ledger has to exist
// before the first migration can be recorded in it.
await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const { rows } = await client.query('SELECT version FROM schema_migrations');
const done = new Set(rows.map((r) => r.version));

if (process.argv.includes('--status')) {
  for (const file of files) console.log(`  ${done.has(file) ? 'applied' : 'PENDING'}  ${file}`);
  await client.end();
  process.exit(0);
}

let applied = 0;
for (const file of files) {
  if (done.has(file)) {
    console.log(`  skip     ${file}`);
    continue;
  }
  const sql = readFileSync(join(dir, file), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`  applied  ${file}`);
    applied += 1;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`  FAILED   ${file}\n  ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(applied ? `\n${applied} migration(s) applied.` : '\nAlready up to date.');
await client.end();
