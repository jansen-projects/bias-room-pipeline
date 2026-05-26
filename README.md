# The Bias Room — Pipeline Control Room

> Internal ops dashboard for the FSR (Framework Scoring Rules) Forex macro analysis system. Replaces n8n as the primary control layer for a 27-workflow automated market data pipeline.

---

## What This Is

The Bias Room is a Forex macro analysis framework built around a structured scoring system (FSR). This Control Room is the operator-facing dashboard that:

- **Monitors** all 27 data ingestion workflows in real time
- **Triggers** workflow runs manually when needed
- **Logs** every execution with full error visibility
- **Accepts** manual operator inputs (CB tone scores, geo risk flags, consensus surveys)
- **Inspects** the Friday anchor snapshot before the scoring engine reads it Monday

This app replaces n8n's visual workflow builder as the control interface — each n8n workflow will eventually be migrated to a Supabase Edge Function callable directly from this UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS (custom design tokens) |
| Data fetching | TanStack Query (react-query) |
| Routing | React Router v6 |
| Database | Supabase (Postgres 17.6) |
| Auth | Supabase RLS (anon read / service role write) |
| Deployment | Vercel |

---

## Design System

```
Background:       #0B1F3A      /* deep navy */
Card:             #182A4D      /* card surface */
Surface:          #1e3259      /* elevated surface */
Border:           rgba(201,162,74,0.18)
Gold accent:      #C9A24A
Green (success):  #4CAF7D
Red (error):      #E05C5C
Amber (warning):  #E6A817

Font heading:     Fraunces (italic, serif)
Font body:        DM Sans
Font mono:        JetBrains Mono
```

---

## Project Structure

```
src/
├── components/
│   ├── manual/
│   │   ├── CBToneTab.tsx       # CB tone score entry form
│   │   ├── GeoRiskTab.tsx      # Geo risk draft/active panels
│   │   └── ConsensusTab.tsx    # Weekly consensus survey grid
│   ├── WorkflowCard.tsx        # Dashboard workflow status card
│   └── RunLogTable.tsx         # Run log filterable table
├── pages/
│   ├── Dashboard.tsx           # Screen 1 — Pipeline Dashboard
│   ├── RunLog.tsx              # Screen 2 — Run Log Explorer
│   ├── ManualEntry.tsx         # Screen 3 — Manual Entry Hub
│   ├── Snapshot.tsx            # Screen 4 — Friday Snapshot Inspector
│   └── DataExplorer.tsx        # Screen 5 — Data Explorer
├── hooks/
│   ├── useWorkflowStatus.ts    # 27 workflows + latest run status
│   ├── useRunLog.ts            # Filterable run log query
│   ├── useCBTone.ts            # CB tone CRUD
│   ├── useGeoRisk.ts           # Geo risk event management
│   └── useConsensusSurvey.ts   # Weekly consensus upsert
├── lib/
│   └── supabase.ts             # Supabase client setup
└── types/
    └── pipeline.ts             # TypeScript interfaces
```

---

## Database — Table Overview

### Meta Layer
| Table | Purpose |
|---|---|
| `meta_workflow_registry` | 27 workflows with cron, description, SLA |
| `meta_currency_dictionary` | 9 currencies — master reference |
| `meta_series_mapping` | FRED/Yahoo series → table column mapping |
| `meta_source_registry` | API source health + credentials metadata |
| `meta_table_freshness_sla` | Per-table staleness thresholds |

### Bronze Layer
| Table | Purpose |
|---|---|
| `raw_ingestion_payloads` | Raw API responses before transformation |

### Silver Layer (core data)
| Table | Source | Update |
|---|---|---|
| `forex_rates` | Yahoo Finance | Weekdays 22:00 UTC |
| `central_bank_rates` | FRED | Daily 06:00 UTC |
| `central_bank_tone` | Manual operator entry | Event-driven |
| `central_bank_events` | Official CB calendars | Weekly |
| `bond_yields` | FRED + TradingEconomics | Weekdays 22:30 UTC |
| `bond_yields_real` | FRED DFII series | Weekdays 22:30 UTC |
| `breakeven_inflation` | FRED T10YIE | Weekdays 22:30 UTC |
| `cot_positioning` | CFTC FinFutWk.txt | Fridays 22:00 UTC |
| `economic_calendar` | ForexFactory + TE | Daily 04:00 UTC |
| `market_sentiment` | Yahoo Finance | Weekdays 22:00 UTC |
| `gold_context` | FRED + LBMA | Weekdays 22:00 UTC |
| `gold_etf_flows` | ETF.com | Weekdays 23:00 UTC |
| `commodity_prices` | Yahoo + GDT | Weekdays 22:00 UTC |
| `risk_reversal_25d` | CME vol surface | Weekdays 22:15 UTC |
| `inflation_forecasts` | CB sites + IMF | Weekly Monday |
| `intermarket_signals` | Derived nightly | Weekdays 23:30 UTC |
| `geo_risk_events` | Manual (n8n drafts) | Operator-promoted only |
| `geo_risk_status_log` | Derived from geo + market | Weekdays 22:30 UTC |
| `consensus_surveys` | Manual operator entry | Saturdays 18:00 UTC |
| `daily_atr14` | Derived from forex_rates | Weekdays 23:15 UTC |
| `fx_friday_closes` | Derived from forex_rates | Fridays 23:30 UTC |

