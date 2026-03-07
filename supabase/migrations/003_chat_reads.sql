-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 003 — Chat Reads (tracciamento messaggi letti)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Tabella per tracciare l'ultima lettura di ogni utente per ogni report
CREATE TABLE IF NOT EXISTS public.chat_reads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_id)
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_chat_reads_user ON public.chat_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_reads_report ON public.chat_reads(report_id);

-- RLS
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_reads_select" ON public.chat_reads
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "chat_reads_insert" ON public.chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "chat_reads_update" ON public.chat_reads
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Abilita Realtime sulla tabella comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
