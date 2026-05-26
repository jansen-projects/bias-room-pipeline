import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { WORKFLOW_STATUS_QUERY_KEY } from '../hooks/useWorkflowStatus'
import { isWorkflowHealthy, isWorkflowStale } from '../lib/workflowHealth'
import { supabase } from '../lib/supabase'
import type { IngestionRunStatus, WorkflowStatus } from '../types/pipeline'

function statusLabel(workflow: WorkflowStatus): string {
  if (!workflow.latest_run) {
    return 'No runs'
  }

  if (isWorkflowStale(workflow) && workflow.latest_run.status === 'success') {
    return 'Stale'
  }

  return workflow.latest_run.status
}

function statusColorClass(workflow: WorkflowStatus): string {
  const run = workflow.latest_run
  if (!run) {
    return 'text-muted'
  }

  if (run.status === 'failed') {
    return 'text-error'
  }

  if (run.status === 'running') {
    return 'text-gold'
  }

  if (isWorkflowStale(workflow)) {
    return 'text-gold'
  }

  return 'text-success'
}

function formatStaleAfterMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }

  if (minutes < 1440) {
    return `${Math.round(minutes / 60)}h`
  }

  return `${Math.round(minutes / 1440)}d`
}

function withOptimisticRunning(workflow: WorkflowStatus): WorkflowStatus {
  const startedAt = new Date().toISOString()
  const optimisticRun = workflow.latest_run
    ? { ...workflow.latest_run, status: 'running' as IngestionRunStatus, started_at: startedAt }
    : {
        id: 0,
        workflow_id: workflow.workflow_id,
        status: 'running' as IngestionRunStatus,
        started_at: startedAt,
        completed_at: null,
        records_fetched: null,
        records_upserted: null,
        records_skipped_dedup: null,
        error_message: null,
        n8n_execution_id: null,
        error_count: null,
      }

  return { ...workflow, latest_run: optimisticRun }
}

export function WorkflowCard({ workflow }: { workflow: WorkflowStatus }) {
  const queryClient = useQueryClient()
  const [optimisticRunning, setOptimisticRunning] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const displayWorkflow = useMemo(
    () => (optimisticRunning ? withOptimisticRunning(workflow) : workflow),
    [workflow, optimisticRunning],
  )

  const healthy = isWorkflowHealthy(displayWorkflow)
  const run = displayWorkflow.latest_run

  async function handleRunNow() {
    setRunError(null)
    setOptimisticRunning(true)
    setIsTriggering(true)

    try {
      const { data, error } = await supabase.functions.invoke('trigger-workflow', {
        body: { workflow_id: workflow.workflow_id },
      })

      if (error) {
        throw error
      }

      const result = data as { success?: boolean; error?: string } | null
      if (!result?.success) {
        throw new Error(result?.error ?? 'Failed to trigger workflow')
      }

      await queryClient.invalidateQueries({ queryKey: WORKFLOW_STATUS_QUERY_KEY })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to trigger workflow'
      setRunError(message)
    } finally {
      setOptimisticRunning(false)
      setIsTriggering(false)
    }
  }

  return (
    <article
      className={[
        'rounded-lg border bg-card p-5 transition-colors',
        healthy ? 'border-border' : 'border-error/40',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-foreground">
            {workflow.workflow_id}
          </p>
          <p className="mt-1 truncate text-sm text-foreground">
            {workflow.description}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {workflow.cron_schedule}
          </p>
        </div>

        <span
          className={[
            'shrink-0 font-mono text-xs uppercase tracking-wide',
            statusColorClass(displayWorkflow),
          ].join(' ')}
        >
          {statusLabel(displayWorkflow)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="font-mono uppercase tracking-wide text-muted">
            Stale after
          </dt>
          <dd className="mt-1 text-foreground">
            {formatStaleAfterMinutes(workflow.stale_after_minutes)}
          </dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-wide text-muted">
            Tables
          </dt>
          <dd className="mt-1 text-foreground">
            {workflow.destination_tables.length}
          </dd>
        </div>
        {run && (
          <>
            <div>
              <dt className="font-mono uppercase tracking-wide text-muted">
                Upserted
              </dt>
              <dd className="mt-1 text-foreground">
                {run.records_upserted?.toLocaleString() ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="font-mono uppercase tracking-wide text-muted">
                Errors
              </dt>
              <dd
                className={[
                  'mt-1',
                  (run.error_count ?? 0) > 0 ? 'text-error' : 'text-foreground',
                ].join(' ')}
              >
                {run.error_count ?? 0}
              </dd>
            </div>
          </>
        )}
      </dl>

      {run && (
        <p className="mt-4 font-mono text-xs text-muted">
          Last run{' '}
          {new Date(run.started_at).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
      )}

      {runError && (
        <p className="mt-3 text-xs text-error" role="alert">
          {runError}
        </p>
      )}

      <button
        type="button"
        onClick={handleRunNow}
        disabled={isTriggering}
        className="mt-4 w-full rounded-md border border-gold/40 bg-background px-3 py-2 font-mono text-xs uppercase tracking-wide text-gold transition-colors hover:border-gold hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isTriggering ? 'Triggering…' : 'Run now'}
      </button>
    </article>
  )
}
