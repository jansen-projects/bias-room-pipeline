import { useState } from 'react'
import { useStaleAlerts } from '../hooks/useStaleAlerts'
import type { StaleAlert } from '../hooks/useStaleAlerts'

function formatAge(minutes: number): string {
  if (minutes >= 999999) return 'Never run'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`
  return `${Math.round(minutes / 1440)}d`
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

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-error/15 text-error border-error/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
  }
  const cls = colors[severity] ?? 'bg-muted/15 text-muted border-muted/30'
  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}>
      {severity}
    </span>
  )
}

function AlertRow({
  alert,
  onResolve,
  isResolving,
}: {
  alert: StaleAlert
  onResolve: (id: string) => void
  isResolving: boolean
}) {
  return (
    <tr className={`border-b border-border/40 ${alert.is_resolved ? 'opacity-50' : ''}`}>
      <td className="py-2.5 pl-4 pr-2">
        <SeverityBadge severity={alert.severity} />
      </td>
      <td className="px-2 py-2.5 font-mono text-xs text-foreground">{alert.table_name}</td>
      <td className="px-2 py-2.5 font-mono text-xs text-muted">{alert.workflow_id}</td>
      <td className="px-2 py-2.5 text-right font-mono text-xs">
        <span className={alert.severity === 'critical' ? 'text-error' : 'text-warning'}>
          {formatAge(alert.actual_age_min)}
        </span>
        <span className="text-dim"> / {formatAge(alert.threshold_min)}</span>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-xs text-muted">
        {formatTs(alert.fired_at)}
      </td>
      <td className="py-2.5 pl-2 pr-4 text-right">
        {alert.is_resolved ? (
          <span className="font-mono text-xs text-dim">resolved</span>
        ) : (
          <button
            onClick={() => onResolve(alert.id)}
            disabled={isResolving}
            className="rounded border border-gold/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
          >
            Resolve
          </button>
        )}
      </td>
    </tr>
  )
}

export default function Alerts() {
  const [showResolved, setShowResolved] = useState(false)

  const {
    alerts,
    criticalCount,
    warningCount,
    isLoading,
    error,
    refetch,
    resolveAlert,
    isResolving,
    resolveAll,
    isResolvingAll,
  } = useStaleAlerts(showResolved)

  const unresolved = alerts.filter((a) => !a.is_resolved)

  return (
    <div className="space-y-6">
      <header className="space-y-1 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-gold">Ops</p>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Stale Data Alerts</h1>
          <button
            onClick={() => refetch()}
            className="font-mono text-xs text-muted transition-colors hover:text-gold"
          >
            Refresh ↺
          </button>
        </div>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Critical', value: criticalCount, color: criticalCount > 0 ? 'text-error' : 'text-muted' },
          { label: 'Warning', value: warningCount, color: warningCount > 0 ? 'text-warning' : 'text-muted' },
          { label: 'Unresolved', value: unresolved.length, color: unresolved.length > 0 ? 'text-foreground' : 'text-success' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-muted">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="accent-gold"
          />
          Show resolved
        </label>
        {unresolved.length > 0 && (
          <button
            onClick={() => resolveAll()}
            disabled={isResolvingAll}
            className="rounded border border-gold/30 px-3 py-1 font-mono text-xs text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
          >
            {isResolvingAll ? 'Resolving…' : `Resolve all (${unresolved.length})`}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error">
          Failed to load alerts: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left">
              {['Severity', 'Table', 'Workflow', 'Age / Threshold', 'Fired At', ''].map((h, i) => (
                <th
                  key={h + i}
                  className={`px-2 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted ${
                    h === 'Age / Threshold' || h === 'Fired At' || h === '' ? 'text-right' : ''
                  } ${h === 'Severity' ? 'pl-4' : ''} ${h === '' ? 'pr-4' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-2 py-3">
                        <div className="h-3 animate-pulse rounded bg-surface/60" />
                      </td>
                    ))}
                  </tr>
                ))
              : alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onResolve={resolveAlert}
                    isResolving={isResolving}
                  />
                ))}
            {!isLoading && alerts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center font-mono text-xs text-success">
                  ✓ All monitored tables are fresh
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
