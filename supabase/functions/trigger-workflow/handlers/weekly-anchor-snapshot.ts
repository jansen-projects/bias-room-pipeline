/**
 * wf_weekly_anchor_snapshot
 * Runs on Friday 23:45 UTC, after wf_fx_friday_close_snapshot.
 * Reads:  All v_latest_* views + fx_friday_closes + daily_atr14 + consensus_surveys
 * Writes: weekly_anchor_snapshots  UNIQUE(snapshot_date)
 *
 * This is the W-series anchor (e.g. W20 = week 20). The snapshot_date is today (Friday).
 * payload: comprehensive JSONB capturing the full macro state for the week.
 * data_quality_flags: staleness warnings, missing data, known caveats.
 * is_locked: false at creation; operator can lock after review.
 *
 * The payload structure mirrors what TBR_Static_Block W-series reports contain:
 *   section_1: fx_rates (Friday closes + ATR14 + returns)
 *   section_2: cb_rates
 *   section_3: cot_positioning
 *   section_4: bond_yields (nominal 2Y + 10Y, real yields, breakeven)
 *   section_5: market_indices (VIX, DXY, SPX, NASDAQ)
 *   section_6: commodities (gold, oil, copper)
 *   section_7: inflation_forecasts
 *   section_8: consensus_surveys (operator-entered, may be absent)
 *   section_9: data_freshness (stale data warnings per table)
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, markRunFailed, markRunSuccess } from '../lib/ops.ts'

const CURRENCY_PAIRS = [
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'XAUUSD',
]

interface WeeklyAnchorRow {
  snapshot_date: string
  payload: Record<string, unknown>
  data_quality_flags: Record<string, unknown>
  is_locked: boolean
}

interface DataQualityFlag {
  table: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

export async function runWeeklyAnchorSnapshot(
  sb: SupabaseClient,
  runId: number,
  _workflowId: string,
): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10)

  // ── 1. Fetch all data sources in parallel ────────────────────────────────
  const [
    { data: cbRates },
    { data: cot },
    { data: marketIndices },
    { data: realYields },
    { data: breakeven },
    { data: bond2y },
    { data: fridayCloses },
    { data: atr14Rows },
    { data: consensusSurveys },
    { data: inflationForecasts },
    { data: goldContext },
    { data: commodities },
    { data: slaTable },
  ] = await Promise.all([
    sb.from('v_latest_central_bank_rates').select('*'),
    sb.from('v_latest_cot').select('*'),
    sb.from('v_latest_market_indices').select('*'),
    sb.from('v_latest_real_yields').select('*'),
    sb.from('v_latest_breakeven').select('*'),
    sb.from('v_latest_bond_yields_2y').select('*'),
    // Today's Friday closes for all pairs
    sb.from('fx_friday_closes')
      .select('*')
      .eq('friday_date', today)
      .in('pair', CURRENCY_PAIRS),
    // Today's ATR14 rows
    sb.from('daily_atr14')
      .select('*')
      .eq('effective_date', today)
      .in('pair', CURRENCY_PAIRS),
    // Latest consensus survey per currency (operator-entered)
    sb.from('consensus_surveys')
      .select('*')
      .order('survey_week_ending', { ascending: false })
      .limit(9 * 2),  // up to 2 recent surveys × 9 currencies
    // Latest inflation forecast per currency
    sb.from('inflation_forecasts')
      .select('currency_code, forecast_year, cpi_forecast, cpi_prev, forecast_date, source_code')
      .order('forecast_date', { ascending: false })
      .limit(16),
    // Gold context (latest 3 indicators)
    sb.from('gold_context')
      .select('indicator, value, effective_date, source')
      .order('effective_date', { ascending: false })
      .limit(10),
    // Commodity prices (latest per commodity)
    sb.from('commodity_prices')
      .select('commodity_code, price_usd, unit, effective_date, change_pct')
      .order('effective_date', { ascending: false })
      .limit(9),
    // SLA table for freshness check
    sb.from('meta_table_freshness_sla')
      .select('table_name, last_updated_at, warning_after_min, critical_after_min'),
  ])

  // ── 2. Index fetched data for easy access ─────────────────────────────────
  const fridayByPair: Record<string, Record<string, unknown>> = {}
  for (const row of (fridayCloses ?? [])) {
    const r = row as Record<string, unknown>
    fridayByPair[String(r.pair)] = r
  }

  const atr14ByPair: Record<string, Record<string, unknown>> = {}
  for (const row of (atr14Rows ?? [])) {
    const r = row as Record<string, unknown>
    atr14ByPair[String(r.pair)] = r
  }

  const latestConsensus: Record<string, Record<string, unknown>> = {}
  for (const row of (consensusSurveys ?? [])) {
    const r = row as Record<string, unknown>
    const key = String(r.currency_code)
    if (!latestConsensus[key]) latestConsensus[key] = r
  }

  const latestInflation: Record<string, Record<string, unknown>> = {}
  for (const row of (inflationForecasts ?? [])) {
    const r = row as Record<string, unknown>
    const key = String(r.currency_code)
    if (!latestInflation[key]) latestInflation[key] = r
  }

  const latestGold: Record<string, Record<string, unknown>> = {}
  for (const row of (goldContext ?? [])) {
    const r = row as Record<string, unknown>
    const key = String(r.indicator)
    if (!latestGold[key]) latestGold[key] = r
  }

  const latestCommodity: Record<string, Record<string, unknown>> = {}
  for (const row of (commodities ?? [])) {
    const r = row as Record<string, unknown>
    const key = String(r.commodity_code)
    if (!latestCommodity[key]) latestCommodity[key] = r
  }

  // ── 3. Build Section 1 — FX rates with ATR14 + returns ───────────────────
  const section1_fx = CURRENCY_PAIRS.map((pair) => {
    const fc = fridayByPair[pair] ?? null
    const atr = atr14ByPair[pair] ?? null
    return {
      pair,
      friday_close: fc?.close_price ?? null,
      friday_date: fc?.friday_date ?? null,
      return_1w: fc?.return_1w ?? null,
      return_4w: fc?.return_4w ?? null,
      return_12w: fc?.return_12w ?? null,
      high_52w: fc?.high_52w ?? null,
      low_52w: fc?.low_52w ?? null,
      atr14: atr?.atr14 ?? null,
      atr_warning: atr?.warning_threshold ?? null,
      atr_critical: atr?.critical_threshold ?? null,
    }
  })

  // ── 4. Compute data_quality_flags ────────────────────────────────────────
  const flags: DataQualityFlag[] = []
  const now = Date.now()

  for (const row of (slaTable ?? [])) {
    const r = row as Record<string, unknown>
    const lastUpdated = r.last_updated_at ? new Date(String(r.last_updated_at)).getTime() : null
    const warnMin = r.warning_after_min ? parseFloat(String(r.warning_after_min)) : null
    const critMin = r.critical_after_min ? parseFloat(String(r.critical_after_min)) : null

    if (!lastUpdated) {
      flags.push({
        table: String(r.table_name),
        severity: 'warning',
        message: 'last_updated_at is NULL — no data has ever been ingested',
      })
      continue
    }

    const staleMins = (now - lastUpdated) / 60000

    if (critMin !== null && staleMins > critMin) {
      flags.push({
        table: String(r.table_name),
        severity: 'critical',
        message: `STALE: ${Math.round(staleMins)} min since last update (critical threshold: ${critMin} min)`,
      })
    } else if (warnMin !== null && staleMins > warnMin) {
      flags.push({
        table: String(r.table_name),
        severity: 'warning',
        message: `STALE: ${Math.round(staleMins)} min since last update (warning threshold: ${warnMin} min)`,
      })
    }
  }

  // Known ongoing DQ flags (from PHASE6_VERIFICATION.md)
  const staleRates = ['AUD', 'CHF', 'NZD']
  for (const ccy of staleRates) {
    const cbRow = (cbRates ?? []).find((r) => (r as Record<string, unknown>).currency === ccy)
    if (cbRow) {
      flags.push({
        table: 'central_bank_rates',
        severity: 'warning',
        message: `${ccy} CB rate from OECD monthly series — may lag actual rate by 4–8 weeks`,
      })
    }
  }

  if (Object.keys(fridayByPair).length < CURRENCY_PAIRS.length) {
    const missing = CURRENCY_PAIRS.filter((p) => !fridayByPair[p])
    flags.push({
      table: 'fx_friday_closes',
      severity: 'warning',
      message: `Missing Friday closes for: ${missing.join(', ')} — wf_fx_friday_close_snapshot may not have run yet`,
    })
  }

  if (Object.keys(atr14ByPair).length < CURRENCY_PAIRS.length) {
    const missing = CURRENCY_PAIRS.filter((p) => !atr14ByPair[p])
    flags.push({
      table: 'daily_atr14',
      severity: 'info',
      message: `ATR-14 missing for: ${missing.join(', ')} — insufficient OHLC history`,
    })
  }

  // ── 5. Build full payload ─────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    anchor_date: today,
    section_1_fx: section1_fx,
    section_2_cb_rates: cbRates ?? [],
    section_3_cot: cot ?? [],
    section_4_yields: {
      bond_2y: bond2y ?? [],
      real_yields: realYields ?? [],
      breakeven: breakeven ?? [],
    },
    section_5_market_indices: marketIndices ?? [],
    section_6_commodities: {
      gold_context: Object.values(latestGold),
      commodity_prices: Object.values(latestCommodity),
    },
    section_7_inflation: Object.values(latestInflation),
    section_8_consensus: Object.values(latestConsensus),
  }

  // ── 6. Upsert ─────────────────────────────────────────────────────────────
  const anchorRow: WeeklyAnchorRow = {
    snapshot_date: today,
    payload,
    data_quality_flags: { flags, generated_at: new Date().toISOString(), flag_count: flags.length },
    is_locked: false,
  }

  const { error: upsertErr } = await sb
    .from('weekly_anchor_snapshots')
    .upsert([anchorRow], { onConflict: 'snapshot_date' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, 1)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  const warnCount = flags.filter((f) => f.severity === 'warning').length
  const critCount = flags.filter((f) => f.severity === 'critical').length

  // DQ flags are informational — the run itself succeeded regardless of flag count.
  // Pass null errorSummary so run status = 'success'.
  await markRunSuccess(sb, runId, 1, 1, null, 0)

  return json({
    success: true,
    run_id: runId,
    snapshot_date: today,
    pairs_captured: Object.keys(fridayByPair).length,
    atr14_captured: Object.keys(atr14ByPair).length,
    dq_flags: { total: flags.length, critical: critCount, warning: warnCount },
    ...(flags.length > 0 && { flags: flags.slice(0, 5) }),  // preview first 5 flags
  })
}
