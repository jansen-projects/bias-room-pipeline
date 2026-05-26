-- ============================================================
-- Phase 4 — Gold Layer: 11 v_latest_* views + v_active_geo_flags
-- All views use DISTINCT ON for latest-per-key pattern.
-- daily_close_snapshots and weekly_anchor_snapshots already exist.
-- ============================================================

-- 1. v_latest_central_bank_rates
--    Latest canonical rate per currency
CREATE OR REPLACE VIEW v_latest_central_bank_rates AS
SELECT DISTINCT ON (currency)
  currency,
  rate,
  prev_rate,
  rate_change,
  effective_date,
  release_date,
  rate_type,
  source,
  updated_at,
  is_canonical
FROM central_bank_rates
ORDER BY currency, is_canonical DESC NULLS LAST, effective_date DESC;

COMMENT ON VIEW v_latest_central_bank_rates IS
  'Gold layer: one row per currency — the latest canonical central bank rate.';

-- 2. v_latest_central_bank_tone
--    Latest verified tone per currency
CREATE OR REPLACE VIEW v_latest_central_bank_tone AS
SELECT DISTINCT ON (currency_code)
  currency_code,
  central_bank_code,
  tone_score,
  tone_label,
  trigger_event,
  effective_date,
  verified_at,
  verified_by
FROM central_bank_tone
WHERE verified_at IS NOT NULL
ORDER BY currency_code, effective_date DESC;

COMMENT ON VIEW v_latest_central_bank_tone IS
  'Gold layer: one row per currency — the latest verified CB tone signal.';

-- 3. v_latest_bond_yields_2y
--    Latest 2-year nominal yield per currency
--    Joins meta_series_mapping to filter to 2Y tenor rows only.
CREATE OR REPLACE VIEW v_latest_bond_yields_2y AS
SELECT DISTINCT ON (b.currency)
  b.currency,
  b.yield,
  b.prev_yield,
  b.yield_change,
  b.effective_date,
  b.series_id,
  b.yield_type,
  b.source
FROM bond_yields_nominal b
JOIN meta_series_mapping sm
  ON sm.series_id = b.series_id
 AND sm.series_type  = 'bond_yield'
 AND sm.tenor_label  = '2Y'
ORDER BY b.currency, b.effective_date DESC;

COMMENT ON VIEW v_latest_bond_yields_2y IS
  'Gold layer: one row per currency — the latest 2-year nominal bond yield.';

-- 4. v_latest_real_yields
--    Latest TIPS/inflation-linked yield per currency
CREATE OR REPLACE VIEW v_latest_real_yields AS
SELECT DISTINCT ON (currency_code)
  currency_code,
  yield_2y_real,
  yield_10y_real,
  effective_date,
  source,
  is_stale,
  is_stale_60d,
  is_stale_120d,
  updated_at
FROM bond_yields_real
ORDER BY currency_code, effective_date DESC;

COMMENT ON VIEW v_latest_real_yields IS
  'Gold layer: one row per currency — the latest real (inflation-linked) yields.';

-- 5. v_latest_breakeven
--    Latest breakeven inflation per currency
CREATE OR REPLACE VIEW v_latest_breakeven AS
SELECT DISTINCT ON (currency_code)
  currency_code,
  breakeven_2y,
  breakeven_10y,
  effective_date,
  source,
  fred_series,
  updated_at
FROM breakeven_inflation
ORDER BY currency_code, effective_date DESC;

COMMENT ON VIEW v_latest_breakeven IS
  'Gold layer: one row per currency — the latest breakeven inflation figures.';

-- 6. v_latest_market_indices
--    Latest price per market symbol
CREATE OR REPLACE VIEW v_latest_market_indices AS
SELECT DISTINCT ON (symbol)
  symbol,
  asset,
  price,
  open,
  high,
  low,
  change_pct,
  prev_close,
  effective_date,
  source,
  asset_class
FROM market_indices
ORDER BY symbol, effective_date DESC;

COMMENT ON VIEW v_latest_market_indices IS
  'Gold layer: one row per index symbol — the latest close price.';

-- 7. v_latest_cot
--    Latest COT positioning per currency
CREATE OR REPLACE VIEW v_latest_cot AS
SELECT DISTINCT ON (currency)
  currency,
  long_positions,
  short_positions,
  net_position,
  prev_net,
  net_change,
  report_date,
  effective_date,
  cftc_release_date,
  cftc_lag_days,
  source
FROM cot_positioning
ORDER BY currency, report_date DESC;

COMMENT ON VIEW v_latest_cot IS
  'Gold layer: one row per currency — the latest CFTC COT positioning report.';

-- 8. v_latest_gold_etf_flow_5d
--    Latest 5-day flow snapshot per ETF ticker
--    flow_5d_usd is pre-computed by wf_gold_etf_flows_daily
CREATE OR REPLACE VIEW v_latest_gold_etf_flow_5d AS
SELECT DISTINCT ON (etf_ticker)
  etf_ticker,
  effective_date,
  shares_outstanding,
  nav_per_share,
  total_aum_usd,
  daily_flow_usd,
  flow_5d_usd,
  flow_20d_usd,
  source,
  updated_at
FROM gold_etf_flows
ORDER BY etf_ticker, effective_date DESC;

COMMENT ON VIEW v_latest_gold_etf_flow_5d IS
  'Gold layer: one row per ETF — the latest ETF flow data including 5-day rolling sum.';

-- 9. v_latest_intermarket_signals
--    Latest signal value per currency × signal_name
CREATE OR REPLACE VIEW v_latest_intermarket_signals AS
SELECT DISTINCT ON (currency_code, signal_name)
  currency_code,
  signal_name,
  signal_value,
  signal_direction,
  confidence,
  source_tables,
  effective_date,
  updated_at
FROM intermarket_signals
ORDER BY currency_code, signal_name, effective_date DESC;

COMMENT ON VIEW v_latest_intermarket_signals IS
  'Gold layer: one row per (currency, signal) — the latest intermarket signal reading.';

-- 10. v_latest_risk_reversal
--     Latest 25-delta risk reversal per pair × tenor
CREATE OR REPLACE VIEW v_latest_risk_reversal AS
SELECT DISTINCT ON (pair, tenor)
  pair,
  tenor,
  rr_25d,
  iv_25d_call,
  iv_25d_put,
  atm_iv,
  effective_date,
  source,
  updated_at
FROM risk_reversal_25d
ORDER BY pair, tenor, effective_date DESC;

COMMENT ON VIEW v_latest_risk_reversal IS
  'Gold layer: one row per (pair, tenor) — the latest 25-delta FX vol skew.';

-- 11. v_active_geo_flags
--     All geo_risk_events currently in active/monitoring status
CREATE OR REPLACE VIEW v_active_geo_flags AS
SELECT
  event_code,
  event_title,
  severity,
  affected_currencies,
  bullish_channel,
  bearish_channel,
  trigger_threshold_numeric,
  status,
  promoted_at,
  promoted_by,
  operator_notes
FROM geo_risk_events
WHERE status IN ('active', 'monitoring')
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high'     THEN 2
    WHEN 'medium'   THEN 3
    WHEN 'low'      THEN 4
    ELSE 5
  END,
  promoted_at DESC NULLS LAST;

COMMENT ON VIEW v_active_geo_flags IS
  'Gold layer: all active/monitoring geo-risk events ordered by severity.';
