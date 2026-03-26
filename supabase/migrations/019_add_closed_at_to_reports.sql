-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 019: Aggiunge colonna closed_at alla tabella reports
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Errore: "Could not find the 'closed_at' column of 'reports' in the schema cache"
-- La colonna è usata nel codice per chiusura intervento ma non esiste nel DB live.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_hours NUMERIC;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_parts TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_root_cause TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_action TEXT;
