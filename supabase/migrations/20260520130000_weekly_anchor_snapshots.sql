CREATE TABLE public.weekly_anchor_snapshots (
  id                  bigserial PRIMARY KEY,
  snapshot_date       date NOT NULL UNIQUE,
  payload             jsonb NOT NULL DEFAULT '{}',
  data_quality_flags  jsonb NOT NULL DEFAULT '{}',
  is_locked           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_anchor_snapshots
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read-only"
  ON public.weekly_anchor_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Service role full access"
  ON public.weekly_anchor_snapshots
  FOR ALL USING (auth.role() = 'service_role');
