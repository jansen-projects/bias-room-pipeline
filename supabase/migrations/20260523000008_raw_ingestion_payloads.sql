-- ============================================================
-- Phase 1 — Extend raw_ingestion_payloads
-- Table was created via the Supabase dashboard as a regular
-- (non-partitioned) table with 7 columns. This migration adds
-- the 4 missing columns + indexes + RLS.
--
-- NOTE ON PARTITIONING (deferred to Phase 7 / cleanup):
--   The HTML guide calls for monthly partitioning via pg_partman.
--   This is deferred because forex_rates.source_payload_id has a
--   hard FK → raw_ingestion_payloads(id). PostgreSQL requires unique
--   constraints on partitioned tables to include the full partition key
--   (id, ingested_at), which is incompatible with a FK on id alone.
--   To convert when ready:
--     1. DROP CONSTRAINT source_payload_id_fkey on forex_rates
--     2. RENAME raw_ingestion_payloads → raw_ingestion_payloads_old
--     3. CREATE TABLE raw_ingestion_payloads PARTITION BY RANGE (ingested_at)
--     4. INSERT INTO new table SELECT * FROM old table
--     5. DROP TABLE raw_ingestion_payloads_old
--     6. Change source_payload_id to soft FK (no constraint)
-- ============================================================

ALTER TABLE raw_ingestion_payloads
  ADD COLUMN IF NOT EXISTS payload_size_bytes  int,
  ADD COLUMN IF NOT EXISTS currency_codes      text[],
  ADD COLUMN IF NOT EXISTS is_processed        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processed_at        timestamptz;

COMMENT ON TABLE raw_ingestion_payloads IS
  'Bronze layer: raw API response payloads before any parsing or transformation. '
  'Retain 18 months. Dedup enforced by payload_sha256 — n8n skips INSERT when '
  'SHA matches an existing row for the same source_code + endpoint.';

COMMENT ON COLUMN raw_ingestion_payloads.payload_sha256 IS
  'SHA-256 of the serialised payload body. Used for dedup: same hash = skip.';
COMMENT ON COLUMN raw_ingestion_payloads.is_processed IS
  'Set to true once a downstream workflow has parsed this payload into silver tables.';
COMMENT ON COLUMN raw_ingestion_payloads.currency_codes IS
  'Array of currency codes contained in this payload (for fast filtered queries).';
COMMENT ON COLUMN raw_ingestion_payloads.ingestion_run_id IS
  'Soft FK to ops_ingestion_runs.id.';

-- Indexes
CREATE INDEX IF NOT EXISTS raw_ingestion_payloads_sha256_idx
  ON raw_ingestion_payloads (payload_sha256, ingested_at DESC);

CREATE INDEX IF NOT EXISTS raw_ingestion_payloads_run_idx
  ON raw_ingestion_payloads (ingestion_run_id)
  WHERE ingestion_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS raw_ingestion_payloads_unprocessed_idx
  ON raw_ingestion_payloads (ingested_at DESC)
  WHERE is_processed = false;

CREATE INDEX IF NOT EXISTS raw_ingestion_payloads_source_idx
  ON raw_ingestion_payloads (source_code, ingested_at DESC);

-- RLS (anon has no SELECT — raw payloads may contain API keys/sensitive data)
ALTER TABLE raw_ingestion_payloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON raw_ingestion_payloads;
CREATE POLICY "Service role full access"
  ON raw_ingestion_payloads FOR ALL TO service_role USING (true) WITH CHECK (true);
