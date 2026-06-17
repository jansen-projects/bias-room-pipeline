/**
 * wf_real_yields_daily
 * Sources: FRED DFII5 (USD 5Y TIPS real yield), DFII10 (USD 10Y TIPS real yield)
 * Target:  bond_yields_real  UNIQUE(effective_date, currency_code)
 *
 * Column mapping:
 *   yield_2y_real  ← DFII5  (5Y TIPS is the tradeable "short-end" real yield proxy)
 *   yield_10y_real ← DFII10
 *
 * Note: Only USD is populated here. No free daily source for other currencies.
 * FRED may return "." on non-trading days — fetchFredObs skips those entries.
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'
import { fetchFredObs } from '../lib/fred.ts'

interface RealYieldRow {
  effective_date: string
  currency_code: string
  yield_2y_real: number | null
  yield_10y_real: number | null
  source: string
}

export async function runRealYieldsDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const fredKey = Deno.env.get('FRED_API_KEY') ?? ''
  if (!fredKey) {
    await markRunFailed(sb, runId, 'FRED_API_KEY not set')
    return json({ success: false, error: 'missing_env_fred_key', run_id: runId }, 500)
  }

  const failures: { series: string; message: string }[] = []
  let dfii5: { date: string; value: number } | null = null
  let dfii10: { date: string; value: number } | null = null

  // ── DFII5 (5Y TIPS) ──────────────────────────────────────────────────
  try {
    const obs = await fetchFredObs('DFII5', fredKey)
    dfii5 = { date: obs.date, value: obs.value }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ series: 'DFII5', message })
    await logError(sb, workflowId, runId, message, 'FRED/DFII5', 'rate_limited', {
      series: 'DFII5',
    })
  }

  // ── DFII10 (10Y TIPS) ────────────────────────────────────────────────
  try {
    const obs = await fetchFredObs('DFII10', fredKey)
    dfii10 = { date: obs.date, value: obs.value }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ series: 'DFII10', message })
    await logError(sb, workflowId, runId, message, 'FRED/DFII10', 'rate_limited', {
      series: 'DFII10',
    })
  }

  // Fallback: if both failed, re-use the most recent good row
  if (!dfii5 && !dfii10) {
    const { data: cached } = await sb
      .from('bond_yields_real')
      .select('effective_date, yield_2y_real, yield_10y_real')
      .eq('currency_code', 'USD')
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      dfii5 = cached.yield_2y_real != null
        ? { date: cached.effective_date, value: cached.yield_2y_real }
        : null
      dfii10 = cached.yield_10y_real != null
        ? { date: cached.effective_date, value: cached.yield_10y_real }
        : null
    }
  }

  if (!dfii5 && !dfii10) {
    await markRunFailed(sb, runId, 'Both FRED series failed and no cached data', 2)
    return json({ success: false, error: 'all_series_failed', run_id: runId }, 500)
  }

  // Use the most-recent date available; DFII5 and DFII10 are co-published so
  // dates should match, but handle the edge case gracefully.
  const effectiveDate = (dfii10 ?? dfii5)!.date

  const row: RealYieldRow = {
    effective_date: effectiveDate,
    currency_code: 'USD',
    yield_2y_real: dfii5?.value ?? null,
    yield_10y_real: dfii10?.value ?? null,
    source: 'FRED',
  }

  const { error: upsertErr } = await sb
    .from('bond_yields_real')
    .upsert([row], { onConflict: 'effective_date,currency_code' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, 2)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  const errorSummary =
    failures.length > 0
      ? `${failures.length} series failed: ${failures.map((f) => f.series).join(', ')}`
      : null

  await markRunSuccess(sb, runId, 2, 1, errorSummary, failures.length)

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: 1,
    ...(failures.length > 0 && { errors: failures }),
  })
}
