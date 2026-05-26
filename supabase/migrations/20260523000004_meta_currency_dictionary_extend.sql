-- ============================================================
-- Phase 0 — Extend meta_currency_dictionary
-- Adds cftc_contract_code, yahoo_ticker, dxy_weight columns
-- and populates all 9 existing rows.
-- ============================================================

ALTER TABLE meta_currency_dictionary
  ADD COLUMN IF NOT EXISTS cftc_contract_code text,
  ADD COLUMN IF NOT EXISTS yahoo_ticker       text,
  ADD COLUMN IF NOT EXISTS dxy_weight         numeric(5,2);

COMMENT ON COLUMN meta_currency_dictionary.cftc_contract_code IS
  'CFTC legacy market code used in COT Disaggregated reports';
COMMENT ON COLUMN meta_currency_dictionary.yahoo_ticker IS
  'Yahoo Finance ticker for spot FX or front-month futures (e.g. EURUSD=X, GC=F)';
COMMENT ON COLUMN meta_currency_dictionary.dxy_weight IS
  'Weight in the DXY basket (%). NULL for currencies not in the DXY (AUD, NZD, XAU, USD base)';

-- ─── Populate 9 rows ─────────────────────────────────────────────────────────

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '098662',
  yahoo_ticker       = 'DX-Y.NYB',
  dxy_weight         = NULL           -- USD is the DXY base, not a weighted component
WHERE currency_code = 'USD';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '099741',
  yahoo_ticker       = 'EURUSD=X',
  dxy_weight         = 57.60
WHERE currency_code = 'EUR';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '097741',
  yahoo_ticker       = 'JPY=X',       -- USD/JPY (Yahoo convention: quote per USD)
  dxy_weight         = 13.60
WHERE currency_code = 'JPY';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '096742',
  yahoo_ticker       = 'GBPUSD=X',
  dxy_weight         = 11.90
WHERE currency_code = 'GBP';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '092741',
  yahoo_ticker       = 'CHF=X',       -- USD/CHF
  dxy_weight         = 3.60
WHERE currency_code = 'CHF';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '090741',
  yahoo_ticker       = 'CAD=X',       -- USD/CAD
  dxy_weight         = 9.10
WHERE currency_code = 'CAD';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '232741',
  yahoo_ticker       = 'AUDUSD=X',
  dxy_weight         = NULL           -- AUD not in DXY basket
WHERE currency_code = 'AUD';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '112741',
  yahoo_ticker       = 'NZDUSD=X',
  dxy_weight         = NULL           -- NZD not in DXY basket
WHERE currency_code = 'NZD';

UPDATE meta_currency_dictionary SET
  cftc_contract_code = '088691',
  yahoo_ticker       = 'GC=F',        -- Gold front-month futures
  dxy_weight         = NULL           -- XAU not in DXY basket
WHERE currency_code = 'XAU';
