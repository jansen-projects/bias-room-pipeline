/**
 * wf_bond_yields_nominal_daily
 * Sources:
 *   FRED       → USD 2Y (DGS2), USD 10Y (DGS10)                       [daily]
 *   ECB SDW    → EUR 2Y (SR_2Y), EUR 10Y (SR_10Y)                     [daily]
 *   Bank of Canada Valet → CAD 2Y, CAD 10Y                            [daily]
 *   MOF Japan CSV → JPY 2Y (col 2), JPY 10Y (col 10)                  [daily]
 *   FRED OECD  → GBP 10Y, AUD 10Y, NZD 10Y, CHF 10Y                  [monthly fallback]
 * Target: bond_yields_nominal  UNIQUE(series_id, effective_date)
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'
import { fetchFredObs } from '../lib/fred.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BondYieldRow {
  currency: string
  region: string
  instrument: string
  series_id: string
  series_label: string
  yield_type: string       // CHECK: must be 'government_bond'
  data_frequency: string
  yield: number
  prev_yield: number | null
  yield_change: number | null
  effective_date: string
  release_date: null
  source: string
}

// ─── FRED (USD daily + GBP/AUD/NZD/CHF monthly) ──────────────────────────────

interface FredSeriesCfg {
  seriesId: string
  currency: string
  region: string
  instrument: string
  seriesLabel: string
  dataFrequency: string
  source: string
}

const FRED_SERIES: FredSeriesCfg[] = [
  {
    seriesId: 'DGS2',
    currency: 'USD', region: 'United States', instrument: 'UST 2Y',
    seriesLabel: 'USD 2Y Nominal', dataFrequency: 'daily', source: 'FRED',
  },
  {
    seriesId: 'DGS10',
    currency: 'USD', region: 'United States', instrument: 'UST 10Y',
    seriesLabel: 'USD 10Y Nominal', dataFrequency: 'daily', source: 'FRED',
  },
  {
    seriesId: 'IRLTLT01GBM156N',
    currency: 'GBP', region: 'United Kingdom', instrument: 'Gilt 10Y',
    seriesLabel: 'GBP 10Y Nominal (OECD)', dataFrequency: 'monthly', source: 'FRED',
  },
  {
    seriesId: 'IRLTLT01AUM156N',
    currency: 'AUD', region: 'Australia', instrument: 'ACGB 10Y',
    seriesLabel: 'AUD 10Y Nominal (OECD)', dataFrequency: 'monthly', source: 'FRED',
  },
  {
    seriesId: 'IRLTLT01NZM156N',
    currency: 'NZD', region: 'New Zealand', instrument: 'NZGB 10Y',
    seriesLabel: 'NZD 10Y Nominal (OECD)', dataFrequency: 'monthly', source: 'FRED',
  },
  {
    seriesId: 'IRLTLT01CHM156N',
    currency: 'CHF', region: 'Switzerland', instrument: 'Swiss 10Y',
    seriesLabel: 'CHF 10Y Nominal (OECD)', dataFrequency: 'monthly', source: 'FRED',
  },
]

// ─── ECB Statistical Data Warehouse ──────────────────────────────────────────

interface EcbSeriesCfg {
  tenor: string   // 'SR_2Y' | 'SR_10Y'
  seriesId: string
  instrument: string
  seriesLabel: string
}

const ECB_SERIES: EcbSeriesCfg[] = [
  { tenor: 'SR_2Y',  seriesId: 'ECB_EUR_2Y',  instrument: 'EUR 2Y',  seriesLabel: 'EUR 2Y Nominal' },
  { tenor: 'SR_10Y', seriesId: 'ECB_EUR_10Y', instrument: 'EUR 10Y', seriesLabel: 'EUR 10Y Nominal' },
]

/**
 * Parse SDMX-JSON from ECB.
 * With `lastNObservations=2` the returned `structure.dimensions.observation[0].values`
 * has exactly N entries, and the observation keys map positionally to those dates.
 */
function parseEcbResponse(
  data: unknown,
): { date: string; value: number; prevValue: number | null } {
  const d = data as Record<string, unknown>
  const series = (
    (d.dataSets as Array<Record<string, unknown>>)?.[0]?.series
  ) as Record<string, { observations: Record<string, number[]> }> | undefined

  if (!series) throw new Error('ECB: dataSets[0].series missing')

  const firstKey = Object.keys(series)[0]
  if (!firstKey) throw new Error('ECB: no series key')

  const observations = series[firstKey].observations
  const dateValues = (
    (d.structure as Record<string, unknown>)
    ?.dimensions as Record<string, unknown>
  )?.observation as Array<{ values: Array<{ id: string }> }> | undefined

  const dates = dateValues?.[0]?.values
  if (!dates?.length) throw new Error('ECB: no observation date values')

  // Sort observation keys numerically; they map positionally to dates[]
  const sortedKeys = Object.keys(observations)
    .map(Number)
    .sort((a, b) => a - b)

  if (sortedKeys.length === 0) throw new Error('ECB: empty observations')

  const n = sortedKeys.length
  const latestValue = observations[String(sortedKeys[n - 1])][0]
  const prevValue = n > 1 ? observations[String(sortedKeys[n - 2])][0] : null

  // dates is ordered chronologically; last entry = most recent
  const latestDate = dates[n - 1].id

  return { date: latestDate, value: latestValue, prevValue }
}

