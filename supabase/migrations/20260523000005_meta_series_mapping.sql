-- ============================================================
-- Phase 0 — CREATE meta_series_mapping
-- Priority-chain mapping: (currency, indicator_type) → ordered
-- list of (source_code, series_id) to try.
-- Priority 1 = primary, 2 = fallback, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_series_mapping (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code   char(3) NOT NULL REFERENCES meta_currency_dictionary(currency_code),
  indicator_type  text    NOT NULL,
  source_code     text    NOT NULL,
  series_id       text    NOT NULL,
  priority        int     NOT NULL DEFAULT 1 CHECK (priority > 0),
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (currency_code, indicator_type, source_code, priority)
);

COMMENT ON TABLE meta_series_mapping IS
  'Priority chain: for each (currency_code, indicator_type) pair, an ordered list '
  'of (source_code, series_id) to attempt. Priority 1 = primary source, 2 = fallback. '
  'n8n workflows read this table to know which API series to fetch.';

ALTER TABLE meta_series_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read-only" ON meta_series_mapping;
CREATE POLICY "Anon read-only" ON meta_series_mapping FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Service role full access" ON meta_series_mapping;
CREATE POLICY "Service role full access" ON meta_series_mapping FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Seed: 2-Year Nominal Bond Yields ────────────────────────────────────────
-- Primary source: FRED (where available); fallback: TRADINGECONOMICS
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('USD', 'bond_yield_2y',   'FRED',             'DGS2',               1, 'US 2-Year Treasury Constant Maturity Rate'),
  ('USD', 'bond_yield_2y',   'YAHOO',            '^IRX',               2, 'US 13-Week T-Bill (fallback proxy)'),
  ('EUR', 'bond_yield_2y',   'TRADINGECONOMICS', 'GERMANY2YR',         1, 'Germany 2-Year Bund Yield (EUR area proxy)'),
  ('JPY', 'bond_yield_2y',   'TRADINGECONOMICS', 'JAPAN2YR',           1, 'Japan 2-Year JGB Yield'),
  ('GBP', 'bond_yield_2y',   'TRADINGECONOMICS', 'UNITEDKINGDOM2YR',   1, 'UK 2-Year Gilt Yield'),
  ('CHF', 'bond_yield_2y',   'TRADINGECONOMICS', 'SWITZERLAND2YR',     1, 'Switzerland 2-Year Govt Bond Yield'),
  ('CAD', 'bond_yield_2y',   'TRADINGECONOMICS', 'CANADA2YR',          1, 'Canada 2-Year Govt Bond Yield'),
  ('AUD', 'bond_yield_2y',   'TRADINGECONOMICS', 'AUSTRALIA2YR',       1, 'Australia 2-Year Govt Bond Yield'),
  ('NZD', 'bond_yield_2y',   'TRADINGECONOMICS', 'NEWZEALAND2YR',      1, 'New Zealand 2-Year Govt Bond Yield')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;

-- ─── Seed: 10-Year Nominal Bond Yields ───────────────────────────────────────
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('USD', 'bond_yield_10y',  'FRED',             'DGS10',              1, 'US 10-Year Treasury Constant Maturity Rate'),
  ('EUR', 'bond_yield_10y',  'FRED',             'IRLTLT01EZM156N',    1, 'Euro Area 10-Year Govt Bond Yield (ECB)'),
  ('EUR', 'bond_yield_10y',  'TRADINGECONOMICS', 'GERMANY10YR',        2, 'Germany 10-Year Bund Yield (fallback)'),
  ('JPY', 'bond_yield_10y',  'FRED',             'IRLTLT01JPM156N',    1, 'Japan 10-Year JGB Yield (FRED)'),
  ('GBP', 'bond_yield_10y',  'FRED',             'IRLTLT01GBM156N',    1, 'UK 10-Year Gilt Yield (FRED)'),
  ('CHF', 'bond_yield_10y',  'FRED',             'IRLTLT01CHM156N',    1, 'Switzerland 10-Year Govt Bond Yield (FRED)'),
  ('CAD', 'bond_yield_10y',  'FRED',             'IRLTLT01CAM156N',    1, 'Canada 10-Year Govt Bond Yield (FRED)'),
  ('AUD', 'bond_yield_10y',  'FRED',             'IRLTLT01AUM156N',    1, 'Australia 10-Year Govt Bond Yield (FRED)'),
  ('NZD', 'bond_yield_10y',  'FRED',             'IRLTLT01NZM156N',    1, 'New Zealand 10-Year Govt Bond Yield (FRED)')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;

-- ─── Seed: Real Yields (TIPS / Inflation-Linked) ─────────────────────────────
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('USD', 'bond_yield_real', 'FRED',             'DFII10',             1, 'US 10-Year TIPS Yield (inflation-indexed)'),
  ('USD', 'bond_yield_real', 'FRED',             'DFII5',              2, 'US 5-Year TIPS Yield (fallback)'),
  ('EUR', 'bond_yield_real', 'FRED',             'REAINTRATREARAT10Y', 1, 'Euro Area 10-Year Real Interest Rate (ECB)'),
  ('GBP', 'bond_yield_real', 'TRADINGECONOMICS', 'UNITEDKINGDOMGILTSI',1, 'UK 10-Year Index-Linked Gilt Yield')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;

