/**
 * wf_breakeven_daily
 * Sources: FRED T5YIE (USD 5Y breakeven inflation), T10YIE (USD 10Y breakeven)
 * Target:  breakeven_inflation  UNIQUE(effective_date, currency_code)
 *
 * Column mapping:
 *   breakeven_2y  ← T5YIE  (5Y breakeven, short-end proxy)
 *   breakeven_10y ← T10YIE
 *   fred_series   ← 'T5YIE,T10YIE'
 *
 * Note: Only USD is populated. No free daily breakeven series for other currencies.
 * FRED may return "." on non-trading days — fetchFredObs skips those entries.
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'
import { fetchFredObs } from '../lib/fred.ts'

interface BreakevenRow {
  effective_date: string
  currency_code: string
  breakeven_2y: number | null
  breakeven_10y: number | null
  source: string
  fred_series: string
}

export async function runBreakevenDaily(
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
  let t5yie: { date: string; value: number } | null = null
  let t10yie: { date: string; value: number } | null = null

  // ── T5YIE (5Y breakeven) ─────────────────────────────────────────────
  try {
    const obs = await fetchFredObs('T5YIE', fredKey)
    t5yie = { date: obs.date, value: obs.value }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ series: 'T5YIE', message })
    await logError(sb, workflowId, runId, message, 'FRED/T5YIE', 'rate_limited', {
      series: 'T5YIE',
    })
  }

  // ── T10YIE (10Y breakeven) ───────────────────────────────────────────
  try {
    const obs = await fetchFredObs('T10YIE', fredKey)
    t10yie = { date: obs.date, value: obs.value }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failures.push({ series: 'T10YIE', message })
    await logError(sb, workflowId, runId, message, 'FRED/T10YIE', 'rate_limited', {
      series: 'T10YIE',
    })
  }

  // Fallback: if both failed, re-use the most recent good row
  if (!t5yie && !t10yie) {
    const { data: cached } = await sb
      .from('breakeven_inflation')
      .select('effective_date, breakeven_2y, breakeven_10y')
      .eq('currency_code', 'USD')
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      t5yie = cached.breakeven_2y != null
        ? { date: cached.effective_date, value: cached.breakeven_2y }
        : null
      t10yie = cached.breakeven_10y != null
        ? { date: cached.effective_date, value: cached.breakeven_10y }
        : null
    }
  }

  if (!t5yie && !t10yie) {
    await markRunFailed(sb, runId, 'Both FRED breakeven series failed and no cached data', 2)
    return json({ success: false, error: 'all_series_failed', run_id: runId }, 500)
  }

  // T5YIE and T10YIE are published together — dates should match.
  // Use whichever is available, preferring T10YIE as the canonical date.
  const effectiveDate = (t10yie ?? t5yie)!.date

  const row: BreakevenRow = {
    effective_date: effectiveDate,
    currency_code: 'USD',
    breakeven_2y: t5yie?.value ?? null,
    breakeven_10y: t10yie?.value ?? null,
    source: 'FRED',
    fred_series: 'T5YIE,T10YIE',
  }

  const { error: upsertErr } = await sb
    .from('breakeven_inflation')
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
