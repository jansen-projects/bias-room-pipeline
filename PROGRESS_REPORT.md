# The Bias Room — Build Progress Report

**Generated:** 2026-05-23  
**Audit Scope:** Supabase migrations, Edge Functions, React hooks, TypeScript types  
**Baseline Requirement:** 38 tables + 27 workflows

---

## Executive Summary

| Category | Confirmed | Required | % Complete |
|---|---|---|---|
| DB Tables | 8 | 38 | **21%** |
| Workflows | 3 | 27 | **11%** |
| React Pages Wired | 4 fully, 2 partial | 9 | **~55%** |

**Breakdown of confirmed tables:**
- ✅ 1 SQL migration exists (`weekly_anchor_snapshots`)
- ✅ 4 tables confirmed via Edge Function handlers (`forex_rates`, `central_bank_rates`, `cot_positioning`, `ops_ingestion_runs`)
- 🔶 3 tables confirmed by React hooks + type definitions only — no migration file found (`central_bank_tone`, `geo_risk_events`, `consensus_surveys`)
- 🔶 3 additional tables referenced in hooks but not yet migrated (`bond_yields`, `gold_context`, `market_sentiment`)

---

## DB Tables Status

| Table Name | Evidence Found | Status |
|---|---|---|
| **META LAYER** | | |
| `meta_currency_dictionary` | — | ⬜ Not Found |
| `meta_series_mapping` | — | ⬜ Not Found |
| `meta_source_registry` | — | ⬜ Not Found |
| `meta_workflow_registry` | hooks: useWorkflowStatus, useRunLog; edge fn: index.ts SELECT | ✅ Done |
| `meta_table_freshness_sla` | — | ⬜ Not Found |
| **BRONZE LAYER** | | |
| `raw_ingestion_payloads` | Referenced in ops.ts pattern but no migration | ⬜ Not Found |
| **SILVER LAYER (22 required)** | | |
| `forex_rates` | Edge fn: handlers/forex.ts upsert | ✅ Done |
| `bond_yields_nominal` | Not in schema (rename from `bond_yields` pending) | ⬜ Not Found |
| `bond_yields_real` | Not in schema | ⬜ Not Found |
| `central_bank_rates` | Edge fn: handlers/cb-rates.ts upsert | ✅ Done |
| `central_bank_tone` | Type defined; hook: useCBTone.ts; useDataExplorer refs | 🔶 Partial |
| `central_bank_events` | Not in schema | ⬜ Not Found |
| `cot_positioning` | Edge fn: handlers/cot.ts upsert | ✅ Done |
| `gold_etf_flows` | Not in schema | ⬜ Not Found |
| `gold_context` | useDataExplorer TABLE_CONFIG refs; snapshot type partial | 🔶 Partial |
| `market_indices` | Referenced as `market_sentiment` in hooks — rename pending | 🔶 Partial |
| `commodity_prices` | Not in schema | ⬜ Not Found |
| `risk_reversal_25d` | Not in schema | ⬜ Not Found |
| `intermarket_signals` | Not in schema | ⬜ Not Found |
| `geo_risk_events` | Type defined; hook: useGeoRisk.ts implemented | 🔶 Partial |
| `geo_risk_status_log` | Not in schema | ⬜ Not Found |
| `daily_atr14` | Not in schema | ⬜ Not Found |
| `fx_friday_closes` | Not in schema | ⬜ Not Found |
| `economic_calendar` | useDataExplorer TABLE_CONFIG refs | 🔶 Partial |
| `breakeven_inflation` | Not in schema | ⬜ Not Found |
| `inflation_forecasts` | Not in schema | ⬜ Not Found |
| `consensus_surveys` | Type defined; hook: useConsensusSurvey.ts implemented | 🔶 Partial |
| `economic_calendar_consensus_history` | Not in schema | ⬜ Not Found |
| `path_dependency_state` | Not in schema | ⬜ Not Found |
| **OPS LAYER** | | |
| `ops_ingestion_runs` | Type defined; used in Edge fn index.ts + ops.ts | ✅ Done |
| `ops_ingestion_errors` | Type inferred; edge fn ops.ts refs | 🔶 Partial |
| `ops_dead_letter_queue` | Edge fn ops.ts refs, no migration | 🔶 Partial |
| `ops_stale_data_alerts` | Not in schema | ⬜ Not Found |
| `system_logs` | Not in schema | ⬜ Not Found |
| `system_health_logs` | Not in schema | ⬜ Not Found |
| **GOLD LAYER** | | |
| `weekly_anchor_snapshots` | Migration SQL exists; hook: useSnapshot.ts | ✅ Done |
| `daily_close_snapshots` | Not in schema | ⬜ Not Found |
| **GOLD VIEWS (11 required)** | | |
| `v_latest_central_bank_rates` | — | ⬜ Not Found |
| `v_latest_central_bank_tone` | — | ⬜ Not Found |
| `v_latest_bond_yields_2y` | — | ⬜ Not Found |
| `v_latest_real_yields` | — | ⬜ Not Found |
| `v_latest_breakeven` | — | ⬜ Not Found |
| `v_latest_market_indices` | — | ⬜ Not Found |
| `v_latest_cot` | — | ⬜ Not Found |
| `v_latest_gold_etf_flow_5d` | — | ⬜ Not Found |
| `v_latest_intermarket_signals` | — | ⬜ Not Found |
| `v_latest_risk_reversal` | — | ⬜ Not Found |
| `v_active_geo_flags` | — | ⬜ Not Found |

