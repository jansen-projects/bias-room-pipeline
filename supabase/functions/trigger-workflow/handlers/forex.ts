import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { TICKER_MAP } from '../lib/maps.ts'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

const FOREX_TICKERS = Object.keys(TICKER_MAP)

interface ForexRow {
  effective_date: string
  pair: string
  base_currency: string | null
  quote_currency: string | null
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  prev_close: number | null
  change_pct: number | null
  rate: number | null
  source: string
  data_frequency: string
  source_timestamp: string
  source_payload_id: null
}

async function fetchTicker(ticker: string): Promise<ForexRow> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(ticker)}?interval=1d&range=5d`

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiasRoom/1.0)' },
  })
  if (!resp.ok) throw new Error(`Yahoo Finance ${resp.status} for ${ticker}`)

  const data = await resp.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`No chart result for ${ticker}`)

  const meta = result.meta ?? {}
  const timestamps: number[] = result.timestamp ?? []
  const q = result.indicators?.quote?.[0] ?? {}
  const closes: (number | null)[] = q.close ?? []
  const opens: (number | null)[] = q.open ?? []
  const highs: (number | null)[] = q.high ?? []
  const lows: (number | null)[] = q.low ?? []

  let i = closes.length - 1
  while (i >= 0 && closes[i] == null) i--
  if (i < 0) throw new Error(`All closes null for ${ticker}`)

  const close = closes[i]!
  const open = opens[i] ?? null
  const high = highs[i] ?? null
  const low = lows[i] ?? null
  const prevClose: number | null =
    meta.previousClose ?? meta.chartPreviousClose ?? null
  const changePct =
    close != null && prevClose != null && prevClose !== 0
      ? ((close - prevClose) / prevClose) * 100
      : null

  const effectiveDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
  const { pair, base, quote } = TICKER_MAP[ticker]

  return {
    effective_date: effectiveDate,
    pair,
    base_currency: base,
    quote_currency: quote,
    open,
    high,
    low,
    close,
    prev_close: prevClose,
    change_pct: changePct,
    rate: close,
    source: 'yahoo_finance',
    data_frequency: 'daily',
    source_timestamp: new Date().toISOString(),
    source_payload_id: null,
  }
}

export async function runForexDailyFetch(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const rows: ForexRow[] = []
  const failures: { ticker: string; message: string }[] = []

  for (const ticker of FOREX_TICKERS) {
    try {
      rows.push(await fetchTicker(ticker))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ ticker, message })
      await logError(sb, workflowId, runId, message, `ticker=${ticker}`)
    }
  }

  if (rows.length === 0) {
    await markRunFailed(sb, runId, `All ${failures.length} tickers failed`, failures.length)
    return json({ success: false, error: 'all_tickers_failed', run_id: runId }, 500)
  }

  const { error: upsertError } = await sb
    .from('forex_rates')
    .upsert(rows, { onConflict: 'pair,effective_date' })

  if (upsertError) {
    await markRunFailed(sb, runId, upsertError.message, FOREX_TICKERS.length)
    return json({ success: false, error: upsertError.message, run_id: runId }, 500)
  }

  const errorSummary =
    failures.length > 0
      ? `${failures.length} ticker(s) failed: ${failures.map((f) => f.ticker).join(', ')}`
      : null

  await markRunSuccess(sb, runId, FOREX_TICKERS.length, rows.length, errorSummary)

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: rows.length,
    ...(failures.length > 0 && { errors: failures }),
  })
}
