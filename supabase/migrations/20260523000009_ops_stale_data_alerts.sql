-- ============================================================
-- Phase 1 — CREATE ops_stale_data_alerts
-- Fired by wf_stale_data_monitor when a silver table exceeds
-- its warning_after_min or critical_after_min threshold from
-- meta_table_freshness_sla.
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_stale_data_alerts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name          text        NOT NULL,
  workflow_id         text,                    -- soft ref to meta_workflow_registry
  severity            text        NOT NULL
    CHECK (severity IN ('warning','critical')),
  actual_age_min      int         NOT NULL,    -- minutes since last successful run
  threshold_min       int         NOT NULL,    -- the SLA threshold that was breached
  is_resolved         boolean     NOT NULL DEFAULT false,
  resolved_at         timestamptz,
  resolved_by         text,                    -- 'auto' | operator email
  operator_notes      text,
  fired_at            timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT alert_resolved_requires_timestamp
    CHECK (is_resolved = false OR resolved_at IS NOT NULL),

  CONSTRAINT alert_age_positive
    CHECK (actual_age_min > 0),

  CONSTRAINT alert_threshold_positive
    CHECK (threshold_min > 0)
);

COMMENT ON TABLE ops_stale_data_alerts IS
  'Log of stale-data alerts fired by wf_stale_data_monitor. '
  'An alert is fired when ops_ingestion_runs shows no recent success for a table '
  'and the elapsed time exceeds the threshold in meta_table_freshness_sla. '
  'is_resolved = true once the table is refreshed or manually acknowledged.';

COMMENT ON COLUMN ops_stale_data_alerts.actual_age_min IS
  'Minutes elapsed since the last ops_ingestion_runs row with status=''success'' '
  'for this table''s workflow_id, at the time the alert fired.';

COMMENT ON COLUMN ops_stale_data_alerts.threshold_min IS
  'The SLA threshold that was breached (warning_after_min or critical_after_min '
  'from meta_table_freshness_sla at alert time).';

COMMENT ON COLUMN ops_stale_data_alerts.resolved_by IS
  '''auto'' = resolved automatically when wf_stale_data_monitor detected fresh data; '
  'operator email = manually acknowledged via Control Room.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ops_stale_alerts_unresolved_idx
  ON ops_stale_data_alerts (fired_at DESC)
  WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS ops_stale_alerts_table_idx
  ON ops_stale_data_alerts (table_name, fired_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE ops_stale_data_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read-only" ON ops_stale_data_alerts;
CREATE POLICY "Anon read-only"
  ON ops_stale_data_alerts FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Service role full access" ON ops_stale_data_alerts;
CREATE POLICY "Service role full access"
  ON ops_stale_data_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
