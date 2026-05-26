import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SnapshotDateRow, WeeklyAnchorSnapshot } from '../types/snapshot'

export const SNAPSHOT_DATES_QUERY_KEY = 'snapshot-dates' as const
export const SNAPSHOT_QUERY_KEY = 'snapshot' as const

export async function fetchSnapshotDates(): Promise<SnapshotDateRow[]> {
  const { data, error } = await supabase
    .from('weekly_anchor_snapshots')
    .select('id, snapshot_date, is_locked, created_at')
    .order('snapshot_date', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as SnapshotDateRow[]
}

export async function fetchSnapshot(
  snapshotDate: string,
): Promise<WeeklyAnchorSnapshot | null> {
  const { data, error } = await supabase
    .from('weekly_anchor_snapshots')
    .select('*')
    .eq('snapshot_date', snapshotDate)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    snapshot_date: data.snapshot_date,
    created_at: data.created_at,
    payload: (data.payload ?? {}) as WeeklyAnchorSnapshot['payload'],
    data_quality_flags: (data.data_quality_flags ??
      {}) as WeeklyAnchorSnapshot['data_quality_flags'],
    is_locked: data.is_locked,
  }
}

export function useSnapshotDates() {
  const { data, isLoading } = useQuery({
    queryKey: [SNAPSHOT_DATES_QUERY_KEY],
    queryFn: fetchSnapshotDates,
  })

  return {
    dates: data ?? [],
    isLoading,
  }
}

export function useSnapshot(snapshotDate: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: [SNAPSHOT_QUERY_KEY, snapshotDate],
    queryFn: () => fetchSnapshot(snapshotDate!),
    enabled: Boolean(snapshotDate),
  })

  return {
    snapshot: data ?? null,
    isLoading,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
  }
}
