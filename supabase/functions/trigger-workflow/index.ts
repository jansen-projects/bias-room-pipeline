import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, json } from './lib/ops.ts'
import { runForexDailyFetch } from './handlers/forex.ts'
import { runCbRatesDaily } from './handlers/cb-rates.ts'
import { runCotWeekly } from './handlers/cot.ts'
import { runMarketIndicesDaily } from './handlers/market-indices.ts'
import { runCommoditiesDaily } from './handlers/commodities.ts'
import { runGoldContextDaily } from './handlers/gold-context.ts'
import { runEconomicCalendarDaily } from './handlers/economic-calendar.ts'
import { runBondYieldsNominalDaily } from './handlers/bond-yields-nominal.ts'
import { runRealYieldsDaily } from './handlers/real-yields.ts'
import { runBreakevenDaily } from './handlers/breakeven.ts'
import { runInflationForecastsWeekly } from './handlers/inflation-forecasts.ts'
import { runComputeAtr14Daily } from './handlers/compute-atr14.ts'
import { runFxFridayCloseSnapshot } from './handlers/fx-friday-close.ts'
import { runDailyCloseSnapshot } from './handlers/daily-close-snapshot.ts'
import { runWeeklyAnchorSnapshot } from './handlers/weekly-anchor-snapshot.ts'
import { runStaleDataMonitor } from './handlers/stale-data-monitor.ts'
import { runDlqRetry } from './handlers/dlq-retry.ts'
import { runHealthCheckHourly } from './handlers/health-check.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: { workflow_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const workflowId = (body.workflow_id ?? '').trim()
  if (!workflowId) {
    return json({ error: 'workflow_id is required' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'missing_env' }, 500)
  }

  const sb = createClient(supabaseUrl, serviceRoleKey)

  const { data: registry } = await sb
    .from('meta_workflow_registry')
    .select('workflow_id')
    .eq('workflow_id', workflowId)
    .maybeSingle()

  if (!registry) {
    return json({ error: 'workflow_not_found' }, 404)
  }

  const { data: running } = await sb
    .from('ops_ingestion_runs')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('status', 'running')
    .limit(1)
    .maybeSingle()

  if (running) {
    return json({ error: 'already_running' }, 409)
  }

  const { data: run, error: insertError } = await sb
    .from('ops_ingestion_runs')
    .insert({ workflow_id: workflowId, status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single()

  if (insertError || !run) {
    return json({ error: insertError?.message ?? 'failed to create run' }, 500)
  }

  if (workflowId === 'wf_forex_daily_fetch')         return runForexDailyFetch(sb, run.id, workflowId)
  if (workflowId === 'wf_cb_rates_daily')            return runCbRatesDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_cot_weekly')                return runCotWeekly(sb, run.id, workflowId)
  if (workflowId === 'wf_market_indices_daily')      return runMarketIndicesDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_commodities_daily')         return runCommoditiesDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_gold_context_daily')        return runGoldContextDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_economic_calendar_daily')   return runEconomicCalendarDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_bond_yields_nominal_daily') return runBondYieldsNominalDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_real_yields_daily')         return runRealYieldsDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_breakeven_daily')           return runBreakevenDaily(sb, run.id, workflowId)
  if (workflowId === 'wf_inflation_forecasts_weekly') return runInflationForecastsWeekly(sb, run.id, workflowId)
  if (workflowId === 'wf_compute_atr14_daily')        return runComputeAtr14Daily(sb, run.id, workflowId)
  if (workflowId === 'wf_fx_friday_close_snapshot')   return runFxFridayCloseSnapshot(sb, run.id, workflowId)
  if (workflowId === 'wf_daily_close_snapshot')       return runDailyCloseSnapshot(sb, run.id, workflowId)
  if (workflowId === 'wf_weekly_anchor_snapshot')     return runWeeklyAnchorSnapshot(sb, run.id, workflowId)
  if (workflowId === 'wf_stale_data_monitor')         return runStaleDataMonitor(sb, run.id, workflowId)
  if (workflowId === 'wf_dlq_retry')                  return runDlqRetry(sb, run.id, workflowId)
  if (workflowId === 'wf_health_check_hourly')        return runHealthCheckHourly(sb, run.id, workflowId)

  await sb.from('ops_ingestion_runs').update({
    status: 'failed',
    completed_at: new Date().toISOString(),
    error_message: `No handler implemented for ${workflowId}`,
  }).eq('id', run.id)

  return json({ error: 'no_handler', workflow_id: workflowId }, 422)
})
