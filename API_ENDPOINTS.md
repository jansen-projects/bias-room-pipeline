# API Endpoints Reference
> Tested: 2026-05-23 | All curl tests run from local machine  
> Status: FINAL — all sources confirmed before handler development begins

---

## Supabase Secrets (already added)
| Secret name | Value | Used by |
|---|---|---|
| `FRED_API_KEY` | `490e9a95...` | bond yields, real yields, breakeven, fed funds |
| `TWELVE_DATA_API_KEY` | `d511fce2...` | reserved — limited bond coverage (see below) |

---

## ✅ SOURCE 1 — Yahoo Finance
**No key required**  
**Base URL:** `https://query1.finance.yahoo.com`  
**Endpoint:** `GET /v8/finance/chart/{ticker}?interval=1d&range=5d`  
**Required header:** `User-Agent: Mozilla/5.0`  
**Latest value:** `chart.result[0].indicators.quote[0].close[-1]`  
**Timestamp:** `chart.result[0].timestamp[-1]` (Unix epoch → convert to date)

### Confirmed tickers
| Handler | Ticker | Description |
|---|---|---|
| `wf_forex_daily_fetch` | `EURUSD=X` | EUR/USD |
| | `GBPUSD=X` | GBP/USD |
| | `USDJPY=X` | USD/JPY |
| | `USDCHF=X` | USD/CHF |
| | `USDCAD=X` | USD/CAD |
| | `AUDUSD=X` | AUD/USD |
| | `NZDUSD=X` | NZD/USD |
| | `XAUUSD=X` | Gold/USD spot |
| `wf_market_indices_daily` | `DX-Y.NYB` | DXY Dollar Index |
| | `^GSPC` | S&P 500 |
| | `^VIX` | VIX Volatility |
| | `^IXIC` | Nasdaq Composite |
| `wf_commodities_daily` | `GC=F` | Gold futures |
| | `CL=F` | WTI Crude Oil |
| | `HG=F` | Copper futures |
| `wf_gold_context_daily` | `GC=F` | Gold spot proxy |
| | `DX-Y.NYB` | DXY |
| `wf_gold_etf_flows_daily` | `GLD` | SPDR Gold Shares (price only) |
| | `IAU` | iShares Gold Trust (price only) |
| | `PHYS` | Sprott Physical Gold (price only) |

> ⚠️ **ETF flows gap:** Yahoo does not return `sharesOutstanding` or `totalAssets` for ETFs.  
> `daily_flow_usd` and `flow_5d_usd` cannot be computed. **Handler deferred.**

---

## ✅ SOURCE 2 — FRED (Federal Reserve Economic Data)
**Key required:** `FRED_API_KEY` ✅ added to Supabase secrets  
**Base URL:** `https://api.stlouisfed.org/fred`  
**Endpoint:** `/series/observations?series_id={id}&api_key={key}&limit=2&sort_order=desc&file_type=json`  
**Latest value:** `observations[0].value` (string — parse to float)  
**Previous value:** `observations[1].value`  
**Date:** `observations[0].date` (YYYY-MM-DD string)

> ⚠️ FRED may return `"."` instead of a number on weekends/holidays. Always check `value !== "."` before parsing.

### Daily series (current data)
| Series ID | Description | Handler | Latest tested |
|---|---|---|---|
| `DGS2` | USD 2Y nominal yield | `wf_bond_yields_nominal_daily` | 4.08% (2026-05-21) |
| `DGS10` | USD 10Y nominal yield | `wf_bond_yields_nominal_daily` | 4.57% (2026-05-21) |
| `DFII5` | USD 5Y real yield (TIPS) | `wf_real_yields_daily` | 1.68% (2026-05-21) |
| `DFII10` | USD 10Y real yield (TIPS) | `wf_real_yields_daily` | 2.18% (2026-05-21) |
| `T5YIE` | 5Y breakeven inflation | `wf_breakeven_daily` | 2.54% (2026-05-22) |
| `T10YIE` | 10Y breakeven inflation | `wf_breakeven_daily` | 2.40% (2026-05-22) |
| `DFF` | Fed Funds Rate (effective) | `wf_gold_context_daily` | 3.62% (2026-05-21) |

