-- ============================================================================
-- 001 — user profiles, pump branding, and notification plumbing
--
-- Additive only. Every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so
-- this can run against a database that already holds live transactions without
-- touching a single existing row.
-- ============================================================================

-- ---------------------------------------------------------------- users ----
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS designation   VARCHAR(100),
  -- Avatars are stored as a data URL rather than in object storage: they are
  -- resized to 256px in the browser before upload (~25 KB), and this avoids
  -- adding a whole storage service for what amounts to a few small images.
  ADD COLUMN IF NOT EXISTS avatar        TEXT,
  ADD COLUMN IF NOT EXISTS notify_email  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_sms    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notify_events JSONB NOT NULL
      DEFAULT '{"fraud_alert":true,"credit_limit":true,"daily_summary":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Two people must not share an email, but plenty of accounts have none.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users (LOWER(email)) WHERE email IS NOT NULL;

-- ------------------------------------------------------- pump settings ----
-- A single row of branding for the whole installation. The CHECK (id = 1)
-- makes a second row impossible, so there can never be ambiguity about which
-- settings are "the" settings.
CREATE TABLE IF NOT EXISTS pump_settings (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pump_name      VARCHAR(150) NOT NULL DEFAULT 'F.M. Amin & Co.',
  oil_company    VARCHAR(80)  NOT NULL DEFAULT 'Hindustan Petroleum',
  address        TEXT,
  city           VARCHAR(80),
  gstin          VARCHAR(20),
  contact_email  VARCHAR(255),
  contact_phone  VARCHAR(20),
  logo           TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pump_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------- notifications ----
-- Every message is recorded here BEFORE any provider is called, so there is an
-- auditable trail of what the system decided to send even when no email or SMS
-- provider is configured (those rows land as 'skipped').
CREATE TABLE IF NOT EXISTS notifications (
  notification_id SERIAL PRIMARY KEY,
  user_id      INTEGER      REFERENCES users(user_id) ON DELETE CASCADE,
  channel      VARCHAR(10)  NOT NULL CHECK (channel IN ('email', 'sms')),
  event        VARCHAR(40)  NOT NULL,
  recipient    VARCHAR(255),
  subject      TEXT,
  body         TEXT         NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','sent','failed','skipped')),
  error        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);
