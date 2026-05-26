-- ============================================================
-- Phase 0 — CREATE meta_source_registry
-- Registry of all external data sources used in the pipeline.
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_source_registry (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code         text    NOT NULL UNIQUE,
  source_name         text    NOT NULL,
  base_url            text,
  api_key_env_var     text,
  rate_limit_rpm      int,
  is_free             boolean NOT NULL DEFAULT true,
  requires_auth       boolean NOT NULL DEFAULT false,
  data_format         text    CHECK (data_format IN ('json','csv','xml','html','parquet')),
  documentation_url   text,
  operator_notes      text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE meta_source_registry IS
  'Registry of all external API / data sources. api_key_env_var names the Supabase '
  'Vault secret or n8n credential key holding the API token.';

COMMENT ON COLUMN meta_source_registry.api_key_env_var IS
  'Name of the Supabase Vault secret or n8n credential. NULL = no key required.';
COMMENT ON COLUMN meta_source_registry.rate_limit_rpm IS
  'Approximate requests-per-minute limit. NULL = unknown/unlimited.';

ALTER TABLE meta_source_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read-only" ON meta_source_registry;
CREATE POLICY "Anon read-only" ON meta_source_registry FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Service role full access" ON meta_source_registry;
CREATE POLICY "Service role full access" ON meta_source_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Seed ─────────────────────────────────────────────────────────────────────
INSERT INTO meta_source_registry
  (source_code, source_name, base_url, api_key_env_var, rate_limit_rpm,
   is_free, requires_auth, data_format, documentation_url, operator_notes)
VALUES
  ('YAHOO',
   'Yahoo Finance',
   'https://query2.finance.yahoo.com',
   NULL,
   100,
   true, false, 'json',
   'https://finance.yahoo.com',
   'Unofficial API — no key needed but rate-limit aggressively. Use /v8/finance/chart endpoint.'),

  ('FRED',
   'Federal Reserve Economic Data',
   'https://api.stlouisfed.org/fred',
   'FRED_API_KEY',
   120,
   true, true, 'json',
   'https://fred.stlouisfed.org/docs/api/fred/',
   'Free tier allows 120 req/min. Register at stlouisfed.org for an API key.'),

  ('CFTC',
   'CFTC Commitments of Traders',
   'https://publicreporting.cftc.gov',
   NULL,
   10,
   true, false, 'csv',
   'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
   'COT reports released every Friday ~3:30 PM ET for the prior Tuesday. CSV bulk download.'),

  ('TRADINGECONOMICS',
   'Trading Economics',
   'https://api.tradingeconomics.com',
   'TRADINGECONOMICS_KEY',
   100,
   false, true, 'json',
   'https://docs.tradingeconomics.com/',
   'Paid plan required for live data. Use for 2Y bond yields not available in FRED.'),

  ('FOREXFACTORY',
   'Forex Factory Economic Calendar',
   'https://nfs.faireconomy.media',
   NULL,
   60,
   true, false, 'json',
   'https://www.forexfactory.com/calendar',
   'Unofficial JSON feed at /ff_calendar_thisweek.json. No auth needed.'),

  ('ETFCOM',
   'ETF.com Fund Flow Data',
   'https://www.etf.com',
   NULL,
   30,
   true, false, 'html',
   'https://www.etf.com/sections/features-and-news/etf-fund-flows-tool',
   'Scrape required. Target GLD, IAU, SGOL flow tables for gold ETF flows.'),

  ('CME',
   'CME Group DataMine',
   'https://www.cmegroup.com',
   NULL,
   30,
   true, false, 'json',
   'https://www.cmegroup.com/market-data.html',
   'Public market data for options/vol. Use for 25-delta risk reversal data.'),

  ('NEWSAPI',
   'NewsAPI',
   'https://newsapi.org/v2',
   'NEWSAPI_KEY',
   100,
   false, true, 'json',
   'https://newsapi.org/docs',
   'Used by wf_geo_scan_hourly for geopolitical risk event detection.'),

  ('GDT',
   'Global Dairy Trade',
   'https://www.globaldairytrade.info',
   NULL,
   5,
   true, false, 'html',
   'https://www.globaldairytrade.info/en/product-results/',
   'Bi-weekly auctions (every ~2 weeks). Scrape GDT Price Index for NZD commodity driver.'),

  ('INVESTING',
   'Investing.com',
   'https://www.investing.com',
   NULL,
   30,
   true, false, 'html',
   'https://www.investing.com',
   'Fallback scrape source. Use only when primary sources unavailable. No official API.'),

  ('WORLDBANK',
   'World Bank Open Data',
   'https://api.worldbank.org/v2',
   NULL,
   100,
   true, false, 'json',
   'https://datahelpdesk.worldbank.org/knowledgebase/articles/898581',
   'Monthly/quarterly data. Used for inflation forecasts and GDP growth estimates.')

ON CONFLICT (source_code) DO NOTHING;
