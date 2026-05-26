import type {
  DataQualityFlagDetail,
  DataQualityFlags,
  DqsFlagEntry,
  IndexEntry,
  IndexValue,
  SnapshotPayload,
} from '../types/snapshot'

const INDEX_SYMBOLS = ['VIX', 'DXY', 'SPX', 'STOXX50', 'GDX'] as const

export function formatSnapshotDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function nextFridaySnapshotUtc(from: Date = new Date()): Date {
  const target = new Date(from)
  target.setUTCHours(23, 45, 0, 0)

  const day = from.getUTCDay()
  let daysUntilFriday = (5 - day + 7) % 7

  if (daysUntilFriday === 0 && from >= target) {
    daysUntilFriday = 7
  }

  target.setUTCDate(from.getUTCDate() + daysUntilFriday)
  return target
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return '0h 0m 0s'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }

  return `${hours}h ${minutes}m ${seconds}s`
}

export function isPayloadEmpty(payload: SnapshotPayload | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') {
    return true
  }

  return Object.keys(payload).length === 0
}

export function normalizeDataQualityFlags(
  flags: DataQualityFlags | undefined,
): DataQualityFlagDetail[] {
  if (!flags) {
    return []
  }

  if (Array.isArray(flags)) {
    return flags.filter((entry) => entry && typeof entry === 'object')
  }

  if (typeof flags === 'object') {
    return Object.entries(flags).map(([key, value]) => ({
      source: value.source ?? key,
      table: value.table ?? key,
      severity: value.severity,
      dqs_deduction: value.dqs_deduction,
      message: value.message ?? value.reason,
      reason: value.reason,
    }))
  }

  return []
}

export function getMissingSourceLabels(flags: DataQualityFlags | undefined): string[] {
  return normalizeDataQualityFlags(flags).map(
    (entry) => entry.source ?? entry.table ?? 'Unknown source',
  )
}

export function getDqsFlagEntries(flags: DataQualityFlags | undefined): DqsFlagEntry[] {
  if (!flags) {
    return []
  }

  if (Array.isArray(flags)) {
    return flags
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, index) => ({
        key: entry.source ?? entry.table ?? `flag_${index}`,
        severity: entry.severity,
        description:
          entry.description ?? entry.message ?? entry.reason ?? 'Missing or stale data',
        dqs_deduction: entry.dqs_deduction,
      }))
  }

  return Object.entries(flags).map(([key, value]) => ({
    key,
    severity: value.severity,
    description:
      value.description ?? value.message ?? value.reason ?? 'Missing or stale data',
    dqs_deduction: value.dqs_deduction,
  }))
}

export function normalizeIndices(
  indices: SnapshotPayload['indices'],
): { symbol: string; value: IndexValue }[] {
  if (!indices) {
    return []
  }

  if (Array.isArray(indices)) {
    return indices.map((row: IndexEntry) => ({
      symbol: row.symbol,
      value: { value: row.value, change_1d: row.change_1d },
    }))
  }

  const symbols = [
    ...INDEX_SYMBOLS,
    ...Object.keys(indices).filter(
      (key) => !INDEX_SYMBOLS.includes(key as (typeof INDEX_SYMBOLS)[number]),
    ),
  ]

  const unique = [...new Set(symbols)]

  return unique.map((symbol) => ({
    symbol,
    value: (indices as Record<string, IndexValue>)[symbol] ?? {},
  }))
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) {
    return '—'
  }

  return `${value.toFixed(digits)}%`
}

export function formatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || Number.isNaN(value)) {
    return '—'
  }

  return value.toFixed(digits)
}

export function formatReturnPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '—'
  }

  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function isStaleAsOf(asOfDate: string | null | undefined, snapshotDate: string): boolean {
  if (!asOfDate) {
    return true
  }

  return asOfDate.slice(0, 10) !== snapshotDate.slice(0, 10)
}

/** Normalize array or currency-keyed object into rows with `currency`. */
export function asCurrencyArray<T extends object>(
  data: T[] | Record<string, T> | undefined,
): (T & { currency: string })[] {
  if (!data) {
    return []
  }

  if (Array.isArray(data)) {
    return data as (T & { currency: string })[]
  }

  return Object.entries(data).map(([currency, row]) => ({
    currency,
    ...row,
  })) as (T & { currency: string })[]
}
