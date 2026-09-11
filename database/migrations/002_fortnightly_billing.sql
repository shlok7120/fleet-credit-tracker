-- ============================================================================
-- 002 — fortnightly billing cycles
--
-- The pump bills 1st–15th and 16th–end of month. Invoices are emailed to the
-- client at the close of each cycle.
--
-- Additive only; safe against a database holding live transactions.
-- ============================================================================

-- Where a client's invoice should be sent. Falls back to the fleet manager's
-- own email when blank, so an existing client needs no change to start
-- receiving invoices.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);

-- ---------------------------------------------------------------------------
-- One row per invoice actually sent.
--
-- The UNIQUE (client_id, period) constraint is the whole point: the dispatch
-- job runs on a schedule and may be retried, but a client must never receive
-- the same fortnight's invoice twice. The database refuses the duplicate
-- rather than relying on the job to remember.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_dispatches (
  dispatch_id   SERIAL PRIMARY KEY,
  client_id     INTEGER      NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  period        VARCHAR(12)  NOT NULL,          -- e.g. 2026-09-H2
  recipient     VARCHAR(255),
  line_count    INTEGER      NOT NULL DEFAULT 0,
  total_liters  NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        VARCHAR(20)  NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued','sent','failed','skipped')),
  error         TEXT,
  sent_by       INTEGER      REFERENCES users(user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT invoice_dispatches_once UNIQUE (client_id, period)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_period ON invoice_dispatches (period, created_at DESC);
