# The Bias Room — Pipeline Control Room

## Stack
- React + Vite + Tailwind CSS
- Supabase JS client (anon key in frontend)
- TanStack Query (all DB reads go through hooks)
- React Router

## Supabase
- Project: Forex Macro
- URL: https://uqszgyftveyoscsslxre.supabase.co
- Edge Function: `trigger-workflow` (single function, 18 workflow IDs dispatched by `workflow_id`)

### Key tables
| Table | Purpose |
|---|---|
| `meta_workflow_registry` | 18 registered workflows with cron schedules |
| `ops_ingestion_runs` | Every pipeline run (status, timestamps, record counts) |
| `ops_ingestion_errors` | Per-run error rows |
| `ops_stale_data_alerts` | Fired when a table hasn't been updated within SLA |
| `ops_dead_letter_queue` | Failed runs queued for retry |
| `system_health_logs` | Per-source health check results (7 external sources) |
| `meta_table_freshness_sla` | Warning/critical thresholds per table |
| `weekly_anchor_snapshots` | Friday W-series anchor payloads (9-section JSONB) |
| `daily_close_snapshots` | Daily intraday snapshot vs Friday anchor |
| `forex_rates` | FX OHLC + ECB rates (8 pairs) |
| `central_bank_rates` | CB policy rates — FRED (canonical) + OECD monthly (non-canonical) |
| `cot_positioning` | CFTC commitment of traders |
| `daily_atr14` | ATR-14 per pair (GENERATED cols: warning_threshold, critical_threshold) |
| `fx_friday_closes` | 52-week Friday close history per pair |

### Deprecated tables (do not use)
- `system_logs` — deprecated, use `system_health_logs`
- `weekly_bias_reports` — dropped

## Design System
- bg: `#0B1F3A`
- card: `#182A4D`
- surface: `#1e3259`
- detail: `#0a1628`
- gold: `#C9A24A`
- success: `#4CAF7D`
- error: `#E05C5C`
- warning: `#E6A817`
- Fonts: Fraunces (display) / DM Sans (sans) / JetBrains Mono (mono)
- Use Tailwind tokens always — never raw hex values

## Screens
1. Dashboard — `/`
2. Run Log — `/runs`
3. Manual Entry — `/manual` (CB tone, consensus surveys, geo risk)
4. Friday Snapshot — `/snapshot`
5. Data Explorer — `/data`
6. Ingestion Runs — `/ingestion`
7. Stale Alerts — `/alerts`
8. Data Sources — `/sources`
9. Settings — `/settings` (SLA threshold editor)

## Rules
- Never hardcode colors — use Tailwind custom tokens
- All DB queries go through TanStack Query hooks in `/hooks`
- No scoring logic in this app — data display only
- Match the gold/navy design system on every component
- RLS: anon key = SELECT only; service role key = never exposed to frontend

## Known Gotchas

### GENERATED columns in daily_atr14
`warning_threshold` and `critical_threshold` are `GENERATED ALWAYS AS` columns.
Never include them in INSERT/UPSERT payloads — Postgres will error.

### FX rate convention
- Yahoo Finance `CAD=X` = USD/CAD (~1.38) ✅
- `CADUSD=X` = inverted CAD/USD (~0.72) ❌ — do not use
- JPY=X, CHF=X follow the same USD-base convention as CAD=X

### CB rates — canonical vs OECD
- FRED-sourced rows: `is_canonical=true` (daily, authoritative)
- AUD/CHF/NZD/JPY also have OECD monthly rows: `is_canonical=false` (may lag 4–8 weeks)
- Use `WHERE is_canonical=true` when you want the most authoritative rate

### markRunSuccess in ops.ts
Signature: `markRunSuccess(sb, runId, fetched, upserted, errorMessage, skipped)`
If `errorMessage` is non-null the run status becomes `'failed'` even if records were written.
Pass `null` for expected/informational skips — only pass a string for genuine errors.

### Weekly anchor snapshot runs on Fridays only
`friday_close` fields will be null if the snapshot is triggered on any other day.
This is by design — pg_cron fires it at 23:45 UTC every Friday.
