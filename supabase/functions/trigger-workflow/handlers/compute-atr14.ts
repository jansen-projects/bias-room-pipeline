/**
 * wf_compute_atr14_daily
 * Reads:  forex_rates (last 20 rows per pair, ordered by effective_date DESC)
 * Writes: daily_atr14  UNIQUE(effective_date, pair)
 *
 * ATR-14 algorithm:
 *   For each bar, True Range = max(H-L, |H-prevClose|, |L-prevClose|) when OHLC available.
 *   When high/low are null (ECB source rows), TR falls back to |close - prevClose|.
 *   ATR-14 = simple 14-period average of the most recent 14 True Ranges.
 *
 * warning_threshold  = 1.5 × ATR-14
 * critical_threshold = 2.0 × ATR-14
 *
 * Note: ATR quality improves as Yahoo OHLC data accumulates. Rows without H/L contribute
 * a close-to-close TR estimate which underestimates true intraday range.
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

const PAIRS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'XAUUSD']
const ATR_PERIOD = 14
const LOOKBACK = ATR_PERIOD + 6  // fetch extra rows to ensure 14 valid TRs

interface ForexRow {
  effective_date: string
  rate: number
  high: number | null
  low: number | null
  close: number | null
}

interface Atr14Row {
  effective_date: string
  pair: string
  atr14: number
  prev_atr14: number | null
  // warning_threshold and critical_threshold are GENERATED ALWAYS AS columns
  // (0.5×atr14 and 1.2×atr14) — do NOT include in upsert payload
}

function round(n: number, dp = 6): number {
  return Math.round(n * 10 ** dp) / 10 ** dp
}

/** Compute ATR-14 from a list of rows (newest → oldest). Returns null if insufficient data. */
function computeAtr14(rows: ForexRow[]): { atr14: number } | null {
  if (rows.length < 2) return null

  const trValues: number[] = []

  for (let i = 0; i < rows.length - 1; i++) {
    const curr = rows[i]
    const prev = rows[i + 1]
    const currClose = curr.close ?? curr.rate
    const prevClose = prev.close ?? prev.rate

    let tr: number
    if (curr.high !== null && curr.low !== null) {
      // Full OHLC available → proper True Range
      tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prevClose),
        Math.abs(curr.low - prevClose),
      )
    } else {
      // No OHLC → close-to-close proxy
      tr = Math.abs(currClose - prevClose)
    }

    trValues.push(tr)
  }

  if (trValues.length < ATR_PERIOD) return null

  // Use the most recent 14 TRs (trValues[0] is the most recent)
  const recent14 = trValues.slice(0, ATR_PERIOD)
  const atr14 = recent14.reduce((sum, v) => sum + v, 0) / ATR_PERIOD

  return { atr14 }
}

export async function runComputeAtr14Daily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10)
  const rows: Atr14Row[] = []
  const skipped: string[] = []

  for (const pair of PAIRS) {
    try {
      // Fetch last LOOKBACK rows for this pair, newest first
      const { data: forex, error } = await sb
        .from('forex_rates')
        .select('effective_date, rate, high, low, close')
        .eq('pair', pair)
        .order('effective_date', { ascending: false })
        .limit(LOOKBACK)

      if (error) throw new Error(`DB read error for ${pair}: ${error.message}`)
      if (!forex || forex.length < 2) {
        skipped.push(`${pair}: insufficient rows (${forex?.length ?? 0})`)
        continue
      }

      const typed: ForexRow[] = forex.map((r: Record<string, unknown>) => ({
        effective_date: r.effective_date as string,
        rate: parseFloat(String(r.rate)),
        high: r.high !== null ? parseFloat(String(r.high)) : null,
        low: r.low !== null ? parseFloat(String(r.low)) : null,
        close: r.close !== null ? parseFloat(String(r.close)) : null,
      }))

      const result = computeAtr14(typed)
      if (!result) {
        skipped.push(`${pair}: need ${ATR_PERIOD + 1} rows with data, only ${typed.length} available`)
        continue
      }

      // Fetch previous ATR14 for this pair (yesterday's row)
      const { data: prevAtrRow } = await sb
        .from('daily_atr14')
        .select('atr14')
        .eq('pair', pair)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const prevAtr14 = prevAtrRow ? parseFloat(String(prevAtrRow.atr14)) : null

      rows.push({
        effective_date: today,
        pair,
        atr14: round(result.atr14),
        prev_atr14: prevAtr14 !== null ? round(prevAtr14) : null,
        // warning_threshold = atr14 * 0.5 (generated)
        // critical_threshold = atr14 * 1.2 (generated)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      skipped.push(`${pair}: ${message}`)
      await logError(sb, workflowId, runId, message, `compute_atr14/${pair}`, 'unknown', { pair })
    }
  }

  if (rows.length === 0) {
    const errMsg = `No ATR-14 rows computed. Skipped: ${skipped.join('; ')}`
    await markRunFailed(sb, runId, errMsg, PAIRS.length)
    return json({ success: false, error: errMsg, run_id: runId }, 500)
  }

  const { error: upsertErr } = await sb
    .from('daily_atr14')
    .upsert(rows, { onConflict: 'effective_date,pair' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, PAIRS.length)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  await markRunSuccess(sb, runId, PAIRS.length, rows.length, null, skipped.length)

  return json({
    success: true,
    run_id: runId,
    records_upserted: rows.length,
    ...(skipped.length > 0 && { skipped }),
  })
}