async function fetchEcbYield(
  tenor: string,
): Promise<{ date: string; value: number; prevValue: number | null }> {
  const url =
    `https://data-api.ecb.europa.eu/service/data/YC/` +
    `B.U2.EUR.4F.G_N_A.SV_C_YM.${tenor}?format=jsondata&lastNObservations=2`

  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!resp.ok) throw new Error(`ECB HTTP ${resp.status} for tenor ${tenor}`)

  const data = await resp.json()
  return parseEcbResponse(data)
}

// ─── Bank of Canada Valet API ─────────────────────────────────────────────────

interface BocObs {
  d: string
  [key: string]: { v: string } | string
}

async function fetchBocYields(): Promise<{
  date: string
  yield2y: number
  yield10y: number
  prevDate: string | null
  prevYield2y: number | null
  prevYield10y: number | null
}> {
  const url =
    'https://www.bankofcanada.ca/valet/observations/group/bond_yields_all/json?recent=2'
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Bank of Canada HTTP ${resp.status}`)

  const data = await resp.json()
  const obs: BocObs[] = data?.observations ?? []
  if (obs.length === 0) throw new Error('Bank of Canada: empty observations')

  const last = obs[obs.length - 1]
  const prev = obs.length > 1 ? obs[obs.length - 2] : null

  const get = (o: BocObs, key: string): number => {
    const entry = o[key]
    if (!entry || typeof entry !== 'object') throw new Error(`BOC: missing key ${key}`)
    return parseFloat((entry as { v: string }).v)
  }

  return {
    date: last.d as string,
    yield2y: get(last, 'BD.CDN.2YR.DQ.YLD'),
    yield10y: get(last, 'BD.CDN.10YR.DQ.YLD'),
    prevDate: prev ? (prev.d as string) : null,
    prevYield2y: prev ? get(prev, 'BD.CDN.2YR.DQ.YLD') : null,
    prevYield10y: prev ? get(prev, 'BD.CDN.10YR.DQ.YLD') : null,
  }
}

// ─── Ministry of Finance Japan CSV ───────────────────────────────────────────

async function fetchMofJapanYields(): Promise<{
  date: string
  yield2y: number
  yield10y: number
  prevDate: string | null
  prevYield2y: number | null
  prevYield10y: number | null
}> {
  const resp = await fetch(
    'https://www.mof.go.jp/english/jgbs/reference/interest_rate/jgbcme.csv',
    {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiasRoom/1.0)' },
    },
  )
  if (!resp.ok) throw new Error(`MOF Japan HTTP ${resp.status}`)

  const text = await resp.text()
  // Normalize line endings and strip BOM
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)

  // Date pattern: YYYY/M/D or YYYY/MM/DD
  const DATE_RE = /^\d{4}\/\d{1,2}\/\d{1,2}$/

  const parseMofDate = (d: string): string => {
    // "2026/5/21" → "2026-05-21"
    const parts = d.trim().split('/')
    if (parts.length !== 3) throw new Error(`MOF Japan: unexpected date format: "${d}"`)
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }

  // Collect only rows whose first column looks like a date (YYYY/M/D).
  // This naturally skips the title row, header row, empty rows, and footnotes.
  const dataRows: string[][] = []
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.trim())
    if (DATE_RE.test(cols[0])) {
      dataRows.push(cols)
    }
  }

  if (dataRows.length === 0) throw new Error('MOF Japan: no date rows found in CSV')

  const last = dataRows[dataRows.length - 1]
  const prev = dataRows.length > 1 ? dataRows[dataRows.length - 2] : null

  return {
    date: parseMofDate(last[0]),
    yield2y: parseFloat(last[2]),    // col 2 = 2Y
    yield10y: parseFloat(last[10]),  // col 10 = 10Y
    prevDate: prev ? parseMofDate(prev[0]) : null,
    prevYield2y: prev ? parseFloat(prev[2]) : null,
    prevYield10y: prev ? parseFloat(prev[10]) : null,
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function runBondYieldsNominalDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const fredKey = Deno.env.get('FRED_API_KEY') ?? ''
  if (!fredKey) {
    await markRunFailed(sb, runId, 'FRED_API_KEY not set')
    return json({ success: false, error: 'missing_env_fred_key', run_id: runId }, 500)
  }

  const rows: BondYieldRow[] = []
  const failures: { source: string; message: string }[] = []

  // ── A. FRED: USD daily + GBP/AUD/NZD/CHF monthly ─────────────────────
  for (const cfg of FRED_SERIES) {
    try {
      const obs = await fetchFredObs(cfg.seriesId, fredKey)
      const yieldChange =
        obs.prevValue != null
          ? parseFloat((obs.value - obs.prevValue).toFixed(4))
          : null
      rows.push({
        currency: cfg.currency,
        region: cfg.region,
        instrument: cfg.instrument,
        series_id: cfg.seriesId,
        series_label: cfg.seriesLabel,
        yield_type: 'government_bond',
        data_frequency: cfg.dataFrequency,
        yield: obs.value,
        prev_yield: obs.prevValue,
        yield_change: yieldChange,
        effective_date: obs.date,
        release_date: null,
        source: cfg.source,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ source: `FRED/${cfg.seriesId}`, message })
      await logError(sb, workflowId, runId, message, `FRED/${cfg.seriesId}`, 'http_error', {
        series_id: cfg.seriesId,
      })
    }
  }

  // ── B. ECB: EUR 2Y + 10Y ─────────────────────────────────────────────
  for (const cfg of ECB_SERIES) {
    try {
      const obs = await fetchEcbYield(cfg.tenor)
      const yieldChange =
        obs.prevValue != null
          ? parseFloat((obs.value - obs.prevValue).toFixed(4))
          : null
      rows.push({
        currency: 'EUR',
        region: 'Euro Area',
        instrument: cfg.instrument,
        series_id: cfg.seriesId,
        series_label: cfg.seriesLabel,
        yield_type: 'government_bond',
        data_frequency: 'daily',
        yield: obs.value,
        prev_yield: obs.prevValue,
        yield_change: yieldChange,
        effective_date: obs.date,
        release_date: null,
        source: 'ECB',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ source: `ECB/${cfg.tenor}`, message })
      await logError(sb, workflowId, runId, message, `ECB/${cfg.tenor}`, 'http_error', {
        tenor: cfg.tenor,
      })
    }
  }

  // ── C. Bank of Canada: CAD 2Y + 10Y ─────────────────────────────────
  try {
    const boc = await fetchBocYields()

    const bocPairs = [
      { seriesId: 'BOC_CAD_2Y',  instrument: 'GoC 2Y',  seriesLabel: 'CAD 2Y Nominal',  yield: boc.yield2y,  prev: boc.prevYield2y  },
      { seriesId: 'BOC_CAD_10Y', instrument: 'GoC 10Y', seriesLabel: 'CAD 10Y Nominal', yield: boc.yield10y, prev: boc.prevYield10y },
    ]

    for (const p of bocPairs) {
      const yieldChange =
        p.prev != null ? parseFloat((p.yield - p.prev).toFixed(4)) : null
      rows.push({
        currency: 'CAD',
        region: 'Canada',
        instrument: p.instrument,
        series_id: p.seriesId,
        series_label: p.seriesLabel,
        yield_type: 'government_bond',
        data_frequency: 'daily',
        yield: p.yield,
        prev_yield: p.prev,
        yield_change: yieldChange,
        effective_date: boc.date,
        release_date: null,
        source: 'BOC',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ source: 'BOC', message })
    await logError(sb, workflowId, runId, message, 'BOC', 'http_error', { source: 'boc' })
  }

  // ── D. MOF Japan: JPY 2Y + 10Y ──────────────────────────────────────
  try {
    const mof = await fetchMofJapanYields()

    const mofPairs = [
      { seriesId: 'MOF_JPY_2Y',  instrument: 'JGB 2Y',  seriesLabel: 'JPY 2Y Nominal',  yield: mof.yield2y,  prev: mof.prevYield2y  },
      { seriesId: 'MOF_JPY_10Y', instrument: 'JGB 10Y', seriesLabel: 'JPY 10Y Nominal', yield: mof.yield10y, prev: mof.prevYield10y },
    ]

    for (const p of mofPairs) {
      const yieldChange =
        p.prev != null ? parseFloat((p.yield - p.prev).toFixed(4)) : null
      rows.push({
        currency: 'JPY',
        region: 'Japan',
        instrument: p.instrument,
        series_id: p.seriesId,
        series_label: p.seriesLabel,
        yield_type: 'government_bond',
        data_frequency: 'daily',
        yield: p.yield,
        prev_yield: p.prev,
        yield_change: yieldChange,
        effective_date: mof.date,
        release_date: null,
        source: 'MOF_JP',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ source: 'MOF_JP', message })
    await logError(sb, workflowId, runId, message, 'MOF_JP', 'http_error', { source: 'mof_japan' })
  }

  // ── Bail out if nothing fetched ───────────────────────────────────────
  if (rows.length === 0) {
    await markRunFailed(sb, runId, `All ${failures.length} sources failed`, failures.length)
    return json({ success: false, error: 'all_sources_failed', run_id: runId }, 500)
  }

  // ── Upsert ────────────────────────────────────────────────────────────
  const { error: upsertErr } = await sb
    .from('bond_yields_nominal')
    .upsert(rows, { onConflict: 'series_id,effective_date' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, rows.length)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  const totalSeries = FRED_SERIES.length + ECB_SERIES.length + 2 /* BOC */ + 2 /* MOF */
  const errorSummary =
    failures.length > 0
      ? `${failures.length} source(s) failed: ${failures.map((f) => f.source).join(', ')}`
      : null

  await markRunSuccess(sb, runId, totalSeries, rows.length, errorSummary, failures.length)

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: rows.length,
    ...(failures.length > 0 && { errors: failures }),
  })
}
