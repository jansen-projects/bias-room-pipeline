import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const STALE_ALERTS_QUERY_KEY = 'stale-alerts' as const

const DEFAULT_PAGE_SIZE = 25

export interface StaleAlert {
  id: string
  table_name: string
  workflow_id: string
  severity: 'warning' | 'critical'
  actual_age_min: number
  threshold_min: number
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  operator_notes: string | null
  fired_at: string
  created_at: string
}

async function fetchAlerts(
  includeResolved: boolean,
  page: number,
  pageSize: number,
): Promise<{ alerts: StaleAlert[]; totalCount: number }> {
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = page * pageSize - 1

  let query = supabase
    .from('ops_stale_data_alerts')
    .select('*')
    .order('fired_at', { ascending: false })

  let countQuery = supabase
    .from('ops_stale_data_alerts')
    .select('*', { count: 'exact', head: true })

  if (!includeResolved) {
    query = query.eq('is_resolved', false)
    countQuery = countQuery.eq('is_resolved', false)
  }

  const [result, countResult] = await Promise.all([
    query.range(rangeFrom, rangeTo),
    countQuery,
  ])

  if (result.error) throw result.error
  if (countResult.error) throw countResult.error

  return {
    alerts: (result.data ?? []) as StaleAlert[],
    totalCount: countResult.count ?? 0,
  }
}

export function useStaleAlerts(includeResolved = false, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [STALE_ALERTS_QUERY_KEY, includeResolved, page, pageSize],
    queryFn: () => fetchAlerts(includeResolved, page, pageSize),
    refetchInterval: 60_000,
  })

  const resolveMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('ops_stale_data_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: 'operator',
        })
        .eq('id', alertId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STALE_ALERTS_QUERY_KEY] })
    },
  })

  const resolveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('ops_stale_data_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: 'operator',
        })
        .eq('is_resolved', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STALE_ALERTS_QUERY_KEY] })
    },
  })

  const alerts = data?.alerts ?? []
  const totalCount = data?.totalCount ?? 0
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.is_resolved).length
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.is_resolved).length

  return {
    alerts,
    totalCount,
    criticalCount,
    warningCount,
    isLoading,
    error: error ?? null,
    refetch,
    resolveAlert: resolveMutation.mutate,
    isResolving: resolveMutation.isPending,
    resolveAll: resolveAll.mutate,
    isResolvingAll: resolveAll.isPending,
  }
}
