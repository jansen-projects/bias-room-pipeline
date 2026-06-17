/**
 * Shared FRED (Federal Reserve Economic Data) observations fetcher.
 *
 * Uses limit=5 with sort_order=desc to ensure at least 2 valid observations
 * even when recent entries carry "." (FRED's placeholder for no-data days).
 *
 * Retries up to 3 times with exponential backoff on transient HTTP errors
 * (429, 500, 502, 503, 504) to stay within FRED's 120 req/day free tier.
 */
export interface FredObs {
  date: string        // YYYY-MM-DD of the latest valid observation
  value: number
  prevDate: string | null
  prevValue: number | null
}

const MAX_RETRIES = 3
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt)

    try {
      const resp = await fetch(url)

      if (!resp.ok) {
        if (RETRYABLE_STATUSES.has(resp.status) && attempt < MAX_RETRIES - 1) {
          lastError = new Error(`FRED HTTP ${resp.status} for ${seriesId}`)
          continue
        }
        throw new Error(`FRED HTTP ${resp.status} for ${seriesId}`)
      }

      const data = await resp.json()
      const raw: Array<{ date: string; value: string }> = data.observations ?? []

      const valid = raw.filter((o) => o.value !== '.')
      if (valid.length === 0) throw new Error(`FRED: no valid observations for ${seriesId}`)

      return {
        date: valid[0].date,
        value: parseFloat(valid[0].value),
        prevDate: valid.length > 1 ? valid[1].date : null,
        prevValue: valid.length > 1 ? parseFloat(valid[1].value) : null,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt >= MAX_RETRIES - 1) break
    }
  }

  throw lastError ?? new Error(`FRED: failed after ${MAX_RETRIES} attempts for ${seriesId}`)
}
