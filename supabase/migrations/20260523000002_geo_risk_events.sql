-- ============================================================
-- RETROACTIVE MIGRATION — geo_risk_events
-- This table was created via the Supabase dashboard and is
-- already in production. This migration captures the schema
-- in version control for reproducibility.
-- Uses CREATE TABLE IF NOT EXISTS — safe to apply on fresh project.
-- ============================================================

CREATE TABLE IF NOT EXISTS geo_risk_events (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Operator-assigned short code, e.g. "HORMUZ_BLOCKADE_2026"
  event_code                  text          NOT NULL UNIQUE,
  event_title                 text          NOT NULL,
  event_description           text,
  -- Array of affected currency codes, e.g. ARRAY['USD','JPY']
  affected_currencies         text[]        NOT NULL DEFAULT '{}',
  -- Plain-text description of conditions that push a currency bullish
  bullish_channel             text,
  -- Plain-text description of conditions that push a currency bearish
  bearish_channel             text,
  -- Machine-readable thresholds for automated channel evaluation
  -- e.g. {"wti_above": 90, "vix_above": 25}
  trigger_threshold_numeric   jsonb,
  status                      text          NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','active','resolved','archived')),
  severity                    text          NOT NULL DEFAULT 'medium'
                                CHECK (severity IN ('low','medium','high','critical')),
  -- Operator-only promotion: n8n populates draft queue,
  -- operator must explicitly promote to active (never auto-promoted)
  promoted_at                 timestamptz,
  promoted_by                 text,
  resolved_at                 timestamptz,
  operator_notes              text,
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE geo_risk_events IS
  'Registry of active geopolitical risk events. n8n (wf_geo_scan_hourly) '
  'populates the draft queue; operators promote to active via the Control Room.';

COMMENT ON COLUMN geo_risk_events.status IS
  'draft → active (operator-promoted) → resolved | archived';

-- Row Level Security
ALTER TABLE geo_risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anon read-only"
  ON geo_risk_events FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access"
  ON geo_risk_events FOR ALL TO service_role USING (true) WITH CHECK (true);