---

## Workflow Status

| Workflow ID | Handler | Status |
|---|---|---|
| **TIER 1 (20 required)** | | |
| `wf_forex_daily_fetch` | `handlers/forex.ts` | ✅ Done |
| `wf_cb_rates_daily` | `handlers/cb-rates.ts` | ✅ Done |
| `wf_cot_weekly` | `handlers/cot.ts` | ✅ Done |
| `wf_bond_yields_nominal_daily` | — | ⬜ Not Found |
| `wf_real_yields_daily` | — | ⬜ Not Found |
| `wf_breakeven_daily` | — | ⬜ Not Found |
| `wf_economic_calendar_daily` | — | ⬜ Not Found |
| `wf_economic_calendar_actuals_fill` | — | ⬜ Not Found |
| `wf_market_indices_daily` | — | ⬜ Not Found |
| `wf_commodities_daily` | — | ⬜ Not Found |
| `wf_gold_context_daily` | — | ⬜ Not Found |
| `wf_gold_etf_flows_daily` | — | ⬜ Not Found |
| `wf_risk_reversal_daily` | — | ⬜ Not Found |
| `wf_inflation_forecasts_weekly` | — | ⬜ Not Found |
| `wf_cb_tone_review` | — | ⬜ Not Found |
| `wf_cb_events_calendar` | — | ⬜ Not Found |
| `wf_geo_scan_hourly` | — | ⬜ Not Found |
| `wf_geo_status_daily` | — | ⬜ Not Found |
| `wf_gdt_dairy_biweekly` | — | ⬜ Not Found |
| `wf_consensus_survey_weekly` | — | ⬜ Not Found |
| **TIER 2 (4 required)** | | |
| `wf_compute_atr14_daily` | — | ⬜ Not Found |
| `wf_fx_friday_close_snapshot` | — | ⬜ Not Found |
| `wf_daily_close_snapshot` | — | ⬜ Not Found |
| `wf_weekly_anchor_snapshot` | — | ⬜ Not Found |
| **TIER 3 (3 required)** | | |
| `wf_stale_data_monitor` | — | ⬜ Not Found |
| `wf_dlq_retry` | — | ⬜ Not Found |
| `wf_health_check_hourly` | — | ⬜ Not Found |

---

## React App Coverage

### Hooks → Table Mapping

| Hook | Reads From | Writes To | Status |
|---|---|---|---|
| `useWorkflowRegistry` | `meta_workflow_registry` | — | ✅ Active |
| `useWorkflowStatus` | `meta_workflow_registry`, `ops_ingestion_runs` | — | ✅ Active |
| `useRunLog` | `ops_ingestion_runs`, `meta_workflow_registry` | — | ✅ Active |
| `useCBTone` | `central_bank_tone` | `central_bank_tone` | 🔶 Type defined, migration missing |
| `useGeoRisk` | `geo_risk_events` | `geo_risk_events` | 🔶 Type defined, migration missing |
| `useConsensusSurvey` | `consensus_surveys` | `consensus_surveys` | 🔶 Type defined, migration missing |
| `useDataExplorer` | 8 silver tables | — | 🔶 Only 3 of 8 confirmed in DB |
| `useSnapshot` | `weekly_anchor_snapshots` | — | ✅ Active |

### Pages → Hooks Wiring

