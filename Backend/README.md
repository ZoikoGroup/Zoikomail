# Zoiko Mail — Identity API

PostgreSQL-backed authentication for Zoiko Mail. Express 5 · TypeScript · `pg` ·
Argon2id.

Stores accounts and an append-only audit trail. **It never stores a password** —
only an Argon2id digest, which verifies a password but cannot be reversed into
one.

---

## Running it

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL
npm run migrate           # create the tables
npm run seed              # optional: demo accounts
npm run dev               # http://localhost:4000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode via tsx |
| `npm run build` / `start` | Compile to `dist/`, then run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:status` | Show applied vs pending |
| `npm run seed` | Insert the demo accounts |

Health check: `GET /health` → `{"status":"ok","database":"up"}`

---

## Database

Its **own** database, `zoikomail`, owned by a dedicated non-superuser role
`zoikomail_app`. Deliberately separate from the unrelated `zoiko` database on
the same server, which belongs to a different (logistics) product.

### `app_user`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `UUID` | `gen_random_uuid()` |
| `email` | `CITEXT` | Unique, case-insensitive |
| `first_name`, `last_name` | `TEXT` | Non-empty, enforced by CHECK |
| `password_hash` | `TEXT` | Argon2id — **never the password** |
| `status` | `app_user_status` | `active` · `invited` · `suspended` · `deleted` |
| `failed_attempts` | `INTEGER` | Runbook §6.4 lockout counter |
| `locked_until` | `TIMESTAMPTZ` | Set on the fifth failure |
| `last_login_at`, `created_at`, `updated_at` | `TIMESTAMPTZ` | `updated_at` by trigger |

### `auth_event`

Audit §6.1. Append-only per §6.3 — the application only ever inserts. Records
`request_id`, `source_ip` and `user_agent`, and keeps the `email` even when no
account matches, so probing an unknown address is still auditable.

---

## Endpoints

Base path `/api/v1` (API §4). Errors use the §4 envelope:
`{ error: { code, message, request_id } }`.

### `POST /auth/register`

```json
{ "firstName": "Ada", "lastName": "Lovelace",
  "email": "ada@example.com", "password": "Abcdef1!" }
```
→ `201 { "created": true, "taken": false }` · `200 { "created": false, "taken": true }`

Password policy is re-checked server-side. Client validation is a convenience,
not a control — a direct POST bypasses the checklist entirely.

Insert uses `ON CONFLICT DO NOTHING`. Two simultaneous submissions of the same
address would both pass a prior existence check and one would then fail on the
unique index; letting Postgres arbitrate removes the race.

### `POST /auth/sign-in`

```json
{ "email": "ada@example.com", "password": "Abcdef1!" }
```
→ `{ "outcome": "dashboard", "firstName": "Ada", "workspaceIds": ["ten_acme"] }`

Outcomes: `dashboard` · `failed` · `locked` · `accountSuspended` ·
`invitationPending`. The shape matches the frontend's `Scenario` type exactly,
so nothing downstream changes.

**Evaluation order follows Security §7.2** — account status at steps 3–4, the
credential check at step 5:

```
1. No account?          → failed (or locked), audited, indistinguishable
2. status = suspended   → accountSuspended   ┐ before the password
3. status = invited     → invitationPending  │ is ever verified
4. status = deleted     → failed             ┘
5. locked_until ahead?  → locked
6. verify password      → dashboard, or failed/locked
```

Steps 2–4 run **before** step 6 deliberately. Verifying a password for an
account that cannot sign in either way would confirm the password was correct.

---

## Security notes

**Enumeration.** Sign-in has exactly one generic failure for a wrong password,
an unknown address and a deleted account. Unknown addresses are still audited
and still lock out, because a lockout that only ever appeared for real accounts
would itself reveal which addresses exist. Registration *does* disclose
`taken` — there the person is asserting the address is theirs, and withholding
it leaves them stuck.

**Hashing.** Argon2id at the OWASP minimum (19 MiB, t=2, p=1) via
`@node-rs/argon2` — prebuilt, so no compiler toolchain. Parameters live inside
the digest, so raising them later leaves existing hashes valid.

**CORS.** Allow-list, never a wildcard, because these endpoints take
credentials. Development also accepts any localhost port: a mismatch surfaces as
a CORS error the frontend swallows into its offline fallback, which looks like
the app working while nothing reaches the database.

**Error bodies.** Internal failures return a fixed message. Postgres error text
names tables, columns and constraints — free reconnaissance. It goes to the log.

---

## Known gaps

| Gap | Status |
| --- | --- |
| No rate limiting per IP | **Open** — lockout is per account only, so an attacker can still spray one attempt each across many addresses |
| No sessions or tokens | **Open** — sign-in returns an outcome, not a JWT or cookie |
| MFA not enforced server-side | **Open** — the frontend challenge is not yet verified here |
| Email verification | **Open** — needs a transactional email stream |
| `pg_hba.conf` set to `trust` | **Open** — see below |

### `pg_hba.conf` still trusts every local connection

The server currently accepts any local connection with no password:

```
local   all   all                    trust
host    all   all   127.0.0.1/32     trust
```

Before this holds anything real, edit
`C:\Program Files\PostgreSQL\18\data\pg_hba.conf` as Administrator, change those
`trust` entries to `scram-sha-256`, set a password for `postgres`, then reload:

```sql
ALTER ROLE postgres PASSWORD 'a-strong-password';
SELECT pg_reload_conf();
```

`zoikomail_app` already has a password, so this backend keeps working unchanged.

### ZoikoID

Security §4: *"Zoiko Mail must not implement a separate unmanaged identity
system unless formally approved as a temporary migration control."* This service
is that separate system. Building it is fine; the approval needs recording, and
Gate 2 asks for ZoikoID integration as evidence.
