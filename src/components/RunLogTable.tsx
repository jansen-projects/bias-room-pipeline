import { Fragment, useState, type KeyboardEvent } from 'react'
import { formatDuration, formatStartedAtUtc } from '../lib/runLogFormat'
import type { IngestionRunStatus, RunLogEntry } from '../types/pipeline'

const COLUMNS = [
  'Workflow',
  'Status',
  'Started',
  'Duration',
  'Records',
  'Error',
] as const

const STATUS_STYLES: Record<
  IngestionRunStatus,
  { pill: string; showPulse?: boolean }
> = {
  success: { pill: 'bg-success text-background' },
  partial_success: { pill: 'bg-warning text-background' },
  failed: { pill: 'bg-error text-background' },
  running: { pill: 'bg-warning text-background', showPulse: true },
  skipped: { pill: 'bg-skipped text-background' },
}

function StatusBadge({ status }: { status: IngestionRunStatus }) {
  const style = STATUS_STYLES[status]

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        style.pill,
      ].join(' ')}
    >
      {style.showPulse && (
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-background"
          aria-hidden
        />
      )}
      {status === 'partial_success' ? 'partial' : status}
    </span>
  )
}

function RecordsCell({ run }: { run: RunLogEntry }) {
  if ((run.status === 'success' || run.status === 'partial_success') && run.records_upserted != null) {
    return (
      <span className="font-mono text-xs text-success">
        ↑ {run.records_upserted.toLocaleString()} upserted
      </span>
    )
  }

  if (run.status === 'skipped' && run.records_skipped_dedup != null) {
    return (
      <span className="font-mono text-xs text-muted">
        — skipped {run.records_skipped_dedup.toLocaleString()} dedup
      </span>
    )
  }

  return <span className="font-mono text-xs text-dim">—</span>
}

function RunDetailPanel({ run }: { run: RunLogEntry }) {
  const stats = [
    { label: 'Fetched', value: run.records_fetched },
    { label: 'Upserted', value: run.records_upserted },
    { label: 'Skipped (dedup)', value: run.records_skipped_dedup },
  ]

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Workflow
        </p>
        <p className="mt-1 text-sm text-foreground">{run.description}</p>
      </div>

      {run.n8n_execution_id && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            n8n execution
          </p>
          <p className="mt-1 font-mono text-sm text-foreground">
            {run.n8n_execution_id}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-md border border-border-dim bg-card px-3 py-2"
          >
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              {label}
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {value?.toLocaleString() ?? '—'}
            </p>
          </div>
        ))}
      </div>

      {run.error_message && (
        <div className="rounded-md border border-error/30 bg-error/15 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-error">
            Error
          </p>
          <p className="mt-2 text-sm leading-relaxed text-error">
            {run.error_message}
          </p>
        </div>
      )}

      <div className="grid gap-2 font-mono text-xs text-muted sm:grid-cols-2">
        <p>
          Started{' '}
          <span className="text-foreground">{run.started_at}</span>
        </p>
        <p>
          Completed{' '}
          <span className="text-foreground">{run.completed_at ?? '—'}</span>
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border-dim bg-card px-6 py-16 text-center">
      <svg
        className="mb-4 h-10 w-10 text-dim"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="font-mono text-sm text-muted">No runs match your filters</p>
    </div>
  )
}

export interface RunLogTableProps {
  runs: RunLogEntry[]
}

export function RunLogTable({ runs }: RunLogTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  function toggleExpanded(id: number) {
    setExpandedId((current) => (current === id ? null : id))
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleExpanded(id)
    }
  }

  if (runs.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-dim">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="bg-surface">
            {COLUMNS.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-gold"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const isExpanded = expandedId === run.id
            const hasError = run.error_message != null
            const isStriped = index % 2 === 1

            return (
              <Fragment key={run.id}>
                <tr
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(run.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, run.id)}
                  className={[
                    'cursor-pointer border-t border-border-dim transition-colors hover:bg-gold-hover',
                    isExpanded ? 'bg-gold-dim/60' : isStriped ? 'bg-gold-dim/40' : 'bg-transparent',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 align-top">
                    <p className="font-mono text-sm text-gold">{run.workflow_id}</p>
                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted">
                      {run.description}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-foreground">
                    {formatStartedAtUtc(run.started_at)}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-foreground">
                    {formatDuration(run.started_at, run.completed_at)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <RecordsCell run={run} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    {hasError ? (
                      <span className="font-mono text-xs text-error">⚠</span>
                    ) : (
                      <span className="font-mono text-xs text-dim">—</span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-t border-border-dim bg-detail">
                    <td colSpan={COLUMNS.length} className="p-0">
                      <RunDetailPanel run={run} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
