import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const SLA_SETTINGS_QUERY_KEY = 'sla-settings' as const

export interface SlaEntry {
  id: string
  table_name: string
  expected_frequency: string
  warning_after_min: number
  critical_after_min: number
  workflow_id: string
  operator_notes: string | null
  is_active: boolean
  created_at: string
}

export interface SlaUpdateInput {
  id: string
  warning_after_min: number
  critical_after_min: number
  operator_notes?: string | null
  is_active?: boolean
}

async function fetchSlaEntries(): Promise<SlaEntry[]> {
  const { data, error } = await supabase
    .from('meta_table_freshness_sla')
    .select('*')
    .order('table_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as SlaEntry[]
}

export function useSlaSettings() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [SLA_SETTINGS_QUERY_KEY],
    queryFn: fetchSlaEntries,
  })

  const updateMutation = useMutation({
    mutationFn: async (input: SlaUpdateInput) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('meta_table_freshness_sla')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SLA_SETTINGS_QUERY_KEY] })
    },
  })

  return {
    entries: data ?? [],
    isLoading,
    error: error ?? null,
    refetch,
    updateEntry: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error ?? null,
  }
}