### Monthly series — fallback for GBP/AUD/NZD/CHF (4–6 week lag)
| Series ID | Currency | Tenor | Last date |
|---|---|---|---|
| `IRLTLT01GBM156N` | GBP | 10Y | 2026-04-01 |
| `IRLTLT01AUM156N` | AUD | 10Y | 2026-04-01 |
| `IRLTLT01NZM156N` | NZD | 10Y | 2026-04-01 |
| `IRLTLT01CHM156N` | CHF | 10Y | 2026-04-01 |

> These are OECD data sourced via FRED. Updated ~monthly. Acceptable for weekly bias signal — yield levels don't move dramatically week-to-week for these currencies. Flagged as `priority = 2` in `meta_series_mapping`.

---

## ✅ SOURCE 3 — ECB Statistical Data Warehouse
**No key required**  
**Base URL:** `https://data-api.ecb.europa.eu/service/data`  
**Endpoint:** `/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_{tenor}?format=jsondata&lastNObservations=2`  
**Required header:** `Accept: application/json`

**Parsing:**
```
series key  = dataSets[0].series — take first key
observations = series[key].observations
dates        = structure.dimensions.observation[0].values[i].id
value        = observations[i][0]
```

| Tenor param | Description | Latest tested |
|---|---|---|
| `SR_2Y` | EUR 2Y yield | 2.673% (2026-05-20) |
| `SR_10Y` | EUR 10Y yield | 3.191% (2026-05-20) |

---

## ✅ SOURCE 4 — Bank of Canada Valet API
**No key required**  
**Endpoint:** `https://www.bankofcanada.ca/valet/observations/group/bond_yields_all/json?recent=2`

**Parsing:** `observations[-1]`

| Series key | Description | Latest tested |
|---|---|---|
| `BD.CDN.2YR.DQ.YLD` | CAD 2Y yield | 2.93% (2026-05-20) |
| `BD.CDN.10YR.DQ.YLD` | CAD 10Y yield | 3.58% (2026-05-20) |

---

## ✅ SOURCE 5 — Ministry of Finance Japan (CSV)
**No key required**  
**Endpoint:** `https://www.mof.go.jp/english/jgbs/reference/interest_rate/jgbcme.csv`  
**Follow redirect:** yes  
**Format:** CSV, updated daily on business days

**CSV structure:**
```
Row 1: title row (skip)
Row 2: headers — Date, 1Y, 2Y, 3Y, 4Y, 5Y, 6Y, 7Y, 8Y, 9Y, 10Y, 15Y, 20Y, 25Y, 30Y, 40Y
Row 3+: data — 2026/5/21, 1.140, 1.453, ...
Last 2 rows: empty + footnote (skip rows where Date is empty)
```

| Column index | Description | Latest tested |
|---|---|---|
| 2 (index) | JPY 2Y yield | 1.453% (2026-05-21) |
| 10 (index) | JPY 10Y yield | 2.748% (2026-05-21) |

---

## ✅ SOURCE 6 — ForexFactory Economic Calendar
**No key required**  
**Endpoint:** `https://nfs.faireconomy.media/ff_calendar_thisweek.json`  
**Required header:** `User-Agent: Mozilla/5.0`  
**Rate limit:** ~1 request per 15 min from same IP. Do not poll more frequently.

**Response fields:**
| Field | Maps to DB column | Notes |
|---|---|---|
| `country` | `currency` | 3-letter code e.g. `USD`, `EUR` |
| `date` | `event_date` | ISO8601 with timezone offset |
| `title` | `event_name` | Full event title |
| `impact` | `impact` | `"High"`, `"Medium"`, `"Low"`, `"Holiday"` |
| `forecast` | `forecast` | String with % or value, may be empty |
| `previous` | `previous` | Same format |

> ⚠️ **Actuals gap:** `actual` field is present in schema but **always null** in this JSON feed.  
> ForexFactory only publishes actuals on their rendered HTML page.  
> `wf_economic_calendar_actuals_fill` has **no viable free source** — handler deferred.

---

