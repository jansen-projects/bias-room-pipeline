import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getPreviousWeekEnding } from '../lib/manualEntry'
import { supabase } from '../lib/supabase'
import type { ConsensusSurvey, ConsensusSurveyUpsertRow } from '../types/pipeline'

export const CONSENSUS_SURVEY_QUERY_KEY = ['consensus-surveys'] as const

export async function fetchSurveyByWeek(
  weekEnding: string,
): Promise<ConsensusSurvey[]> {
  const { data, error } = await supabase
    .from('consensus_surveys')
    .select('*')
    .eq('survey_week_ending', weekEnding)
    .order('currency_code', { ascending: true })

  if (error) throw error
  return (data ?? []) as ConsensusSurvey[]
}

export async function fetchPreviousWeek(
  weekEnding: string,
): Promise<ConsensusSurvey[]> {
  return fetchSurveyByWeek(getPreviousWeekEnding(weekEnding))
}

export async function upsertSurvey(
  rows: ConsensusSurveyUpsertRow[],
): Promise<ConsensusSurvey[]> {
  const { data, error } = await supabase
    .from('consensus_surveys')
    .upsert(rows, {
      onConflict: 'survey_week_ending,currency_code',
      ignoreDuplicates: false,
    })
    .select('*')

  if (error) throw error
  return (data ?? []) as ConsensusSurvey[]
}

export function useConsensusSurvey(
  weekEnding: string,
): UseQueryResult<ConsensusSurvey[], Error> & {
  surveys: ConsensusSurvey[]
} {
  const query = useQuery({
    queryKey: [...CONSENSUS_SURVEY_QUERY_KEY, weekEnding],
    queryFn: () => fetchSurveyByWeek(weekEnding),
    enabled: Boolean(weekEnding),
  })

  return { ...query, surveys: query.data ?? [] }
}

export function usePreviousWeekConsensus(weekEnding: string): UseQueryResult<
  ConsensusSurvey[],
  Error
> & {
  surveys: ConsensusSurvey[]
  previousWeekEnding: string
} {
  const previousWeekEnding = getPreviousWeekEnding(weekEnding)

  const query = useQuery({
    queryKey: [...CONSENSUS_SURVEY_QUERY_KEY, 'previous', previousWeekEnding],
    queryFn: () => fetchPreviousWeek(weekEnding),
    enabled: Boolean(weekEnding),
  })

  return {
    ...query,
    surveys: query.data ?? [],
    previousWeekEnding,
  }
}

export function useUpsertConsensusSurvey(): UseMutationResult<
  ConsensusSurvey[],
  Error,
  ConsensusSurveyUpsertRow[]
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: upsertSurvey,
    onSuccess: (_data, rows) => {
      const weekEnding = rows[0]?.survey_week_ending
      void queryClient.invalidateQueries({
        queryKey: CONSENSUS_SURVEY_QUERY_KEY,
      })
      if (weekEnding) {
        void queryClient.invalidateQueries({
          queryKey: [...CONSENSUS_SURVEY_QUERY_KEY, weekEnding],
        })
        void queryClient.invalidateQueries({
          queryKey: [
            ...CONSENSUS_SURVEY_QUERY_KEY,
            'previous',
            getPreviousWeekEnding(weekEnding),
          ],
        })
      }
    },
  })
}
