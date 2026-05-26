# The Bias Room — Pipeline Build Tasks

> **Source:** `TBR_Data_Pipeline_Guide.html` (FSR v6.1-FINAL · May 2026)
> **Total scope:** 38 tables · 27 workflows · ~20 hrs estimated build time
> **Strict boundary:** Data only — no scoring, no grading, no output rendering

Legend: `✅ done` · `🔶 partial` · `⬜ not started`

---

## Phase 0 — Foundation Meta Tables ✅ COMPLETE

> Build these first — every silver table has FKs pointing here.

- [x] ✅ `meta_currency_dictionary` — 9 rows seeded (USD/EUR/JPY/GBP/CHF/CAD/AUD/NZD/XAU)
  - Added `cftc_contract_code`, `yahoo_ticker`, `dxy_weight` via migration `20260523000004`
  - All 9 rows populated; DXY basket sum = 95.80% (SEK 4.2% not in our universe)
- [x] ✅ `meta_series_mapping` — 50 rows seeded across 9 currencies
  - Covers: bond yields (2Y+10Y), real yields, breakevensinflation, COT positions, spot rates, CPI, DXY
  - Priority chain: FRED primary → TRADINGECONOMICS fallback; CFTC for COT; YAHOO for FX spots
  - Migration: `20260523000005`
- [x] ✅ `meta_source_registry` — 11 sources seeded (YAHOO, FRED, CFTC, TRADINGECONOMICS, FOREXFACTORY, ETFCOM, CME, NEWSAPI, GDT, INVESTING, WORLDBANK)
  - Migration: `20260523000006`
- [x] ✅ `meta_workflow_registry` — 27 rows confirmed in DB
- [x] ✅ `meta_table_freshness_sla` — 22 rows seeded (one per tracked silver table)
  - Thresholds: hourly (60/180 min), daily (1440/2880 min), weekly (10080/20160 min)
  - All workflow_id soft-refs validated against meta_workflow_registry
  - Migration: `20260523000007`

**Phase 0 test results (2026-05-23):**
| Test | Result |
|---|---|
| T01 Row counts (9/27/50/11/22) | ✅ PASS |
| T02 No null cftc/yahoo; 4 null dxy_weight (expected) | ✅ PASS |
| T03 FK violation on bad currency_code | ✅ PASS |
| T04 SLA constraints (critical > warning, all positive) | ✅ PASS |
| T05 RLS policies on all 3 new tables (2 each) | ✅ PASS |
| T06 Series coverage per currency | ✅ PASS |
| T07 Idempotent seed (ON CONFLICT DO NOTHING) | ✅ PASS |
| T08 Auth consistency (api_key_env_var ↔ requires_auth) | ✅ PASS |
| T09 SLA workflow_id soft-refs all valid | ✅ PASS |
| T10 All 9 currency codes present, correct display_order | ✅ PASS |
| T11 UNIQUE constraint on meta_series_mapping | ✅ PASS |
| T12 All 6 meta migrations recorded in schema_migrations | ✅ PASS |

---

## Phase 1 — Operations Layer ✅ COMPLETE

> Control room tables. Build before any workflow runs.

- [x] ✅ `raw_ingestion_payloads` — 11 columns, 7 indexes, RLS applied
  - Extended via `20260523000008` — added `payload_size_bytes`, `currency_codes`, `is_processed`, `processed_at`
  - **Note:** Kept as regular table (not partitioned) — `forex_rates.source_payload_id` FK blocks conversion. Partitioning deferred to Phase 7.
  - ⚠️ Pre-existing "Anon read-only" policy found — raw payloads ideally service_role only. Flag for Phase 7 cleanup.
- [x] ✅ `ops_ingestion_runs` — EXISTS (migration + app hooks exist)
- [x] ✅ `ops_ingestion_errors` — EXISTS; `error_kind` CHECK confirmed (`http_error/timeout/rate_limited/parse_error/validation_failed/db_error/unknown`)
- [x] ✅ `ops_dead_letter_queue` — EXISTS; `record jsonb NOT NULL` — `ops.ts` fix applied
- [x] ✅ `ops_stale_data_alerts` — 12 columns, 2 indexes, RLS applied
  - Migration: `20260523000009`
  - CHECK constraint: `is_resolved=true` requires `resolved_at IS NOT NULL`

