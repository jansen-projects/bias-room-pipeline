import type { CSSProperties } from 'react'
import type { ConsensusDirection, CurrencyCode } from '../types/pipeline'

export const CURRENCY_CODES: CurrencyCode[] = [
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'XAU',
]

export const CENTRAL_BANK_BY_CURRENCY: Record<CurrencyCode, string> = {
  USD: 'FED',
  EUR: 'ECB',
  JPY: 'BOJ',
  GBP: 'BOE',
  CHF: 'SNB',
  CAD: 'BOC',
  AUD: 'RBA',
  NZD: 'RBNZ',
  XAU: 'XAU',
}

const TONE_LABEL_BY_SCORE: Record<number, string> = {
  [-2]: 'Very Dovish',
  [-1.5]: 'Dovish',
  [-1]: 'Mildly Dovish',
  [-0.5]: 'Leaning Dovish',
  0: 'Neutral',
  0.5: 'Leaning Hawkish',
  1: 'Mildly Hawkish',
  1.5: 'Hawkish',
  2: 'Very Hawkish',
}

export function toneScoreToLabel(score: number): string {
  return TONE_LABEL_BY_SCORE[score] ?? 'Unknown'
}

export function toneScoreColorClass(score: number): string {
  if (score < 0) return 'text-error'
  if (score > 0) return 'text-success'
  return 'text-muted'
}

/** Live slider label colors per score step. */
export function toneLabelColorClass(score: number): string {
  switch (score) {
    case -2:
    case -1.5:
      return 'text-error'
    case -1:
      return 'text-error/80'
    case -0.5:
      return 'text-warning'
    case 0:
      return 'text-muted'
    case 0.5:
      return 'text-success/70'
    case 1:
    case 1.5:
    case 2:
      return 'text-success'
    default:
      return toneScoreColorClass(score)
  }
}

export function countToneSources(
  source1: string | null | undefined,
  source2: string | null | undefined,
  source3: string | null | undefined,
): number {
  return [source1, source2, source3].filter((s) => s?.trim()).length
}

/** Range track fill: red left of thumb when negative, green when positive. */
export function toneSliderTrackStyle(score: number): CSSProperties {
  const percent = ((score + 2) / 4) * 100
  const fill =
    score < 0 ? '#E05C5C' : score > 0 ? '#4CAF7D' : 'rgba(255,255,255,0.28)'
  const track = '#0B1F3A'

  return {
    background: `linear-gradient(to right, ${fill} 0%, ${fill} ${percent}%, ${track} ${percent}%, ${track} 100%)`,
  }
}

export function formatDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Next Friday on or after `from` (if `from` is Friday, returns that day). */
export function getComingFriday(from = new Date()): string {
  const date = new Date(from)
  const day = date.getDay()
  const daysUntilFriday = (5 - day + 7) % 7
  date.setDate(date.getDate() + daysUntilFriday)
  return date.toISOString().slice(0, 10)
}

export function getPreviousWeekEnding(weekEnding: string): string {
  const date = new Date(`${weekEnding}T12:00:00`)
  date.setDate(date.getDate() - 7)
  return date.toISOString().slice(0, 10)
}

export function computeLiveConsensus(
  views: (ConsensusDirection | null | undefined)[],
): ConsensusDirection | null {
  if (views.length !== 5 || views.some((view) => !view)) {
    return null
  }
  const [first, ...rest] = views as ConsensusDirection[]
  if (!rest.every((view) => view === first)) {
    return null
  }
  return first
}

export const fieldClassName =
  'w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors focus:border-gold'

export const labelClassName =
  'font-mono text-[10px] uppercase tracking-wide text-muted'
