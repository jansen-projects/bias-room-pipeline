/**
 * wf_gold_context_daily
 * Sources:
 *   Yahoo Finance → GC=F (Gold Spot), DX-Y.NYB (DXY Index)
 *   FRED          → DFF  (Fed Funds Rate)
 * Target: gold_context  UNIQUE(effective_date, indicator)
 *
 * Indicator vocabulary (CHECK constraint):
 *   'US 10Y Nominal Yield' | 'US 10Y Real Yield' | 'Breakeven Inflation'
 *   'DXY Index' | 'VIX' | 'SPX 500' | 'Gold Spot' | 'Gold/Oil Ratio'
 *   'Fed Funds Rate'
 *
 * This handler writes: 'Gold Spot', 'DXY Index', 'Fed Funds Rate'
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'
import { fetchYahooChart } from '../lib/yahoo.ts'
import { fetchFredObs } from '../lib/fred.ts'

interface GoldContextRow {
  effective_date: string
  indicator: string
  value: number
  series_id: string
  source: string
  data_frequency: string
}

export async function runGoldContextDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const fredKey = Deno.env.get('FRED_API_KEY') ?? ''
  if (!fredKey) {
    await markRunFailed(sb, runId, 'FRED_API_KEY not set')
    return json({ success: false, error: 'missing_env_fred_key', run_id: runId }, 500)
  }

  const rows: GoldContextRow[] = []
  const failures: { source: string; message: string }[] = []

  // ── 1. Gold Spot (GC=F) ──────────────────────────────────────────────────
  try {
    const q = await fetchYahooChart('GC=F')
    rows.push({
      effective_date: q.effectiveDate,
      indicator: 'Gold Spot',
      value: q.close,
      series_id: 'GC=F',
      source: 'yahoo_finance',
      data_frequency: 'daily',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ source: 'Yahoo/GC=F', message })
    await logError(sb, workflowId, runId, message, 'Yahoo/GC=F', 'http_error', { ticker: 'GC=F' })
  }

  // ── 2. DXY Index (DX-Y.NYB) ─────────────────────────────────────────────
  try {
    const q = await fetchYahooChart('DX-Y.NYB')
    rows.push({
      effective_date: q.effectiveDate,
      indicator: 'DXY Index',
      value: q.close,
      series_id: 'DX-Y.NYB',
      source: 'yahoo_finance',
      data_frequency: 'daily',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ source: 'Yahoo/DX-Y.NYB', message })
    await logError(sb, workflowId, runId, message, 'Yahoo/DX-Y.NYB', 'http_error', {
      ticker: 'DX-Y.NYB',
    })
  }

  // ── 3. Fed Funds Rate (FRED DFF) ─────────────────────────────────────────
  try {
    const obs = await fetchFredObs('DFF', fredKey)
    rows.push({
      effective_date: obs.date,
      indicator: 'Fed Funds Rate',
      value: obs.value,
      series_id: 'DFF',
      source: 'fred',
      data_frequency: 'daily',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ source: 'FRED/DFF', message })
    await logError(sb, workflowId, runId, message, 'FRED/DFF', 'http_error', { series: 'DFF' })
  }

  if (rows.length === 0) {
    await markRunFailed(sb, runId, `All 3 sources failed`, 3)
    return json({ success: false, error: 'all_sources_failed', run_id: runId }, 500)
  }

  const { error: upsertErr } = await sb
    .from('gold_context')
    .upsert(rows, { onConflict: 'effective_date,indicator' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, 3)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  const errorSummary =
    failures.length > 0
      ? `${failures.length} source(s) failed: ${failures.map((f) => f.source).join(', ')}`
      : null

  await markRunSuccess(sb, runId, 3, rows.length, errorSummary, failures.length)

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: rows.length,
    ...(failures.length > 0 && { errors: failures }),
  })
}
