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
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 50

async function fetchTableData(
  params: UseDataExplorerParams,
): Promise<{ rows: Record<string, unknown>[]; totalCount: number }> {
  const { table, currency, dateFrom, dateTo } = params
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = page * pageSize - 1

  const config = TABLE_CONFIG[table]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from(table) as any).select('*')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let countQuery = (supabase.from(table) as any).select('*', { count: 'exact', head: true })

  if (currency && config.currencyColumn) {
    if (config.currencyMatchMode === 'ilike') {
      query = query.ilike(config.currencyColumn, `%${currency}%`)
      countQuery = countQuery.ilike(config.currencyColumn, `%${currency}%`)
    } else {
      query = query.eq(config.currencyColumn, currency)
      countQuery = countQuery.eq(config.currencyColumn, currency)
    }
  }

  if (dateFrom) {
    query = query.gte(config.dateColumn, dateFrom)
    countQuery = countQuery.gte(config.dateColumn, dateFrom)
  }

  if (dateTo) {
    query = query.lte(config.dateColumn, dateTo)
    countQuery = countQuery.lte(config.dateColumn, dateTo)
  }

  const [result, countResult] = await Promise.all([
    query.order(config.dateColumn, { ascending: false }).range(rangeFrom, rangeTo),
    countQuery,
  ])

  if (result.error) throw result.error
  if (countResult.error) throw countResult.error

  return {
    rows: (result.data ?? []) as Record<string, unknown>[],
    totalCount: countResult.count ?? 0,
  }
}

export function useDataExplorer(params: UseDataExplorerParams) {
  const { table, currency, dateFrom, dateTo } = params
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE

  const { data, isLoading, error } = useQuery({
    queryKey: ['data-explorer', table, currency, dateFrom, dateTo, page, pageSize],
    queryFn: () => fetchTableData({ table, currency, dateFrom, dateTo, page, pageSize }),
  })

  const rows = data?.rows ?? []
  const totalCount = data?.totalCount ?? 0
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return { rows, columns, totalCount, isLoading, error: error ?? null }
}
