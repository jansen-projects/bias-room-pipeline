# The Bias Room — Pipeline Testing Guide

> **Project:** TBR Data Pipeline (FSR v6.1-FINAL)
> **Scope:** 38 tables · 27 workflows · React Control Room UI
> **Strict rule:** Data only — no scoring, no grading, no output rendering

**Legend:** `[AUTO]` = automatable in CI · `[MANUAL]` = requires human judgment or live service

---

## Test Execution Order (Recommended)

| Order | Category | Prerequisite |
|---|---|---|
| 1st | Cat 8 — Hardening Checklist | None — verify baseline before building |
| 2nd | Cat 7 — Security | Tables and RLS policies must exist |
| 3rd | Cat 1 — DB Schema | Phase 0–3 migrations applied |
| 4th | Cat 2 — Idempotency | Phase 5 Tier 1 handlers deployed |
| 5th | Cat 3 — Error/DLQ | Phase 5 all tiers deployed |
| 6th | Cat 5 — Stale Monitor | Phase 5 Tier 3 + `meta_table_freshness_sla` seeded |
| 7th | Cat 4 — Snapshot Integrity | All Tier 1 + Tier 2 workflows running |
| Last | Cat 6 — React UI | All prior categories passing |

---

## Category 1 — Database Schema Tests

> Run all SQL tests in the Supabase SQL Editor using the **service_role** key unless the test explicitly calls for the anon key. Estimated time per test: 1–3 min.

---

**Test:** UNIQUE constraint enforcement on `forex_rates`  
**Precondition:** `forex_rates` table has `UNIQUE(pair, effective_date, source_code)` applied (Phase 2 ALTER)  
**Steps:**
1. `INSERT INTO forex_rates (pair, effective_date, source_code, rate) VALUES ('EURUSD', '2026-05-23', 'yahoo_finance', 1.0850);`
2. Repeat the identical INSERT.  
**Expected result:** Second INSERT returns `ERROR: duplicate key value violates unique constraint`  
**Failure indicator:** Second INSERT succeeds and a duplicate row appears — dedup layer is broken  
**Automation:** `[AUTO]` — pgTAP test or Supabase RPC

---

**Test:** `is_friday_ny_close` generated column — Friday date  
**Precondition:** `forex_rates.is_friday_ny_close` generated column exists (`EXTRACT(DOW FROM effective_date) = 5`)  
**Steps:**
1. Insert a row with `effective_date = '2026-05-22'` (confirmed Friday)
2. `SELECT is_friday_ny_close FROM forex_rates WHERE pair = 'GBPUSD' AND effective_date = '2026-05-22';`  
**Expected result:** `is_friday_ny_close = true`  
**Failure indicator:** Returns `false` or NULL — generated expression is wrong  
**Automation:** `[AUTO]`

---

**Test:** `is_friday_ny_close` generated column — non-Friday date  
**Precondition:** Same as above  
**Steps:**
1. Insert a row with `effective_date = '2026-05-21'` (Thursday)
2. Query `is_friday_ny_close` for that row  
**Expected result:** `is_friday_ny_close = false`  
**Failure indicator:** Returns `true` for a Thursday  
**Automation:** `[AUTO]`

---

**Test:** `cftc_lag_days` generated column correctness  
**Precondition:** `cot_positioning.cftc_lag_days` generated as `cftc_release_date - report_date`  
**Steps:**
1. `INSERT INTO cot_positioning (currency_code, report_date, cftc_release_date, trader_category) VALUES ('EUR', '2026-05-12', '2026-05-16', 'non_commercial');`
2. `SELECT cftc_lag_days FROM cot_positioning WHERE currency_code = 'EUR' AND report_date = '2026-05-12';`  
**Expected result:** `cftc_lag_days = 4`  
**Failure indicator:** Different value or NULL — formula references wrong columns  
**Automation:** `[AUTO]`

---

