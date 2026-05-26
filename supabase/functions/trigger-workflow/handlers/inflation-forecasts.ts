/**
 * wf_inflation_forecasts_weekly
 * Source:  World Bank API — CPI indicator FP.CPI.TOTL.ZG (annual % change)
 * Target:  inflation_forecasts  UNIQUE(currency_code, forecast_date, forecast_year, source_code)
 *
 * World Bank data is annual and updated ~once per year. Running weekly keeps a
 * snapshot history of what data was available on each Monday.
 *
 * Mapping:
 *   forecast_date  = today (date the data was fetched)
 *   forecast_year  = year string from World Bank response (e.g. "2024")
 *   cpi_forecast   = [1][0].value  (most recent year)
 *   cpi_prev       = [1][1].value  (previous year, for context)
 *   source_code    = 'WORLDBANK'
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

// World Bank ISO-2 country codes for our currency universe.
// EUR → DE (Germany): World Bank's XC (Euro area aggregate) does not carry
//   FP.CPI.TOTL.ZG data. Germany is the standard macro proxy for EUR inflation.
const CURRENCY_ISO2: Array<{ currency: string; iso2: string }> = [
  { currency: 'USD', iso2: 'US' },
  { currency: 'EUR', iso2: 'DE' },  // Germany proxy — XC has no CPI in World Bank
  { currency: 'JPY', iso2: 'JP' },
  { currency: 'GBP', iso2: 'GB' },
  { currency: 'CHF', iso2: 'CH' },
  { currency: 'CAD', iso2: 'CA' },
  { currency: 'AUD', iso2: 'AU' },
  { currency: 'NZD', iso2: 'NZ' },
]

const INDICATOR = 'FP.CPI.TOTL.ZG'
const SOURCE_CODE = 'WORLDBANK'

interface InflationForecastRow {
  currency_code: string
  forecast_date: string
  forecast_year: number
  cpi_forecast: number | null
  cpi_prev: number | null
  source_code: string
  source_reference: string
}

async function fetchWorldBankCpi(
  iso2: string,
): Promise<{ year: number; value: number | null; prevYear: number | null; prevValue: number | null }> {
  const url =
    `https://api.worldbank.org/v2/country/${encodeURIComponent(iso2)}` +
    `/indicator/${INDICATOR}?format=json&mrv=2&per_page=2`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`World Bank HTTP ${resp.status} for ${iso2}`)

  const data = await resp.json()
  // Response shape: [ metadata, [ {date, value}, {date, value} ] ]
  const rows: Array<{ date: string; value: number | null }> = data?.[1] ?? []
  if (!rows.length) throw new Error(`World Bank: no data for ${iso2}`)

  const latest = rows[0]
  const prev = rows.length > 1 ? rows[1] : null

  return {
    year: parseInt(latest.date, 10),
    value: latest.value,
    prevYear: prev ? parseInt(prev.date, 10) : null,
    prevValue: prev?.value ?? null,
  }
}

export async function runInflationForecastsWeekly(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const forecastDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const rows: InflationForecastRow[] = []
  const failures: { currency: string; message: string }[] = []

  for (const { currency, iso2 } of CURRENCY_ISO2) {
    try {
      const d = await fetchWorldBankCpi(iso2)
      const sourceRef =
        `https://api.worldbank.org/v2/country/${iso2}/indicator/${INDICATOR}?format=json&mrv=2`

      rows.push({
        currency_code: currency,
        forecast_date: forecastDate,
        forecast_year: d.year,
        cpi_forecast: d.value,
        cpi_prev: d.prevValue,
        source_code: SOURCE_CODE,
        source_reference: sourceRef,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ currency, message })
      await logError(sb, workflowId, runId, message, `WorldBank/${currency}`, 'http_error', {
        currency,
        iso2,
      })
    }
  }

  if (rows.length === 0) {
    await markRunFailed(sb, runId, `All ${CURRENCY_ISO2.length} currencies failed`, CURRENCY_ISO2.length)
    return json({ success: false, error: 'all_currencies_failed', run_id: runId }, 500)
  }

  const { error: upsertErr } = await sb
    .from('inflation_forecasts')
    .upsert(rows, { onConflict: 'currency_code,forecast_date,forecast_year,source_code' })

  if (upsertErr) {
    await markRunFailed(sb, runId, upsertErr.message, CURRENCY_ISO2.length)
    return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
  }

  const errorSummary =
    failures.length > 0
      ? `${failures.length} currency(ies) failed: ${failures.map((f) => f.currency).join(', ')}`
      : null

  await markRunSuccess(
    sb, runId, CURRENCY_ISO2.length, rows.length, errorSummary, failures.length,
  )

  return json({
    success: errorSummary === null,
    run_id: runId,
    records_upserted: rows.length,
    ...(failures.length > 0 && { errors: failures }),
  })
}
