/**
 * Seeds the demo accounts.
 *
 * Once the backend is authoritative, the frontend's in-memory scenario table
 * stops being consulted — so without these rows the documented status screens
 * (suspended, invitation pending) become unreachable and there is nothing left
 * to demonstrate §7.2 against.
 *
 * Idempotent: re-running updates the existing rows rather than failing.
 *
 *   node db/seed-demo.mjs
 */

import 'dotenv/config';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const DEMO_PASSWORD = 'Zoiko2026!';

const ACCOUNTS = [
  { email: 'alex@acme.com', firstName: 'Alex', lastName: 'Mercer', status: 'active' },
  { email: 'sarah@acme.com', firstName: 'Sarah', lastName: 'Kaur', status: 'active' },
  { email: 'suspended@acme.com', firstName: 'Sam', lastName: 'Holt', status: 'suspended' },
  { email: 'invited@acme.com', firstName: 'Iris', lastName: 'Nolan', status: 'invited' },
];

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const digest = await hash(DEMO_PASSWORD, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

for (const account of ACCOUNTS) {
  await client.query(
    `INSERT INTO app_user (email, first_name, last_name, password_hash, status)
     VALUES ($1, $2, $3, $4, $5::app_user_status)
     ON CONFLICT (email) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name  = EXCLUDED.last_name,
           password_hash = EXCLUDED.password_hash,
           status = EXCLUDED.status,
           failed_attempts = 0,
           locked_until = NULL`,
    [account.email, account.firstName, account.lastName, digest, account.status],
  );
  console.log(`  seeded  ${account.email.padEnd(24)} ${account.status}`);
}

console.log(`\n${ACCOUNTS.length} demo accounts seeded. Password: ${DEMO_PASSWORD}`);
await client.end();