**Test:** `is_stale_60d` and `is_stale_120d` generated columns on `bond_yields_real`  
**Precondition:** `bond_yields_real` has `staleness_days int GENERATED`, `is_stale_60d bool GENERATED`, `is_stale_120d bool GENERATED`  
**Steps:**
1. Insert row with `effective_date = CURRENT_DATE - INTERVAL '65 days'` → query both flags
2. Insert row with `effective_date = CURRENT_DATE - INTERVAL '125 days'` → query both flags
3. Insert row with `effective_date = CURRENT_DATE - INTERVAL '30 days'` → query both flags  
**Expected result:** Row 1: `(true, false)` · Row 2: `(true, true)` · Row 3: `(false, false)`  
**Failure indicator:** Any flag doesn't match — likely `staleness_days` uses `now()` vs `CURRENT_DATE`  
**Automation:** `[AUTO]`

---

**Test:** FK referential integrity — invalid `currency_code`  
**Precondition:** `meta_currency_dictionary` seeded with exactly 9 rows. `central_bank_tone.currency_code` has FK to it.  
**Steps:**
1. `INSERT INTO central_bank_tone (currency_code, tone_score, effective_date) VALUES ('XXX', 0.5, CURRENT_DATE);`  
**Expected result:** `ERROR: insert or update on table "central_bank_tone" violates foreign key constraint`  
**Failure indicator:** Insert succeeds — FK was not added or dictionary not seeded  
**Automation:** `[AUTO]`

---

**Test:** RLS — anon key cannot INSERT into `weekly_anchor_snapshots`  
**Precondition:** RLS enabled per `20260520130000_weekly_anchor_snapshots.sql` (anon = SELECT only)  
**Steps:**
1. Using the anon Supabase JS client: `supabase.from('weekly_anchor_snapshots').insert({ snapshot_date: '2026-05-23', payload: {} })`  
**Expected result:** HTTP 403 or Postgres error `42501`. No row inserted.  
**Failure indicator:** Insert succeeds — RLS policy is too permissive  
**Automation:** `[AUTO]` — Vitest unit test using the anon client

---

**Test:** RLS — service_role key can INSERT into all tables  
**Precondition:** Service role key configured  
**Steps:**
1. Using service role client, INSERT test rows into `weekly_anchor_snapshots`, `ops_ingestion_runs`, `central_bank_tone`
2. Verify each row appears; clean up after  
**Expected result:** All INSERTs succeed  
**Failure indicator:** Any INSERT fails — `FOR ALL USING (auth.role() = 'service_role')` policy is missing  
**Automation:** `[AUTO]`

---

**Test:** RLS — anon key can SELECT from `weekly_anchor_snapshots`  
**Precondition:** At least one row exists  
**Steps:**
1. Anon client: `supabase.from('weekly_anchor_snapshots').select('id, snapshot_date').limit(1)`  
**Expected result:** Returns data, no RLS error  
**Failure indicator:** Empty result or error when data exists  
**Automation:** `[AUTO]`

---

## Category 2 — Workflow Idempotency Tests

> Requires Edge Function `trigger-workflow` to be deployed. Estimated time: 3–5 min per test.

---

**Test:** Double-run idempotency — silver table deduplication  
**Precondition:** `wf_forex_daily_fetch` in registry. `forex_rates` has UNIQUE constraint. Edge Function deployed.  
**Steps:**
1. Call `trigger-workflow` with `{ workflow_id: 'wf_forex_daily_fetch' }`. Wait for `status != 'running'`.
2. Note `records_upserted` from Run 1.
3. Call `trigger-workflow` again. Wait for Run 2.
4. Count `forex_rates` rows for `effective_date = CURRENT_DATE` — should be the same as after Run 1.
5. Verify `ops_ingestion_runs` has exactly 2 rows for `wf_forex_daily_fetch` today.  
**Expected result:** Silver table row count does not increase after Run 2 (UPSERT ON CONFLICT updates, does not insert)  
**Failure indicator:** `forex_rates` count doubles — UNIQUE constraint or conflict target is wrong  
**Automation:** `[AUTO]`

