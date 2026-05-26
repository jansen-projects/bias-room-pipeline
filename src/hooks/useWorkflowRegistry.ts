import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { MetaWorkflowRegistry } from '../types/pipeline'

export const WORKFLOW_REGISTRY_QUERY_KEY = ['workflow-registry'] as const

async function fetchWorkflowRegistry(): Promise<MetaWorkflowRegistry[]> {
  const { data, error } = await supabase
    .from('meta_workflow_registry')
    .select('workflow_id, tier, description, cron_schedule, stale_after_minutes, destination_tables')
    .order('workflow_id', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as MetaWorkflowRegistry[]
}

export function useWorkflowRegistry() {
  const { data, isLoading, error } = useQuery({
    queryKey: WORKFLOW_REGISTRY_QUERY_KEY,
    queryFn: fetchWorkflowRegistry,
  })

  return {
    workflows: data ?? [],
    isLoading,
    error: error ?? null,
  }
}
