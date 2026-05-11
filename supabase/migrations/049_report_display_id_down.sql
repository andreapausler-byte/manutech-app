-- Rollback Migration 049

DROP INDEX IF EXISTS public.idx_reports_display_id_org;

DROP TRIGGER IF EXISTS trg_set_report_display_id ON public.reports;

DROP FUNCTION IF EXISTS public.compute_report_display_id();

ALTER TABLE public.reports
  DROP COLUMN IF EXISTS display_id;
