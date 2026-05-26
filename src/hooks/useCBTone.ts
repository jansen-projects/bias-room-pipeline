import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { CentralBankTone, InsertToneEntryInput } from '../types/pipeline'

export const CB_TONE_QUERY_KEY = ['central-bank-tone'] as const

export async function fetchRecentTone(): Promise<CentralBankTone[]> {
  const { data, error } = await supabase
    .from('central_bank_tone')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw error
  return (data ?? []) as CentralBankTone[]
}

export async function insertToneEntry(
  data: InsertToneEntryInput,
): Promise<CentralBankTone> {
  const { data: row, error } = await supabase
    .from('central_bank_tone')
    .insert({
      currency_code: data.currency_code,
      central_bank_code: data.central_bank_code,
      tone_score: data.tone_score,
      source_1: data.source_1,
      source_2: data.source_2,
      source_3: data.source_3 ?? null,
      trigger_event: data.trigger_event,
      effective_date: data.effective_date,
      operator_notes: data.operator_notes ?? null,
      is_draft: data.is_draft,
      verified_at: data.verified_at ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return row as CentralBankTone
}

export async function verifyToneEntry(id: string): Promise<CentralBankTone> {
  const { data, error } = await supabase
    .from('central_bank_tone')
    .update({
      is_draft: false,
      verified_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as CentralBankTone
}

export function useRecentTone(): UseQueryResult<CentralBankTone[], Error> & {
  entries: CentralBankTone[]
} {
  const query = useQuery({
    queryKey: [...CB_TONE_QUERY_KEY, 'recent'],
    queryFn: fetchRecentTone,
  })

  return {
    ...query,
    entries: query.data ?? [],
  }
}

export function useInsertToneEntry(): UseMutationResult<
  CentralBankTone,
  Error,
  InsertToneEntryInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: insertToneEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CB_TONE_QUERY_KEY })
    },
  })
}

export function useVerifyToneEntry(): UseMutationResult<
  CentralBankTone,
  Error,
  string
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: verifyToneEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CB_TONE_QUERY_KEY })
    },
  })
}
