-- ============================================================
-- Phase 0 — CREATE meta_table_freshness_sla
-- One row per tracked silver table. wf_stale_data_monitor
-- reads this to determine when to fire ops_stale_data_alerts.
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_table_freshness_sla (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name           text    NOT NULL UNIQUE,
  expected_frequency   text    NOT NULL
    CHECK (expected_frequency IN ('hourly','daily','weekly','biweekly','monthly')),
  warning_after_min    int     NOT NULL,
  critical_after_min   int     NOT NULL,
  -- Soft FK: references workflow_id in meta_workflow_registry
  -- (not a hard FK to avoid cascading issues during teardown)
  workflow_id          text,
  operator_notes       text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sla_thresholds_ordered
    CHECK (critical_after_min > warning_after_min),
  CONSTRAINT sla_warning_positive
    CHECK (warning_after_min > 0)
);

COMMENT ON TABLE meta_table_freshness_sla IS
  'SLA configuration per silver table. warning_after_min / critical_after_min are '
  'minutes elapsed since the last ops_ingestion_runs.completed_at for that table '
  'before wf_stale_data_monitor fires an alert.';

COMMENT ON COLUMN meta_table_freshness_sla.workflow_id IS
  'Soft reference to meta_workflow_registry.workflow_id. Not a hard FK.';

ALTER TABLE meta_table_freshness_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read-only" ON meta_table_freshness_sla;
CREATE POLICY "Anon read-only" ON meta_table_freshness_sla FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Service role full access" ON meta_table_freshness_sla;
CREATE POLICY "Service role full access" ON meta_table_freshness_sla FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Seed: one row per tracked silver table ───────────────────────────────────
-- Thresholds rationale:
--   daily tables:   warn after 1 day (1440 min), critical after 2 days (2880 min)
--   CB rates:       wider window (4320 = 3 days) — rate changes are infrequent
--   weekly tables:  warn after 1 week (10080), critical after 2 weeks (20160)
--   hourly tables:  warn after 1 hr (60 min), critical after 3 hrs (180 min)

INSERT INTO meta_table_freshness_sla
  (table_name, expected_frequency, warning_after_min, critical_after_min, workflow_id)
VALUES
  -- Tier 1 — daily ingestion
  ('forex_rates',             'daily',     1440,  2880,  'wf_forex_daily_fetch'),
  ('central_bank_rates',      'daily',     1440,  4320,  'wf_cb_rates_daily'),
  ('bond_yields',             'daily',     1440,  2880,  'wf_bond_yields_nominal_daily'),
  ('bond_yields_real',        'daily',     1440,  2880,  'wf_real_yields_daily'),
  ('breakeven_inflation',     'daily',     1440,  2880,  'wf_breakeven_daily'),
  ('economic_calendar',       'daily',     1440,  2880,  'wf_economic_calendar_daily'),
  ('market_sentiment',        'daily',     1440,  2880,  'wf_market_indices_daily'),
  ('gold_context',            'daily',     1440,  2880,  'wf_gold_context_daily'),
  ('gold_etf_flows',          'daily',     1440,  2880,  'wf_gold_etf_flows_daily'),
  ('commodity_prices',        'daily',     1440,  2880,  'wf_commodities_daily'),
  ('risk_reversal_25d',       'daily',     1440,  2880,  'wf_risk_reversal_daily'),
  ('intermarket_signals',     'daily',     1440,  2880,  'wf_market_indices_daily'),
  ('daily_atr14',             'daily',     1440,  2880,  'wf_compute_atr14_daily'),
  ('daily_close_snapshots',   'daily',     1440,  2880,  'wf_daily_close_snapshot'),

  -- Tier 1 — weekly ingestion
  ('cot_positioning',         'weekly',    10080, 20160, 'wf_cot_weekly'),
  ('central_bank_tone',       'weekly',    10080, 20160, 'wf_cb_tone_review'),
  ('central_bank_events',     'weekly',    10080, 20160, 'wf_cb_events_calendar'),
  ('consensus_surveys',       'weekly',    10080, 20160, 'wf_consensus_survey_weekly'),
  ('inflation_forecasts',     'weekly',    10080, 20160, 'wf_inflation_forecasts_weekly'),
  ('fx_friday_closes',        'weekly',    10080, 20160, 'wf_fx_friday_close_snapshot'),

  -- Tier 1 — hourly
  ('geo_risk_events',         'hourly',    60,    180,   'wf_geo_scan_hourly'),
  ('geo_risk_status_log',     'daily',     1440,  2880,  'wf_geo_status_daily')

ON CONFLICT (table_name) DO NOTHING;
