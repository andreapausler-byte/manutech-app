-- ═══════════════════════════════════════════════════════════
-- ManuTech v3.2 — Chat Media Support
-- Esegui nel SQL Editor di Supabase
-- ═══════════════════════════════════════════════════════════

-- Aggiunge il campo media (JSONB) alla tabella comments
-- Questo permette di allegare foto, video e audio ai messaggi chat
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS media JSONB DEFAULT NULL;

-- Commento sulla colonna per documentazione
COMMENT ON COLUMN public.comments.media IS 'Array JSON di media allegati al commento: [{type, url, name}]';

-- Policy RLS per comments (se non esistono già)
DO $$
BEGIN
  -- Select
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'comments_select') THEN
    EXECUTE 'CREATE POLICY comments_select ON public.comments FOR SELECT TO authenticated USING (true)';
  END IF;
  -- Insert
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'comments_insert') THEN
    EXECUTE 'CREATE POLICY comments_insert ON public.comments FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
  -- Update
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'comments_update') THEN
    EXECUTE 'CREATE POLICY comments_update ON public.comments FOR UPDATE TO authenticated USING (true)';
  END IF;
END $$;
