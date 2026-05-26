import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * Aligned with ops_ingestion_errors.error_kind CHECK constraint.
 * Retryable:     http_error, timeout, rate_limited
 * Non-retryable: parse_error, validation_failed, db_error, unknown
 */
export type ErrorKind =
  | 'http_error'
  | 'parse_error'
  | 'timeout'
  | 'rate_limited'
  | 'validation_failed'
  | 'db_error'
  | 'unknown'

const RETRYABLE_KINDS: ErrorKind[] = ['http_error', 'timeout', 'rate_limited']

export async function logError(
  sb: SupabaseClient,
  workflowId: string,
  runId: number,
  message: string,
  context?: string,
  errorKind: ErrorKind = 'http_error',
  /** Optional raw payload/context to store in the DLQ for later replay. */
  dlqRecord: Record<string, unknown> = {},
): Promise<void> {
  const label = context ? `${context}: ${message}` : message
  const isRetryable = RETRYABLE_KINDS.includes(errorKind)

  await sb.from('ops_ingestion_errors').insert({
    workflow_id: workflowId,
    ingestion_run_id: runId,
    error_message: message,
    error_kind: errorKind,
    is_retryable: isRetryable,
    occurred_at: new Date().toISOString(),
  })

  // DLQ `record` column is jsonb NOT NULL — always pass the error context
  await sb.from('ops_dead_letter_queue').insert({
    workflow_id: workflowId,
    ingestion_run_id: runId,
    error_message: label,
    record: { error_kind: errorKind, message: label, ...dlqRecord },
  })
}

export async function markRunFailed(
  sb: SupabaseClient,
  runId: number,
  errorMessage: string,
  recordsFetched = 0,
): Promise<void> {
  await sb.from('ops_ingestion_runs').update({
    status: 'failed',
    completed_at: new Date().toISOString(),
    records_fetched: recordsFetched,
    error_message: errorMessage,
  }).eq('id', runId)
}

export async function markRunSuccess(
  sb: SupabaseClient,
  runId: number,
  recordsFetched: number,
  recordsUpserted: number,
  errorMessage: string | null = null,
  recordsSkippedDedup: number | null = null,
): Promise<void> {
  await sb.from('ops_ingestion_runs').update({
    status: errorMessage ? 'failed' : 'success',
    completed_at: new Date().toISOString(),
    records_fetched: recordsFetched,
    records_upserted: recordsUpserted,
    records_skipped_dedup: recordsSkippedDedup,
    error_message: errorMessage,
  }).eq('id', runId)
}
