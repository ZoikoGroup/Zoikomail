import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { clientIp, HttpError } from '../http.js';
import { hashPassword, passwordMeetsPolicy, verifyPassword } from '../password.js';

export const authRouter = Router();

/* ─────────────────────────── audit ─────────────────────────── */

type AuditEvent = 'login' | 'failed_login' | 'register';

/**
 * Audit §6.1. Append-only by §6.3, so this only ever inserts.
 *
 * A failure to write the audit row must not fail the request the user is
 * making, but it must be loud in the log — a silently missing audit trail is
 * worse than a noisy one.
 */
async function audit(
  req: Request,
  event: AuditEvent,
  fields: { userId?: string | null; email?: string | null; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    await query(
      `INSERT INTO auth_event (event, user_id, email, request_id, source_ip, user_agent, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event,
        fields.userId ?? null,
        fields.email ?? null,
        req.requestId,
        clientIp(req),
        req.header('User-Agent') ?? null,
        JSON.stringify(fields.detail ?? {}),
      ],
    );
  } catch (error) {
    console.error(`[${req.requestId}] audit write failed:`, error);
  }
}

/* ─────────────────────────── register ─────────────────────────── */

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  password_hash: string;
  status: 'active' | 'invited' | 'suspended' | 'deleted';
  failed_attempts: number;
  locked_until: Date | null;
}

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', 'Check the details you entered and try again.');
  }

  const { firstName, lastName, email, password } = parsed.data;

  // Re-checked here because client-side validation is a convenience, not a
  // control. A direct POST bypasses the checklist entirely.
  if (!passwordMeetsPolicy(password)) {
    throw new HttpError(400, 'weak_password', 'That password does not meet the requirements.');
  }

  const passwordHash = await hashPassword(password);

  // ON CONFLICT rather than SELECT-then-INSERT: two simultaneous submissions of
  // the same address would both pass a prior existence check and one would then
  // fail on the unique index. Letting Postgres arbitrate removes the race.
  const { rows } = await query<{ id: string }>(
    `INSERT INTO app_user (email, first_name, last_name, password_hash, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, firstName, lastName, passwordHash],
  );

  const created = rows.length > 0;

  if (created) {
    await audit(req, 'register', { userId: rows[0]!.id, email });
  }

  // `taken` is disclosed here but never on sign-in. On this form the person is
  // asserting the address is theirs, and withholding it leaves them stuck with
  // no way forward. On sign-in the same disclosure would be an enumeration
  // oracle, which is why that path has a single generic failure.
  res.status(created ? 201 : 200).json({ created, taken: !created });
});

/* ─────────────────────────── sign-in ─────────────────────────── */

const signInSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

/** Failures for an address that has no account, so lockout still applies. */
async function recentFailuresFor(email: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM auth_event
     WHERE event = 'failed_login'
       AND email = $1
       AND occurred_at > now() - ($2 || ' seconds')::interval`,
    [email, String(config.lockSeconds)],
  );
  return Number(rows[0]?.n ?? 0);
}

authRouter.post('/sign-in', async (req, res) => {
  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', 'Enter your email and password.');
  }

  const { email, password } = parsed.data;

  const { rows } = await query<UserRow>(
    `SELECT id, email, first_name, password_hash, status, failed_attempts, locked_until
     FROM app_user WHERE email = $1`,
    [email],
  );
  const user = rows[0];

  /*
   * No account. The response is the same generic failure a wrong password
   * gets, and the attempt is still audited so repeated probing of one address
   * locks out exactly as it would for a real account. Without that, the
   * presence or absence of a lockout would itself reveal whether the address
   * exists.
   */
  if (!user) {
    await audit(req, 'failed_login', { email, detail: { reason: 'no_account' } });
    const failures = await recentFailuresFor(email);
    res.json({ outcome: failures >= config.maxFailedAttempts ? 'locked' : 'failed' });
    return;
  }

  /*
   * Security §7.2 evaluates account status at steps 3–4, ahead of the
   * credential check at step 5. Verifying a password for an account that
   * cannot sign in either way would confirm the password was correct.
   */
  if (user.status === 'suspended') {
    await audit(req, 'failed_login', { userId: user.id, email, detail: { reason: 'suspended' } });
    res.json({ outcome: 'accountSuspended' });
    return;
  }

  if (user.status === 'invited') {
    res.json({ outcome: 'invitationPending' });
    return;
  }

  // A deleted account is indistinguishable from one that never existed.
  if (user.status === 'deleted') {
    await audit(req, 'failed_login', { userId: user.id, email, detail: { reason: 'deleted' } });
    res.json({ outcome: 'failed' });
    return;
  }

  if (user.locked_until && user.locked_until > new Date()) {
    await audit(req, 'failed_login', { userId: user.id, email, detail: { reason: 'locked' } });
    res.json({
      outcome: 'locked',
      lockedForSeconds: Math.ceil((user.locked_until.getTime() - Date.now()) / 1000),
    });
    return;
  }

  const ok = await verifyPassword(user.password_hash, password);

  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const locking = attempts >= config.maxFailedAttempts;

    await query(
      `UPDATE app_user
       SET failed_attempts = $2,
           locked_until = CASE WHEN $3 THEN now() + ($4 || ' seconds')::interval ELSE locked_until END
       WHERE id = $1`,
      [user.id, attempts, locking, String(config.lockSeconds)],
    );

    await audit(req, 'failed_login', {
      userId: user.id,
      email,
      detail: { reason: 'bad_password', attempts, locked: locking },
    });

    res.json(
      locking
        ? { outcome: 'locked', lockedForSeconds: config.lockSeconds }
        : { outcome: 'failed', attemptsRemaining: config.maxFailedAttempts - attempts },
    );
    return;
  }

  // Correct. The counter resets — five failures then a success then four more
  // must not lock the account.
  await query(
    `UPDATE app_user
     SET failed_attempts = 0, locked_until = NULL, last_login_at = now()
     WHERE id = $1`,
    [user.id],
  );

  await audit(req, 'login', { userId: user.id, email });

  res.json({ outcome: 'dashboard', firstName: user.first_name, workspaceIds: ['ten_acme'] });
});
