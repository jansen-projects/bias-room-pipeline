# The Bias Room — Pipeline Control Room
## Operator Instructions

---

## What This App Is

The Pipeline Control Room is the **backend interface for The Bias Room**. It does not produce trade signals or bias scores — that is done separately. This app's job is to:

1. **Ingest** raw market data from external sources automatically every day
2. **Monitor** that data is fresh, complete, and healthy
3. **Snapshot** the macro state every Friday as a W-series anchor
4. **Alert** you when something goes wrong or data goes stale
5. **Accept** manual operator inputs that cannot be automated (CB tone, consensus surveys, geo risk)

Everything runs automatically via a scheduler. You should only need to open this app to check on things, resolve alerts, or enter manual data.

---

## The Data Pipeline — How It Works

Data flows through three tiers, in order:

```
TIER 1 — External sources (raw data ingested from APIs)
    ↓
TIER 2 — Derived calculations (computed from Tier 1)
    ↓
TIER 3 — Operations (monitors Tier 1 + 2 for problems)
```

### Tier 1 — Raw Ingestion (runs automatically)
| Workflow | What it fetches | Schedule |
|---|---|---|
| `wf_forex_daily_fetch` | FX rates + OHLC for 8 pairs (ECB + Yahoo Finance) | 22:00 UTC weekdays |
| `wf_cb_rates_daily` | Central bank policy rates (FRED + OECD) | 06:00 UTC daily |
| `wf_cot_weekly` | CFTC commitment of traders positioning | 22:00 UTC Fridays |
| `wf_market_indices_daily` | VIX, DXY, SPX, NASDAQ | 22:00 UTC weekdays |
| `wf_commodities_daily` | Gold, oil, copper prices | 22:00 UTC weekdays |
| `wf_gold_context_daily` | Gold-specific indicators (ETF flows, real yield) | 22:00 UTC weekdays |
| `wf_economic_calendar_daily` | Upcoming economic events (ForexFactory) | 04:00 UTC daily |
| `wf_bond_yields_nominal_daily` | 2Y/10Y government bond yields | 22:30 UTC weekdays |
| `wf_real_yields_daily` | US real yields (FRED TIPS) | 22:30 UTC weekdays |
| `wf_breakeven_daily` | Breakeven inflation rates | 22:30 UTC weekdays |
| `wf_inflation_forecasts_weekly` | CPI forecasts per country (World Bank) | 07:00 UTC Mondays |

### Tier 2 — Derived Calculations (runs after Tier 1)
| Workflow | What it computes | Schedule |
|---|---|---|
| `wf_compute_atr14_daily` | ATR-14 volatility measure per FX pair | 23:15 UTC weekdays |
| `wf_fx_friday_close_snapshot` | 52-week Friday close history + returns | 23:30 UTC Fridays |
| `wf_daily_close_snapshot` | Intraday snapshot vs Friday anchor | 23:30 UTC weekdays |
| `wf_weekly_anchor_snapshot` | Full W-series macro state (9 sections) | 23:45 UTC Fridays |

### Tier 3 — Operations (monitors everything)
| Workflow | What it does | Schedule |
|---|---|---|
| `wf_stale_data_monitor` | Checks if any table hasn't been updated within SLA | Every 15 min, weekdays |
| `wf_dlq_retry` | Retries failed runs that are queued for retry | Every 6 hours |
| `wf_health_check_hourly` | Pings all 7 external data sources | Every hour |

---

## The Interface — Page by Page

### Dashboard `/`
**What it shows:** The health of all 18 workflows at a glance.

Each card shows a workflow's name, last run time, and status. The header shows how many workflows are healthy out of 18.

**Status meanings:**
- 🟢 **Success** — Last run completed without errors
- 🔴 **Failed** — Last run hit an error (check `/ingestion` for details)
- 🟡 **Running** — Currently executing
- ⚫ **Skipped** — Run was intentionally skipped (e.g. no new data available)
- **No runs yet** — Workflow has never been triggered

**What to do here:** Use this as your morning check. If all 18 are green, the pipeline is healthy. If any are red, investigate.

---

### Ingestion Runs `/ingestion`
**What it shows:** A detailed log of every pipeline run — timestamps, duration, records processed, and errors.

