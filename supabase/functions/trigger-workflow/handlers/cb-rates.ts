import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { CB_SERIES } from '../lib/maps.ts'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

const CB_SERIES_IDS = Object.keys(CB_SERIES)

interface CbRateRow {
  currency: string
  region: string
  central_bank: string
  series_id: string
  series_label: string
  rate_type: string
  data_frequency: string
  source: string
  rate: number
  prev_rate: number | null
  effective_date: string
  release_date: string
  rate_change: number | null
  updated_at: string
  is_canonical: boolean
  is_manual_override: boolean
}

interface FredObservation {
  date: string
  value: string
}

async function fetchFredSeries(
  seriesId: string,
  apiKey: string,
): Promise<CbRateRow> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${seriesId}&api_key=${apiKey}` +
    `&sort_order=desc&limit=2&file_type=json`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`FRED ${resp.status} for ${seriesId}`)

  const data = await resp.json()
  if (data.error_message) throw new Error(`FRED: ${data.error_message}`)

  const obs: FredObservation[] = (data.observations ?? []).filter(
    (o: FredObservation) => o.value !== '.',
  )
  if (obs.length === 0) throw new Error(`No valid observations for ${seriesId}`)

  const latest = obs[0]
  const previous = obs[1] ?? null
  const rate = parseFloat(latest.value)
  const prevRate = previous ? parseFloat(previous.value) : null
  const meta = CB_SERIES[seriesId]

  return {
    currency: meta.currency,
    region: meta.region,
    central_bank: meta.centralBank,
    series_id: seriesId,
    series_label: meta.seriesLabel,
    rate_type: 'policy_rate',
    data_frequency: meta.frequency,
    source: 'FRED',
    rate,
    prev_rate: prevRate,
    effective_date: latest.date,
    release_date: latest.date,
    rate_change: prevRate !== null ? rate - prevRate : null,
    updated_at: new Date().toISOString(),
    is_canonical: true,        // FRED/official source = canonical
    is_manual_override: false,
  }
}

export async function runCbRatesDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const fredApiKey = Deno.env.get('FRED_API_KEY')
  if (!fredApiKey) {
    await markRunFailed(sb, runId, 'FRED_API_KEY env var not set')
    return json({ success: false, error: 'missing_fred_api_key', run_id: runId }, 500)
  }

  const rows: CbRateRow[] = []
  const failures: { series: string; message: string }[] = []

  for (const seriesId of CB_SERIES_IDS) {
    try {
      rows.push(await fetchFredSeries(seriesId, fredApiKey))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ series: seriesId, message })
      await logError(sb, workflowId, runId, message, `series=${seriesId}`)
    }
  }

  if (rows.length === 0) {
    await markRunFailed(sb, runId, `All ${failures.length} series failed`, failures.length)
    return json({ success: false, error: 'all_series_failed', run_id: runId }, 500)
  }

  const { error: upsertError } = await sb
    .from('central_bank_rates')
    .upsert(rows, { onConflict: 'series_id,effective_date' })

  if (upsertError) {
    await markRunFailed(sb, runId, upsertError.message, CB_SERIES_IDS.length)
    return json({ success: false, error: upsertError.message, run_id: runId }, 500)
  }

  const errorSummary =
    failures.length > 0
      ? `${failures.length} series failed: ${failures.map((f) => f.series).join(', ')}`
      : null

  await markRunSuccess(sb, runId, CB_SERIES_IDS.length, rows.length, errorSummary)

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: rows.length,
    ...(failures.length > 0 && { errors: failures }),
  })
}
