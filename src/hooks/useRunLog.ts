import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { OpsIngestionRun, RunLogEntry } from '../types/pipeline'

export const RUN_LOG_QUERY_KEY = 'run-log' as const

const DEFAULT_PAGE_SIZE = 25

export interface UseRunLogParams {
  workflowId?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

function toStartOfDayIso(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`
  }
  return value
}

function toEndOfDayIso(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T23:59:59.999Z`
  }
  return value
}

function logSupabaseResponse(
  label: string,
  result: {
    data: unknown
    error: unknown
    status?: number
    statusText?: string
    count?: number | null
  },
) {
  console.log(`[useRunLog] ${label}`, {
    status: result.status,
    statusText: result.statusText,
    count: result.count ?? null,
    rowCount: Array.isArray(result.data) ? result.data.length : null,
    error: result.error,
    data: result.data,
  })
}

async function fetchRunLog(params: UseRunLogParams): Promise<{
  runs: RunLogEntry[]
  totalCount: number
}> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = page * pageSize - 1

  const workflowId = params.workflowId?.trim() || undefined
  const status = params.status?.trim() || undefined
  const dateFrom = params.dateFrom?.trim() || undefined
  const dateTo = params.dateTo?.trim() || undefined

  const appliedFilters = {
    workflowId: workflowId ?? null,
    status: status ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    dateFromGte: null as string | null,
    dateToLte: null as string | null,
    page,
    pageSize,
  }

  console.group('[useRunLog] fetchRunLog')
  console.log('raw params:', params)
  console.log('normalized filters (no defaults):', appliedFilters)

  const baseline = await supabase
    .from('ops_ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5)

  logSupabaseResponse('baseline — no filters, limit 5', baseline)

  let runsQuery = supabase.from('ops_ingestion_runs').select('*')
  let countQuery = supabase
    .from('ops_ingestion_runs')
    .select('*', { count: 'exact', head: true })

  if (workflowId) {
    runsQuery = runsQuery.eq('workflow_id', workflowId)
    countQuery = countQuery.eq('workflow_id', workflowId)
  }

  if (status) {
    runsQuery = runsQuery.eq('status', status)
    countQuery = countQuery.eq('status', status)
  }

  if (dateFrom) {
    appliedFilters.dateFromGte = toStartOfDayIso(dateFrom)
    runsQuery = runsQuery.gte('started_at', appliedFilters.dateFromGte)
    countQuery = countQuery.gte('started_at', appliedFilters.dateFromGte)
  }

  if (dateTo) {
    appliedFilters.dateToLte = toEndOfDayIso(dateTo)
    runsQuery = runsQuery.lte('started_at', appliedFilters.dateToLte)
    countQuery = countQuery.lte('started_at', appliedFilters.dateToLte)
  }

  console.log('applied filters (including gte/lte):', appliedFilters)

  const runsResult = await runsQuery
    .order('started_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  logSupabaseResponse('filtered runs query', runsResult)

  const countResult = await countQuery
  logSupabaseResponse('filtered count query', countResult)

  const registryResult = await supabase
    .from('meta_workflow_registry')
    .select('workflow_id, description, tier')

  logSupabaseResponse('meta_workflow_registry', registryResult)

  console.groupEnd()

  if (runsResult.error) {
    throw runsResult.error
  }

  if (countResult.error) {
    throw countResult.error
  }

  if (registryResult.error) {
    console.warn('[useRunLog] registry lookup failed:', registryResult.error)
  }

  const descriptionByWorkflowId = new Map<string, string>()
  const tierByWorkflowId = new Map<string, 1 | 2 | 3>()

  for (const row of registryResult.data ?? []) {
    descriptionByWorkflowId.set(row.workflow_id, row.description)
    tierByWorkflowId.set(row.workflow_id, row.tier)
  }

  const runs: RunLogEntry[] = ((runsResult.data ?? []) as OpsIngestionRun[]).map(
    (run) => ({
      ...run,
      description:
        descriptionByWorkflowId.get(run.workflow_id) ?? 'Unknown workflow',
      tier: tierByWorkflowId.get(run.workflow_id) ?? 1,
    }),
  )

  console.log('[useRunLog] merged result:', {
    runCount: runs.length,
    totalCount: countResult.count ?? runs.length,
    runs,
  })

  return {
    runs,
    totalCount: countResult.count ?? runs.length,
  }
}

export function useRunLog(params: UseRunLogParams = {}) {
  const workflowId = params.workflowId?.trim() || undefined
  const status = params.status?.trim() || undefined
  const dateFrom = params.dateFrom?.trim() || undefined
  const dateTo = params.dateTo?.trim() || undefined
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE

  const { data, isLoading, error } = useQuery({
    queryKey: [RUN_LOG_QUERY_KEY, workflowId, status, dateFrom, dateTo, page, pageSize],
    queryFn: () =>
      fetchRunLog({ workflowId, status, dateFrom, dateTo, page, pageSize }),
  })

  return {
    runs: data?.runs ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ?? null,
  }
}
