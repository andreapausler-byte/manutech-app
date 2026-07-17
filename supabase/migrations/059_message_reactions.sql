-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 059 — Reazioni chat + ringraziamenti
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Feedback sui messaggi della chat segnalazione con significato
-- operativo (utile / confermo il problema / risolto per me) e
-- ringraziamento 👏 a livello segnalazione quando passa a 'risolta'
-- (comment_id NULL = reazione sulla segnalazione, non su un messaggio).
--
-- Una riga per (utente, tipo, messaggio|segnalazione): il toggle in UI
-- fa INSERT/DELETE, gli unique index partial impediscono i doppioni.
-- RLS: lettura org-scoped come comments; insert/delete vincolati
-- all'utente loggato come report_stars (migration 052).

-- Cleanup: una versione preliminare della tabella (senza org_id, creata
-- fuori migration) può esistere su ambienti che hanno seguito il primo
-- rollout — mai referenziata dal codice, sicura da ricreare.
DROP TABLE IF EXISTS public.reactions;

CREATE TABLE public.reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  comment_id  UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   TEXT,
  type        TEXT NOT NULL CHECK (type IN ('utile', 'confermo', 'risolto', 'grazie')),
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reactions_report ON public.reactions(report_id);
CREATE UNIQUE INDEX idx_reactions_unique_comment ON public.reactions(comment_id, user_id, type) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_reactions_unique_report ON public.reactions(report_id, user_id, type) WHERE comment_id IS NULL;

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select" ON public.reactions
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "reactions_insert" ON public.reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "reactions_delete" ON public.reactions
  FOR DELETE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