---

**Test:** `records_skipped_dedup` increments on second run  
**Precondition:** Same as above. Handler must write `records_skipped_dedup` to `ops_ingestion_runs`.  
**Steps:**
1. Run `wf_forex_daily_fetch` twice on the same day.
2. Query: `SELECT records_skipped_dedup FROM ops_ingestion_runs WHERE workflow_id = 'wf_forex_daily_fetch' ORDER BY started_at DESC LIMIT 1;`  
**Expected result:** `records_skipped_dedup > 0` for Run 2  
**Failure indicator:** `records_skipped_dedup` is NULL — **known gap**: `markRunSuccess` in `ops.ts` does not currently write this column; must be added  
**Automation:** `[AUTO]` once handler is updated

---

**Test:** SHA-256 dedup on `raw_ingestion_payloads`  
**Precondition:** `raw_ingestion_payloads` exists with `payload_sha256` UNIQUE constraint (Phase 1 task)  
**Steps:**
1. Insert a row with `payload = '{"test": 1}'` and `payload_sha256 = encode(digest('{"test": 1}', 'sha256'), 'hex')`
2. Attempt the identical insert again  
**Expected result:** Second insert fails with unique constraint violation or is skipped  
**Failure indicator:** Second row is inserted — SHA-256 UNIQUE constraint is missing  
**Automation:** `[AUTO]` — pure SQL

---

## Category 3 — Error and DLQ Tests

> Estimated time: 5–10 min per test. Tests 3.1 and 3.2 require temporarily modifying a secret.

---

**Test:** Bad API key triggers `ops_ingestion_errors`  
**Precondition:** `wf_cb_rates_daily` implemented. `ops_ingestion_errors` table exists.  
**Steps:**
1. In Supabase Dashboard → Edge Function Secrets, set `FRED_API_KEY = 'INVALID_KEY_TEST'`
2. Call `trigger-workflow` with `{ workflow_id: 'wf_cb_rates_daily' }`
3. Wait for `status = 'failed'`
4. Query `ops_ingestion_errors` for that run_id
5. Restore real `FRED_API_KEY`  
**Expected result:** Row in `ops_ingestion_errors` with `error_kind = 'http_error'` and message referencing `FRED 400` or similar  
**Failure indicator:** `ops_ingestion_errors` is empty — error catch block is not calling `logError`  
> ⚠️ **Known gap:** `logError` in `ops.ts` currently uses `error_kind: 'fetch_error'` — align to `'http_error'` before this test  
**Automation:** `[MANUAL]` (requires secret rotation)

---

**Test:** Max retries → `ops_dead_letter_queue.status = 'manual_review'`  
**Precondition:** `ops_dead_letter_queue` exists. `wf_dlq_retry` implemented with 3-attempt max.  
**Steps:**
1. Insert into DLQ: `status = 'queued'`, `retry_count = 2`, `record = '{"test": true}'`
2. Trigger `wf_dlq_retry`
3. Query: `SELECT status, retry_count FROM ops_dead_letter_queue WHERE id = <inserted_id>;`  
**Expected result:** `status = 'manual_review'`, `retry_count = 3`  
**Failure indicator:** Status remains `'queued'` — max-retry threshold logic is missing  
**Automation:** `[AUTO]`

---

**Test:** `wf_dlq_retry` success path  
**Precondition:** DLQ has a row with `status = 'queued'`, `retry_count = 0`. Underlying issue is resolved.  
**Steps:**
1. Insert a queued DLQ row with a valid replay payload
2. Trigger `wf_dlq_retry`
3. Wait for completion
4. Query `status` on that row  
**Expected result:** `status = 'succeeded'`  
**Failure indicator:** Status becomes `'manual_review'` — success path does not write `'succeeded'`  
**Automation:** `[AUTO]`

---

## Category 4 — Snapshot Integrity Tests

> Estimated time: 5–15 min per test. Tests 4.1 and 4.3 require live workflow execution.