-- ─── Seed: Breakeven Inflation ────────────────────────────────────────────────
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('USD', 'breakeven_10y',   'FRED',             'T10YIE',             1, 'US 10-Year Breakeven Inflation Rate (TIPS spread)'),
  ('USD', 'breakeven_5y',    'FRED',             'T5YIE',              1, 'US 5-Year Breakeven Inflation Rate'),
  ('EUR', 'breakeven_10y',   'TRADINGECONOMICS', 'EURBREAKEVEN10Y',    1, 'EUR 10-Year Inflation Swap Breakeven')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;

-- ─── Seed: COT Net Speculative Positioning (CFTC legacy codes) ───────────────
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('EUR', 'cot_net_position', 'CFTC', '099741', 1, 'EUR/USD Futures — Non-Commercial Net (COT)'),
  ('JPY', 'cot_net_position', 'CFTC', '097741', 1, 'JPY/USD Futures — Non-Commercial Net (COT)'),
  ('GBP', 'cot_net_position', 'CFTC', '096742', 1, 'GBP/USD Futures — Non-Commercial Net (COT)'),
  ('CHF', 'cot_net_position', 'CFTC', '092741', 1, 'CHF/USD Futures — Non-Commercial Net (COT)'),
  ('CAD', 'cot_net_position', 'CFTC', '090741', 1, 'CAD/USD Futures — Non-Commercial Net (COT)'),
  ('AUD', 'cot_net_position', 'CFTC', '232741', 1, 'AUD/USD Futures — Non-Commercial Net (COT)'),
  ('NZD', 'cot_net_position', 'CFTC', '112741', 1, 'NZD/USD Futures — Non-Commercial Net (COT)'),
  ('XAU', 'cot_net_position', 'CFTC', '088691', 1, 'Gold Futures — Non-Commercial Net (COT)')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;

-- ─── Seed: Spot FX Rates (Yahoo Finance) ─────────────────────────────────────
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('EUR', 'spot_rate', 'YAHOO', 'EURUSD=X',  1, 'EUR/USD spot rate'),
  ('JPY', 'spot_rate', 'YAHOO', 'JPY=X',     1, 'USD/JPY spot rate'),
  ('GBP', 'spot_rate', 'YAHOO', 'GBPUSD=X',  1, 'GBP/USD spot rate'),
  ('CHF', 'spot_rate', 'YAHOO', 'CHF=X',     1, 'USD/CHF spot rate'),
  ('CAD', 'spot_rate', 'YAHOO', 'CAD=X',     1, 'USD/CAD spot rate'),
  ('AUD', 'spot_rate', 'YAHOO', 'AUDUSD=X',  1, 'AUD/USD spot rate'),
  ('NZD', 'spot_rate', 'YAHOO', 'NZDUSD=X',  1, 'NZD/USD spot rate'),
  ('XAU', 'spot_rate', 'YAHOO', 'GC=F',      1, 'Gold front-month futures (spot proxy)'),
  ('USD', 'dxy_index', 'YAHOO', 'DX-Y.NYB',  1, 'US Dollar Index (DXY) spot')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;

-- ─── Seed: CPI / Inflation Data ───────────────────────────────────────────────
INSERT INTO meta_series_mapping (currency_code, indicator_type, source_code, series_id, priority, description) VALUES
  ('USD', 'cpi_yoy', 'FRED', 'CPIAUCSL',           1, 'US CPI All Urban Consumers (index — compute YoY)'),
  ('EUR', 'cpi_yoy', 'FRED', 'CP0000EZ19M086NEST', 1, 'Euro Area HICP Index (ECB — compute YoY)'),
  ('JPY', 'cpi_yoy', 'FRED', 'JPNCPIALLMINMEI',    1, 'Japan CPI All Items (OECD via FRED)'),
  ('GBP', 'cpi_yoy', 'FRED', 'GBRCPIALLMINMEI',    1, 'UK CPI All Items (OECD via FRED)'),
  ('CAD', 'cpi_yoy', 'FRED', 'CPALCY01CAM661N',    1, 'Canada CPI YoY (FRED)'),
  ('AUD', 'cpi_yoy', 'FRED', 'CPALCY01AUM661N',    1, 'Australia CPI YoY (FRED)'),
  ('NZD', 'cpi_yoy', 'FRED', 'CPALCY01NZM661N',    1, 'New Zealand CPI YoY (FRED)'),
  ('CHF', 'cpi_yoy', 'FRED', 'CPALCY01CHM661N',    1, 'Switzerland CPI YoY (FRED)')

ON CONFLICT (currency_code, indicator_type, source_code, priority) DO NOTHING;
