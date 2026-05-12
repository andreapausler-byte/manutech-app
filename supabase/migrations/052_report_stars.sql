-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 052 — Report Stars (preferiti personali admin)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Stella per-utente sui report: usata dalla lista admin per pinnare
-- in cima ticket che richiedono follow-up personale. Tabella di join
-- pura (PK composta), RLS scoped sull'utente loggato. Pattern speculare
-- a chat_reads (migration 003).

CREATE TABLE IF NOT EXISTS public.report_stars (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_id  UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  starred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_report_stars_user ON public.report_stars(user_id);

ALTER TABLE public.report_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_stars_select" ON public.report_stars
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "report_stars_insert" ON public.report_stars
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "report_stars_delete" ON public.report_stars
  FOR DELETE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