Click any row to expand it and see the full error message, record counts (fetched vs upserted vs dedup-skipped), and run ID.

**Filters:** You can filter by workflow name or status (success / failed / running / skipped).

**What to look for:**
- `records_upserted = 0` with `status = success` — the run worked but found no new data (normal on weekends or if data source had nothing new)
- `error_count > 0` — the run partially succeeded but logged errors for some records
- Repeated failures on the same workflow — investigate the data source

---

### Stale Alerts `/alerts`
**What it shows:** Alerts fired when a table hasn't been updated within its SLA threshold.

Each alert has a **severity** and shows the **actual age** of the data vs the **threshold** that triggered it.

**Severity meanings:**
- 🔴 **Critical** — Data is significantly overdue (e.g. 2× the warning threshold)
- 🟡 **Warning** — Data is past the warning window but not yet critical

**What to do:**
- If the alert is from a weekend — it's expected, not a real problem. Click **Resolve**.
- If it's a weekday alert — check `/sources` to see if the upstream data source is down, then check `/ingestion` to see if the workflow failed.
- **Resolve all** clears all current alerts at once (useful after a known outage is fixed).

**Expected behaviour:** On Monday mornings you will see a batch of warning alerts from the weekend. This is normal — resolve them and move on.

---

### Data Sources `/sources`
**What it shows:** The health of the 7 external data sources the pipeline depends on, based on hourly canary checks.

| Source | What it provides |
|---|---|
| FRED | US CB rates, real yields, breakeven inflation |
| Yahoo Finance | FX OHLC, gold price, market indices, commodities |
| CFTC | COT positioning data (weekly) |
| ForexFactory | Economic calendar events |
| ECB | Euro area bond yield data |
| Bank of Canada | Canadian bond yields |
| World Bank | CPI inflation forecasts |

**Status meanings:**
- 🟢 **Healthy** — No issues in recent checks
- 🟡 **Warning** — Timeout or transient error (usually self-resolving)
- 🔴 **Critical** — HTTP 5xx or connection failure (data may be stale)
- ⚫ **Unknown** — No checks recorded yet

**Note on FRED warnings:** FRED occasionally triggers a false warning due to an HTTP/2 stream error from the Supabase Edge Function network. This is a network infrastructure issue, not a real FRED outage. The actual FRED data handlers work fine regardless.

**Note on CFTC:** The CFTC CDN blocks automated HEAD requests with HTTP 403. This is treated as "alive" — not an outage.

---

### Friday Snapshot `/snapshot`
**What it shows:** The weekly W-series anchor snapshot — the full macro state captured every Friday at 23:45 UTC.

This is the reference point for the week's trading. It contains:
- **Section 1:** FX Friday closes + ATR-14 + 52-week range
- **Section 2:** Central bank policy rates
- **Section 3:** COT positioning
- **Section 4:** Bond yields (2Y nominal, real yields, breakeven)
- **Section 5:** Market indices (VIX, DXY, SPX, NASDAQ)
- **Section 6:** Commodities (gold, oil, copper)
- **Section 7:** Inflation forecasts
- **Section 8:** Consensus surveys (operator-entered)
- **Data quality flags:** Known caveats for the week's snapshot

