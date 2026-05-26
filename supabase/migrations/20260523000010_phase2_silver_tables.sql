-- ============================================================
-- Phase 2 — Extend existing silver tables (6 migrations)
-- forex_rates: already complete (is_friday_ny_close, source_payload_id,
--              UNIQUE all confirmed in DB pre-phase-2)
-- ============================================================

-- 1. central_bank_rates: add is_canonical + source_payload_id
ALTER TABLE central_bank_rates
  ADD COLUMN IF NOT EXISTS is_canonical      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_payload_id bigint;

COMMENT ON COLUMN central_bank_rates.is_canonical IS
  'True for the single authoritative row when multiple sources conflict.';
COMMENT ON COLUMN central_bank_rates.source_payload_id IS
  'Soft FK to raw_ingestion_payloads.id.';

-- 2. cot_positioning: add cftc_release_date + cftc_lag_days generated
ALTER TABLE cot_positioning
  ADD COLUMN IF NOT EXISTS cftc_release_date date,
  ADD COLUMN IF NOT EXISTS cftc_lag_days     int GENERATED ALWAYS AS (
    CASE WHEN cftc_release_date IS NOT NULL
    THEN (cftc_release_date - report_date)
    ELSE NULL END
  ) STORED;

COMMENT ON COLUMN cot_positioning.cftc_release_date IS
  'The Friday the CFTC published this report (typically report_date + 3 days).';
COMMENT ON COLUMN cot_positioning.cftc_lag_days IS
  'Generated: days between report_date (Tuesday) and cftc_release_date (Friday). Typically 3.';

-- 3. economic_calendar: add actual_filled_at, actual_numeric, actual_source_code
ALTER TABLE economic_calendar
  ADD COLUMN IF NOT EXISTS actual_filled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS actual_numeric      numeric,
  ADD COLUMN IF NOT EXISTS actual_source_code  text;

COMMENT ON COLUMN economic_calendar.actual_filled_at IS
  'When the actual value was first populated. NULL = not yet released.';
COMMENT ON COLUMN economic_calendar.actual_numeric IS
  'Machine-readable actual (parsed from varchar actual column).';
COMMENT ON COLUMN economic_calendar.actual_source_code IS
  'Source that provided the actual. Soft FK to meta_source_registry.source_code.';

-- 4. gold_context: add CHECK constraint on indicator vocabulary
ALTER TABLE gold_context
  ADD CONSTRAINT gold_context_indicator_vocab CHECK (
    indicator IN (
      'US 10Y Nominal Yield',
      'US 10Y Real Yield',
      'Breakeven Inflation',
      'DXY Index',
      'VIX',
      'SPX 500',
      'Gold Spot',
      'Gold/Oil Ratio',
      'Fed Funds Rate'
    )
  );

-- 5. RENAME market_sentiment → market_indices
ALTER TABLE market_sentiment RENAME TO market_indices;
UPDATE meta_table_freshness_sla SET table_name = 'market_indices' WHERE table_name = 'market_sentiment';

COMMENT ON TABLE market_indices IS
  'Daily market index data. Renamed from market_sentiment in Phase 2.';

-- 6. RENAME bond_yields → bond_yields_nominal
ALTER TABLE bond_yields RENAME TO bond_yields_nominal;
UPDATE meta_table_freshness_sla SET table_name = 'bond_yields_nominal' WHERE table_name = 'bond_yields';

COMMENT ON TABLE bond_yields_nominal IS
  'Nominal government bond yields. Renamed from bond_yields in Phase 2. '
  'Companion: bond_yields_real for TIPS/inflation-linked yields.';
