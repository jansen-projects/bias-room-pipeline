-- ============================================================
-- RETROACTIVE MIGRATION — consensus_surveys
-- This table was created via the Supabase dashboard and is
-- already in production. This migration captures the schema
-- in version control for reproducibility.
-- Uses CREATE TABLE IF NOT EXISTS — safe to apply on fresh project.
-- ============================================================

CREATE TABLE IF NOT EXISTS consensus_surveys (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_week_ending   date        NOT NULL,
  currency_code        char(3)     NOT NULL,

  -- Five media sources: bullish | bearish | neutral
  reuters_view         text        NOT NULL CHECK (reuters_view    IN ('bullish','bearish','neutral')),
  ft_view              text        NOT NULL CHECK (ft_view         IN ('bullish','bearish','neutral')),
  bloomberg_view       text        NOT NULL CHECK (bloomberg_view  IN ('bullish','bearish','neutral')),
  economist_view       text        NOT NULL CHECK (economist_view  IN ('bullish','bearish','neutral')),
  wsj_view             text        NOT NULL CHECK (wsj_view        IN ('bullish','bearish','neutral')),

  -- Auto-computed: all 5 sources must agree for a uniform consensus
  uniform_consensus    boolean     NOT NULL GENERATED ALWAYS AS (
    CASE WHEN
      reuters_view    = ft_view
      AND ft_view     = bloomberg_view
      AND bloomberg_view = economist_view
      AND economist_view = wsj_view
    THEN true ELSE false END
  ) STORED,

  -- Non-null only when uniform_consensus = true
  consensus_direction  text GENERATED ALWAYS AS (
    CASE WHEN
      reuters_view    = ft_view
      AND ft_view     = bloomberg_view
      AND bloomberg_view = economist_view
      AND economist_view = wsj_view
    THEN reuters_view ELSE NULL END
  ) STORED,

  operator_notes       text,
  entered_at           timestamptz NOT NULL DEFAULT now(),
  entered_by           text,

  UNIQUE (survey_week_ending, currency_code)
);

COMMENT ON TABLE consensus_surveys IS
  'Weekly media-consensus survey: 5 sources (Reuters, FT, Bloomberg, Economist, WSJ) '
  'per currency. uniform_consensus and consensus_direction are Postgres-generated — '
  'no workflow code needed.';

-- Row Level Security
ALTER TABLE consensus_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anon read-only"
  ON consensus_surveys FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access"
  ON consensus_surveys FOR ALL TO service_role USING (true) WITH CHECK (true);
