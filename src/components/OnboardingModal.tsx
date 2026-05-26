import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'

interface OnboardingModalProps {
  onClose: () => void
}

type TabId = 'pages' | 'schedule' | 'tasks'

const TABS: { id: TabId; label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'tasks', label: 'Operator Tasks' },
]

const PAGES_INFO = [
  {
    route: '/',
    label: 'Dashboard',
    desc: 'Health of all 18 workflows at a glance. Your morning check — all green means the pipeline is healthy.',
    end: true,
  },
  {
    route: '/ingestion',
    label: 'Ingestion Runs',
    desc: 'Detailed log of every pipeline run with timestamps, duration, and record counts. Click any row to expand error details.',
    end: false,
  },
  {
    route: '/alerts',
    label: 'Stale Alerts',
    desc: 'Fires when a table hasn\'t updated within its SLA window. Resolve weekend staleness alerts every Monday morning.',
    end: false,
  },
  {
    route: '/sources',
    label: 'Data Sources',
    desc: 'Hourly canary checks for all 7 external sources. FRED connection errors and CFTC 403s are known false positives — not real outages.',
    end: false,
  },
  {
    route: '/snapshot',
    label: 'Friday Snapshot',
    desc: 'The weekly W-series anchor — the full macro state captured every Friday at 23:45 UTC. Lock it after reviewing.',
    end: false,
  },
  {
    route: '/manual',
    label: 'Manual Entry',
    desc: 'Enter CB tone scores, consensus surveys, and geo risk events. These require your judgment and cannot be automated.',
    end: false,
  },
  {
    route: '/runs',
    label: 'Run Log',
    desc: 'All pipeline runs with date-range filtering. Use for historical lookups beyond what Ingestion shows.',
    end: false,
  },
  {
    route: '/data',
    label: 'Data Explorer',
    desc: 'Browse any raw data table. Use to spot-check specific values mid-week — e.g. latest EURUSD rate or COT positioning.',
    end: false,
  },
  {
    route: '/settings',
    label: 'Settings',
    desc: 'Edit SLA freshness thresholds per table. Also shows the full pipeline schedule as a reference.',
    end: false,
  },
]

const SCHEDULE_INFO: { time: string; workflows: string; tier: 1 | 2 | 3 }[] = [
  { time: '04:00 UTC daily',        tier: 1, workflows: 'Economic calendar' },
  { time: '06:00 UTC daily',        tier: 1, workflows: 'CB rates' },
  { time: '07:00 UTC Mondays',      tier: 1, workflows: 'Inflation forecasts' },
  { time: '22:00 UTC weekdays',     tier: 1, workflows: 'FX rates, Market indices, Commodities, Gold context' },
  { time: '22:00 UTC Fridays',      tier: 1, workflows: 'COT positioning' },
  { time: '22:30 UTC weekdays',     tier: 1, workflows: 'Bond yields, Real yields, Breakeven' },
  { time: '23:15 UTC weekdays',     tier: 2, workflows: 'ATR-14' },
  { time: '23:30 UTC weekdays',     tier: 2, workflows: 'Daily close snapshot' },
  { time: '23:30 UTC Fridays',      tier: 2, workflows: 'Friday close snapshot' },
  { time: '23:45 UTC Fridays',      tier: 2, workflows: 'Weekly anchor snapshot' },
  { time: 'Every 15 min, weekdays', tier: 3, workflows: 'Stale data monitor' },
  { time: 'Every hour',             tier: 3, workflows: 'Health checks' },
  { time: 'Every 6 hours',          tier: 3, workflows: 'DLQ retry' },
]

const TASKS_INFO = [
  {
    task: 'Enter CB tone scores',
    where: '/manual',
    tab: 'CB Tone',
    when: 'After each central bank meeting or significant speech',
  },
  {
    task: 'Enter consensus surveys',
    where: '/manual',
    tab: 'Consensus',
    when: 'Once per week, before the Friday snapshot is locked',
  },
  {
    task: 'Log geo risk events',
    where: '/manual',
    tab: 'Geo Risk',
    when: 'When a new risk event begins or status changes',
  },
  {
    task: 'Resolve stale alerts',
    where: '/alerts',
    tab: null,
    when: 'Monday mornings + after any known outage',
  },
  {
    task: 'Lock the weekly snapshot',
    where: null,
    tab: null,
    when: 'After reviewing the Friday anchor snapshot',
    note: 'Via Supabase dashboard',
  },
]

