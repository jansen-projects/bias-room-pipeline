import { useEffect, useMemo, useState } from 'react'
import {
  useConsensusSurvey,
  usePreviousWeekConsensus,
  useUpsertConsensusSurvey,
} from '../../hooks/useConsensusSurvey'
import {
  CURRENCY_CODES,
  computeLiveConsensus,
  fieldClassName,
  getComingFriday,
  labelClassName,
} from '../../lib/manualEntry'
import type {
  ConsensusDirection,
  ConsensusSurvey,
  ConsensusSurveyUpsertRow,
  CurrencyCode,
} from '../../types/pipeline'

const SOURCE_KEYS = [
  'reuters_view',
  'ft_view',
  'bloomberg_view',
  'economist_view',
  'wsj_view',
] as const

const SOURCE_LABELS = ['Reuters', 'FT', 'Bloomberg', 'Economist', 'WSJ']

type SourceKey = (typeof SOURCE_KEYS)[number]

type RowState = Record<SourceKey, ConsensusDirection | null>

function emptyRow(): RowState {
  return {
    reuters_view: null,
    ft_view: null,
    bloomberg_view: null,
    economist_view: null,
    wsj_view: null,
  }
}

function surveyToRow(survey: ConsensusSurvey): RowState {
  return {
    reuters_view: survey.reuters_view,
    ft_view: survey.ft_view,
    bloomberg_view: survey.bloomberg_view,
    economist_view: survey.economist_view,
    wsj_view: survey.wsj_view,
  }
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: ConsensusDirection | null
  onChange: (direction: ConsensusDirection) => void
}) {
  const options: {
    id: ConsensusDirection
    label: string
    active: string
  }[] = [
    {
      id: 'bullish',
      label: 'Bull',
      active: 'border-success/40 bg-success/20 text-success',
    },
    {
      id: 'neutral',
      label: 'Neu',
      active: 'border-border bg-surface text-muted',
    },
    {
      id: 'bearish',
      label: 'Bear',
      active: 'border-error/40 bg-error/20 text-error',
    },
  ]

  return (
    <div className="flex justify-center gap-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={[
            'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase transition-colors',
            value === option.id
              ? option.active
              : 'border-transparent text-dim hover:text-muted',
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ConsensusCell({ views }: { views: (ConsensusDirection | null)[] }) {
  const consensus = computeLiveConsensus(views)

  if (consensus === 'bullish') {
    return (
      <span className="inline-block rounded border border-success/40 bg-success/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-success">
        BULLISH
      </span>
    )
  }

  if (consensus === 'bearish') {
    return (
      <span className="inline-block rounded border border-error/40 bg-error/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-error">
        BEARISH
      </span>
    )
  }

  return <span className="font-mono text-sm text-dim">—</span>
}

function lastWeekDirection(survey: ConsensusSurvey | undefined): string {
  if (!survey?.uniform_consensus || !survey.consensus_direction) {
    return '—'
  }
  return survey.consensus_direction.toUpperCase()
}

export function ConsensusTab() {
  const [weekEnding, setWeekEnding] = useState(getComingFriday())
  const [rows, setRows] = useState<Record<CurrencyCode, RowState>>(() =>
    Object.fromEntries(
      CURRENCY_CODES.map((code) => [code, emptyRow()]),
    ) as Record<CurrencyCode, RowState>,
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { surveys, isLoading, error } = useConsensusSurvey(weekEnding)
  const { surveys: previousSurveys } = usePreviousWeekConsensus(weekEnding)
  const upsertMutation = useUpsertConsensusSurvey()

  const previousByCurrency = useMemo(() => {
    const map = new Map<CurrencyCode, ConsensusSurvey>()
    for (const survey of previousSurveys) {
      map.set(survey.currency_code, survey)
    }
    return map
  }, [previousSurveys])

  useEffect(() => {
    const next = Object.fromEntries(
      CURRENCY_CODES.map((code) => [code, emptyRow()]),
    ) as Record<CurrencyCode, RowState>

    for (const survey of surveys) {
      next[survey.currency_code] = surveyToRow(survey)
    }

    setRows(next)
  }, [surveys, weekEnding])

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 2000)
    return () => window.clearTimeout(timer)
  }, [saved])

  function updateSource(
    currency: CurrencyCode,
    key: SourceKey,
    direction: ConsensusDirection,
  ) {
    setRows((prev) => ({
      ...prev,
      [currency]: { ...prev[currency], [key]: direction },
    }))
  }

  async function handleSaveAll() {
    setSaveError(null)

    const payload: ConsensusSurveyUpsertRow[] = []

    for (const code of CURRENCY_CODES) {
      const row = rows[code]
      const views = SOURCE_KEYS.map((key) => row[key])

      if (views.some((view) => !view)) {
        setSaveError(
          `Select Bull, Neu, or Bear for every source on ${code} before saving.`,
        )
        return
      }

      payload.push({
        survey_week_ending: weekEnding,
        currency_code: code,
        reuters_view: row.reuters_view!,
        ft_view: row.ft_view!,
        bloomberg_view: row.bloomberg_view!,
        economist_view: row.economist_view!,
        wsj_view: row.wsj_view!,
      })
    }

    try {
      await upsertMutation.mutateAsync(payload)
      setSaved(true)
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save survey entries',
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-card px-4 py-4">
        <label className="flex flex-col gap-1">
          <span className={labelClassName}>Week ending</span>
          <input
            type="date"
            value={weekEnding}
            onChange={(event) => setWeekEnding(event.target.value)}
            className={fieldClassName}
          />
        </label>
        <button
          type="button"
          disabled={upsertMutation.isPending || isLoading}
          onClick={() => void handleSaveAll()}
          className="rounded-md border border-gold bg-gold px-4 py-2 font-mono text-xs text-background transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {saved ? 'Saved ✓' : 'Save All Entries'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          Failed to load survey: {error.message}
        </p>
      )}

      {saveError && (
        <p role="alert" className="text-sm text-error">
          {saveError}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="w-28 px-3 py-3 text-left">Currency</th>
              {SOURCE_LABELS.map((label) => (
                <th key={label} className="px-2 py-3 text-center">
                  {label}
                </th>
              ))}
              <th className="px-2 py-3 text-center">Consensus</th>
            </tr>
          </thead>
          <tbody>
            {CURRENCY_CODES.map((code, index) => {
              const row = rows[code]
              const views = SOURCE_KEYS.map((key) => row[key])
              const prev = previousByCurrency.get(code)
              const isOdd = index % 2 === 0

              return (
                <tr
                  key={code}
                  className={[
                    'border-b border-border-dim',
                    isOdd ? 'bg-card' : 'bg-card-even',
                  ].join(' ')}
                >
                  <td className="w-28 px-3 py-4 align-middle">
                    <p className="font-mono text-sm font-medium text-gold">
                      {code}
                    </p>
                    <p className="mt-1 font-mono text-[9px] text-dim">
                      Last week: {lastWeekDirection(prev)}
                    </p>
                  </td>
                  {SOURCE_KEYS.map((key) => (
                    <td key={key} className="px-2 py-4 align-middle">
                      <DirectionToggle
                        value={row[key]}
                        onChange={(direction) =>
                          updateSource(code, key, direction)
                        }
                      />
                    </td>
                  ))}
                  <td className="px-2 py-4 text-center align-middle">
                    <ConsensusCell views={views} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <p className="font-mono text-xs text-muted">Loading week data…</p>
      )}
    </div>
  )
}
