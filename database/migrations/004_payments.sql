-- ============================================================================
-- 004 — payments received
--
-- Until now, recording a payment did exactly one thing:
--
--     UPDATE clients SET current_balance = current_balance - $amount
--
-- The money disappeared into a subtraction. There was no way to answer when a
-- client last paid, how much, by what method, or who entered it — and a
-- mis-keyed amount could not be traced, let alone reversed. For a system whose
-- whole job is tracking credit, a payment is the single most important event
-- there is, and it left no record at all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  payment_id   SERIAL PRIMARY KEY,
  client_id    INTEGER       NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),

  -- How the money arrived. Indian fleets settle by cheque and NEFT far more
  -- often than cash, and the reference is what reconciles against a bank
  -- statement later.
  method       VARCHAR(12)   NOT NULL DEFAULT 'cash'
                             CHECK (method IN ('cash','cheque','neft','rtgs','upi','other')),
  reference    VARCHAR(64),                 -- cheque number, UTR, UPI txn id

  -- When the money actually arrived, which is often not when it was entered:
  -- a cheque dated Monday may be keyed in on Thursday. Statements must use
  -- the former.
  received_on  DATE          NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,

  recorded_by  INTEGER       REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A wrong payment is reversed, never deleted. Both the original and the
  -- reversal stay visible, because "this entry was a mistake" is itself part
  -- of the financial record.
  reversed_at     TIMESTAMPTZ,
  reversed_by     INTEGER    REFERENCES users(user_id) ON DELETE SET NULL,
  reversal_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_client   ON payments (client_id, received_on DESC);
CREATE INDEX IF NOT EXISTS idx_payments_received ON payments (received_on DESC);
CREATE INDEX IF NOT EXISTS idx_payments_active   ON payments (client_id) WHERE reversed_at IS NULL;
