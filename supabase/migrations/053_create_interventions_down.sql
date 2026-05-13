-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 053 — DOWN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Reverte 053_create_interventions.sql.
-- Ordine inverso: view, ALTER su tabelle dipendenti, publication, DROP tabella.

-- ── 1. View ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.reports_with_planning;

-- ── 2. ALTER maintenance_logs ──────────────────────────────────────────
DROP INDEX IF EXISTS idx_maintenance_logs_intervention;
ALTER TABLE public.maintenance_logs
  DROP COLUMN IF EXISTS intervention_id;

-- ── 3. ALTER notifications ─────────────────────────────────────────────
DROP INDEX IF EXISTS idx_notifications_intervention;
ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS intervention_id;

-- ── 4. ALTER activities ────────────────────────────────────────────────
-- Prima: rimuovi intervention_id. Poi ripristina NOT NULL su report_id.
-- Se ci sono righe con report_id IS NULL (interventi 'manuale' loggati),
-- vanno eliminate prima del SET NOT NULL.
DROP INDEX IF EXISTS idx_activities_intervention;

DELETE FROM public.activities
  WHERE report_id IS NULL;

ALTER TABLE public.activities
  DROP COLUMN IF EXISTS intervention_id;

ALTER TABLE public.activities
  ALTER COLUMN report_id SET NOT NULL;

-- ── 5. Realtime ────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime DROP TABLE public.interventions;

-- ── 6. DROP table interventions ────────────────────────────────────────
-- Le RLS policy, gli indici e il trigger vengono droppati con la tabella.
DROP TABLE IF EXISTS public.interventions;
