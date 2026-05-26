-- ============================================================
-- RETROACTIVE MIGRATION — central_bank_tone
-- This table was created via the Supabase dashboard and is
-- already in production. This migration captures the schema
-- in version control for reproducibility.
-- Uses CREATE TABLE IF NOT EXISTS — safe to apply on a fresh
-- project or skip if the table already exists.
-- ============================================================

CREATE TABLE IF NOT EXISTS central_bank_tone (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code     char(3)      NOT NULL,
  central_bank_code text         NOT NULL,
  tone_score        numeric(3,1) NOT NULL CHECK (tone_score BETWEEN -2.0 AND 2.0),
  tone_label        text         NOT NULL,
  -- Minimum 2 verified sources required before verified_at is set
  source_1          text,
  source_2          text,
  source_3          text,
  trigger_event     text,
  operator_notes    text,
  -- Draft = awaiting operator verification; only non-draft rows
  -- are read by the FSR scoring engine (WHERE verified_at IS NOT NULL)
  is_draft          boolean      NOT NULL DEFAULT true,
  verified_at       timestamptz,
  verified_by       text,
  effective_date    date         NOT NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (currency_code, effective_date)
);

COMMENT ON TABLE central_bank_tone IS
  'Manual-entry CB tone scores on the FSR 5-point scale (-2.0 to +2.0). '
  'Scoring engine reads only rows where verified_at IS NOT NULL.';

-- Row Level Security
ALTER TABLE central_bank_tone ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anon read-only"
  ON central_bank_tone FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access"
  ON central_bank_tone FOR ALL TO service_role USING (true) WITH CHECK (true);
