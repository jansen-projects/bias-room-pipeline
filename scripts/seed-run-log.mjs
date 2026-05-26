/**
 * Seeds 15 sample ops_ingestion_runs rows for the Run Log screen.
 * Usage: node scripts/seed-run-log.mjs
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  const raw = readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return env
}

const env = loadEnv()
const baseUrl = env.VITE_SUPABASE_URL
const apiKey = env.VITE_SUPABASE_ANON_KEY

if (!baseUrl || !apiKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const headers = {
  apikey: apiKey,
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
}

async function rest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function daysAgo(n, hour = 12, minute = 0) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(hour, minute, 0, 0)
  return d.toISOString()
}

const registry = await rest(
  '/rest/v1/meta_workflow_registry?select=workflow_id&order=workflow_id.asc',
)

const workflowIds = registry.map((row) => row.workflow_id)
if (workflowIds.length === 0) {
  console.error('meta_workflow_registry is empty — seed registry first.')
  process.exit(1)
}

const statuses = ['success', 'success', 'success', 'failed', 'failed', 'skipped', 'skipped', 'success', 'failed', 'success', 'skipped', 'success', 'failed', 'success', 'success']

const rows = statuses.map((status, index) => {
  const workflow_id = workflowIds[index % workflowIds.length]
  const dayOffset = index % 7
  const started_at = daysAgo(dayOffset, 6 + (index % 12), (index * 7) % 60)
  const durationMin = 2 + (index % 8)
  const completed_at =
    status === 'running' ? null : addMinutes(started_at, durationMin)

  const records_fetched = status === 'skipped' ? 0 : 50 + index * 17
  const records_upserted =
    status === 'success' ? Math.max(1, Math.floor(records_fetched * 0.4)) : status === 'failed' ? 0 : null
  const records_skipped_dedup =
    status === 'skipped' ? records_fetched : index % 4 === 0 ? index * 3 : null

  const error_message =
    status === 'failed'
      ? index % 2 === 0
        ? `HTTP 429 rate limited from upstream API (workflow ${workflow_id})`
        : `Validation failed: missing required field "observation_date" in payload`
      : null

  return {
    workflow_id,
    status,
    started_at,
    completed_at,
    records_fetched,
    records_upserted,
    records_skipped_dedup,
    error_message,
    n8n_execution_id: String(1500 + index),
  }
})

await rest('/rest/v1/ops_ingestion_runs', {
  method: 'POST',
  body: JSON.stringify(rows),
})

console.log(`Inserted ${rows.length} sample runs into ops_ingestion_runs.`)