---

**Test:** Friday-only assertion — snapshot date logic is correct  
**Precondition:** `wf_weekly_anchor_snapshot` implemented. `weekly_anchor_snapshots` has `UNIQUE(snapshot_date)`.  
**Steps:**
1. On a non-Friday (e.g. Monday 2026-05-25), manually trigger `wf_weekly_anchor_snapshot`
2. Query: `SELECT snapshot_date FROM weekly_anchor_snapshots ORDER BY created_at DESC LIMIT 1;`  
**Expected result:** A row IS written. `snapshot_date` equals the most recent Friday (2026-05-22), not the run date. The workflow determines anchor date from `MAX(effective_date) WHERE is_friday_ny_close = true` — not `CURRENT_DATE`.  
**Failure indicator:** No row written (overly strict date guard); or `snapshot_date = CURRENT_DATE` on a non-Friday (wrong date logic)  
**Automation:** `[MANUAL]`

---

**Test:** Field completeness — all payload sections non-null after Tier 1 success  
**Precondition:** All 20 Tier 1 workflows ran successfully today.  
**Steps:**
1. Confirm all Tier 1 `ops_ingestion_runs.status = 'success'` for today
2. Trigger `wf_weekly_anchor_snapshot`
3. Query: `SELECT payload FROM weekly_anchor_snapshots ORDER BY created_at DESC LIMIT 1;`
4. Verify each key is present and non-empty: `fx_closes`, `cb_rates`, `cb_tone`, `bond_yields`, `cot`, `volatility`, `indices`, `geo_flags`, `consensus`
5. Verify `data_quality_flags = '{}'`  
**Expected result:** All 9 sections present and non-empty. `data_quality_flags` is empty.  
**Failure indicator:** Any key is missing or `[]`/`null`; or `data_quality_flags` contains entries when all Tier 1 ran successfully  
**Automation:** `[AUTO]` — SQL: `SELECT payload ? 'fx_closes' AND payload ? 'cb_rates' ... FROM weekly_anchor_snapshots ORDER BY created_at DESC LIMIT 1`

---

**Test:** `data_quality_flags` populated when one Tier 1 workflow fails  
**Precondition:** `wf_weekly_anchor_snapshot` has the upstream-check / degraded-write logic.  
**Steps:**
1. Intentionally break `wf_cb_rates_daily` (set invalid `FRED_API_KEY`)
2. Trigger `wf_cb_rates_daily` → confirm `status = 'failed'`
3. Trigger `wf_weekly_anchor_snapshot`
4. Query `data_quality_flags` from the latest snapshot row  
**Expected result:** A row IS written. `data_quality_flags` contains an entry referencing `wf_cb_rates_daily` or `central_bank_rates` as missing. Never silently degrades.  
**Failure indicator:** Snapshot not written (workflow aborts on failure); or `data_quality_flags = {}` despite failed upstream  
**Automation:** `[MANUAL]`

---

**Test:** Snapshot immutability — locked row cannot be updated  
**Precondition:** A Postgres `BEFORE UPDATE` trigger or RLS policy exists to block UPDATEs when `is_locked = true`  
> ⚠️ **Known gap:** The current migration does NOT include an immutability trigger — must be added in Phase 4 hardening  
**Steps:**
1. SET a snapshot row to `is_locked = true`
2. Attempt: `UPDATE weekly_anchor_snapshots SET payload = '{"tampered": true}' WHERE is_locked = true;`  
**Expected result:** UPDATE rejected. Zero rows affected.  
**Failure indicator:** UPDATE succeeds and payload is overwritten — immutability guard is missing  
**Automation:** `[AUTO]` once trigger/policy is implemented

---

## Category 5 — Stale Data Monitor Tests

> Requires `wf_stale_data_monitor` and `meta_table_freshness_sla` (Phase 5 Tier 3). Estimated time: 3–5 min per test.

---

