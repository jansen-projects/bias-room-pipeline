/**
 * Shared FRED (Federal Reserve Economic Data) observations fetcher.
 *
 * Uses limit=5 with sort_order=desc to ensure at least 2 valid observations
 * even when recent entries carry "." (FRED's placeholder for no-data days).
 */
export interface FredObs {
  date: string        // YYYY-MM-DD of the latest valid observation
  value: number
  prevDate: string | null
  prevValue: number | null
}

export async function fetchFredObs(
  seriesId: string,
  apiKey: string,
): Promise<FredObs> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&limit=5&sort_order=desc&file_type=json`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`FRED HTTP ${resp.status} for ${seriesId}`)

  const data = await resp.json()
  const raw: Array<{ date: string; value: string }> = data.observations ?? []

  // Filter out "." placeholder entries (no data for that day)
  const valid = raw.filter((o) => o.value !== '.')
  if (valid.length === 0) throw new Error(`FRED: no valid observations for ${seriesId}`)

  return {
    date: valid[0].date,
    value: parseFloat(valid[0].value),
    prevDate: valid.length > 1 ? valid[1].date : null,
    prevValue: valid.length > 1 ? parseFloat(valid[1].value) : null,
  }
}
