import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { OpsIngestionRun } from '../types/pipeline'

export const INGESTION_RUNS_QUERY_KEY = 'ingestion-runs' as const

export interface UseIngestionRunsParams {
  workflowId?: string
  status?: string
  limit?: number
}

export interface IngestionRunWithErrors extends OpsIngestionRun {
  error_count: number
}

async function fetchIngestionRuns(params: UseIngestionRunsParams): Promise<{
  runs: IngestionRunWithErrors[]
  totalCount: number
}> {
  const limit = params.limit ?? 50
  const workflowId = params.workflowId?.trim() || undefined
  const status = params.status?.trim() || undefined

  let query = supabase.from('ops_ingestion_runs').select('*')
  let countQuery = supabase
    .from('ops_ingestion_runs')
    .select('*', { count: 'exact', head: true })

  if (workflowId) {
    query = query.eq('workflow_id', workflowId)
    countQuery = countQuery.eq('workflow_id', workflowId)
  }
  if (status) {
    query = query.eq('status', status)
    countQuery = countQuery.eq('status', status)
  }

  const [runsResult, countResult] = await Promise.all([
    query.order('started_at', { ascending: false }).limit(limit),
    countQuery,
  ])

  if (runsResult.error) throw runsResult.error
  if (countResult.error) throw countResult.error

  const runs = (runsResult.data ?? []) as OpsIngestionRun[]
  const runIds = runs.map((r) => r.id)

  // Fetch error counts for these runs
  let errorCountByRunId: Record<number, number> = {}
  if (runIds.length > 0) {
    const { data: errorRows } = await supabase
      .from('ops_ingestion_errors')
      .select('run_id')
      .in('run_id', runIds)
    for (const row of errorRows ?? []) {
      const r = row as { run_id: number }
      errorCountByRunId[r.run_id] = (errorCountByRunId[r.run_id] ?? 0) + 1
    }
  }

  return {
    runs: runs.map((r) => ({
      ...r,
      error_count: errorCountByRunId[r.id] ?? 0,
    })),
    totalCount: countResult.count ?? runs.length,
  }
}

export function useIngestionRuns(params: UseIngestionRunsParams = {}) {
  const workflowId = params.workflowId?.trim() || undefined
  const status = params.status?.trim() || undefined
  const limit = params.limit ?? 50

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [INGESTION_RUNS_QUERY_KEY, workflowId, status, limit],
    queryFn: () => fetchIngestionRuns({ workflowId, status, limit }),
    refetchInterval: 30_000,
  })

  return {
    runs: data?.runs ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ?? null,
    refetch,
  }
}