**Test:** Alert created for stale `forex_rates` data  
**Precondition:** `meta_table_freshness_sla` has a row for `forex_rates` with a `stale_after_minutes` threshold. `ops_stale_data_alerts` exists.  
**Steps:**
1. Insert into `forex_rates` with `effective_date = CURRENT_DATE - INTERVAL '30 days'` using a unique test pair
2. Trigger `wf_stale_data_monitor`
3. Query `ops_stale_data_alerts` for `table_name = 'forex_rates'`  
**Expected result:** Alert row present with `actual_age_minutes > 43200` (30 days) and appropriate `severity`  
**Failure indicator:** No alert created — monitor is not evaluating the table or not writing to `ops_stale_data_alerts`  
**Automation:** `[AUTO]`

---

**Test:** Alert severity escalation at correct thresholds  
**Precondition:** `meta_table_freshness_sla` defines warning / error / critical escalation multipliers.  
**Steps:**
1. Insert three test rows into `forex_rates` with ages just over (a) warning threshold, (b) error threshold, (c) critical threshold — using unique pair names `TEST_W`, `TEST_E`, `TEST_C`
2. Trigger `wf_stale_data_monitor`
3. Query `ops_stale_data_alerts` for these three pairs  
**Expected result:** (a) `severity = 'warning'` · (b) `severity = 'error'` · (c) `severity = 'critical'`  
**Failure indicator:** All three get the same severity — escalation logic is not reading threshold multiples from `meta_table_freshness_sla`  
**Automation:** `[AUTO]`

---

## Category 6 — React UI Tests

> Tests 6.1–6.4 can be automated with Playwright. Tests 6.5–6.9 are primarily manual. Estimated time: 2–5 min per test.

---

**Test:** Dashboard — card count matches `meta_workflow_registry` row count  
**Precondition:** App running. Registry seeded with all 27 rows.  
**Steps:**
1. Navigate to `/`; wait for loading to clear
2. Count rendered workflow cards
3. Query: `SELECT COUNT(*) FROM meta_workflow_registry;`  
**Expected result:** Card count = 27  
**Failure indicator:** Count mismatch — `useWorkflowStatus` is filtering or registry is not fully seeded  
**Automation:** `[AUTO]` — Playwright: `page.locator('article').count()`

---

**Test:** Dashboard — "Run Now" button creates row in `ops_ingestion_runs`  
**Precondition:** `wf_forex_daily_fetch` card visible. Edge Function deployed.  
**Steps:**
1. Note current count of `ops_ingestion_runs` for `wf_forex_daily_fetch`
2. Click the "Run now" button on that card; wait for button to reset
3. Query `ops_ingestion_runs` count again  
**Expected result:** Count increased by 1. Card "Last run" timestamp updates. No inline error.  
**Failure indicator:** Count unchanged; or card shows `already_running` / `workflow_not_found` error  
**Automation:** `[AUTO]` — Playwright

---

**Test:** Run Log — status filter returns only matching rows  
**Precondition:** `ops_ingestion_runs` has rows with mixed statuses. At least one `failed` row exists.  
**Steps:**
1. Navigate to `/runs`
2. Set Status filter to "failed"
3. Inspect all visible rows  
**Expected result:** Every row shows `failed` status  
**Failure indicator:** Other statuses appear — `useRunLog` filter is not applied  
**Automation:** `[AUTO]` — Playwright

---

**Test:** Run Log — date range filter excludes out-of-range rows  
**Precondition:** Rows spanning multiple days exist.  
**Steps:**
1. Navigate to `/runs`
2. Set both "Date From" and "Date To" to yesterday's date
3. Inspect visible rows  
**Expected result:** Only rows with `started_at` within yesterday (00:00–23:59 UTC) appear  
**Failure indicator:** Today's or older rows appear — `useRunLog` `.gte`/`.lte` filters not applied correctly  
**Automation:** `[AUTO]` — Playwright

---