| Page | Route | Hooks Used | Status |
|---|---|---|---|
| Dashboard | `/` | `useWorkflowStatus` | ✅ Fully wired |
| Run Log | `/runs` | `useRunLog`, `useWorkflowRegistry` | ✅ Fully wired |
| Manual Entry | `/manual` | `useCBTone`, `useGeoRisk`, `useConsensusSurvey` | 🔶 Hooks exist, DB tables pending |
| Snapshot | `/snapshot` | `useSnapshot` | ✅ Fully wired |
| Data Explorer | `/data` | `useDataExplorer` | 🔶 8 tables ref'd, 3 confirmed |
| Ingestion | `/ingestion` | — | ⬜ Stub page |
| Alerts | `/alerts` | — | ⬜ Stub page |
| Sources | `/sources` | — | ⬜ Stub page |
| Settings | `/settings` | — | ⬜ Stub page |

---

## Missing Items — Priority Order

### 🔴 Critical Blockers (must exist before any silver table is built)
- `meta_currency_dictionary` — 9-row seed; FK target for all silver tables
- `meta_source_registry` — FK target for `raw_ingestion_payloads`
- `meta_series_mapping` — encodes source-priority chain
- `meta_table_freshness_sla` — required by `wf_stale_data_monitor`
- `raw_ingestion_payloads` — bronze landing zone (partitioned)
- `ops_dead_letter_queue` — referenced in existing ops.ts but no confirmed migration
- `ops_stale_data_alerts` — required by Tier 3 monitor workflow

### 🟠 Silver Tables (18 missing)
`bond_yields_nominal`, `bond_yields_real`, `central_bank_events`, `breakeven_inflation`, `commodity_prices`, `daily_atr14`, `economic_calendar_consensus_history`, `fx_friday_closes`, `gold_etf_flows`, `inflation_forecasts`, `intermarket_signals`, `market_indices` (rename), `path_dependency_state`, `risk_reversal_25d`, `geo_risk_status_log`

Plus DB migrations needed to confirm: `central_bank_tone`, `geo_risk_events`, `consensus_surveys`, `economic_calendar`

### 🟡 Gold Layer (12 missing)
- All 11 `v_latest_*` views
- `daily_close_snapshots` table

### 🔵 Workflows (24 missing)
All Tier 1 except 3 already done. All Tier 2. All Tier 3.

### ⚙️ Config
- `.gitignore` is missing `supabase/.temp/` — auto-generated files risk being committed

---

## Inconsistencies & Notes

1. **Types without migrations:** `central_bank_tone`, `geo_risk_events`, `consensus_surveys` have full TypeScript interfaces and working CRUD hooks, but **no SQL migration files exist**. These may have been created manually in the Supabase dashboard — verify via the Supabase UI or CLI.

2. **ops_ingestion_runs has no migration file** despite being the most-used ops table. Likely created manually. Consider creating a retroactive migration to capture it in version control.

3. **useDataExplorer references 8 tables** but only 3 are confirmed in DB. The Data Explorer page will silently return empty results for the other 5 until those tables are built.

4. **Only 1 SQL migration file exists** (`weekly_anchor_snapshots`). The 27 tables known to exist were likely created outside version control — all need retroactive migrations for reproducibility.

5. **meta_workflow_registry** is live (app reads it), but with only 3 handlers implemented, the dashboard shows 27 workflow cards — the other 24 will show as never-run until workflows are built.

---

## Raw Evidence

### Migration Files
```
supabase/migrations/
  └── 20260520130000_weekly_anchor_snapshots.sql
```

### Edge Functions
```
supabase/functions/trigger-workflow/
  ├── index.ts          → dispatcher: routes to forex, cb-rates, cot handlers
  ├── handlers/
  │   ├── forex.ts      → wf_forex_daily_fetch (Yahoo Finance → forex_rates)
  │   ├── cb-rates.ts   → wf_cb_rates_daily (FRED → central_bank_rates)
  │   └── cot.ts        → wf_cot_weekly (CFTC → cot_positioning)
  └── lib/
      ├── ops.ts        → references ops_ingestion_runs, ops_ingestion_errors, ops_dead_letter_queue
      └── maps.ts       → ticker/series/code mappings
```

### React Hooks
```
src/hooks/
  ├── useWorkflowRegistry.ts    → meta_workflow_registry
  ├── useWorkflowStatus.ts      → meta_workflow_registry + ops_ingestion_runs
  ├── useRunLog.ts              → ops_ingestion_runs (filterable)
  ├── useSnapshot.ts            → weekly_anchor_snapshots
  ├── useCBTone.ts              → central_bank_tone (CRUD)
  ├── useGeoRisk.ts             → geo_risk_events (CRUD)
  ├── useConsensusSurvey.ts     → consensus_surveys (CRUD)
  └── useDataExplorer.ts        → 8 silver tables (generic browser)
```

---

*Report generated by automated audit subagent · 2026-05-23*
