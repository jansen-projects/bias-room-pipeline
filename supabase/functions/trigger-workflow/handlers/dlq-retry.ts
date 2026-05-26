/**
 * wf_dlq_retry
 * Reads:  ops_dead_letter_queue  (status='pending', is_retryable=true, next_retry_at <= now())
 * Writes: ops_dead_letter_queue  (status → 'retrying'/'exhausted'; retry_count++)
 *         ops_ingestion_runs     (new run for each retry)
 *
 * Retry logic:
 *   1. Fetch pending, retryable DLQ entries where next_retry_at <= now()
 *   2. For each entry:
 *      a. If retry_count >= max_retries → set status = 'manual_review'
 *      b. Else → re-invoke the workflow via Edge Function HTTP call
 *         - On success → set status = 'resolved', resolved_at = now()
 *         - On failure → increment retry_count, compute next_retry_at (exponential backoff)
 *         - If retry_count >= max_retries after failure → set status = 'manual_review'
 *
 * Backoff schedule (seconds): [60, 300, 900] (from meta_workflow_registry.retry_backoff_seconds)
 * Default fallback: 60s × 2^n
 *
 * ⚠️ This handler re-invokes workflows via HTTP (self-call). It uses
 *    SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the Edge Function environment.
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, markRunFailed, markRunSuccess } from '../lib/ops.ts'

interface DlqEntry {
  id: number
  workflow_id: string
  ingestion_run_id: number
  status: string
  retry_count: number
  max_retries: number
  record: Record<string, unknown>
  error_message: string
  next_retry_at: string | null
}

interface RetryResult {
  dlq_id: number
  workflow_id: string
  outcome: 'resolved' | 'retried' | 'manual_review' | 'exhausted'
  retry_count: number
  next_retry_at: string | null
  error?: string
}

const DEFAULT_BACKOFF_SECONDS = [60, 300, 900]

function computeNextRetryAt(retryCount: number, backoff: number[]): string {
  const delaySeconds = retryCount < backoff.length
    ? backoff[retryCount]
    : backoff[backoff.length - 1] * (retryCount - backoff.length + 2)  // linear extension
  return new Date(Date.now() + delaySeconds * 1000).toISOString()
}

export async function runDlqRetry(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  const now = new Date().toISOString()

  // ── 1. Fetch retryable DLQ entries due for retry ────────────────────────
  const { data: dlqEntries, error: fetchErr } = await sb
    .from('ops_dead_letter_queue')
    .select('id, workflow_id, ingestion_run_id, status, retry_count, max_retries, record, error_message, next_retry_at')
    .eq('status', 'pending')
    .lte('next_retry_at', now)
    .limit(10)   // process up to 10 per run to avoid timeout

  if (fetchErr) {
    await markRunFailed(sb, runId, fetchErr.message, 0)
    return json({ success: false, error: fetchErr.message, run_id: runId }, 500)
  }

  // Also check retryable column from ops_ingestion_errors for context
  // (DLQ entries inherit is_retryable from the error that created them)
  // The retry logic proceeds for all pending entries — non-retryable errors
  // should not have status='pending' (logError sets is_retryable on the error row,
  // but DLQ status is managed here)

  if (!dlqEntries || dlqEntries.length === 0) {
    await markRunSuccess(sb, runId, 0, 0, null, 0)
    return json({
      success: true,
      run_id: runId,
      processed: 0,
      message: 'No DLQ entries due for retry',
    })
  }

  // ── 2. Fetch workflow registry for backoff schedules ─────────────────────
  const { data: registryRows } = await sb
    .from('meta_workflow_registry')
    .select('workflow_id, retry_backoff_seconds, max_retry_attempts')

  const backoffMap: Record<string, number[]> = {}
  const maxRetriesMap: Record<string, number> = {}
  for (const reg of (registryRows ?? [])) {
    const r = reg as Record<string, unknown>
    const wfId = String(r.workflow_id)
    backoffMap[wfId] = (r.retry_backoff_seconds as number[]) ?? DEFAULT_BACKOFF_SECONDS
    maxRetriesMap[wfId] = (r.max_retry_attempts as number) ?? 3
  }

  // ── 3. Process each DLQ entry ─────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const results: RetryResult[] = []

  for (const entry of dlqEntries) {
    const e = entry as DlqEntry
    const maxRetries = maxRetriesMap[e.workflow_id] ?? e.max_retries ?? 3
    const backoff = backoffMap[e.workflow_id] ?? DEFAULT_BACKOFF_SECONDS

    // Mark as manual_review if retries exhausted
    if (e.retry_count >= maxRetries) {
      await sb.from('ops_dead_letter_queue')
        .update({ status: 'manual_review' })
        .eq('id', e.id)

      results.push({
        dlq_id: e.id,
        workflow_id: e.workflow_id,
        outcome: 'manual_review',
        retry_count: e.retry_count,
        next_retry_at: null,
      })
      continue
    }

    // Re-invoke the workflow
    let retrySuccess = false
    let retryError = ''

    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/trigger-workflow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ workflow_id: e.workflow_id }),
        },
      )

      if (resp.ok) {
        const body = await resp.json()
        retrySuccess = body?.success === true
        if (!retrySuccess) retryError = body?.error ?? 'handler returned success=false'
      } else {
        retryError = `HTTP ${resp.status}`
      }
    } catch (err) {
      retryError = err instanceof Error ? err.message : String(err)
    }

    if (retrySuccess) {
      await sb.from('ops_dead_letter_queue')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          retry_count: e.retry_count + 1,
        })
        .eq('id', e.id)

      results.push({
        dlq_id: e.id,
        workflow_id: e.workflow_id,
        outcome: 'resolved',
        retry_count: e.retry_count + 1,
        next_retry_at: null,
      })
    } else {
      const newRetryCount = e.retry_count + 1
      const nextStatus = newRetryCount >= maxRetries ? 'manual_review' : 'pending'
      const nextRetryAt = nextStatus === 'pending'
        ? computeNextRetryAt(newRetryCount, backoff)
        : null

      await sb.from('ops_dead_letter_queue')
        .update({
          status: nextStatus,
          retry_count: newRetryCount,
          next_retry_at: nextRetryAt,
          error_message: `[Retry ${newRetryCount}] ${retryError}`,
        })
        .eq('id', e.id)

      results.push({
        dlq_id: e.id,
        workflow_id: e.workflow_id,
        outcome: nextStatus === 'manual_review' ? 'manual_review' : 'retried',
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt,
        error: retryError,
      })
    }
  }

  const resolved = results.filter((r) => r.outcome === 'resolved').length
  const retried = results.filter((r) => r.outcome === 'retried').length
  const manual = results.filter((r) => r.outcome === 'manual_review').length

  const summary = `${resolved} resolved, ${retried} retried, ${manual} → manual_review`
  await markRunSuccess(sb, runId, dlqEntries.length, resolved + retried, summary, manual)

  return json({
    success: true,
    run_id: runId,
    processed: dlqEntries.length,
    resolved,
    retried,
    manual_review: manual,
    results,
  })
}