**Test:** Snapshot page — date picker shows all snapshot dates  
**Precondition:** At least 2 rows in `weekly_anchor_snapshots`.  
**Steps:**
1. Navigate to `/snapshot`; open the "Anchor week" select
2. Count options; compare to `SELECT COUNT(*) FROM weekly_anchor_snapshots;`  
**Expected result:** Option count = DB row count  
**Failure indicator:** Mismatch — `useSnapshotDates` not returning all rows  
**Automation:** `[AUTO]` — Playwright

---

**Test:** Snapshot page — all 9 section cards render with data  
**Precondition:** A snapshot row exists with all 9 payload keys non-empty.  
**Steps:**
1. Navigate to `/snapshot`; select the known-good date
2. Visually confirm all 9 section cards: FX Closes, CB Rates, CB Tone, Bond Yields, COT Positioning, Volatility (ATR-14), Market Indices, Geo Risk Flags, Consensus Survey
3. Confirm no red "MISSING" badges appear where data was provided  
**Expected result:** All 9 sections visible with data. "Preflight" banner shows green.  
**Failure indicator:** Any card missing or all-MISSING badges — `SnapshotSections` not receiving payload data  
**Automation:** `[MANUAL]` (visual) / `[AUTO]` for heading presence via Playwright

---

**Test:** Manual Entry CB Tone — form submission inserts row  
**Precondition:** `central_bank_tone` table exists. App user has INSERT permission.  
**Steps:**
1. Navigate to `/manual` → CB Tone tab
2. Select currency = EUR, score = 1.0, fill Source 1, Source 2, Trigger Event, today's date
3. Submit
4. `SELECT currency_code, tone_score, tone_label FROM central_bank_tone ORDER BY created_at DESC LIMIT 1;`  
**Expected result:** Row with `currency_code = 'EUR'`, `tone_score = 1.0`, `tone_label = 'Mildly Hawkish'`  
**Failure indicator:** No row inserted — check browser console for Supabase error  
**Automation:** `[MANUAL]`

---

**Test:** Manual Entry Geo Risk — "Promote" changes status draft → active  
**Precondition:** At least one `geo_risk_events` row with `status = 'draft'`.  
**Steps:**
1. Navigate to `/manual` → Geo Risk tab
2. Find a draft event card; click "Promote"
3. `SELECT status, promoted_at FROM geo_risk_events WHERE id = '<event_id>';`  
**Expected result:** `status = 'active'`, `promoted_at` is a recent timestamp  
**Failure indicator:** Status remains `'draft'` — `promoteEvent` in `useGeoRisk` returning an error  
**Automation:** `[MANUAL]`

---

**Test:** Data Explorer — table picker fetches rows  
**Precondition:** At least one row exists in each of the 8 tables listed in `useDataExplorer.ts`.  
**Steps:**
1. Navigate to `/data`
2. Select "forex_rates" from the table picker; verify rows and columns
3. Repeat for 2 other tables  
**Expected result:** Each table returns rows with schema-appropriate column headers. No error banner.  
**Failure indicator:** Empty grid or error — anon RLS blocking SELECT, or table names don't match after Phase 2 renames  
> ⚠️ After Phase 2 renames, update `SILVER_TABLES` in `useDataExplorer.ts`: `bond_yields` → `bond_yields_nominal`, `market_sentiment` → `market_indices`  
**Automation:** `[MANUAL]`

---

## Category 7 — Security Tests

> Estimated time: 2–3 min per test.

---

**Test:** Anon key SELECT on read-permitted tables  
**Precondition:** Rows exist in `weekly_anchor_snapshots`, `ops_ingestion_runs`, `meta_workflow_registry`  
**Steps:** Using anon client, run SELECT on all three tables  
**Expected result:** All three return data without errors  
**Failure indicator:** Permission error — anon SELECT policy missing  
**Automation:** `[AUTO]`

---

