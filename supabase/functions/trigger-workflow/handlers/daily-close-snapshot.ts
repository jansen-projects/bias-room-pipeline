/**
 * wf_daily_close_snapshot
 * Reads:  All v_latest_* gold views + forex_rates (latest per pair) + fx_friday_closes
 * Writes: daily_close_snapshots  UNIQUE(snapshot_date)
 *
 * payload: JSONB snapshot of all current market data (cb_rates, cot, yields, fx, indices)
 * anchor_friday_date: most recent Friday from fx_friday_closes
 * vs_anchor_delta: % change of FX pairs vs the anchor Friday close
 *
 * Schedule: 30 23 * * 1-5 (Mon–Fri 23:30 UTC, after Tier-1 handlers have run)
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, markRunFailed, markRunSuccess } from '../lib/ops.ts'

interface SnapshotRow {
  snapshot_date: string
  anchor_friday_date: string
  payload: Record<string, unknown>
  vs_anchor_delta: Record<string, unknown>
}

export async function runDailyCloseSnapshot(
  sb: SupabaseClient,
  runId: number,
  _workflowId: string,
): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10)

  // ── 1. Fetch all gold views in parallel ─────────────────────────────────
  const [
    { data: cbRates },
    { data: cot },
    { data: marketIndices },
    { data: realYields },
    { data: breakeven },
    { data: bond2y },
    { data: forexLatest },
    { data: fridayCloses },
    { data: goldContext },
    { data: commodities },
    { data: inflationForecasts },
  ] = await Promise.all([
    sb.from('v_latest_central_bank_rates').select('*'),
    sb.from('v_latest_cot').select('*'),
    sb.from('v_latest_market_indices').select('*'),
    sb.from('v_latest_real_yields').select('*'),
    sb.from('v_latest_breakeven').select('*'),
    sb.from('v_latest_bond_yields_2y').select('*'),
    // Latest forex rate per pair
    sb.from('forex_rates')
      .select('pair, effective_date, rate, close, change_pct, high, low')
      .order('effective_date', { ascending: false })
      .limit(9 * 5),   // up to 5 rows × 9 pairs; will deduplicate below
    // Latest Friday per pair for delta calc
    sb.from('fx_friday_closes')
      .select('pair, friday_date, close_price')
      .order('friday_date', { ascending: false })
      .limit(9 * 2),
    // Gold context (most recent 3 rows)
    sb.from('gold_context')
      .select('indicator, value, effective_date, source')
      .order('effective_date', { ascending: false })
      .limit(10),
    // Commodity prices (most recent 3)
    sb.from('commodity_prices')
      .select('commodity_code, price_usd, effective_date, unit')
      .order('effective_date', { ascending: false })
      .limit(6),
    // Latest inflation forecast per currency
    sb.from('inflation_forecasts')
      .select('currency_code, forecast_year, cpi_forecast, forecast_date')
      .order('forecast_date', { ascending: false })
      .limit(16),
  ])

  // ── 2. Deduplicate forex to latest row per pair ───────────────────────────
  const latestFx: Record<string, Record<string, unknown>> = {}
  for (const row of (forexLatest ?? [])) {
    const r = row as Record<string, unknown>
    const pair = String(r.pair)
    if (!latestFx[pair]) latestFx[pair] = r
  }

  // ── 3. Latest Friday close per pair ──────────────────────────────────────
  const latestFriday: Record<string, { date: string; price: number }> = {}
  for (const row of (fridayCloses ?? [])) {
    const r = row as Record<string, unknown>
    const pair = String(r.pair)
    if (!latestFriday[pair]) {
      latestFriday[pair] = {
        date: String(r.friday_date),
        price: parseFloat(String(r.close_price)),
      }
    }
  }

  // ── 4. Determine anchor_friday_date (latest Friday across all pairs) ─────
  const fridayDates = Object.values(latestFriday).map((v) => v.date)
  const anchorFridayDate = fridayDates.length > 0
    ? fridayDates.sort().reverse()[0]
    : today

  // ── 5. Compute vs_anchor_delta for FX pairs ───────────────────────────────
  const vsAnchorDelta: Record<string, number | null> = {}
  for (const [pair, fxRow] of Object.entries(latestFx)) {
    const fridayAnchor = latestFriday[pair]
    if (!fridayAnchor) {
      vsAnchorDelta[pair] = null
      continue
    }
    const currentClose = fxRow.close !== null
      ? parseFloat(String(fxRow.close))
      : parseFloat(String(fxRow.rate))
    const anchorClose = fridayAnchor.price
    if (!anchorClose || anchorClose === 0) {
      vsAnchorDelta[pair] = null
    } else {
      vsAnchorDelta[pair] = Math.round(((currentClose - anchorClose) / anchorClose) * 10000) / 100
    }
  }

  // ── 6. Deduplicate gold_context and commodity_prices ─────────────────────
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

  const latestInflation: Record<string, Record<string, unknown>> = {}
  for (const row of (inflationForecasts ?? [])) {
    const r = row as Record<string, unknown>
    const key = String(r.currency_code)
    if (!latestInflation[key]) latestInflation[key] = r
  }

  // ── 7. Build payload ───────────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    cb_rates: cbRates ?? [],
    cot: cot ?? [],
    market_indices: marketIndices ?? [],
    real_yields: realYields ?? [],
    breakeven: breakeven ?? [],
    bond_yields_2y: bond2y ?? [],
    fx: Object.values(latestFx),
    gold_context: Object.values(latestGold),
    commodities: Object.values(latestCommodity),
    inflation_forecasts: Object.values(latestInflation),
  }

  // ── 8. Upsert ─────────────────────────────────────────────────────────────
  const snapshotRow: SnapshotRow = {
    snapshot_date: today,
    anchor_friday_date: anchorFridayDate,
    payload,
    vs_anchor_delta: vsAnchorDelta,
  }

  const { error: upsertErr } = await sb
    .from('daily_close_snapshots')
    .upsert([snapshotRow], { onConflict: 'snapshot_date' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, 1)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  await markRunSuccess(sb, runId, 1, 1, null, 0)

  return json({
    success: true,
    run_id: runId,
    snapshot_date: today,
    anchor_friday_date: anchorFridayDate,
    fx_pairs: Object.keys(latestFx).length,
    vs_anchor_delta: vsAnchorDelta,
  })
}