### Gold Layer
| Table | Purpose |
|---|---|
| `weekly_anchor_snapshots` | ⭐ Friday locked state — what the scoring engine reads Monday |
| `daily_close_snapshots` | Daily vs anchor comparison |

### Ops Layer
| Table | Purpose |
|---|---|
| `ops_ingestion_runs` | Every workflow execution log |
| `ops_ingestion_errors` | Per-error detail with kind + retryability |
| `ops_dead_letter_queue` | Failed records parked for manual review |
| `ops_stale_data_alerts` | Tables exceeding freshness SLA |
| `system_health_logs` | API endpoint health pings |

---

## Screens

### Screen 1 — Pipeline Dashboard `/`
27 workflow cards showing real-time status from `ops_ingestion_runs`. Color-coded health summary banner. "Run Now" button triggers a Supabase Edge Function per workflow.

### Screen 2 — Run Log Explorer `/runs`
Full execution history, filterable by workflow, status, and date range. Drill-down per row shows record counts, error details, and n8n execution ID.

### Screen 3 — Manual Entry Hub `/manual`
Three-tab operator input surface:
- **CB Tone** — Score entry (-2.0 to +2.0) with source verification. Scoring engine only reads `verified_at IS NOT NULL` rows.
- **Geo Risk** — Draft queue → active promotion workflow. Operator-confirmed only.
- **Consensus Survey** — Weekly 9-currency × 5-source grid with auto-computed 4-of-5 uniform consensus flag.

### Screen 4 — Friday Snapshot Inspector `/snapshot`
Reads the current `weekly_anchor_snapshots` row. Highlights missing or stale fields in red. The pre-flight check before Monday scoring.

### Screen 5 — Data Explorer `/data`
Quick read of any silver table. Filter by currency and date range. Spot-check individual data points mid-week.

---

## Workflow Tiers

| Tier | Count | Role |
|---|---|---|
| **Tier 1** | 20 | External API ingestion → silver tables |
| **Tier 2** | 4 | Derived computations (ATR, closes, snapshots) |
| **Tier 3** | 3 | Ops (stale monitor, DLQ retry, health check) |

Tier 2 workflows wait for upstream Tier 1 success before executing. Friday execution order is strict — the anchor snapshot runs last at 23:45 UTC.

---

## Key Business Rules

- **Scoring engine reads `weekly_anchor_snapshots` only** — never live silver tables
- **CB tone rows are invisible to the scoring engine** until `verified_at IS NOT NULL`
- **Geo risk events are never auto-promoted** — operator must manually promote from draft
- **`uniform_consensus`** is a Postgres-generated column — never computed in the frontend
- **Friday anchor snapshot is immutable** once written — never updated, only appended
- **Dead letter queue** holds failed records for manual review — nothing is lost silently

---

## Environment Variables

```bash
# .env.local
VITE_SUPABASE_URL=https://uqszgyftveyoscsslxre.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Build for production
npm run build

# Deploy (Vercel CLI)
vercel --prod
```

---

## Cursor Chat Naming Convention

Each screen has its own Cursor chat to preserve context window:

| Chat Name | Screen | Route |
|---|---|---|
| `TBR-S1-Dashboard` | Pipeline Dashboard | `/` |
| `TBR-S2-RunLog` | Run Log Explorer | `/runs` |
| `TBR-S3-ManualEntry` | Manual Entry Hub | `/manual` |
| `TBR-S4-Snapshot` | Friday Snapshot Inspector | `/snapshot` |
| `TBR-S5-DataExplorer` | Data Explorer | `/data` |

Start every new Cursor chat by pasting the project context block. The `AGENTS.md` file at project root contains the permanent context for auto-pickup.

---

## Build Roadmap

- [x] Screen 1 — Pipeline Dashboard
- [x] Screen 2 — Run Log Explorer
- [ ] Screen 3 — Manual Entry Hub
- [ ] Screen 4 — Friday Snapshot Inspector
- [ ] Screen 5 — Data Explorer
- [ ] Edge Functions — replace n8n workflow by workflow
- [ ] Web verification layer (Sonnet 4.6 auto-check + Opus 4.7 deep audit)
- [ ] Vercel production deployment

---

*The Bias Room — built for one analyst, runs like a trading desk.*