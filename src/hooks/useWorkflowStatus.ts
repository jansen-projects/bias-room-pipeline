import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  MetaWorkflowRegistry,
  OpsIngestionRun,
  WorkflowStatus,
} from '../types/pipeline'

export const WORKFLOW_STATUS_QUERY_KEY = ['workflow-status'] as const
const REFETCH_INTERVAL_MS = 30_000

async function fetchWorkflowStatus(): Promise<WorkflowStatus[]> {
  const { data: registry, error: registryError } = await supabase
    .from('meta_workflow_registry')
    .select('*')
    .order('workflow_id', { ascending: true })

  if (registryError) {
    throw registryError
  }

  const rows = (registry ?? []) as MetaWorkflowRegistry[]
  if (rows.length === 0) {
    return []
  }

  const workflowIds = rows.map((row) => row.workflow_id)

  const { data: runs, error: runsError } = await supabase
    .from('ops_ingestion_runs')
    .select('*')
    .in('workflow_id', workflowIds)
    .order('started_at', { ascending: false })

  if (runsError) {
    throw runsError
  }

  const latestByWorkflowId = new Map<string, OpsIngestionRun>()
  for (const run of (runs ?? []) as OpsIngestionRun[]) {
    if (!latestByWorkflowId.has(run.workflow_id)) {
      latestByWorkflowId.set(run.workflow_id, run)
    }
  }

  return rows.map((entry) => ({
    ...entry,
    latest_run: latestByWorkflowId.get(entry.workflow_id) ?? null,
  }))
}

export function useWorkflowStatus() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: WORKFLOW_STATUS_QUERY_KEY,
    queryFn: fetchWorkflowStatus,
    refetchInterval: REFETCH_INTERVAL_MS,
  })

  return {
    workflows: data ?? [],
    isLoading,
    error: error ?? null,
    lastUpdatedAt: dataUpdatedAt,
  }
}
