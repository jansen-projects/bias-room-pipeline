import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const STALE_ALERTS_QUERY_KEY = 'stale-alerts' as const

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

async function fetchAlerts(includeResolved: boolean): Promise<StaleAlert[]> {
  let query = supabase
    .from('ops_stale_data_alerts')
    .select('*')
    .order('fired_at', { ascending: false })
    .limit(200)

  if (!includeResolved) {
    query = query.eq('is_resolved', false)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as StaleAlert[]
}

export function useStaleAlerts(includeResolved = false) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [STALE_ALERTS_QUERY_KEY, includeResolved],
    queryFn: () => fetchAlerts(includeResolved),
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

  const alerts = data ?? []
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.is_resolved).length
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.is_resolved).length

  return {
    alerts,
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
