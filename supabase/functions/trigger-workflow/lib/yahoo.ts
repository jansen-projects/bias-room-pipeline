/**
 * Shared Yahoo Finance v8 chart fetcher.
 * Returns the latest valid (non-null) daily close plus OHLC and prev close.
 */
export interface YahooQuote {
  effectiveDate: string        // YYYY-MM-DD of the latest trading day
  close: number
  open: number | null
  high: number | null
  low: number | null
  prevClose: number | null
  changePct: number | null
  exchangeName: string | null
  instrumentType: string | null
}

export async function fetchYahooChart(ticker: string): Promise<YahooQuote> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(ticker)}?interval=1d&range=5d`

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiasRoom/1.0)' },
  })
  if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status} for ${ticker}`)

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

  // Walk backwards to the last non-null close
  let i = closes.length - 1
  while (i >= 0 && closes[i] == null) i--
  if (i < 0) throw new Error(`All closes are null for ${ticker}`)

  const close = closes[i]!
  const prevClose: number | null = meta.previousClose ?? meta.chartPreviousClose ?? null
  const changePct =
    prevClose != null && prevClose !== 0
      ? ((close - prevClose) / prevClose) * 100
      : null

  return {
    effectiveDate: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
    close,
    open: opens[i] ?? null,
    high: highs[i] ?? null,
    low: lows[i] ?? null,
    prevClose,
    changePct,
    exchangeName: meta.exchangeName ?? null,
    instrumentType: meta.instrumentType ?? null,
  }
}
