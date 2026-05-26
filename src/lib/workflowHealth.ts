import type { OpsIngestionRun, WorkflowStatus } from '../types/pipeline'

export function getLastActivityAt(run: OpsIngestionRun): Date {
  return new Date(run.completed_at ?? run.started_at)
}

export function isWorkflowStale(workflow: WorkflowStatus): boolean {
  if (!workflow.latest_run) {
    return true
  }

  const ageMs = Date.now() - getLastActivityAt(workflow.latest_run).getTime()
  return ageMs > workflow.stale_after_minutes * 60 * 1000
}

export function isWorkflowHealthy(workflow: WorkflowStatus): boolean {
  if (!workflow.latest_run || workflow.latest_run.status !== 'success') {
    return false
  }

  return !isWorkflowStale(workflow)
}
