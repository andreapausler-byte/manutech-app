-- Rollback migration 038
DROP INDEX IF EXISTS public.idx_comments_report_kind;

ALTER TABLE public.comments
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS extra_data,
  DROP COLUMN IF EXISTS kind;
