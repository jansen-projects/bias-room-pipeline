export type IngestionRunStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

/** Row shape for `ops_ingestion_runs`. */
export interface OpsIngestionRun {
  id: number
  workflow_id: string
  status: IngestionRunStatus
  started_at: string
  completed_at: string | null
  records_fetched: number | null
  records_upserted: number | null
  records_skipped_dedup: number | null
  error_message: string | null
  n8n_execution_id: string | null
  error_count?: number | null
}

/** Row shape for `meta_workflow_registry`. */
export interface MetaWorkflowRegistry {
  workflow_id: string
  tier: 1 | 2 | 3
  description: string
  cron_schedule: string
  stale_after_minutes: number
  destination_tables: string[]
}

/** Ingestion run joined with registry metadata for the run log table. */
export type RunLogEntry = OpsIngestionRun & {
  description: string
  tier: 1 | 2 | 3
}

/** Registry entry joined with the most recent ingestion run for that workflow. */
export type WorkflowStatus = MetaWorkflowRegistry & {
  latest_run: OpsIngestionRun | null
}

export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'JPY'
  | 'GBP'
  | 'CHF'
  | 'CAD'
  | 'AUD'
  | 'NZD'
  | 'XAU'

export type ConsensusDirection = 'bullish' | 'bearish' | 'neutral'

export type GeoRiskStatus = 'draft' | 'active' | 'resolved' | 'archived'

export type GeoRiskSeverity = 'low' | 'medium' | 'high' | 'critical'

/** Row shape for `central_bank_tone`. */
export interface CentralBankTone {
  id: string
  currency_code: CurrencyCode
  central_bank_code: string
  tone_score: number
  tone_label: string
  source_1: string | null
  source_2: string | null
  source_3: string | null
  trigger_event: string | null
  operator_notes: string | null
  is_draft: boolean
  verified_at: string | null
  verified_by: string | null
  effective_date: string
  created_at: string
  updated_at: string
}

export interface InsertToneEntryInput {
  currency_code: CurrencyCode
  central_bank_code: string
  tone_score: number
  source_1: string
  source_2: string
  source_3?: string | null
  trigger_event: string
  effective_date: string
  operator_notes?: string | null
  is_draft: boolean
  verified_at?: string | null
}

/** Row shape for `geo_risk_events`. */
export interface GeoRiskEvent {
  id: string
  event_code: string
  event_title: string
  event_description: string | null
  affected_currencies: CurrencyCode[]
  bullish_channel: string | null
  bearish_channel: string | null
  trigger_threshold_numeric: Record<string, unknown> | null
  status: GeoRiskStatus
  severity: GeoRiskSeverity
  promoted_at: string | null
  promoted_by: string | null
  resolved_at: string | null
  operator_notes: string | null
  created_at: string
  updated_at: string
}

export interface InsertGeoEventInput {
  event_code: string
  event_title: string
  event_description?: string | null
  affected_currencies: CurrencyCode[]
  bullish_channel: string
  bearish_channel: string
  severity: GeoRiskSeverity
  operator_notes?: string | null
}

/** Row shape for `consensus_surveys`. */
export interface ConsensusSurvey {
  id: string
  survey_week_ending: string
  currency_code: CurrencyCode
  reuters_view: ConsensusDirection
  ft_view: ConsensusDirection
  bloomberg_view: ConsensusDirection
  economist_view: ConsensusDirection
  wsj_view: ConsensusDirection
  uniform_consensus: boolean
  consensus_direction: string | null
  operator_notes: string | null
  entered_at: string
  entered_by: string | null
}

export interface ConsensusSurveyUpsertRow {
  survey_week_ending: string
  currency_code: CurrencyCode
  reuters_view: ConsensusDirection
  ft_view: ConsensusDirection
  bloomberg_view: ConsensusDirection
  economist_view: ConsensusDirection
  wsj_view: ConsensusDirection
  operator_notes?: string | null
}
