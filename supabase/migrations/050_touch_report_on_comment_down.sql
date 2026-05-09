-- Rollback Migration 050

DROP TRIGGER IF EXISTS trg_touch_report_on_comment ON public.comments;
DROP FUNCTION IF EXISTS public.touch_report_on_comment();
