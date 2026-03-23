-- Aggiunge la colonna 'type' alla tabella reports per il tipo di intervento
-- (correttiva, preventiva, migliorativa, ispezione)
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'correttiva'
  CHECK (type IN ('correttiva', 'preventiva', 'migliorativa', 'ispezione'));
