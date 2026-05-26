import { useState, type FormEvent } from 'react'
import {
  useActiveGeoEvents,
  useArchiveGeoEvent,
  useDraftGeoEvents,
  useInsertGeoEvent,
  usePromoteGeoEvent,
  useResolveGeoEvent,
} from '../../hooks/useGeoRisk'
import { CURRENCY_CODES, fieldClassName, labelClassName } from '../../lib/manualEntry'
import type { CurrencyCode, GeoRiskEvent, GeoRiskSeverity } from '../../types/pipeline'

const SEVERITY_OPTIONS: GeoRiskSeverity[] = ['low', 'medium', 'high', 'critical']

function severityBadgeClass(severity: GeoRiskSeverity): string {
  switch (severity) {
    case 'low':
      return 'border-border bg-surface text-muted'
    case 'medium':
      return 'border-warning/40 bg-warning/15 text-warning'
    case 'high':
      return 'border-warning bg-warning/25 text-warning'
    case 'critical':
      return 'border-error bg-error/15 text-error'
    default:
      return 'border-border bg-surface text-muted'
  }
}

function SeverityBadge({ severity }: { severity: GeoRiskSeverity }) {
  return (
    <span
      className={[
        'rounded border px-2 py-0.5 font-mono text-[10px] uppercase',
        severityBadgeClass(severity),
      ].join(' ')}
    >
      {severity}
    </span>
  )
}

function CurrencyPills({ currencies }: { currencies: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {currencies.map((code) => (
        <span
          key={code}
          className="rounded border border-border-dim bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted"
        >
          {code}
        </span>
      ))}
    </div>
  )
}

function formatPromotedAt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  })
}

function DraftCard({
  event,
  onPromote,
  onArchive,
  isBusy,
}: {
  event: GeoRiskEvent
  onPromote: (id: string) => void
  onArchive: (id: string) => void
  isBusy: boolean
}) {
  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{event.event_title}</h3>
        <p className="mt-1 font-mono text-[10px] text-gold">{event.event_code}</p>
      </div>
      <CurrencyPills currencies={event.affected_currencies} />
      <SeverityBadge severity={event.severity} />
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onPromote(event.id)}
          className="rounded-md border border-gold px-3 py-1.5 font-mono text-[10px] uppercase text-gold transition-colors hover:bg-gold-dim disabled:opacity-50"
        >
          Promote to Active
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onArchive(event.id)}
          className="font-mono text-[10px] text-dim underline-offset-2 transition-colors hover:text-muted disabled:opacity-50"
        >
          Archive
        </button>
      </div>
    </article>
  )
}

function ActiveCard({
  event,
  onResolve,
  isBusy,
}: {
  event: GeoRiskEvent
  onResolve: (id: string) => void
  isBusy: boolean
}) {
  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{event.event_title}</h3>
        <p className="mt-1 font-mono text-[10px] text-dim">{event.event_code}</p>
      </div>
      <CurrencyPills currencies={event.affected_currencies} />
      <SeverityBadge severity={event.severity} />
      {event.bullish_channel && (
        <p className="font-mono text-xs">
          <span className="text-muted">Bullish channel: </span>
          <span className="text-success">{event.bullish_channel}</span>
        </p>
      )}
      {event.bearish_channel && (
        <p className="font-mono text-xs">
          <span className="text-muted">Bearish channel: </span>
          <span className="text-error">{event.bearish_channel}</span>
        </p>
      )}
      <p className="font-mono text-[10px] text-muted">
        Promoted {formatPromotedAt(event.promoted_at)}
      </p>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => onResolve(event.id)}
        className="rounded-md border border-error px-3 py-1.5 font-mono text-[10px] uppercase text-error transition-colors hover:bg-error/10 disabled:opacity-50"
      >
        Mark Resolved
      </button>
    </article>
  )
}

