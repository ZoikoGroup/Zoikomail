
-- 001_identity.sql — identity tables for Zoiko Mail.
--
-- Modelled on Data Model §6.2 AppUser, with one deliberate deviation: §6.2
-- defines no password_hash column, because Security §4 expects ZoikoID to hold
-- credentials. Storing a hash here puts the project on the self-hosted
-- credential path, which Security §4 permits only as a "formally approved
-- temporary migration control". That approval still needs recording.
--
-- What is never stored: the password itself. Only an Argon2id digest, which can
-- verify a password but cannot be reversed into one.

-- Required by this migration: citext for the email column, pgcrypto for
-- gen_random_uuid(). Created here rather than assumed, so a brand new database
-- migrates cleanly — both are trusted extensions from PostgreSQL 13, so the
-- database owner can create them without superuser.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Data Model §6.2 — the four documented account states.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_user_status') THEN
    CREATE TYPE app_user_status AS ENUM ('active', 'invited', 'suspended', 'deleted');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS app_user (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CITEXT so Alex@acme.com and alex@acme.com are one account. A TEXT column
  -- with a lower(email) index would also work, but then every query has to
  -- remember to lower-case, and the one that forgets creates a duplicate.
  email           CITEXT      NOT NULL UNIQUE,

  first_name      TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,

  -- Argon2id digest, self-describing: $argon2id$v=19$m=,t=,p=$salt$hash.
  -- Parameters live inside the string, so they can be raised later and old
  -- hashes still verify.
  password_hash   TEXT        NOT NULL,

  status          app_user_status NOT NULL DEFAULT 'active',

  -- Runbook §6.4 — five consecutive failures lock the account.
  failed_attempts INTEGER     NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,

  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_user_email_shape   CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  CONSTRAINT app_user_first_name_ne CHECK (btrim(first_name) <> ''),
  CONSTRAINT app_user_last_name_ne  CHECK (btrim(last_name) <> ''),
  CONSTRAINT app_user_attempts_pos  CHECK (failed_attempts >= 0)
);

-- Audit §6.1 defines the identity events; §6.3 makes the rows append-only, so
-- the application only ever inserts here.
CREATE TABLE IF NOT EXISTS auth_event (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event       TEXT        NOT NULL,

  user_id     UUID        REFERENCES app_user(id) ON DELETE SET NULL,

  -- Recorded even when no account matches, so failed attempts against unknown
  -- addresses stay auditable. Not a foreign key, for exactly that reason.
  email       CITEXT,

  request_id  TEXT,
  source_ip   INET,
  user_agent  TEXT,
  detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT auth_event_known CHECK (
    event IN ('login', 'failed_login', 'register', 'mfa_enabled',
              'mfa_disabled', 'session_revoked', 'role_changed')
  )
);

CREATE INDEX IF NOT EXISTS auth_event_email_time_idx ON auth_event (email, occurred_at DESC);
CREATE INDEX IF NOT EXISTS auth_event_user_time_idx  ON auth_event (user_id, occurred_at DESC);

-- Keeps updated_at honest without the application having to remember.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_user_set_updated_at ON app_user;
CREATE TRIGGER app_user_set_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
