import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const SILVER_TABLES = [
  'forex_rates',
  'central_bank_rates',
  'central_bank_tone',
  'bond_yields_nominal',
  'cot_positioning',
  'economic_calendar',
  'gold_context',
  'market_indices',
] as const

export type SilverTable = (typeof SILVER_TABLES)[number]

interface TableConfig {
  currencyColumn: string | null
  dateColumn: string
  currencyMatchMode: 'exact' | 'ilike'
}

const TABLE_CONFIG: Record<SilverTable, TableConfig> = {
  // Verified against information_schema.columns 2026-05-23 (Phase 2 renames applied)
  forex_rates:          { currencyColumn: 'pair',          dateColumn: 'effective_date', currencyMatchMode: 'ilike' },
  central_bank_rates:   { currencyColumn: 'currency',      dateColumn: 'effective_date', currencyMatchMode: 'exact' },
  central_bank_tone:    { currencyColumn: 'currency_code', dateColumn: 'effective_date', currencyMatchMode: 'exact' },
  bond_yields_nominal:  { currencyColumn: 'currency',      dateColumn: 'effective_date', currencyMatchMode: 'exact' },
  cot_positioning:      { currencyColumn: 'currency',      dateColumn: 'report_date',    currencyMatchMode: 'exact' },
  economic_calendar:    { currencyColumn: 'currency',      dateColumn: 'event_date',     currencyMatchMode: 'exact' },
  gold_context:         { currencyColumn: null,             dateColumn: 'effective_date', currencyMatchMode: 'exact' },
  market_indices:       { currencyColumn: null,             dateColumn: 'effective_date', currencyMatchMode: 'exact' },
}

export function tableHasCurrencyFilter(table: SilverTable): boolean {
  return TABLE_CONFIG[table].currencyColumn !== null
}

export interface UseDataExplorerParams {
  table: SilverTable
  currency?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}

const DEFAULT_LIMIT = 200

async function fetchTableData(
  params: UseDataExplorerParams,
): Promise<Record<string, unknown>[]> {
  const { table, currency, dateFrom, dateTo, limit = DEFAULT_LIMIT } = params
  const config = TABLE_CONFIG[table]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from(table) as any).select('*')

  if (currency && config.currencyColumn) {
    if (config.currencyMatchMode === 'ilike') {
      query = query.ilike(config.currencyColumn, `%${currency}%`)
    } else {
      query = query.eq(config.currencyColumn, currency)
    }
  }

  if (dateFrom) {
    query = query.gte(config.dateColumn, dateFrom)
  }

  if (dateTo) {
    query = query.lte(config.dateColumn, dateTo)
  }

  const { data, error } = await query
    .order(config.dateColumn, { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []) as Record<string, unknown>[]
}

export function useDataExplorer(params: UseDataExplorerParams) {
  const { table, currency, dateFrom, dateTo, limit = DEFAULT_LIMIT } = params

  const { data, isLoading, error } = useQuery({
    queryKey: ['data-explorer', table, currency, dateFrom, dateTo, limit],
    queryFn: () => fetchTableData({ table, currency, dateFrom, dateTo, limit }),
  })

  const rows = data ?? []
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return { rows, columns, isLoading, error: error ?? null }
}
