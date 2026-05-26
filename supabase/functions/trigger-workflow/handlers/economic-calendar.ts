/**
 * wf_economic_calendar_daily
 * Source:  ForexFactory JSON feed  https://nfs.faireconomy.media/ff_calendar_thisweek.json
 * Target:  economic_calendar  UNIQUE(event_date, currency, event_name)
 *
 * ⚠️  ForexFactory rate-limit: ~1 request per 15 min from same IP.
 *     pg_cron schedule: 0 4 * * * (once at 04:00 UTC daily).
 *
 * ⚠️  The `actual` field in the FF JSON feed is always null.
 *     Do NOT attempt to parse it. The actuals-fill workflow is deferred.
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, logError, markRunFailed, markRunSuccess } from '../lib/ops.ts'

interface FfEvent {
  title: string
  country: string
  date: string     // ISO8601 with timezone offset, e.g. "2026-05-23T14:30:00-04:00"
  impact: string   // "High" | "Medium" | "Low" | "Holiday"
  forecast: string | null
  previous: string | null
  actual: null     // always null in JSON feed
}

interface CalendarRow {
  event_date: string              // date
  event_time: string | null       // time without time zone
  currency: string
  event_name: string
  impact: string
  actual: null
  forecast: string | null
  previous: string | null
  source: string
  source_timestamp: string
  data_frequency: string
}

/** Split "2026-05-23T14:30:00-04:00" → { eventDate: "2026-05-23", eventTime: "14:30:00" } */
function parseFfDate(dateStr: string): { eventDate: string; eventTime: string | null } {
  const tIdx = dateStr.indexOf('T')
  if (tIdx < 0) {
    return { eventDate: dateStr.slice(0, 10), eventTime: null }
  }
  const eventDate = dateStr.slice(0, tIdx)
  const timePart = dateStr.slice(tIdx + 1)
  const m = timePart.match(/^(\d{2}:\d{2}:\d{2})/)
  return { eventDate, eventTime: m ? m[1] : null }
}

export async function runEconomicCalendarDaily(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  // ── 1. Fetch ForexFactory calendar ──────────────────────────────────────
  let events: FfEvent[]
  try {
    const resp = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiasRoom/1.0)' },
    })
    if (!resp.ok) {
      const msg = `ForexFactory HTTP ${resp.status}`
      await logError(sb, workflowId, runId, msg, 'fetch', 'http_error')
      await markRunFailed(sb, runId, msg)
      return json({ success: false, error: msg, run_id: runId }, 502)
    }
    events = await resp.json()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logError(sb, workflowId, runId, message, 'fetch', 'unknown')
    await markRunFailed(sb, runId, message)
    return json({ success: false, error: message, run_id: runId }, 500)
  }

  if (!Array.isArray(events) || events.length === 0) {
    const msg = 'ForexFactory returned empty or non-array response'
    await logError(sb, workflowId, runId, msg, 'parse', 'parse_error')
    await markRunFailed(sb, runId, msg)
    return json({ success: false, error: msg, run_id: runId }, 500)
  }

  // ── 2. Map to CalendarRow ─────────────────────────────────────────────
  const sourceTs = new Date().toISOString()

  // impact CHECK constraint: 'Low' | 'Medium' | 'High' only.
  // ForexFactory also returns 'Holiday' — skip those rows; they're not economic releases.
  const VALID_IMPACTS = new Set(['Low', 'Medium', 'High'])

  const rows: CalendarRow[] = events
    .filter((ev) => VALID_IMPACTS.has(ev.impact))
    .map((ev) => {
      const { eventDate, eventTime } = parseFfDate(ev.date ?? '')
      return {
        event_date: eventDate,
        event_time: eventTime,
        currency: ev.country,          // FF uses "country" but it's the 3-letter currency code
        event_name: ev.title,
        impact: ev.impact,
        actual: null,                  // always null in FF JSON feed
        forecast: ev.forecast || null, // empty string → null
        previous: ev.previous || null,
        source: 'ForexFactory',
        source_timestamp: sourceTs,
        data_frequency: 'event',       // CHECK constraint: only 'event' or NULL allowed
      }
    })

  // ── 3. Deduplicate on UNIQUE key (event_date, currency, event_name) ──────
  // ForexFactory may include duplicate entries in the same feed (e.g. revised
  // releases listed twice). PostgreSQL will error if the same key appears twice
  // in one upsert batch, so we collapse to last-wins per key.
  const seen = new Map<string, CalendarRow>()
  for (const row of rows) {
    seen.set(`${row.event_date}|${row.currency}|${row.event_name}`, row)
  }
  const dedupedRows = Array.from(seen.values())

  // ── 4. Upsert ─────────────────────────────────────────────────────────
  // Batch in chunks of 500 to stay well within Supabase payload limits
  const CHUNK = 500
  let totalUpserted = 0
  for (let i = 0; i < dedupedRows.length; i += CHUNK) {
    const chunk = dedupedRows.slice(i, i + CHUNK)
    const { error: upsertErr } = await sb
      .from('economic_calendar')
      .upsert(chunk, { onConflict: 'event_date,currency,event_name' })

    if (upsertErr) {
      await logError(sb, workflowId, runId, upsertErr.message, 'upsert', 'db_error')
      await markRunFailed(sb, runId, upsertErr.message, events.length)
      return json({ success: false, error: upsertErr.message, run_id: runId }, 500)
    }
    totalUpserted += chunk.length
  }

  const skippedHolidays = events.length - rows.length    // holiday-impact rows filtered out
  const skippedDupes = rows.length - dedupedRows.length  // duplicate key rows collapsed
  const totalSkipped = skippedHolidays + skippedDupes

  await markRunSuccess(sb, runId, events.length, totalUpserted, null, totalSkipped)

  return json({
    success: true,
    run_id: runId,
    records_fetched: events.length,
    records_upserted: totalUpserted,
    records_skipped: totalSkipped,
  })
}
