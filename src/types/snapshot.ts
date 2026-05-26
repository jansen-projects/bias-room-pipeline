import type { CurrencyCode, GeoRiskSeverity } from './pipeline'

/** List row from `weekly_anchor_snapshots` (date picker). */
export interface SnapshotDateRow {
  id: number
  snapshot_date: string
  is_locked: boolean
  created_at: string
}

export interface WeeklyAnchorSnapshot {
  id: number
  snapshot_date: string
  created_at: string
  payload: SnapshotPayload
  data_quality_flags: DataQualityFlags
  is_locked: boolean
}

export interface SnapshotPayload {
  fx_closes?: FxCloseRow[]
  cb_rates?: CbRateRow[]
  cb_tone?: CbToneRow[]
  bond_yields?: BondYieldRow[]
  cot?: CotRow[]
  volatility?: VolatilityRow[]
  indices?: IndexEntry[] | Record<string, IndexValue>
  geo_flags?: GeoFlagRow[]
  consensus?: ConsensusRow[]
}

export interface FxCloseRow {
  pair: string
  friday_close: number | null
  '1w_return'?: number | null
  '4w_return'?: number | null
  '12w_return'?: number | null
  as_of_date?: string | null
}

export interface CbRateRow {
  currency: string
  rate_pct: number | null
  last_change_date?: string | null
  next_meeting_date?: string | null
}

export interface CbToneRow {
  currency: string
  tone_score: number | null
  tone_label?: string | null
  verified_at?: string | null
}

export interface BondYieldRow {
  currency: string
  yield_2y?: number | null
  yield_10y?: number | null
  real_yield?: number | null
  breakeven?: number | null
}

export interface CotRow {
  currency: string
  net_position?: number | null
  pct_of_open_interest?: number | null
  report_date?: string | null
}

export interface VolatilityRow {
  pair: string
  atr14?: number | null
  warning_threshold?: number | null
  critical_threshold?: number | null
}

export interface IndexValue {
  value?: number | null
  change_1d?: number | null
}

export interface IndexEntry {
  symbol: string
  value?: number | null
  change_1d?: number | null
}

export interface GeoFlagRow {
  event_title: string
  severity?: GeoRiskSeverity | string | null
  affected_currencies?: CurrencyCode[] | string[] | null
  bullish_channel?: string | null
  bearish_channel?: string | null
}

export interface ConsensusRow {
  currency: string
  uniform_consensus?: boolean | null
  consensus_direction?: 'bullish' | 'bearish' | 'neutral' | string | null
}

export interface DataQualityFlagDetail {
  source?: string
  table?: string
  severity?: string
  dqs_deduction?: number
  message?: string
  reason?: string
  description?: string
}

export interface DqsFlagEntry {
  key: string
  severity?: string
  description: string
  dqs_deduction?: number
}

export type DataQualityFlags =
  | Record<string, DataQualityFlagDetail>
  | DataQualityFlagDetail[]
  | null