export function GeoRiskTab() {
  const [formOpen, setFormOpen] = useState(false)
  const [eventCode, setEventCode] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [affectedCurrencies, setAffectedCurrencies] = useState<CurrencyCode[]>([])
  const [severity, setSeverity] = useState<GeoRiskSeverity>('medium')
  const [bullishChannel, setBullishChannel] = useState('')
  const [bearishChannel, setBearishChannel] = useState('')
  const [operatorNotes, setOperatorNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    events: drafts,
    isLoading: draftsLoading,
    error: draftsError,
  } = useDraftGeoEvents()
  const {
    events: active,
    isLoading: activeLoading,
    error: activeError,
  } = useActiveGeoEvents()

  const insertMutation = useInsertGeoEvent()
  const promoteMutation = usePromoteGeoEvent()
  const resolveMutation = useResolveGeoEvent()
  const archiveMutation = useArchiveGeoEvent()

  const isBusy =
    insertMutation.isPending ||
    promoteMutation.isPending ||
    resolveMutation.isPending ||
    archiveMutation.isPending

  function toggleCurrency(code: CurrencyCode, checked: boolean) {
    setAffectedCurrencies((prev) =>
      checked ? [...prev, code] : prev.filter((c) => c !== code),
    )
  }

  function resetForm() {
    setEventCode('')
    setEventTitle('')
    setEventDescription('')
    setAffectedCurrencies([])
    setSeverity('medium')
    setBullishChannel('')
    setBearishChannel('')
    setOperatorNotes('')
    setFormError(null)
  }

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault()
    setFormError(null)

    if (!eventCode.trim() || !eventTitle.trim()) {
      setFormError('Event code and title are required.')
      return
    }

    if (affectedCurrencies.length === 0) {
      setFormError('Select at least one affected currency.')
      return
    }

    try {
      await insertMutation.mutateAsync({
        event_code: eventCode.trim().toUpperCase(),
        event_title: eventTitle.trim(),
        event_description: eventDescription.trim() || null,
        affected_currencies: affectedCurrencies,
        bullish_channel: bullishChannel.trim(),
        bearish_channel: bearishChannel.trim(),
        severity,
        operator_notes: operatorNotes.trim() || null,
      })
      resetForm()
      setFormOpen(false)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to add event',
      )
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-gold">
            Draft Queue
          </h2>
          {draftsError && (
            <p role="alert" className="text-sm text-error">
              {draftsError.message}
            </p>
          )}
          {draftsLoading ? (
            <p className="font-mono text-xs text-muted">Loading…</p>
          ) : drafts.length === 0 ? (
            <p className="rounded-lg border border-border-dim bg-card px-4 py-8 text-center font-mono text-xs text-dim">
              No events in draft queue
            </p>
          ) : (
            <div className="space-y-3">
              {drafts.map((event) => (
                <DraftCard
                  key={event.id}
                  event={event}
                  isBusy={isBusy}
                  onPromote={(id) => void promoteMutation.mutateAsync(id)}
                  onArchive={(id) => void archiveMutation.mutateAsync(id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-error"
              aria-hidden
            />
            <h2 className="font-mono text-xs uppercase tracking-wide text-foreground">
              Active Flags
            </h2>
          </div>
          {activeError && (
            <p role="alert" className="text-sm text-error">
              {activeError.message}
            </p>
          )}
          {activeLoading ? (
            <p className="font-mono text-xs text-muted">Loading…</p>
          ) : active.length === 0 ? (
            <p className="rounded-lg border border-border-dim bg-card px-4 py-8 text-center font-mono text-xs text-dim">
              No active geo risk flags
            </p>
          ) : (
            <div className="space-y-3">
              {active.map((event) => (
                <ActiveCard
                  key={event.id}
                  event={event}
                  isBusy={isBusy}
                  onResolve={(id) => void resolveMutation.mutateAsync(id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="flex w-full items-center gap-2 px-6 py-4 font-mono text-xs text-gold transition-colors hover:text-gold/80"
          aria-expanded={formOpen}
        >
          <span>{formOpen ? '−' : '+'}</span>
          <span>Add New Event</span>
        </button>

        {formOpen && (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4 border-t border-border px-6 pb-6 pt-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassName}>Event code</span>
                <input
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                  className={fieldClassName}
                  required
                  autoCapitalize="characters"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassName}>Event title</span>
                <input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className={fieldClassName}
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className={labelClassName}>Event description</span>
              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                rows={3}
                className={fieldClassName}
              />
            </label>

            <fieldset className="space-y-2">
              <legend className={labelClassName}>Affected currencies</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {CURRENCY_CODES.map((code) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-muted has-checked:border-gold has-checked:text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={affectedCurrencies.includes(code)}
                      onChange={(e) => toggleCurrency(code, e.target.checked)}
                      className="accent-gold"
                    />
                    {code}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <span className={labelClassName}>Severity</span>
              <div className="flex flex-wrap gap-2">
                {SEVERITY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSeverity(option)}
                    className={[
                      'rounded-full border px-3 py-1 font-mono text-[10px] uppercase transition-colors',
                      severity === option
                        ? 'border-gold bg-gold-dim text-gold'
                        : 'border-border text-muted hover:border-gold/40',
                    ].join(' ')}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className={labelClassName}>Bullish channel</span>
              <textarea
                value={bullishChannel}
                onChange={(e) => setBullishChannel(e.target.value)}
                rows={2}
                className={fieldClassName}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClassName}>Bearish channel</span>
              <textarea
                value={bearishChannel}
                onChange={(e) => setBearishChannel(e.target.value)}
                rows={2}
                className={fieldClassName}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClassName}>Operator notes</span>
              <textarea
                value={operatorNotes}
                onChange={(e) => setOperatorNotes(e.target.value)}
                rows={2}
                className={fieldClassName}
              />
            </label>

            {formError && (
              <p role="alert" className="text-sm text-error">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md border border-gold bg-gold px-4 py-2 font-mono text-xs text-background transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Add to Draft Queue
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
