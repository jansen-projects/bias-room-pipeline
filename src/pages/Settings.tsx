import { useState } from 'react'
import { useSlaSettings } from '../hooks/useSlaSettings'
import type { SlaEntry, SlaUpdateInput } from '../hooks/useSlaSettings'

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  if (min < 1440) return `${Math.round(min / 60)}h`
  return `${Math.round(min / 1440)}d`
}

function SlaRow({
  entry,
  onSave,
  isUpdating,
}: {
  entry: SlaEntry
  onSave: (input: SlaUpdateInput) => void
  isUpdating: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [warn, setWarn] = useState(String(entry.warning_after_min))
  const [crit, setCrit] = useState(String(entry.critical_after_min))
  const [notes, setNotes] = useState(entry.operator_notes ?? '')
  const [active, setActive] = useState(entry.is_active)

  const hasChanges =
    warn !== String(entry.warning_after_min) ||
    crit !== String(entry.critical_after_min) ||
    notes !== (entry.operator_notes ?? '') ||
    active !== entry.is_active

  function handleSave() {
    const warnN = parseInt(warn, 10)
    const critN = parseInt(crit, 10)
    if (isNaN(warnN) || isNaN(critN) || warnN <= 0 || critN <= 0) return
    onSave({
      id: entry.id,
      warning_after_min: warnN,
      critical_after_min: critN,
      operator_notes: notes || null,
      is_active: active,
    })
    setEditing(false)
  }

  function handleCancel() {
    setWarn(String(entry.warning_after_min))
    setCrit(String(entry.critical_after_min))
    setNotes(entry.operator_notes ?? '')
    setActive(entry.is_active)
    setEditing(false)
  }

  return (
    <tr className="border-b border-border/40">
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${entry.is_active ? 'bg-success' : 'bg-dim'}`}
          />
          <span className="font-mono text-xs text-foreground">{entry.table_name}</span>
        </div>
      </td>
      <td className="px-2 py-2.5 font-mono text-xs text-muted">{entry.workflow_id}</td>
      <td className="px-2 py-2.5 font-mono text-xs text-muted">{entry.expected_frequency}</td>

      {/* Warning threshold */}
      <td className="px-2 py-2.5 text-right">
        {editing ? (
          <input
            type="number"
            min={1}
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
            className="w-20 rounded border border-warning/40 bg-card px-2 py-0.5 text-right font-mono text-xs text-warning focus:border-warning focus:outline-none"
          />
        ) : (
          <span className="font-mono text-xs text-warning">{formatMinutes(entry.warning_after_min)}</span>
        )}
      </td>

      {/* Critical threshold */}
      <td className="px-2 py-2.5 text-right">
        {editing ? (
          <input
            type="number"
            min={1}
            value={crit}
            onChange={(e) => setCrit(e.target.value)}
            className="w-20 rounded border border-error/40 bg-card px-2 py-0.5 text-right font-mono text-xs text-error focus:border-error focus:outline-none"
          />
        ) : (
          <span className="font-mono text-xs text-error">{formatMinutes(entry.critical_after_min)}</span>
        )}
      </td>

      {/* Active toggle */}
      <td className="px-2 py-2.5 text-center">
        {editing ? (
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="accent-gold"
          />
        ) : (
          <span className={`font-mono text-xs ${entry.is_active ? 'text-success' : 'text-dim'}`}>
            {entry.is_active ? 'yes' : 'no'}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="py-2.5 pl-2 pr-4 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || isUpdating}
              className="rounded border border-success/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-success transition-colors hover:bg-success/10 disabled:opacity-40"
            >
              {isUpdating ? '…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:bg-surface/60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-gold/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gold transition-colors hover:bg-gold/10"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  )
}

export default function Settings() {
  const { entries, isLoading, error, updateEntry, isUpdating } = useSlaSettings()

  const activeCount = entries.filter((e) => e.is_active).length

  return (
    <div className="space-y-8">
      <header className="space-y-1 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-gold">Operator</p>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      </header>

      {/* SLA Thresholds */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Freshness SLA Thresholds</h2>
            <p className="mt-0.5 font-mono text-xs text-muted">
              {activeCount} of {entries.length} entries active · Stale monitor checks every 15 min (weekdays)
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error/50 bg-error/15 px-4 py-3 text-sm text-error">
            Failed to load SLA settings: {error.message}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left">
                {[
                  { label: 'Table', align: 'left', pl: 'pl-4' },
                  { label: 'Workflow', align: 'left', pl: '' },
                  { label: 'Frequency', align: 'left', pl: '' },
                  { label: 'Warn after', align: 'right', pl: '' },
                  { label: 'Crit after', align: 'right', pl: '' },
                  { label: 'Active', align: 'center', pl: '' },
                  { label: '', align: 'right', pl: '' },
                ].map(({ label, align, pl }, i) => (
                  <th
                    key={label + i}
                    className={`px-2 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted text-${align} ${pl} ${label === '' ? 'pr-4' : ''}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-2 py-3">
                          <div className="h-3 animate-pulse rounded bg-surface/60" />
                        </td>
                      ))}
                    </tr>
                  ))
                : entries.map((entry) => (
                    <SlaRow
                      key={entry.id}
                      entry={entry}
                      onSave={updateEntry}
                      isUpdating={isUpdating}
                    />
                  ))}
              {!isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center font-mono text-xs text-dim">
                    No SLA entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 font-mono text-xs text-dim">
          Warning and Critical values are in minutes. Changes take effect on the next monitor run.
        </p>
      </section>

      {/* Pipeline info */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold text-foreground">Pipeline Schedule</h2>
        <div className="space-y-1.5 font-mono text-xs text-muted">
          {[
            { label: 'Tier 1 — FX, Indices, Commodities', schedule: '22:00 UTC weekdays' },
            { label: 'Tier 1 — Bond yields, FRED', schedule: '22:30 UTC weekdays' },
            { label: 'Tier 1 — CB rates', schedule: '06:00 UTC daily' },
            { label: 'Tier 1 — Economic calendar', schedule: '04:00 UTC daily' },
            { label: 'Tier 1 — COT positioning', schedule: '22:00 UTC Fridays' },
            { label: 'Tier 1 — Inflation forecasts', schedule: '07:00 UTC Mondays' },
            { label: 'Tier 2 — ATR-14', schedule: '23:15 UTC weekdays' },
            { label: 'Tier 2 — Friday close snapshot', schedule: '23:30 UTC Fridays' },
            { label: 'Tier 2 — Daily close snapshot', schedule: '23:30 UTC weekdays' },
            { label: 'Tier 2 — Weekly anchor snapshot', schedule: '23:45 UTC Fridays' },
            { label: 'Tier 3 — Stale data monitor', schedule: 'Every 15 min weekdays' },
            { label: 'Tier 3 — DLQ retry', schedule: 'Every 6 hours' },
            { label: 'Tier 3 — Health check', schedule: 'Every hour' },
          ].map(({ label, schedule }) => (
            <div key={label} className="flex items-center justify-between border-b border-border/20 py-1.5 last:border-0">
              <span>{label}</span>
              <span className="text-gold">{schedule}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
