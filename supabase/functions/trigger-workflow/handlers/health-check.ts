/**
 * wf_health_check_hourly
 * Pings canary URLs for each data source.
 * Writes: system_health_logs  (one row per failing source per run)
 *
 * Schedule: 0 * * * * (every hour)
 *
 * Canary checks (HEAD or lightweight GET):
 *   FRED      — GET /fred/series/observations?series_id=DGS10&api_key=...&limit=1
 *   Yahoo     — GET /v8/finance/chart/EURUSD=X?interval=1d&range=1d (HEAD-like)
 *   CFTC      — GET https://www.cftc.gov/dea/newcot/f_natl.zip (HEAD)
 *   ForexFact — GET https://nfs.faireconomy.media/ff_calendar_thisweek.json (HEAD)
 *   ECB       — GET ECB data API canary
 *   BOC       — GET Bank of Canada Valet canary
 *   WorldBank — GET World Bank API canary
 *
 * A source is considered DOWN if:
 *   - HTTP status >= 500, or
 *   - Request times out (>15s), or
 *   - DNS resolution fails
 *
 * On success (all sources up): run completes with status='success', no rows inserted.
 * On failure: row inserted into system_health_logs for each failing source.
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, markRunFailed, markRunSuccess } from '../lib/ops.ts'

interface SourceCheck {
  dataset: string
  url: string
  method?: 'GET' | 'HEAD'
  expectedStatus?: number[]  // defaults to [200, 201, 206]
  timeoutMs?: number
}

interface HealthLogRow {
  check_time: string
  dataset: string
  issue_type: string
  severity: string
  detail: string
  resolved: boolean
}

const CHECKS: SourceCheck[] = [
  {
    dataset: 'FRED',
    // Use observations endpoint (same pattern as lib/fred.ts working handlers).
    url: 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=490e9a95560076f16b3b0313ff4367fa&limit=1&sort_order=desc&file_type=json',
    method: 'GET',
    timeoutMs: 15000,
  },
  {
    dataset: 'Yahoo Finance',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?interval=1d&range=1d',
    method: 'GET',
    timeoutMs: 10000,
  },
  {
    dataset: 'CFTC',
    url: 'https://www.cftc.gov/dea/newcot/f_natl.zip',
    method: 'HEAD',
    // CFTC CDN returns 403 for server-IP HEAD requests but 200 for browser GETs.
    // 403 = server alive (bot protection), not a true outage. Only 5xx = critical.
    expectedStatus: [200, 206, 302, 301, 403, 429],
    timeoutMs: 10000,
  },
  {
    dataset: 'ForexFactory',
    url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    method: 'HEAD',
    expectedStatus: [200, 206, 429],   // 429 = rate-limited but alive
    timeoutMs: 10000,
  },
  {
    dataset: 'ECB',
    url: 'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y?format=jsondata&lastNObservations=1',
    method: 'HEAD',
    expectedStatus: [200, 206],
    timeoutMs: 15000,
  },
  {
    dataset: 'Bank of Canada',
    url: 'https://www.bankofcanada.ca/valet/observations/group/bond_yields_all/json?recent=1',
    method: 'GET',
    timeoutMs: 10000,
  },
  {
    dataset: 'World Bank',
    url: 'https://api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG?format=json&mrv=1&per_page=1',
    method: 'GET',
    timeoutMs: 10000,
  },
]

async function checkSource(
  check: SourceCheck,
  checkTime: string,
): Promise<HealthLogRow | null> {
  const expectedStatuses = check.expectedStatus ?? [200, 201, 206]
  const timeoutMs = check.timeoutMs ?? 10000

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let status: number
    try {
      const resp = await fetch(check.url, {
        method: check.method ?? 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiasRoom/1.0; health-check)' },
        signal: controller.signal,
      })
      status = resp.status
    } finally {
      clearTimeout(timeout)
    }

    if (!expectedStatuses.includes(status)) {
      return {
        check_time: checkTime,
        dataset: check.dataset,
        issue_type: 'http_error',
        severity: status >= 500 ? 'critical' : 'warning',
        detail: `HTTP ${status} from ${check.url}`,
        resolved: false,
      }
    }

    return null  // healthy
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    const message = err instanceof Error ? err.message : String(err)
    // HTTP/2 stream errors from Supabase Edge Function runtime are transient
    // infrastructure issues, not true outages. Reclassify as 'warning'.
    const isHttp2StreamError = message.includes('http2 error: stream error')
    return {
      check_time: checkTime,
      dataset: check.dataset,
      issue_type: isTimeout ? 'timeout' : 'connection_error',
      severity: (isTimeout || isHttp2StreamError) ? 'warning' : 'critical',
      detail: isTimeout
        ? `Timeout after ${timeoutMs}ms: ${check.url}`
        : `${message}: ${check.url}`,
      resolved: false,
    }
  }
}

export async function runHealthCheckHourly(
  sb: SupabaseClient,
  runId: number,
  _workflowId: string,
): Promise<Response> {
  const checkTime = new Date().toISOString()

  // Run all checks in parallel
  const results = await Promise.all(CHECKS.map((c) => checkSource(c, checkTime)))
  const failures = results.filter((r): r is HealthLogRow => r !== null)

  if (failures.length === 0) {
    await markRunSuccess(sb, runId, CHECKS.length, 0, null, 0)
    return json({
      success: true,
      run_id: runId,
      sources_checked: CHECKS.length,
      sources_healthy: CHECKS.length,
    })
  }

  // Insert health log rows for failing sources
  const { error: insertErr } = await sb
    .from('system_health_logs')
    .insert(failures)

  if (insertErr) {
    await markRunFailed(sb, runId, insertErr.message, CHECKS.length)
    return json({ success: false, error: insertErr.message, run_id: runId }, 500)
  }

  const critCount = failures.filter((f) => f.severity === 'critical').length
  const warnCount = failures.filter((f) => f.severity === 'warning').length

  // Logging unhealthy sources is the normal operation — not a run failure.
  // Pass null errorSummary so run status = 'success'.
  await markRunSuccess(sb, runId, CHECKS.length, failures.length, null, 0)

  return json({
    success: true,   // run itself succeeded; source failures are logged, not run-fatal
    run_id: runId,
    sources_checked: CHECKS.length,
    sources_healthy: CHECKS.length - failures.length,
    issues: failures.map((f) => ({
      dataset: f.dataset,
      issue_type: f.issue_type,
      severity: f.severity,
      detail: f.detail,
    })),
    critical: critCount,
    warning: warnCount,
  })
}