**Expectations:**
- The snapshot is created automatically every Friday night
- It will be empty/minimal if run on a non-Friday (Friday closes won't be populated)
- `is_locked = false` at creation — the operator can lock it after review to prevent accidental overwrites

---

### Manual Entry `/manual`
**What it shows:** Three tabs for data that cannot be automated — it requires operator judgment.

#### CB Tone Tab
Enter the central bank tone score for each currency after each major central bank meeting or statement. Tone scores feed directly into the FSR F-layer calculations.

| Score | Label | Meaning |
|---|---|---|
| +2.0 | Strong Hawk | Active hiking cycle, strong inflation language |
| +1.5 | Hawk | Hawkish bias, rate hike likely |
| +0.5 | Neutral-Hawk | Leaning hawkish but on hold |
| 0 | Neutral | No clear bias |
| -0.5 | Neutral-Dove | Leaning dovish, cut possible |
| -1.0 | Dove | Easing bias, cut expected |
| -2.0 | Strong Dove | Active cutting cycle |

**When to update:** After each central bank meeting, press conference, or significant speech that changes the forward guidance.

#### Consensus Surveys Tab
Enter the weekly media consensus direction (Bullish / Neutral / Bearish) per currency from five sources: Reuters, FT, Bloomberg, Economist, WSJ.

**When to update:** Once per week, before the weekly anchor snapshot is locked.

#### Geo Risk Tab
Log active geopolitical risk events that affect FX markets (wars, sanctions, trade disputes, political crises).

**When to update:** When a new risk event begins, when the status changes (active → resolved), or when the severity changes.

---

### Run Log `/runs`
**What it shows:** All pipeline runs with filtering by workflow, status, and date range. Similar to `/ingestion` but with date filtering for historical lookups.

Use this when you need to look back further in history (e.g. "did the COT workflow run successfully 3 weeks ago?").

---

### Data Explorer `/data`
**What it shows:** A raw table browser for exploring the actual data stored in the database.

Use this to verify specific values — e.g. check what the latest EURUSD rate is, or what COT net position was recorded for AUD last week.

---

### Settings `/settings`
**What it shows:** Two sections:

#### Freshness SLA Thresholds
Controls when the stale data monitor fires alerts. Each table has a:
- **Warning after** — minutes before a warning alert is raised
- **Critical after** — minutes before a critical alert is raised
- **Active** — toggle to disable monitoring for a specific table

Click **Edit** on any row to adjust thresholds. Changes take effect on the next monitor run (within 15 minutes).

**Default thresholds:**
- Daily tables (forex, indices): warn after 1440 min (24h), critical after 2880 min (48h)
- Weekly tables (COT, inflation): warn after 10080 min (7 days)

#### Pipeline Schedule
A reference panel showing when each of the 18 workflows runs automatically. Read-only — schedules are managed in the database via pg_cron.

---

## What Requires Operator Action

The pipeline is fully automated except for these:

| Task | Where | Frequency |
|---|---|---|
| Enter CB tone scores | `/manual` → CB Tone | After each central bank meeting |
| Enter consensus surveys | `/manual` → Consensus | Weekly (before Friday snapshot) |
| Log/update geo risk events | `/manual` → Geo Risk | As events occur |
| Resolve stale alerts | `/alerts` | Monday mornings + after outages |
| Lock the weekly snapshot | Supabase dashboard | After reviewing Friday snapshot |

---

## Known Limitations

| Limitation | Impact | When it resolves |
|---|---|---|
| **XAUUSD ATR-14 not computed** | Gold has no ATR-14 in snapshot | After 14 consecutive days of Yahoo OHLC data accumulate (~3 weeks from pipeline start) |
| **USDCAD 12-week return is null** | return_12w missing for USDCAD | After 12 Fridays of clean data (≈ Aug 2026) |
| **AUD/CHF/NZD/JPY CB rates lag by 4–8 weeks** | Rates from OECD monthly series, not official source | Ongoing — flagged in DQ warnings on each snapshot |
| **CB tone is empty until entered** | tone = null in all snapshots | After operator enters values in `/manual` |
| **Friday snapshot empty on non-Fridays** | friday_close = null if snapshot triggered manually | By design — pg_cron runs it at 23:45 UTC Fridays |

---

## What "Healthy" Looks Like

On a normal weekday morning you should see:

- Dashboard: all 18 workflows green (last run within 24h)
- Alerts: 0 unresolved critical alerts
- Sources: all 7 sources healthy
- Ingestion: last 10 runs all `success`

On a Monday morning you should see:

- Dashboard: still green (runs completed Friday)
- Alerts: several weekend staleness warnings — **resolve them**
- Sources: healthy (health checks run hourly all weekend)
- Ingestion: last run was Friday night

On a Friday evening (after 23:45 UTC) you should see:

- A new row in `/snapshot` with the week's W-series anchor
- `wf_fx_friday_close_snapshot` and `wf_weekly_anchor_snapshot` both successful
- Review the snapshot and lock it if satisfied

---

*Last updated: 2026-05-26*
