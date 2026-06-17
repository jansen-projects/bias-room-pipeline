/**
 * wf_stale_data_monitor
 * Reads:  meta_table_freshness_sla  (thresholds, workflow_id per table)
 *         ops_ingestion_runs        (most recent successful run per workflow)
 * Writes: ops_stale_data_alerts
 *
 * Freshness proxy: the most recent ops_ingestion_runs row with status='success'
 * for the workflow that writes each monitored table. If no successful run exists
 * (or the last success is older than the threshold), an alert is raised.
 *
 * ⚠️ Schedule weekdays ONLY: (0,15,30,45 * * * 1-5)
 *    Daily tables have 1440-min warning threshold. On weekends markets are closed
 *    and ALL daily tables appear stale — scheduling weekdays-only avoids alert spam.
 *    (See PHASE6_VERIFICATION.md DQ-02)
 *
 * Logic:
 *   1. Fetch all active SLA entries → table_name, workflow_id, warning_after_min, critical_after_min
 *   2. Batch-fetch most recent successful run per workflow_id
 *   3. For each SLA row:
 *      - If no successful run found → severity='critical', actual_age_min=999999
 *      - Else stale_min = minutes since completed_at
 *      - If stale_min > critical_after_min → severity='critical'
 *      - Else if stale_min > warning_after_min → severity='warning'
 *      - Else → skip
 *   4. Insert alerts into ops_stale_data_alerts
 */

import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, markRunFailed, markRunSuccess } from '../lib/ops.ts'

interface SlaEntry {
  table_name: string
  workflow_id: string
  warning_after_min: number
  critical_after_min: number
}

interface AlertInsert {
  workflow_id: string
  table_name: string
  severity: 'warning' | 'critical'
  actual_age_min: number
  threshold_min: number
  is_resolved: boolean
  fired_at: string
}

export async function runStaleDataMonitor(
  sb: SupabaseClient,
  runId: number,
  workflowId: string,
): Promise<Response> {
  // ── 1. Fetch all active SLA entries ─────────────────────────────────────
  const { data: slaRows, error: slaErr } = await sb
    .from('meta_table_freshness_sla')
    .select('table_name, workflow_id, warning_after_min, critical_after_min')
    .eq('is_active', true)

  if (slaErr) {
    await markRunFailed(sb, runId, slaErr.message, 0)
    return json({ success: false, error: slaErr.message, run_id: runId }, 500)
  }

  if (!slaRows || slaRows.length === 0) {
    await markRunSuccess(sb, runId, 0, 0, 'no active SLA entries', 0)
    return json({ success: true, run_id: runId, alerts: 0, message: 'No active SLA entries' })
  }

  // ── 2. Batch-fetch most recent successful run per unique workflow_id ──────
  const uniqueWorkflows = [...new Set((slaRows as SlaEntry[]).map((r) => r.workflow_id))]

  // Fetch last successful run for each workflow in one query
  const { data: runRows, error: runErr } = await sb
    .from('ops_ingestion_runs')
    .select('workflow_id, completed_at')
    .in('status', ['success', 'partial_success'])
    .in('workflow_id', uniqueWorkflows)
    .order('completed_at', { ascending: false })

  if (runErr) {
    await markRunFailed(sb, runId, runErr.message, slaRows.length)
    return json({ success: false, error: runErr.message, run_id: runId }, 500)
  }

  // Index last successful run per workflow (first result per workflow = latest)
  const lastRunAt: Record<string, string> = {}
  for (const row of (runRows ?? [])) {
    const r = row as { workflow_id: string; completed_at: string }
    if (!lastRunAt[r.workflow_id] && r.completed_at) {
      lastRunAt[r.workflow_id] = r.completed_at
    }
  }

  // ── 3. Evaluate each SLA entry ────────────────────────────────────────────
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const alerts: AlertInsert[] = []

  for (const row of (slaRows as SlaEntry[])) {
    const warnMin = Number(row.warning_after_min)
    const critMin = Number(row.critical_after_min)
    const lastRun = lastRunAt[row.workflow_id]

    if (!lastRun) {
      // No successful run ever
      alerts.push({
        workflow_id: workflowId,
        table_name: row.table_name,
        severity: 'critical',
        actual_age_min: 999999,
        threshold_min: critMin > 0 ? critMin : (warnMin > 0 ? warnMin : 1),
        is_resolved: false,
        fired_at: nowIso,
      })
      continue
    }

    const staleMins = Math.round((now - new Date(lastRun).getTime()) / 60000)
    if (staleMins <= 0) continue  // actual_age_min CHECK requires > 0

    if (staleMins > critMin) {
      alerts.push({
        workflow_id: workflowId,
        table_name: row.table_name,
        severity: 'critical',
        actual_age_min: staleMins,
        threshold_min: critMin,
        is_resolved: false,
        fired_at: nowIso,
      })
    } else if (staleMins > warnMin) {
      alerts.push({
        workflow_id: workflowId,
        table_name: row.table_name,
        severity: 'warning',
        actual_age_min: staleMins,
        threshold_min: warnMin,
        is_resolved: false,
        fired_at: nowIso,
      })
    }
    // else: fresh — no alert
  }

  if (alerts.length === 0) {
    await markRunSuccess(sb, runId, slaRows.length, 0, null, 0)
    return json({
      success: true,
      run_id: runId,
      tables_checked: slaRows.length,
      alerts_raised: 0,
      message: 'All monitored workflows have recent successful runs',
    })
  }

  // ── 4. Insert alerts ──────────────────────────────────────────────────────
  const { error: insertErr } = await sb
    .from('ops_stale_data_alerts')
    .insert(alerts)

  if (insertErr) {
    await markRunFailed(sb, runId, insertErr.message, slaRows.length)
    return json({ success: false, error: insertErr.message, run_id: runId }, 500)
  }

  const critCount = alerts.filter((a) => a.severity === 'critical').length
  const warnCount = alerts.filter((a) => a.severity === 'warning').length
  // Raising alerts is the normal operation of this handler — not an error.
  // Pass null errorSummary so run status = 'success'.
  await markRunSuccess(sb, runId, slaRows.length, alerts.length, null, 0)

  return json({
    success: true,
    run_id: runId,
    tables_checked: slaRows.length,
    alerts_raised: alerts.length,
    critical: critCount,
    warning: warnCount,
    stale_tables: alerts.map((a) => ({
      table: a.table_name,
      severity: a.severity,
      actual_age_min: a.actual_age_min,
    })),
  })
}
