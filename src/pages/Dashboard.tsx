import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { WorkflowCard } from '../components/WorkflowCard'
import { WorkflowCardSkeleton } from '../components/WorkflowCardSkeleton'
import { useWorkflowStatus } from '../hooks/useWorkflowStatus'
import { isWorkflowHealthy } from '../lib/workflowHealth'
import type { WorkflowStatus } from '../types/pipeline'

// Groups define the display order and category labels for all 18 workflows
const WORKFLOW_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: 'FX & Rates',
    ids: ['wf_forex_daily_fetch', 'wf_cb_rates_daily'],
  },
  {
    label: 'Market Data',
    ids: ['wf_market_indices_daily', 'wf_commodities_daily', 'wf_gold_context_daily'],
  },
  {
    label: 'Fixed Income',
    ids: [
      'wf_bond_yields_nominal_daily',
      'wf_real_yields_daily',
      'wf_breakeven_daily',
    ],
  },
  {
    label: 'Macro',
    ids: [
      'wf_cot_weekly',
      'wf_economic_calendar_daily',
      'wf_inflation_forecasts_weekly',
    ],
  },
  {
    label: 'Derived',
    ids: [
      'wf_compute_atr14_daily',
      'wf_fx_friday_close_snapshot',
      'wf_daily_close_snapshot',
      'wf_weekly_anchor_snapshot',
    ],
  },
  {
    label: 'Operations',
    ids: ['wf_stale_data_monitor', 'wf_dlq_retry', 'wf_health_check_hourly'],
  },
]

const SKELETON_PER_GROUP = [2, 3, 3, 3, 4, 3]

function formatLastUpdated(timestamp: number | undefined): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

interface GroupSectionProps {
  label: string
  workflows: WorkflowStatus[]
  skeletonCount: number
  isLoading: boolean
}

function GroupSection({ label, workflows, skeletonCount, isLoading }: GroupSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        {label}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <WorkflowCardSkeleton key={i} />
            ))
          : workflows.map((wf) => (
              <WorkflowCard key={wf.workflow_id} workflow={wf} />
            ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { workflows, isLoading, error, lastUpdatedAt } = useWorkflowStatus()

  const healthyCount = useMemo(
    () => workflows.filter(isWorkflowHealthy).length,
    [workflows],
  )

  const totalCount = workflows.length
  const hasFailedWorkflow = workflows.some(
    (wf) => wf.latest_run?.status === 'failed',
  )

  // Build a lookup map once
  const workflowMap = useMemo(() => {
    const map = new Map<string, WorkflowStatus>()
    for (const wf of workflows) map.set(wf.workflow_id, wf)
    return map
  }, [workflows])

  // For each group, resolve the workflow objects (only known IDs are shown)
  const groups = useMemo(
    () =>
      WORKFLOW_GROUPS.map((g) => ({
        label: g.label,
        workflows: g.ids.flatMap((id) => {
          const wf = workflowMap.get(id)
          return wf ? [wf] : []
        }),
      })),
    [workflowMap],
  )

  return (
    <div className="space-y-8">
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

      <div className="space-y-8">
        {WORKFLOW_GROUPS.map((g, i) => (
          <GroupSection
            key={g.label}
            label={g.label}
            workflows={groups[i]?.workflows ?? []}
            skeletonCount={SKELETON_PER_GROUP[i] ?? 3}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  )
}
