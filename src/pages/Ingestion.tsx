import { useState } from 'react'
import { useIngestionRuns } from '../hooks/useIngestionRuns'
import type { IngestionRunWithErrors } from '../hooks/useIngestionRuns'

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m`
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-success/15 text-success border-success/30',
    failed: 'bg-error/15 text-error border-error/30',
    running: 'bg-gold/15 text-gold border-gold/30',
    skipped: 'bg-skipped/15 text-skipped border-skipped/30',
  }
  const cls = colors[status] ?? 'bg-muted/15 text-muted border-muted/30'
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      {status}
    </span>
  )
}

function RunRow({ run }: { run: IngestionRunWithErrors }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/40 transition-colors hover:bg-surface/40"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pl-4 pr-2">
          <StatusBadge status={run.status} />
        </td>
        <td className="px-2 py-2.5">
          <span className="font-mono text-xs text-foreground">{run.workflow_id}</span>
        </td>
        <td className="px-2 py-2.5 text-right font-mono text-xs text-muted">
          {formatTs(run.started_at)}
        </td>
        <td className="px-2 py-2.5 text-right font-mono text-xs text-muted">
          {formatDuration(run.started_at, run.completed_at)}
        </td>
        <td className="px-2 py-2.5 text-right font-mono text-xs text-muted">
          {run.records_upserted ?? '—'}
        </td>
        <td className="px-2 py-2.5 text-right font-mono text-xs text-muted">
          {run.records_fetched ?? '—'}
        </td>
        <td className="px-2 py-2.5 text-right">
          {run.error_count > 0 ? (
            <span className="font-mono text-xs text-error">{run.error_count} err</span>
          ) : (
            <span className="font-mono text-xs text-dim">—</span>
          )}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono text-xs text-dim">
          {expanded ? '▲' : '▼'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/20 bg-detail">
          <td colSpan={8} className="px-4 py-3">
            <div className="space-y-1.5">
              <div className="flex gap-6 text-xs">
                <span className="text-muted">Run ID</span>
                <span className="font-mono text-foreground">{run.id}</span>
              </div>
              {run.error_message && (
                <div className="space-y-0.5">
                  <span className="text-xs text-muted">Error</span>
                  <p className="rounded bg-error/10 px-3 py-2 font-mono text-xs text-error">
                    {run.error_message}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-6 text-xs">
                <span>
                  <span className="text-muted">Fetched </span>
                  <span className="font-mono text-foreground">{run.records_fetched ?? '—'}</span>
                </span>
                <span>
                  <span className="text-muted">Upserted </span>
                  <span className="font-mono text-foreground">{run.records_upserted ?? '—'}</span>
                </span>
                <span>
                  <span className="text-muted">Dedup-skipped </span>
                  <span className="font-mono text-foreground">{run.records_skipped_dedup ?? '—'}</span>
                </span>
                {run.completed_at && (
                  <span>
                    <span className="text-muted">Completed </span>
                    <span className="font-mono text-foreground">{formatTs(run.completed_at)}</span>
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Ingestion() {
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { runs, totalCount, isLoading, error, refetch } = useIngestionRuns({
    workflowId: workflowFilter,
    status: statusFilter,
    limit: 100,
  })

  const successCount = runs.filter((r) => r.status === 'success').length
  const failedCount = runs.filter((r) => r.status === 'failed').length

  return (
    <div className="space-y-6">
      <header className="space-y-1 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-gold">Ops</p>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Ingestion Runs</h1>
          <button
            onClick={() => refetch()}
            className="font-mono text-xs text-muted transition-colors hover:text-gold"
          >
            Refresh ↺
          </button>
        </div>
      </header>

      {/* Summary stat row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total shown', value: totalCount },
          { label: 'Success', value: successCount, color: 'text-success' },
          { label: 'Failed', value: failedCount, color: failedCount > 0 ? 'text-error' : 'text-muted' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card px-4 py-3"
          >
            <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${color ?? 'text-foreground'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by workflow_id…"
          value={workflowFilter}
          onChange={(e) => setWorkflowFilter(e.target.value)}
          className="rounded border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-dim focus:border-gold focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground focus:border-gold focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error">
          Failed to load runs: {error.message}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left">
              {['Status', 'Workflow', 'Started', 'Duration', 'Upserted', 'Fetched', 'Errors', ''].map((h) => (
                <th
                  key={h}
                  className={`px-2 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted ${
                    h && h !== 'Status' && h !== 'Workflow' ? 'text-right' : ''
                  } ${h === 'Status' ? 'pl-4' : ''} ${h === '' ? 'pr-4' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-2 py-3">
                        <div className="h-3 animate-pulse rounded bg-surface/60" />
                      </td>
                    ))}
                  </tr>
                ))
              : runs.map((run) => <RunRow key={run.id} run={run} />)}
            {!isLoading && runs.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center font-mono text-xs text-dim">
                  No runs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
