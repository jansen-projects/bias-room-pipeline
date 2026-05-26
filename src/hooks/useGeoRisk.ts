import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GeoRiskEvent, InsertGeoEventInput } from '../types/pipeline'

export const GEO_RISK_QUERY_KEY = ['geo-risk-events'] as const

export async function fetchDraftEvents(): Promise<GeoRiskEvent[]> {
  const { data, error } = await supabase
    .from('geo_risk_events')
    .select('*')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GeoRiskEvent[]
}

export async function fetchActiveEvents(): Promise<GeoRiskEvent[]> {
  const { data, error } = await supabase
    .from('geo_risk_events')
    .select('*')
    .eq('status', 'active')
    .order('promoted_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GeoRiskEvent[]
}

export async function insertGeoEvent(
  data: InsertGeoEventInput,
): Promise<GeoRiskEvent> {
  const { data: row, error } = await supabase
    .from('geo_risk_events')
    .insert({
      event_code: data.event_code,
      event_title: data.event_title,
      event_description: data.event_description ?? null,
      affected_currencies: data.affected_currencies,
      bullish_channel: data.bullish_channel,
      bearish_channel: data.bearish_channel,
      severity: data.severity,
      operator_notes: data.operator_notes ?? null,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error) throw error
  return row as GeoRiskEvent
}

export async function promoteEvent(id: string): Promise<GeoRiskEvent> {
  const { data, error } = await supabase
    .from('geo_risk_events')
    .update({
      status: 'active',
      promoted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as GeoRiskEvent
}

export async function resolveEvent(id: string): Promise<GeoRiskEvent> {
  const { data, error } = await supabase
    .from('geo_risk_events')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as GeoRiskEvent
}

/** Used by Manual Entry draft cards — not in core spec but required by UI. */
export async function archiveEvent(id: string): Promise<GeoRiskEvent> {
  const { data, error } = await supabase
    .from('geo_risk_events')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as GeoRiskEvent
}

function invalidateGeoRiskQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: GEO_RISK_QUERY_KEY })
}

export function useDraftGeoEvents(): UseQueryResult<GeoRiskEvent[], Error> & {
  events: GeoRiskEvent[]
} {
  const query = useQuery({
    queryKey: [...GEO_RISK_QUERY_KEY, 'draft'],
    queryFn: fetchDraftEvents,
  })

  return { ...query, events: query.data ?? [] }
}

export function useActiveGeoEvents(): UseQueryResult<GeoRiskEvent[], Error> & {
  events: GeoRiskEvent[]
} {
  const query = useQuery({
    queryKey: [...GEO_RISK_QUERY_KEY, 'active'],
    queryFn: fetchActiveEvents,
  })

  return { ...query, events: query.data ?? [] }
}

export function useInsertGeoEvent(): UseMutationResult<
  GeoRiskEvent,
  Error,
  InsertGeoEventInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: insertGeoEvent,
    onSuccess: () => invalidateGeoRiskQueries(queryClient),
  })
}

export function usePromoteGeoEvent(): UseMutationResult<
  GeoRiskEvent,
  Error,
  string
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: promoteEvent,
    onSuccess: () => invalidateGeoRiskQueries(queryClient),
  })
}

export function useResolveGeoEvent(): UseMutationResult<
  GeoRiskEvent,
  Error,
  string
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resolveEvent,
    onSuccess: () => invalidateGeoRiskQueries(queryClient),
  })
}

export function useArchiveGeoEvent(): UseMutationResult<
  GeoRiskEvent,
  Error,
  string
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: archiveEvent,
    onSuccess: () => invalidateGeoRiskQueries(queryClient),
  })
}
