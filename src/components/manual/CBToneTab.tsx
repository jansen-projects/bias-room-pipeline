import { useState } from 'react'
import { useInsertToneEntry, useRecentTone } from '../../hooks/useCBTone'
import {
  CENTRAL_BANK_BY_CURRENCY,
  CURRENCY_CODES,
  countToneSources,
  fieldClassName,
  formatDateOnly,
  labelClassName,
  todayDateString,
  toneLabelColorClass,
  toneScoreColorClass,
  toneScoreToLabel,
  toneSliderTrackStyle,
} from '../../lib/manualEntry'
import type { CentralBankTone, CurrencyCode } from '../../types/pipeline'

function formatScore(score: number): string {
  const prefix = score > 0 ? '+' : ''
  return `${prefix}${score.toFixed(1)}`
}

function resetFormFields(
  setters: {
    setSource1: (v: string) => void
    setSource2: (v: string) => void
    setSource3: (v: string) => void
    setTriggerEvent: (v: string) => void
    setOperatorNotes: (v: string) => void
    setFormError: (v: string | null) => void
  },
) {
  setters.setSource1('')
  setters.setSource2('')
  setters.setSource3('')
  setters.setTriggerEvent('')
  setters.setOperatorNotes('')
  setters.setFormError(null)
}

export function CBToneTab() {
  const [currency, setCurrency] = useState<CurrencyCode>('USD')
  const [toneScore, setToneScore] = useState(0)
  const [source1, setSource1] = useState('')
  const [source2, setSource2] = useState('')
  const [source3, setSource3] = useState('')
  const [triggerEvent, setTriggerEvent] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayDateString())
  const [operatorNotes, setOperatorNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { entries, isLoading, error } = useRecentTone()
  const insertMutation = useInsertToneEntry()

  const toneLabel = toneScoreToLabel(toneScore)
  const canVerify = Boolean(source1.trim() && source2.trim())

  async function handleSave(verified: boolean) {
    setFormError(null)

    if (!source1.trim() || !source2.trim()) {
      setFormError('Verification Source 1 and 2 are required.')
      return
    }

    if (!triggerEvent.trim()) {
      setFormError('Trigger event is required.')
      return
    }

    try {
      await insertMutation.mutateAsync({
        currency_code: currency,
        central_bank_code: CENTRAL_BANK_BY_CURRENCY[currency],
        tone_score: toneScore,
        source_1: source1.trim(),
        source_2: source2.trim(),
        source_3: source3.trim() || null,
        trigger_event: triggerEvent.trim(),
        effective_date: effectiveDate,
        operator_notes: operatorNotes.trim() || null,
        is_draft: !verified,
        verified_at: verified ? new Date().toISOString() : null,
      })
      resetFormFields({
        setSource1,
        setSource2,
        setSource3,
        setTriggerEvent,
        setOperatorNotes,
        setFormError,
      })
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save tone entry',
      )
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-6 rounded-lg border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-gold">
          New entry
        </h2>

        <div className="space-y-2">
          <span className={labelClassName}>Currency</span>
          <div className="flex flex-wrap gap-2">
            {CURRENCY_CODES.map((code) => {
              const isActive = currency === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCurrency(code)}
                  className={[
                    'rounded-full border px-3 py-1.5 font-mono text-xs transition-colors',
                    isActive
                      ? 'border-gold bg-gold text-background'
                      : 'border-gold bg-card text-foreground hover:bg-gold-dim',
                  ].join(' ')}
                >
                  {code}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-3">
          <p
            className={[
              'font-mono text-sm font-semibold',
              toneLabelColorClass(toneScore),
            ].join(' ')}
          >
            {formatScore(toneScore)} — {toneLabel}
          </p>
          <input
            type="range"
            min={-2}
            max={2}
            step={0.5}
            value={toneScore}
            onChange={(event) => setToneScore(Number(event.target.value))}
            style={toneSliderTrackStyle(toneScore)}
            className="h-2 w-full cursor-pointer appearance-none rounded-full accent-gold [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gold [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gold [&::-webkit-slider-thumb]:bg-foreground"
            aria-label="Tone score"
          />
          <div className="flex justify-between font-mono text-[10px] text-dim">
            <span>-2.0</span>
            <span>0.0</span>
            <span>+2.0</span>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClassName}>Verification Source 1</span>
            <input
              value={source1}
              onChange={(event) => setSource1(event.target.value)}
              className={fieldClassName}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassName}>Verification Source 2</span>
            <input
              value={source2}
              onChange={(event) => setSource2(event.target.value)}
              className={fieldClassName}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassName}>Verification Source 3 (optional)</span>
            <input
              value={source3}
              onChange={(event) => setSource3(event.target.value)}
              className={fieldClassName}
            />
          </label>
        </div>

        <p className="font-mono text-[10px] text-dim">
          Scoring engine requires ≥2 sources before a row is usable
        </p>

        <label className="flex flex-col gap-1">
          <span className={labelClassName}>Trigger event</span>
          <input
            value={triggerEvent}
            onChange={(event) => setTriggerEvent(event.target.value)}
            placeholder="e.g. FOMC Minutes May 2026"
            className={fieldClassName}
          />
        </label>

        <label className="flex max-w-xs flex-col gap-1">
          <span className={labelClassName}>Effective date</span>
          <input
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            className={fieldClassName}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClassName}>Operator notes (optional)</span>
          <textarea
            value={operatorNotes}
            onChange={(event) => setOperatorNotes(event.target.value)}
            rows={3}
            className={fieldClassName}
          />
        </label>

        {formError && (
          <p role="alert" className="text-sm text-error">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={insertMutation.isPending}
            onClick={() => void handleSave(false)}
            className="rounded-md border border-gold px-4 py-2 font-mono text-xs text-gold transition-colors hover:bg-gold-dim disabled:opacity-50"
          >
            Save as Draft
          </button>
          <span
            className="inline-flex"
            title={!canVerify ? 'Requires 2 sources' : undefined}
          >
            <button
              type="button"
              disabled={insertMutation.isPending || !canVerify}
              onClick={() => void handleSave(true)}
              className="rounded-md border border-gold bg-gold px-4 py-2 font-mono text-xs text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save & Verify
            </button>
          </span>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Recent entries
        </h2>

        {error && (
          <p role="alert" className="text-sm text-error">
            Failed to load entries: {error.message}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-[10px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Effective Date</th>
                <th className="px-4 py-3">Sources</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 font-mono text-xs text-muted"
                  >
                    Loading…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 font-mono text-xs text-muted"
                  >
                    No entries yet
                  </td>
                </tr>
              ) : (
                entries.map((row) => (
                  <RecentEntryRow key={row.id} row={row} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function RecentEntryRow({ row }: { row: CentralBankTone }) {
  const sourceCount = countToneSources(row.source_1, row.source_2, row.source_3)

  return (
    <tr className="border-b border-border-dim last:border-0">
      <td className="px-4 py-3 font-mono text-xs text-gold">{row.currency_code}</td>
      <td className="px-4 py-3">
        <span
          className={[
            'font-mono text-xs font-semibold',
            toneScoreColorClass(row.tone_score),
          ].join(' ')}
        >
          {formatScore(row.tone_score)}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted">{row.tone_label}</td>
      <td className="px-4 py-3">
        {row.verified_at ? (
          <span className="inline-block rounded-full border border-success/40 bg-success/15 px-2 py-0.5 font-mono text-[10px] uppercase text-success">
            ✓ Verified
          </span>
        ) : (
          <span className="inline-block rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase text-warning">
            Draft
          </span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted">
        {formatDateOnly(row.effective_date)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-dim">
        {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
      </td>
    </tr>
  )
}
