-- 002_user_session.sql — one row per successful sign-in.
--
-- Distinct from auth_event, which is the append-only audit log required by
-- Audit §6.1 and answers "what happened". This table answers "who is signed in
-- right now", which is a different question with a different lifetime: audit
-- rows are kept for the retention period and never change, sessions are
-- mutable (last_seen_at) and revocable.
--
-- Security §4.2 requires every session to resolve exactly one tenant, and §6
-- makes a workspace switch a security event. Both need somewhere to record the
-- session's current tenant, which is what this table provides.

CREATE TABLE IF NOT EXISTS user_session (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id       UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  -- Denormalised deliberately. A revoked or deleted user still leaves a
  -- readable sign-in history, and the common query — "show this session" —
  -- avoids a join.
  email         CITEXT      NOT NULL,

  -- Security §4.2 — exactly one tenant per session.
  tenant_id     TEXT        NOT NULL DEFAULT 'ten_acme',

  signed_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '8 hours',

  -- Set when the session ends, rather than deleting the row: sign-in history
  -- is evidence, and Audit §6.3 reasoning applies here too.
  revoked_at    TIMESTAMPTZ,

  source_ip     INET,
  user_agent    TEXT,
  request_id    TEXT
);

CREATE INDEX IF NOT EXISTS user_session_user_idx  ON user_session (user_id, signed_in_at DESC);
CREATE INDEX IF NOT EXISTS user_session_email_idx ON user_session (email, signed_in_at DESC);

-- Partial index: the hot query is "sessions still valid", and indexing the
-- revoked ones would be dead weight.
CREATE INDEX IF NOT EXISTS user_session_active_idx
  ON user_session (expires_at)
  WHERE revoked_at IS NULL;
