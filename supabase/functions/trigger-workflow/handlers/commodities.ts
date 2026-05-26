/**
 * wf_commodities_daily
 * Sources: Yahoo Finance (GC=F, CL=F, HG=F)
 * Target:  commodity_prices  UNIQUE(effective_date, commodity_code)
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'
import { fetchYahooChart } from '../lib/yahoo.ts'

interface CommodityCfg {
  ticker: string
  commodityCode: string
  commodityName: string
  unit: string
}

const TICKERS: CommodityCfg[] = [
  { ticker: 'GC=F', commodityCode: 'GOLD_FUTURES', commodityName: 'Gold Futures',  unit: 'per troy oz' },
  { ticker: 'CL=F', commodityCode: 'WTI_CRUDE',    commodityName: 'WTI Crude Oil', unit: 'per barrel'  },
  { ticker: 'HG=F', commodityCode: 'COPPER',       commodityName: 'Copper Futures', unit: 'per lb'     },
]

interface CommodityRow {
  effective_date: string
  commodity_code: string
  commodity_name: string
  price: number
  currency: string
  unit: string
  source: string
  source_timestamp: string
}

export async function runCommoditiesDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const rows: CommodityRow[] = []
  const failures: { ticker: string; message: string }[] = []

  for (const cfg of TICKERS) {
    try {
      const q = await fetchYahooChart(cfg.ticker)
      rows.push({
        effective_date: q.effectiveDate,
        commodity_code: cfg.commodityCode,
        commodity_name: cfg.commodityName,
        price: q.close,
        currency: 'USD',
        unit: cfg.unit,
        source: 'yahoo_finance',
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
    .from('commodity_prices')
    .upsert(rows, { onConflict: 'effective_date,commodity_code' })

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
