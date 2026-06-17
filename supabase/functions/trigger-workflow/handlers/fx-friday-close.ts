/**
 * wf_fx_friday_close_snapshot
 * Reads:  forex_rates  (rows where is_friday_ny_close = true, last 13 per pair)
 * Writes: fx_friday_closes  UNIQUE(friday_date, pair)
 *
 * Computes returns:
 *   return_1w  = (thisClose - lastWeekClose) / lastWeekClose × 100
 *   return_4w  = (thisClose - 4weeksAgoClose) / 4weeksAgoClose × 100
 *   return_12w = (thisClose - 12weeksAgoClose) / 12weeksAgoClose × 100
 *
 * Also computes 52-week high/low from whatever Fridays are available.
 *
 * Schedule: 30 23 * * 5 (Friday 23:30 UTC, after forex handler has run)
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

const PAIRS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'XAUUSD']
const LOOKBACK = 53  // ~1 year of Fridays for 52-week high/low + 12w return

interface FridayRow {
  friday_date: string
  pair: string
  close_price: number
  return_1w: number | null
  return_4w: number | null
  return_12w: number | null
  high_52w: number | null
  low_52w: number | null
  source: string
}

function round(n: number, dp = 4): number {
  return Math.round(n * 10 ** dp) / 10 ** dp
}

function pctReturn(current: number, base: number): number {
  return round(((current - base) / base) * 100)
}

export async function runFxFridayCloseSnapshot(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const rows: FridayRow[] = []
  const skipped: string[] = []

  for (const pair of PAIRS) {
    try {
      // Fetch last LOOKBACK Friday closes for this pair (newest first)
      const { data: fridays, error } = await sb
        .from('forex_rates')
        .select('effective_date, rate, close, source')
        .eq('pair', pair)
        .eq('is_friday_ny_close', true)
        .order('effective_date', { ascending: false })
        .limit(LOOKBACK)

      if (error) throw new Error(`DB read error for ${pair}: ${error.message}`)
      if (!fridays || fridays.length === 0) {
        skipped.push(`${pair}: no Friday close rows found`)
        continue
      }

      // Resolve close price: use COALESCE(close, rate) — same source the handler writes
      const closes: Array<{ date: string; price: number; source: string }> = fridays.map(
        (r: Record<string, unknown>) => ({
          date: r.effective_date as string,
          price: r.close !== null
            ? parseFloat(String(r.close))
            : parseFloat(String(r.rate)),
          source: String(r.source),
        }),
      )

      const latest = closes[0]
      const prev1w = closes[1] ?? null
      const prev4w = closes[4] ?? null
      const prev12w = closes[12] ?? null

      const prices = closes.map((c) => c.price)
      const high52w = Math.max(...prices)
      const low52w = Math.min(...prices)

      rows.push({
        friday_date: latest.date,
        pair,
        close_price: round(latest.price),
        return_1w: prev1w ? pctReturn(latest.price, prev1w.price) : null,
        return_4w: prev4w ? pctReturn(latest.price, prev4w.price) : null,
        return_12w: prev12w ? pctReturn(latest.price, prev12w.price) : null,
        high_52w: prices.length >= 2 ? round(high52w) : null,
        low_52w: prices.length >= 2 ? round(low52w) : null,
        source: latest.source,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      skipped.push(`${pair}: ${message}`)
      await logError(sb, workflowId, runId, message, `fx_friday_close/${pair}`, 'unknown', { pair })
    }
  }

  if (rows.length === 0) {
    const errMsg = `No Friday close rows computed. Skipped: ${skipped.join('; ')}`
    await markRunFailed(sb, runId, errMsg, PAIRS.length)
    return json({ success: false, error: errMsg, run_id: runId }, 500)
  }

  const { error: upsertErr } = await sb
    .from('fx_friday_closes')
    .upsert(rows, { onConflict: 'friday_date,pair' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, PAIRS.length)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  await markRunSuccess(sb, runId, PAIRS.length, rows.length, null, skipped.length)

  return json({
    success: true,
    run_id: runId,
    records_upserted: rows.length,
    friday_date: rows[0]?.friday_date ?? null,
    ...(skipped.length > 0 && { skipped }),
  })
}
