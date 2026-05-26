/**
 * wf_market_indices_daily
 * Sources: Yahoo Finance (DX-Y.NYB, ^GSPC, ^VIX, ^IXIC)
 * Target:  market_indices  UNIQUE(effective_date, asset)
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'
import { fetchYahooChart } from '../lib/yahoo.ts'

interface TickerCfg {
  ticker: string
  asset: string        // value for the `asset` UNIQUE column
  symbol: string       // kept in `symbol` column for charting
  assetClass: string
}

// assetClass values must match the CHECK constraint on market_indices:
//   'volatility_index' | 'equity_index' | 'commodity' | 'currency_index'
const TICKERS: TickerCfg[] = [
  { ticker: 'DX-Y.NYB', asset: 'DXY',    symbol: 'DX-Y.NYB', assetClass: 'currency_index'   },
  { ticker: '^GSPC',    asset: 'SPX',    symbol: '^GSPC',    assetClass: 'equity_index'     },
  { ticker: '^VIX',     asset: 'VIX',    symbol: '^VIX',     assetClass: 'volatility_index' },
  { ticker: '^IXIC',    asset: 'NASDAQ', symbol: '^IXIC',    assetClass: 'equity_index'     },
]

interface MarketIndexRow {
  effective_date: string
  asset: string
  symbol: string
  price: number
  open: number | null
  high: number | null
  low: number | null
  prev_close: number | null
  change_pct: number | null
  source: string
  asset_class: string
  instrument_type: string
  data_frequency: string
  exchange_name: string | null
  source_timestamp: string
}

export async function runMarketIndicesDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const rows: MarketIndexRow[] = []
  const failures: { ticker: string; message: string }[] = []

  for (const cfg of TICKERS) {
    try {
      const q = await fetchYahooChart(cfg.ticker)
      rows.push({
        effective_date: q.effectiveDate,
        asset: cfg.asset,
        symbol: cfg.symbol,
        price: q.close,
        open: q.open,
        high: q.high,
        low: q.low,
        prev_close: q.prevClose,
        change_pct: q.changePct,
        source: 'yahoo_finance',
        asset_class: cfg.assetClass,
        instrument_type: q.instrumentType ?? 'index',
        data_frequency: 'daily',
        exchange_name: q.exchangeName,
        source_timestamp: new Date().toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ ticker: cfg.ticker, message })
      await logError(sb, workflowId, runId, message, `ticker=${cfg.ticker}`, 'http_error', {
        ticker: cfg.ticker,
      })
    }
  }

  if (rows.length === 0) {
    await markRunFailed(sb, runId, `All ${TICKERS.length} tickers failed`, TICKERS.length)
    return json({ success: false, error: 'all_tickers_failed', run_id: runId }, 500)
  }

  const { error: upsertErr } = await sb
    .from('market_indices')
    .upsert(rows, { onConflict: 'effective_date,asset' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, TICKERS.length)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  const errorSummary =
    failures.length > 0
      ? `${failures.length} ticker(s) failed: ${failures.map((f) => f.ticker).join(', ')}`
      : null

  await markRunSuccess(sb, runId, TICKERS.length, rows.length, errorSummary, failures.length)

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: rows.length,
    ...(failures.length > 0 && { errors: failures }),
  })
}