const TIER_COLORS: Record<1 | 2 | 3, string> = {
  1: 'text-gold border-gold/40 bg-gold/10',
  2: 'text-success border-success/40 bg-success/10',
  3: 'text-muted border-border bg-surface/40',
}
const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'T1',
  2: 'T2',
  3: 'T3',
}

export function OnboardingModal({ onClose }: OnboardingModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pages')
  const modalRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus trap — focus modal on open
  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Pipeline operator guide"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
              Operator Guide
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Pipeline Control Room
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Close guide"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'border-b-2 pb-3 pt-3 font-mono text-xs uppercase tracking-wide transition-colors',
                activeTab === tab.id
                  ? 'border-gold text-gold'
                  : 'border-transparent text-muted hover:text-foreground',
                tab.id !== 'pages' ? 'ml-6' : '',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'pages' && (
            <div className="space-y-1">
              <p className="mb-4 font-mono text-xs text-muted">
                Click any page name to navigate there.
              </p>
              {PAGES_INFO.map(({ route, label, desc, end }) => (
                <div
                  key={route}
                  className="flex gap-4 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-surface/40"
                >
                  <div className="w-32 shrink-0">
                    <NavLink
                      to={route}
                      end={end}
                      onClick={onClose}
                      className="font-mono text-xs text-gold hover:underline"
                    >
                      {label} →
                    </NavLink>
                    <p className="mt-0.5 font-mono text-[10px] text-dim">{route}</p>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{desc}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-2">
              <p className="mb-4 font-mono text-xs text-muted">
                All workflows run automatically via pg_cron. Tier 1 = raw ingestion,
                Tier 2 = derived calculations, Tier 3 = operations.
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-surface/60">
                      <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                        Tier
                      </th>
                      <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                        Time
                      </th>
                      <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                        Workflows
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE_INFO.map((row, i) => (
                      <tr
                        key={i}
                        className={[
                          'border-b border-border/40',
                          i % 2 === 1 ? 'bg-surface/20' : '',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] ${TIER_COLORS[row.tier]}`}
                          >
                            {TIER_LABELS[row.tier]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">
                          {row.time}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-foreground">
                          {row.workflows}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <p className="mb-4 font-mono text-xs text-muted">
                The pipeline is fully automated except for these tasks. They require
                your judgment and cannot be scripted.
              </p>
              {TASKS_INFO.map(({ task, where, tab, when, note }) => (
                <div
                  key={task}
                  className="rounded-lg border border-border bg-surface/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-foreground">{task}</p>
                    {where ? (
                      <NavLink
                        to={where}
                        onClick={onClose}
                        className="shrink-0 font-mono text-xs text-gold hover:underline"
                      >
                        {where}{tab ? ` → ${tab}` : ''} →
                      </NavLink>
                    ) : note ? (
                      <span className="shrink-0 font-mono text-xs text-dim">{note}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">{when}</p>
                </div>
              ))}

              <div className="mt-6 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
                <p className="font-mono text-xs font-medium text-gold">
                  What "healthy" looks like on a weekday morning
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  <li>• Dashboard: all 18 workflows green</li>
                  <li>• Alerts: 0 unresolved critical alerts</li>
                  <li>• Sources: all 7 sources healthy</li>
                  <li>• Ingestion: last 10 runs all success</li>
                </ul>
                <p className="mt-3 font-mono text-xs font-medium text-gold">
                  On Monday mornings
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  <li>• Several weekend staleness warnings are normal — resolve them</li>
                  <li>• Last ingestion run will be Friday night — expected</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <p className="font-mono text-[10px] text-dim">
            Press <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px] text-muted">Esc</kbd> or click outside to close
          </p>
          <button
            onClick={onClose}
            className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
