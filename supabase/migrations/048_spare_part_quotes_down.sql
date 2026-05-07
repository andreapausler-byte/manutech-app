-- Rollback migration 048

DROP FUNCTION IF EXISTS public.accept_spare_part_quote(UUID, TEXT, TIMESTAMPTZ, NUMERIC);

DROP INDEX IF EXISTS idx_spo_quotes;

ALTER TABLE public.spare_part_orders
  DROP COLUMN IF EXISTS quotes;
