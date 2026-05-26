import { useSourceHealth } from '../hooks/useSourceHealth'
import type { SourceStatus, HealthLogEntry } from '../hooks/useSourceHealth'

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function StatusDot({ status }: { status: SourceStatus['status'] }) {
  const colors: Record<string, string> = {
    healthy: 'bg-success',
    warning: 'bg-warning',
    critical: 'bg-error animate-pulse',
    unknown: 'bg-dim',
  }
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] ?? 'bg-dim'}`}
      aria-label={status}
    />
  )
}

function StatusLabel({ status }: { status: SourceStatus['status'] }) {
  const colors: Record<string, string> = {
    healthy: 'text-success',
    warning: 'text-warning',
    critical: 'text-error',
    unknown: 'text-dim',
  }
  return (
    <span className={`font-mono text-xs uppercase tracking-widest ${colors[status] ?? 'text-dim'}`}>
      {status}
    </span>
  )
}

function SourceCard({ source }: { source: SourceStatus }) {
  return (
    <div
      className={`rounded-lg border bg-card px-5 py-4 ${
        source.status === 'critical'
          ? 'border-error/50'
          : source.status === 'warning'
            ? 'border-warning/30'
            : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <StatusDot status={source.status} />
          <span className="font-semibold text-foreground">{source.dataset}</span>
        </div>
        <StatusLabel status={source.status} />
      </div>

      <div className="mt-3 space-y-1 font-mono text-xs text-muted">
        {source.lastChecked ? (
          <p>Last check: {formatTs(source.lastChecked)}</p>
        ) : (
          <p className="text-dim">No checks recorded</p>
        )}

        {source.latestIssue && (
          <div className="mt-2 rounded bg-background/60 px-3 py-2 text-[11px]">
            <span
              className={
                source.latestIssue.severity === 'critical' ? 'text-error' : 'text-warning'
              }
            >
              {source.latestIssue.issue_type}:{' '}
            </span>
            <span className="text-muted">{source.latestIssue.detail}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function LogRow({ log }: { log: HealthLogEntry }) {
  return (
    <tr className="border-b border-border/40">
      <td className="px-2 py-2 font-mono text-xs text-muted">{formatTs(log.check_time)}</td>
      <td className="px-2 py-2 font-mono text-xs text-foreground">{log.dataset}</td>
      <td className="px-2 py-2 font-mono text-xs">
        <span
          className={
            log.severity === 'critical'
              ? 'text-error'
              : log.severity === 'warning'
                ? 'text-warning'
                : 'text-muted'
          }
        >
          {log.issue_type}
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-xs text-muted">{log.detail}</td>
    </tr>
  )
}

export default function Sources() {
  const { sources, recentLogs, lastRunAt, isLoading, error, refetch } = useSourceHealth()

  const healthyCount = sources.filter((s) => s.status === 'healthy').length
  const criticalCount = sources.filter((s) => s.status === 'critical').length
  const warnCount = sources.filter((s) => s.status === 'warning').length

  return (
    <div className="space-y-6">
      <header className="space-y-1 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-gold">Ops</p>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Data Sources</h1>
          <div className="flex items-center gap-4">
            {lastRunAt && (
              <span className="font-mono text-xs text-muted">
                Last health check: {formatTs(lastRunAt)}
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="font-mono text-xs text-muted transition-colors hover:text-gold"
            >
              Refresh ↺
            </button>
          </div>
        </div>
      </header>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Healthy', value: healthyCount, color: 'text-success' },
          { label: 'Warning', value: warnCount, color: warnCount > 0 ? 'text-warning' : 'text-muted' },
          { label: 'Critical', value: criticalCount, color: criticalCount > 0 ? 'text-error' : 'text-muted' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error">
          Failed to load source health: {error.message}
        </div>
      )}

      {/* Per-source cards */}
      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
          Source status
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => (
              <SourceCard key={source.dataset} source={source} />
            ))}
          </div>
        )}
      </section>

      {/* Recent issue log */}
      {recentLogs.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
            Recent issues
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/60 text-left">
                  {['Checked At', 'Dataset', 'Type', 'Detail'].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!isLoading && recentLogs.length === 0 && (
        <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-6 text-center">
          <p className="font-mono text-xs text-success">
            ✓ No issues recorded — all sources healthy
          </p>
          <p className="mt-1 font-mono text-xs text-dim">
            Health checks run hourly via pg_cron
          </p>
        </div>
      )}
    </div>
  )
}
