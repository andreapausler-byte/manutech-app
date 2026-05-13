-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 054 — DOWN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Reverte 054_add_supervised_by.sql.

DROP INDEX IF EXISTS idx_interventions_supervised_by;

ALTER TABLE public.interventions
  DROP COLUMN IF EXISTS supervised_by_name,
  DROP COLUMN IF EXISTS supervised_by;
