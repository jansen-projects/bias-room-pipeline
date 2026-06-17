import { useEffect, useMemo, useState } from 'react'
import { Pagination } from '../components/Pagination'
import { RunLogTable } from '../components/RunLogTable'
import { useRunLog } from '../hooks/useRunLog'
import { useWorkflowRegistry } from '../hooks/useWorkflowRegistry'
import type { IngestionRunStatus } from '../types/pipeline'

const PAGE_SIZE = 25

const STATUS_OPTIONS: { value: IngestionRunStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'running', label: 'running' },
  { value: 'success', label: 'success' },
  { value: 'partial_success', label: 'partial success' },
  { value: 'failed', label: 'failed' },
  { value: 'skipped', label: 'skipped' },
]

const fieldClassName =
  'rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors focus:border-gold'

export default function RunLog() {
  const [workflowId, setWorkflowId] = useState<string | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [dateFrom, setDateFrom] = useState<string | undefined>()
  const [dateTo, setDateTo] = useState<string | undefined>()
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1) }, [workflowId, status, dateFrom, dateTo])

  const { workflows, isLoading: registryLoading } = useWorkflowRegistry()
  const { runs, totalCount, isLoading, error } = useRunLog({
    workflowId,
    status,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
  })

  const hasActiveFilters = useMemo(
    () => Boolean(workflowId || status || dateFrom || dateTo),
    [workflowId, status, dateFrom, dateTo],
  )

  function clearFilters() {
    setWorkflowId(undefined)
    setStatus(undefined)
    setDateFrom(undefined)
    setDateTo(undefined)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-display text-4xl italic text-gold">Run Log</h1>
        <p className="font-mono text-xs text-muted">
          Every workflow execution — filterable by workflow, status, and date
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Workflow
            </span>
            <select
              value={workflowId ?? ''}
              onChange={(event) =>
                setWorkflowId(event.target.value || undefined)
              }
              disabled={registryLoading}
              className={fieldClassName}
              aria-label="Filter by workflow"
            >
              <option value="">All workflows</option>
              {workflows.map((workflow) => (
                <option key={workflow.workflow_id} value={workflow.workflow_id}>
                  {workflow.workflow_id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[140px] flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Status
            </span>
            <select
              value={status ?? ''}
              onChange={(event) =>
                setStatus(event.target.value || undefined)
              }
              className={fieldClassName}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              From
            </span>
            <input
              type="date"
              value={dateFrom ?? ''}
              onChange={(event) =>
                setDateFrom(event.target.value || undefined)
              }
              className={fieldClassName}
              aria-label="Filter from date"
            />
          </label>

          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              To
            </span>
            <input
              type="date"
              value={dateTo ?? ''}
              onChange={(event) => setDateTo(event.target.value || undefined)}
              className={fieldClassName}
              aria-label="Filter to date"
            />
          </label>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="pb-2 font-mono text-xs text-gold transition-colors hover:text-gold/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>

        <p className="font-mono text-xs text-muted">
          {isLoading
            ? 'Loading runs…'
            : `${totalCount.toLocaleString()} run${totalCount === 1 ? '' : 's'} total`}
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error"
        >
          Failed to load run log: {error.message}
        </div>
      )}

      <RunLogTable runs={runs} />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onChange={setPage}
      />
    </div>
  )
}