## ✅ SOURCE 7 — World Bank API
**No key required**  
**Endpoint:** `https://api.worldbank.org/v2/country/{iso2}/indicator/FP.CPI.TOTL.ZG?format=json&mrv=2&per_page=2`  
**Update frequency:** Annual  
**Use for:** `inflation_forecasts` table (annual context data, not real-time)

**Parsing:** `[1][0]` → `{ date: "2024", value: 2.94 }`

| Currency | ISO2 code |
|---|---|
| USD | US |
| EUR | XC |
| JPY | JP |
| GBP | GB |
| CHF | CH |
| CAD | CA |
| AUD | AU |
| NZD | NZ |

---

## ❌ SOURCES INVESTIGATED — NOT VIABLE

| Source | Reason |
|---|---|
| **Bank of England** | Akamai enterprise bot protection — 403 from any server-side client |
| **Reserve Bank of Australia** | Akamai bot protection — Access Denied |
| **RBNZ** | F5 bot management — 403 |
| **Swiss National Bank** | Returns HTML, no usable JSON/CSV endpoint found |
| **Twelve Data (bonds)** | Only 2 bonds in catalog: US2Y + South Africa 10Y. No GBP/AUD/NZD/CHF |
| **Alpha Vantage (bonds)** | US treasury yields only |
| **CFTC** | Portal migrated — original Socrata endpoints return 404. Working URL unconfirmed |
| **STOOQ** | Requires API key (free registration available — not tested) |

---

## HANDLER BUILD STATUS

| Handler | Sources | Status |
|---|---|---|
| `wf_forex_daily_fetch` | Yahoo Finance | ✅ **Handler exists** |
| `wf_cb_rates_daily` | Yahoo / manual | ✅ **Handler exists** |
| `wf_cot_weekly` | CFTC | ✅ **Handler exists** — ⚠️ CFTC URL unconfirmed (portal migrated) |
| `wf_bond_yields_nominal_daily` | FRED + ECB + BoC + MOF JP + FRED monthly | ✅ **Ready to build** |
| `wf_real_yields_daily` | FRED (DFII5, DFII10) | ✅ **Ready to build** |
| `wf_breakeven_daily` | FRED (T5YIE, T10YIE) | ✅ **Ready to build** |
| `wf_economic_calendar_daily` | ForexFactory | ✅ **Ready to build** |
| `wf_market_indices_daily` | Yahoo Finance | ✅ **Ready to build** |
| `wf_commodities_daily` | Yahoo Finance | ✅ **Ready to build** |
| `wf_gold_context_daily` | Yahoo (DXY, Gold) + FRED (DFF) | ✅ **Ready to build** |
| `wf_inflation_forecasts_weekly` | World Bank | ✅ **Ready to build** |
| `wf_gold_etf_flows_daily` | — | ❌ **Deferred** — no shares_outstanding source |
| `wf_risk_reversal_daily` | — | ❌ **Deferred** — no free source for FX vol skew |
| `wf_economic_calendar_actuals_fill` | — | ❌ **Deferred** — FF JSON has no actuals |
| `wf_cb_tone_review` | — | 🚫 **Manual entry only** |
| `wf_cb_events_calendar` | — | 🚫 **Manual entry only** |
| `wf_geo_scan_hourly` | NewsAPI | 🔑 **Needs NewsAPI key** |
| `wf_geo_status_daily` | — | 🚫 **Manual entry only** |
| `wf_gdt_dairy_biweekly` | GDT portal | ❓ **Unconfirmed** |
| `wf_consensus_survey_weekly` | — | 🚫 **Manual entry only** |

---

## BUILD ORDER (handlers ready to write now)
1. `wf_market_indices_daily` — simplest shape, good warm-up
2. `wf_commodities_daily` — same Yahoo pattern
3. `wf_gold_context_daily` — Yahoo + FRED (introduces multi-source pattern)
4. `wf_economic_calendar_daily` — ForexFactory, different shape
5. `wf_bond_yields_nominal_daily` — most complex (4 sources, 8 currencies)
6. `wf_real_yields_daily` — FRED only, simple
7. `wf_breakeven_daily` — FRED only, simple
8. `wf_inflation_forecasts_weekly` — World Bank, different cadence
