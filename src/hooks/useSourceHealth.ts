import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const SOURCE_HEALTH_QUERY_KEY = 'source-health' as const

export interface HealthLogEntry {
  id: number
  check_time: string
  dataset: string
  issue_type: string
  severity: string
  detail: string
  resolved: boolean
  resolved_at: string | null
}

export interface SourceStatus {
  dataset: string
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  lastChecked: string | null
  latestIssue: HealthLogEntry | null
  recentIssues: HealthLogEntry[]
}

const ALL_SOURCES = [
  'FRED',
  'Yahoo Finance',
  'CFTC',
  'ForexFactory',
  'ECB',
  'Bank of Canada',
  'World Bank',
] as const

async function fetchSourceHealth(): Promise<{
  sources: SourceStatus[]
  recentLogs: HealthLogEntry[]
  lastRunAt: string | null
}> {
  // Fetch last 200 health log entries (covers many hours of checks)
  const { data, error } = await supabase
    .from('system_health_logs')
    .select('*')
    .order('check_time', { ascending: false })
    .limit(200)

  if (error) throw error

  const logs = (data ?? []) as HealthLogEntry[]

  // Last check_time overall
  const lastRunAt = logs[0]?.check_time ?? null

  // Group by dataset for per-source status
  const byDataset: Record<string, HealthLogEntry[]> = {}
  for (const log of logs) {
    if (!byDataset[log.dataset]) byDataset[log.dataset] = []
    byDataset[log.dataset].push(log)
  }

  // Determine status for each known source
  const sources: SourceStatus[] = ALL_SOURCES.map((dataset) => {
    const issues = byDataset[dataset] ?? []
    const recentIssues = issues.slice(0, 10)

    if (issues.length === 0) {
      return {
        dataset,
        status: 'healthy' as const,
        lastChecked: lastRunAt,
        latestIssue: null,
        recentIssues: [],
      }
    }

    const latest = issues[0]
    const status =
      latest.severity === 'critical'
        ? ('critical' as const)
        : latest.severity === 'warning'
          ? ('warning' as const)
          : ('healthy' as const)

    return {
      dataset,
      status,
      lastChecked: latest.check_time,
      latestIssue: latest,
      recentIssues,
    }
  })

  return { sources, recentLogs: logs.slice(0, 50), lastRunAt }
}

export function useSourceHealth() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [SOURCE_HEALTH_QUERY_KEY],
    queryFn: fetchSourceHealth,
    refetchInterval: 60_000,
  })

  return {
    sources: data?.sources ?? [],
    recentLogs: data?.recentLogs ?? [],
    lastRunAt: data?.lastRunAt ?? null,
    isLoading,
    error: error ?? null,
    refetch,
  }
}
