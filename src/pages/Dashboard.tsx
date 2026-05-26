import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { WorkflowCard } from '../components/WorkflowCard'
import { WorkflowCardSkeleton } from '../components/WorkflowCardSkeleton'
import { useWorkflowStatus } from '../hooks/useWorkflowStatus'
import { isWorkflowHealthy } from '../lib/workflowHealth'

const SKELETON_COUNT = 9

function formatLastUpdated(timestamp: number | undefined): string {
  if (!timestamp) {
    return '—'
  }

  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function Dashboard() {
  const { workflows, isLoading, error, lastUpdatedAt } = useWorkflowStatus()

  const healthyCount = useMemo(
    () => workflows.filter(isWorkflowHealthy).length,
    [workflows],
  )

  const totalCount = workflows.length
  const hasFailedWorkflow = workflows.some(
    (workflow) => workflow.latest_run?.status === 'failed',
  )

  return (
    <div className="space-y-6">
      {hasFailedWorkflow && (
        <div
          role="alert"
          className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error"
        >
          One or more workflows have failed. Review the cards marked{' '}
          <span className="font-mono uppercase">failed</span> below.
        </div>
      )}

      <header className="space-y-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display text-4xl italic text-gold">
            The Bias Room
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Pipeline Control Room
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {isLoading ? (
            <>
              <div className="h-4 w-48 animate-pulse rounded bg-background/70" />
              <div className="h-3 w-40 animate-pulse rounded bg-background/50" />
            </>
          ) : (
            <>
              <p className="text-sm text-foreground">
                <span className="font-semibold text-success">{healthyCount}</span>
                <span className="text-muted">/{totalCount} workflows healthy</span>
              </p>

              <div className="flex items-center gap-4">
                <p className="font-mono text-xs text-muted">
                  Last updated {formatLastUpdated(lastUpdatedAt)}
                </p>
                <Link
                  to="/snapshot"
                  className="font-mono text-xs text-gold hover:underline"
                >
                  View Snapshot →
                </Link>
              </div>
            </>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error"
        >
          Failed to load workflows: {error.message}
        </div>
      )}

      <section
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-busy={isLoading}
      >
        {isLoading
          ? Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <WorkflowCardSkeleton key={index} />
            ))
          : workflows.map((workflow) => (
              <WorkflowCard key={workflow.workflow_id} workflow={workflow} />
            ))}
      </section>
    </div>
  )
}