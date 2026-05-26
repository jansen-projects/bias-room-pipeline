import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { CFTC_CODE_MAP } from '../lib/maps.ts'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

const CFTC_CODES = Object.keys(CFTC_CODE_MAP)

interface CotRow {
  report_date: string
  effective_date: string
  currency: string
  long_positions: number
  short_positions: number
  net_position: number
  prev_net: number
  net_change: number
  cftc_code: string
  source: string
  data_frequency: string
  report_type: string
  trader_category: string
}

interface CftcRecord {
  report_date_as_yyyy_mm_dd: string
  cftc_contract_market_code: string
  noncomm_positions_long_all: string
  noncomm_positions_short_all: string
  change_in_noncomm_long_all: string
  change_in_noncomm_short_all: string
}

async function fetchCotData(): Promise<CotRow[]> {
  const codeList = CFTC_CODES.map((c) => `'${c}'`).join(',')
  const url =
    `https://publicreporting.cftc.gov/resource/6dca-aqww.json` +
    `?$where=cftc_contract_market_code in(${codeList})` +
    `&$order=report_date_as_yyyy_mm_dd DESC` +
    `&$limit=9`

  const resp = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!resp.ok) throw new Error(`CFTC API ${resp.status}`)

  const records: CftcRecord[] = await resp.json()
  if (!records.length) throw new Error('CFTC API returned no records')

  return records.map((r) => {
    const long = parseInt(r.noncomm_positions_long_all, 10)
    const short = parseInt(r.noncomm_positions_short_all, 10)
    const changeLong = parseInt(r.change_in_noncomm_long_all, 10)
    const changeShort = parseInt(r.change_in_noncomm_short_all, 10)
    const net = long - short
    const netChange = changeLong - changeShort
    const reportDate = r.report_date_as_yyyy_mm_dd.slice(0, 10)

    return {
      report_date: reportDate,
      effective_date: reportDate,
      currency: CFTC_CODE_MAP[r.cftc_contract_market_code],
      long_positions: long,
      short_positions: short,
      net_position: net,
      prev_net: net - netChange,
      net_change: netChange,
      cftc_code: r.cftc_contract_market_code,
      source: 'CFTC',
      data_frequency: 'weekly',
      report_type: 'legacy_futures_only',
      trader_category: 'non_commercial',
    }
  })
}

export async function runCotWeekly(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  let rows: CotRow[]

  try {
    rows = await fetchCotData()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logError(sb, workflowId, runId, message)
    await markRunFailed(sb, runId, message, 0)
    return json({ success: false, error: message, run_id: runId }, 500)
  }

  const { error: upsertError } = await sb
    .from('cot_positioning')
    .upsert(rows, { onConflict: 'report_date,currency' })

  if (upsertError) {
    await markRunFailed(sb, runId, upsertError.message, rows.length)
    return json({ success: false, error: upsertError.message, run_id: runId }, 500)
  }

  await markRunSuccess(sb, runId, rows.length, rows.length)

  return json({ success: true, run_id: runId, records_upserted: rows.length })
}
