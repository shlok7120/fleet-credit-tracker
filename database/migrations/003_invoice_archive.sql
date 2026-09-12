-- ============================================================================
-- 003 — permanent invoice records
--
-- Until now an invoice was recomputed from the transactions table every time it
-- was viewed. That is fine for a preview, and wrong for a document already sent
-- to a client: deactivate a vehicle, correct a transaction, or remove a client,
-- and last fortnight's invoice silently changes to something the client never
-- received. An issued invoice is an accounting record and must be immutable.
--
-- Each issued invoice now carries a full snapshot of itself — line items,
-- totals, the client's credit position and the pump's own details as they
-- stood at the moment of issue.
-- ============================================================================

ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS invoice_no  VARCHAR(32),
  ADD COLUMN IF NOT EXISTS snapshot    JSONB,
  ADD COLUMN IF NOT EXISTS issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- GST requires a unique consecutive serial number per invoice.
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_no
  ON invoice_dispatches (invoice_no) WHERE invoice_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_client_period
  ON invoice_dispatches (client_id, period);

-- Rows written before this migration have totals but no line detail. Give them
-- a number so the sequence stays consecutive, and mark the snapshot as absent
-- rather than inventing one — an invoice archive that fabricates history is
-- worse than one that admits a gap.
UPDATE invoice_dispatches
   SET invoice_no = 'INV-' || LPAD(NEXTVAL('invoice_no_seq')::text, 6, '0'),
       snapshot   = jsonb_build_object('legacy', true,
                                       'note', 'Issued before line detail was archived.')
 WHERE invoice_no IS NULL;
