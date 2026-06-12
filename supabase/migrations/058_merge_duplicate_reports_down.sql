-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 058 — DOWN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Reverte 058_merge_duplicate_reports.sql.
-- Ordine inverso: funzioni, indice, colonne.
--
-- NB: eventuali merge già effettuati vengono persi (le colonne sono droppate).
-- Se serve preservarli, eseguire prima gli unmerge dall'app.

DROP FUNCTION IF EXISTS public.unmerge_report(UUID);
DROP FUNCTION IF EXISTS public.merge_reports(UUID, UUID);

DROP INDEX IF EXISTS public.idx_reports_duplicate_of;

ALTER TABLE public.reports
  DROP COLUMN IF EXISTS merged_by,
  DROP COLUMN IF EXISTS merged_at,
  DROP COLUMN IF EXISTS closed_reason,
  DROP COLUMN IF EXISTS duplicate_of_id;