**Test:** Anon key INSERT rejected on `central_bank_tone`  
**Precondition:** Per Phase 7 spec, INSERT requires authenticated operator (not anon)  
**Steps:** Anon client: `supabase.from('central_bank_tone').insert({ currency_code: 'USD', tone_score: 0, effective_date: CURRENT_DATE })`  
**Expected result:** HTTP 403 or RLS error. No row inserted.  
**Failure indicator:** Insert succeeds — RLS policy for `central_bank_tone` is too permissive  
**Automation:** `[AUTO]`

---

**Test:** Edge Function rejects unauthenticated call  
**Precondition:** `trigger-workflow` Edge Function deployed  
**Steps:**
1. `curl -X POST <SUPABASE_URL>/functions/v1/trigger-workflow -d '{"workflow_id":"wf_forex_daily_fetch"}'` (no Authorization header)  
**Expected result:** HTTP 401 — function does not execute  
**Failure indicator:** HTTP 200 or 422 — function is deployed with `--no-verify-jwt`; unauthenticated callers can invoke workflows  
**Automation:** `[AUTO]` — `curl` command in CI

---

## Category 8 — Production Hardening Checklist

> All manual. Estimated time: 15 min total.

---

**Test:** API keys stored in n8n credential vault — not hardcoded  
**Steps:** In n8n, open every HTTP Request node in every ingestion workflow. Inspect for literal key values.  
**Expected result:** All keys referenced as `{{ $credentials.xxx.apiKey }}` expressions — never a hardcoded string  
**Failure indicator:** Any literal key string found in a node  
**Automation:** `[MANUAL]`

---

**Test:** `VITE_SUPABASE_ANON_KEY` is the public-safe anon key  
**Steps:**
1. Copy `VITE_SUPABASE_ANON_KEY` from `.env.local`
2. Compare against Supabase Dashboard → Settings → API → "anon / public" key (NOT "service_role")  
**Expected result:** Values match exactly. Service role key is NOT in `.env.local`.  
**Failure indicator:** `VITE_SUPABASE_ANON_KEY` matches the service_role key — critical security vulnerability; rotate immediately  
**Automation:** `[MANUAL]`

---

**Test:** Service role key is not committed to git  
**Steps:**
1. `git log --all -p -- .env.local .env .env.production 2>/dev/null | grep -i "service_role"`
2. `grep -r "service_role" src/ --include="*.ts" --include="*.tsx"`  
**Expected result:** Both commands return no output  
**Failure indicator:** Any match — rotate the service role key immediately  
**Automation:** `[AUTO]` — add as pre-commit hook via `git-secrets` or `detect-secrets`

---

**Test:** `supabase/.temp/` is in `.gitignore`  
**Steps:** `grep "supabase/.temp" .gitignore`  
**Expected result:** Entry found  
**Failure indicator:** Missing — currently NOT in `.gitignore`. Add this line: `supabase/.temp/`  
**Automation:** `[AUTO]` — `grep "supabase/.temp" .gitignore || exit 1` in CI

---

## Known Gaps Found During Audit

These issues in the current codebase will cause specific tests to fail until resolved:

| # | Gap | Affects | Fix |
|---|---|---|---|
| 1 | `logError` in `ops.ts` writes `error_kind: 'fetch_error'` but spec calls for `'http_error'`, `'parse_error'`, `'timeout'`, `'validation_failed'` | Cat 3.1 | Align enum in `ops.ts` |
| 2 | `markRunSuccess` does not write `records_skipped_dedup` — UPSERT count not tracked | Cat 2.2 | Add pre/post COUNT query or Postgres function return |
| 3 | `supabase/.temp/` missing from `.gitignore` | Cat 8.4 | Add `supabase/.temp/` to `.gitignore` |
| 4 | `weekly_anchor_snapshots` migration has no immutability trigger on locked rows | Cat 4.4 | Add `BEFORE UPDATE` Postgres trigger |
| 5 | `useDataExplorer.ts` references `bond_yields` and `market_sentiment` — will break after Phase 2 renames | Cat 6.9 | Update `SILVER_TABLES` const after renames |

---

*Generated by automated subagent · 2026-05-23 · FSR v6.1-FINAL*