**Phase 1 test results (2026-05-23):**
| Test | Result |
|---|---|
| P1-T01 Column counts (11 / 12) | ✅ PASS |
| P1-T02 raw_ingestion_payloads all columns present | ✅ PASS |
| P1-T03 Constraint blocks is_resolved=true without resolved_at | ✅ PASS (0 bad rows) |
| P1-T04 RLS policies on both tables (2 each) | ✅ PASS |
| P1-T05 7 indexes on raw_ingestion_payloads | ✅ PASS |

---

## Phase 2 — Extend Existing Tables ✅ COMPLETE

> ALTER, don't DROP — all existing data is preserved.

- [x] ✅ `forex_rates` — already complete pre-Phase 2 (is_friday_ny_close GENERATED, source_payload_id, UNIQUE(pair, effective_date) all confirmed in DB)
- [x] ✅ `central_bank_rates` — added `is_canonical bool`, `source_payload_id bigint`; UNIQUE(series_id, effective_date) pre-existed
- [x] ✅ `cot_positioning` — added `cftc_release_date date`, `cftc_lag_days int GENERATED`; UNIQUE(report_date, currency) pre-existed
- [x] ✅ `economic_calendar` — added `actual_filled_at timestamptz`, `actual_numeric numeric`, `actual_source_code text`; UNIQUE(event_date, currency, event_name) pre-existed
- [x] ✅ `gold_context` — added `CHECK(indicator IN (...))` with 9-value vocabulary; UNIQUE(effective_date, indicator) pre-existed; all 72 existing rows valid
- [x] ✅ `RENAME market_sentiment → market_indices` — no view dependencies; meta_table_freshness_sla updated; useDataExplorer.ts updated
- [x] ✅ `RENAME bond_yields → bond_yields_nominal` — no view dependencies; meta_table_freshness_sla updated; useDataExplorer.ts updated
  - Migration: `20260523000010`

**Phase 2 test results (2026-05-23):**
| Test | Result |
|---|---|
| T01a market_indices table exists | ✅ PASS |
| T01b bond_yields_nominal table exists | ✅ PASS |
| T01c market_sentiment gone | ✅ PASS (null = not found) |
| T01d bond_yields gone | ✅ PASS (null = not found) |
| T02 central_bank_rates 2 new cols | ✅ PASS |
| T03 cot_positioning 2 new cols | ✅ PASS |
| T04 cftc_lag_days is GENERATED | ✅ PASS |
| T05 economic_calendar 3 new cols | ✅ PASS |
| T06 gold_context CHECK constraint | ✅ PASS |
| T07 72 gold_context rows still valid | ✅ PASS |
| T08 SLA refs updated (2 new, 0 old) | ✅ PASS |

---

## Phase 3 — New Silver Tables ✅ COMPLETE

> 16 new canonical fact tables. One row = one observation.

