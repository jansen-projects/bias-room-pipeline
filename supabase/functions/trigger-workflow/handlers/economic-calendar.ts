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
  event_time_et: string | null    // ET (UTC-4/-5) from FF offset
  event_time_pht: string | null   // PHT (UTC+8)
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

function parseFfDate(dateStr: string): {
  eventDate: string
  eventTime: string | null
  eventTimeEt: string | null
  eventTimePht: string | null
} {
  const tIdx = dateStr.indexOf('T')
  if (tIdx < 0) {
    return { eventDate: dateStr.slice(0, 10), eventTime: null, eventTimeEt: null, eventTimePht: null }
  }
  const eventDate = dateStr.slice(0, tIdx)
  const timePart = dateStr.slice(tIdx + 1)
  const m = timePart.match(/^(\d{2}:\d{2}:\d{2})/)
  const eventTime = m ? m[1] : null

  // FF timestamps include offset (e.g. -04:00 for EDT). The time portion IS ET.
  const eventTimeEt = eventTime

  // Compute PHT (UTC+8) from the full ISO timestamp
  let eventTimePht: string | null = null
  if (eventTime) {
    try {
      const utcMs = new Date(dateStr).getTime()
      if (!isNaN(utcMs)) {
        const pht = new Date(utcMs + 8 * 3_600_000)
        eventTimePht = pht.toISOString().slice(11, 19)
      }
    } catch { /* leave null */ }
  }

  return { eventDate, eventTime, eventTimeEt, eventTimePht }
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
      const { eventDate, eventTime, eventTimeEt, eventTimePht } = parseFfDate(ev.date ?? '')
      return {
        event_date: eventDate,
        event_time: eventTime,
        event_time_et: eventTimeEt,
        event_time_pht: eventTimePht,
        currency: ev.country,
        event_name: ev.title,
        impact: ev.impact,
        actual: null,
        forecast: ev.forecast || null,
        previous: ev.previous || null,
        source: 'ForexFactory',
        source_timestamp: sourceTs,
        data_frequency: 'event',
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