- [x] ✅ `central_bank_tone` — 16 cols; UNIQUE(currency_code, effective_date) added (was missing from retroactive migration)
- [x] ✅ `central_bank_events` — 14 cols; UNIQUE(currency_code, event_date, event_type) added
- [x] ✅ `bond_yields_real` — 11 cols; added `is_stale_60d`, `is_stale_120d` booleans (set by wf_stale_data_monitor; can't use now() in STORED generated cols)
- [x] ✅ `breakeven_inflation` — 9 cols; UNIQUE(effective_date, currency_code) pre-existed
- [x] ✅ `inflation_forecasts` — **CREATED**; UNIQUE(currency_code, forecast_date, forecast_year, source_code); FK → meta_currency_dictionary; RLS; SLA entry added
- [x] ✅ `gold_etf_flows` — 12 cols; UNIQUE(effective_date, etf_ticker) pre-existed
- [x] ✅ `commodity_prices` — 11 cols; UNIQUE(effective_date, commodity_code) pre-existed
- [x] ✅ `risk_reversal_25d` — 11 cols; UNIQUE(effective_date, pair, tenor) pre-existed
- [x] ✅ `intermarket_signals` — 11 cols; UNIQUE(effective_date, currency_code, signal_name) pre-existed
- [x] ✅ `geo_risk_events` — 16 cols; UNIQUE(event_code) pre-existed
- [x] ✅ `geo_risk_status_log` — 10 cols; UNIQUE(log_date, event_code) pre-existed
- [x] ✅ `consensus_surveys` — 13 cols; UNIQUE(survey_week_ending, currency_code) pre-existed; uniform_consensus + consensus_direction are GENERATED
- [x] ✅ `economic_calendar_consensus_history` — **CREATED**; days_to_event GENERATED; UNIQUE(currency_code, event_name, event_date, snapshot_date); RLS
- [x] ✅ `fx_friday_closes` — 11 cols; UNIQUE(friday_date, pair) pre-existed
- [x] ✅ `daily_atr14` — 8 cols; warning_threshold (×0.5) + critical_threshold (×1.2) GENERATED pre-existed; UNIQUE(effective_date, pair) pre-existed
- [x] ✅ `path_dependency_state` — **CREATED**; FK → meta_currency_dictionary; flexible jsonb state_value; RLS

**Phase 3 test results (2026-05-23):**
| Test | Result |
|---|---|
| T01 All 16 tables exist | ✅ PASS |
| T02 bond_yields_real staleness cols (2) | ✅ PASS |
| T03 central_bank_tone UNIQUE added | ✅ PASS |
| T04 central_bank_events UNIQUE added | ✅ PASS |
| T05 days_to_event is GENERATED | ✅ PASS |
| T06 inflation_forecasts FK to meta_currency_dictionary | ✅ PASS |
| T07 path_dependency_state FK to meta_currency_dictionary | ✅ PASS |
| T08 RLS enabled on all 3 new tables | ✅ PASS |
| T09 inflation_forecasts in SLA table | ✅ PASS |

---

## Phase 4 — Gold Layer — Views & Snapshots ✅ COMPLETE

> "What does the framework see right now?" — answered in one row.

### 11 `v_latest_*` Views (CREATE VIEW ... DISTINCT ON ...)
- [x] ✅ `v_latest_central_bank_rates` — DISTINCT ON (currency), is_canonical DESC, effective_date DESC
- [x] ✅ `v_latest_central_bank_tone` — DISTINCT ON (currency_code), WHERE verified_at IS NOT NULL
- [x] ✅ `v_latest_bond_yields_2y` — JOIN meta_series_mapping ON indicator_type = 'bond_yield_2y'
- [x] ✅ `v_latest_real_yields` — DISTINCT ON (currency_code), effective_date DESC
- [x] ✅ `v_latest_breakeven` — DISTINCT ON (currency_code), effective_date DESC
- [x] ✅ `v_latest_market_indices` — DISTINCT ON (symbol), effective_date DESC; 8 rows queryable
- [x] ✅ `v_latest_cot` — DISTINCT ON (currency), report_date DESC; DISTINCT verified correct
- [x] ✅ `v_latest_gold_etf_flow_5d` — DISTINCT ON (etf_ticker); flow_5d_usd pre-computed by wf
- [x] ✅ `v_latest_intermarket_signals` — DISTINCT ON (currency_code, signal_name); no dupes verified
- [x] ✅ `v_latest_risk_reversal` — DISTINCT ON (pair, tenor), effective_date DESC
- [x] ✅ `v_active_geo_flags` — WHERE status IN ('active','monitoring') ORDER BY severity rank
  - Migration: `20260523000011`

### Snapshot Tables
- [x] ✅ `weekly_anchor_snapshots` — EXISTS (migration + Snapshot page + hooks)
- [x] ✅ `daily_close_snapshots` — EXISTS (pre-existing table confirmed)

**Phase 4 test results (2026-05-23):**
| Test | Result |
|---|---|
| T01 All 11 gold views created | ✅ PASS (11/11) |
| T02 weekly_anchor_snapshots + daily_close_snapshots exist | ✅ PASS (2/2) |
| T03 v_latest_central_bank_rates queryable (8 rows) | ✅ PASS |
| T04 meta_series_mapping has 9 bond_yield_2y rows (join ready) | ✅ PASS |
| T05 v_latest_market_indices queryable (8 rows) | ✅ PASS |
| T06 v_active_geo_flags queryable (0 rows — empty, expected) | ✅ PASS |
| T07 v_latest_cot: COUNT = COUNT(DISTINCT currency) | ✅ PASS |
| T08 v_latest_intermarket_signals: no (currency_code, signal_name) dupes | ✅ PASS |

---

## Phase 5 — 27 n8n Workflows (~8 hrs)

> Build the reusable error/retry sub-workflow first — all others call it.
> Build sequence: Tier 1 (priority order) → Tier 2 → Tier 3.

### Sub-Workflow (build first)
- [ ] ⬜ **Error / Retry sub-workflow** — reusable pattern (idempotency guard, run log open/close, error catch, DLQ push)

### Tier 1 — 20 Ingestion Workflows

| Workflow ID | Cron | Destination | Status |
|---|---|---|---|
| `wf_forex_daily_fetch` | `0 22 * * 1-5` | `forex_rates` | ✅ Edge Fn handler exists |
| `wf_cb_rates_daily` | `0 6 * * *` | `central_bank_rates` | ✅ Edge Fn handler exists |
| `wf_cot_weekly` | `0 22 * * 5` + Tue retry | `cot_positioning` | ✅ Edge Fn handler exists |
| `wf_bond_yields_nominal_daily` | `30 22 * * 1-5` | `bond_yields_nominal` | ⬜ |
| `wf_real_yields_daily` | `30 22 * * 1-5` | `bond_yields_real` | ⬜ |
| `wf_breakeven_daily` | `30 22 * * 1-5` | `breakeven_inflation` | ⬜ |
| `wf_economic_calendar_daily` | `0 4 * * *` | `economic_calendar` | ⬜ |
| `wf_economic_calendar_actuals_fill` | `*/30 * * * *` | `economic_calendar` | ⬜ **fixes NULL actuals bug** |
| `wf_market_indices_daily` | `0 22 * * 1-5` | `market_indices` | ⬜ |
| `wf_commodities_daily` | `0 22 * * 1-5` | `commodity_prices` | ⬜ |
| `wf_gold_context_daily` | `0 22 * * 1-5` | `gold_context` | ⬜ |
| `wf_gold_etf_flows_daily` | `0 23 * * 1-5` | `gold_etf_flows` | ⬜ |
| `wf_risk_reversal_daily` | `15 22 * * 1-5` | `risk_reversal_25d` | ⬜ |
| `wf_inflation_forecasts_weekly` | `0 7 * * 1` | `inflation_forecasts` | ⬜ |
| `wf_cb_tone_review` | `0 14 * * 1` | `central_bank_tone (draft)` | ⬜ |
| `wf_cb_events_calendar` | `0 6 * * 0` | `central_bank_events` | ⬜ |
| `wf_geo_scan_hourly` | `0 8-22 * * 1-5` | `geo_risk_events (draft)` | ⬜ |
| `wf_geo_status_daily` | `30 22 * * 1-5` | `geo_risk_status_log` | ⬜ |
| `wf_gdt_dairy_biweekly` | `0 20 * * 2` (alt. Tue) | `commodity_prices (GDT_DAIRY)` | ⬜ |
| `wf_consensus_survey_weekly` | `0 18 * * 6` | `consensus_surveys` | ⬜ manual entry |

### Tier 2 — 4 Derived Workflows

| Workflow ID | Cron | Reads | Writes | Status |
|---|---|---|---|---|
| `wf_compute_atr14_daily` | `15 23 * * 1-5` | `forex_rates` (last 20 OHLC) | `daily_atr14` | ⬜ |
| `wf_fx_friday_close_snapshot` | `30 23 * * 5` | `forex_rates (is_friday_ny_close)` | `fx_friday_closes` | ⬜ |
| `wf_daily_close_snapshot` | `30 23 * * 1-5` | All `v_latest_*` views | `daily_close_snapshots` | ⬜ |
| `wf_weekly_anchor_snapshot` | `45 23 * * 5` | All `v_latest_*` + `fx_friday_closes` + `daily_atr14` + `consensus_surveys` | `weekly_anchor_snapshots` | ⬜ |

> ⚠️ Tier 2 waits for upstream Tier 1 `status='success'` (30-min timeout). If Tier 1 failed, snapshot writes with `data_quality_flags` — never silently degrades.

### Tier 3 — 3 Operations Workflows

| Workflow ID | Cron | Purpose | Status |
|---|---|---|---|
| `wf_stale_data_monitor` | `*/15 * * * *` | Check every table vs `meta_table_freshness_sla`; write `ops_stale_data_alerts` | ⬜ |
| `wf_dlq_retry` | `0 */6 * * *` | Retry `ops_dead_letter_queue` records (3 attempts, then `manual_review`) | ⬜ |
| `wf_health_check_hourly` | `0 * * * *` | Ping FRED, Yahoo, CFTC canary URLs; write `system_health_logs` | ⬜ |

---

## Phase 6 — Verification (~4 hrs)

> Never skip this phase.

- [ ] ⬜ Run all 27 workflows manually once → confirm `ops_ingestion_runs.status = 'success'` for each
- [ ] ⬜ Compare generated `weekly_anchor_snapshots` row against `TBR_Static_Block_W20.txt`
  - ✅ File is now in the project root (`TBR_Static_Block_W20.txt` — W20 anchor date May 8, 2026, DQS 80/100)
  - Compare raw data fields only (rates, COT positions, tone scores, ATR values) — the scoring outputs (F/S/R layers, grades) are computed by the FSR engine, not the pipeline
- [ ] ⬜ Run `wf_stale_data_monitor` → confirm zero false-positive alerts
- [ ] ⬜ Trigger intentional failure (set a bad API key) → verify `ops_dead_letter_queue` receives the record and `ops_ingestion_runs.status = 'failed'`

---

## Phase 7 — Legacy Cleanup (~15 min)

- [ ] ⬜ `DROP TABLE weekly_bias_reports` (2 rows; out of scope — report output, not data input)
- [ ] ⬜ Mark `system_logs` deprecated — stop writing to it, preserve existing 431 rows
- [ ] ⬜ Update Supabase RLS policies for all newly created tables
  - Standard: anon = SELECT, service_role = ALL
  - Exception: `central_bank_tone`, `geo_risk_events`, `consensus_surveys` = INSERT/UPDATE only for authenticated operators

---

## Phase 8 — React UI Stubs (Frontend Deliverables)

> These 4 nav items are wired but show nothing. Not in the HTML guide, but needed to complete the app.

- [ ] ⬜ `/ingestion` — Ingestion Runs view (currently a stub)
  - Show live/recent `raw_ingestion_payloads` rows per source; pipeline ingest volume charts
- [ ] ⬜ `/alerts` — Stale Data Alerts view (currently a stub)
  - Show `ops_stale_data_alerts` table; severity badges; resolution actions
- [ ] ⬜ `/sources` — Data Source Health view (currently a stub)
  - Show `system_health_logs`; last ping per source; up/down status per API
- [ ] ⬜ `/settings` — Operator Settings view (currently a stub)
  - Manage `meta_table_freshness_sla` thresholds; workflow registry viewer

---

## Friday Execution Order Reference

> The most critical night — Tier 2 must run after all Tier 1 outputs are ready.

| UTC Time | Workflows |
|---|---|
| 21:00 | `wf_economic_calendar_actuals_fill` (picks up Friday releases) |
| 22:00 | `wf_forex_daily_fetch`, `wf_cb_rates_daily`, `wf_market_indices_daily`, `wf_commodities_daily`, `wf_gold_context_daily`, `wf_cot_weekly` |
| 22:15 | `wf_bond_yields_nominal_daily`, `wf_real_yields_daily`, `wf_breakeven_daily`, `wf_risk_reversal_daily` |
| 22:30 | `wf_geo_status_daily` |
| 23:00 | `wf_gold_etf_flows_daily` |
| 23:15 | 🔶 `wf_compute_atr14_daily` ← Tier 2 starts |
| 23:30 | 🔶 `wf_fx_friday_close_snapshot`, `wf_daily_close_snapshot` |
| 23:45 | 🥇 `wf_weekly_anchor_snapshot` ← **The big one** |

---

## Deduplication Checkpoints

Three separate safeguards (must all be present before going to production):

| Level | Mechanism | Implemented |
|---|---|---|
| Bronze | SHA-256 hash check on `raw_ingestion_payloads` | ⬜ |
| Silver | `UNIQUE` constraint + `INSERT ... ON CONFLICT DO UPDATE` on every silver table | ⬜ |
| Snapshot | `UNIQUE(iso_week_id)` on `weekly_anchor_snapshots` | ✅ (UNIQUE on snapshot_date exists) |

---

## Data Source API Keys Required

| Source | Key Type | Used By |
|---|---|---|
| FRED (fred.stlouisfed.org) | Free API key | `wf_real_yields_daily`, `wf_bond_yields_nominal_daily`, `wf_breakeven_daily`, `wf_gold_context_daily`, `wf_cb_rates_daily` |
| NewsAPI (newsapi.org) | Free tier (100 req/day) or Developer plan | `wf_geo_scan_hourly` |
| TradingEconomics | Free tier | `wf_economic_calendar_daily`, `wf_bond_yields_nominal_daily` |
| Yahoo Finance | No key — public | `wf_forex_daily_fetch`, `wf_market_indices_daily`, `wf_commodities_daily` |
| CFTC.gov | No key — public download | `wf_cot_weekly` |
| ETF.com | No key — scrape | `wf_gold_etf_flows_daily` |
| CME Group | Account or scraping | `wf_risk_reversal_daily` |

---

*Last updated: 2026-05-23 · Guide version: FSR v6.1-FINAL · 38 tables · 27 workflows*
