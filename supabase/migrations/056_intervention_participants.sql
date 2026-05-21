-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 056 — intervention_participants (Sprint 1c MVP)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- ADR di riferimento: ADR-008 — Interventi v2 (data model)
-- Status ADR-008: Proposed → Partially superseded da questo MVP.
--
-- Sprint 1c MVP: coinvolgere uno o più utenti (oltre ad assigned_to e
-- supervised_by) in un intervento + notificarli via push. Niente ruoli,
-- niente status di invito — additivo all'ADR.
--
-- Estensione futura (post-OQ ADR-008): ALTER TABLE per aggiungere
-- columns `role` (lead/supporto/operatore_linea/approvatore/osservatore/
-- fornitore) e `status` (invitato/confermato/rifiutato/completato).
-- Backfill: per ogni riga MVP esistente, role='supporto' status='confermato'.
--
-- Backward compat: NIENTE trigger di sync con interventions.assigned_to /
-- supervised_by in questo MVP. Il client deduplica lato applicativo
-- (allUserIds in useInterventionPeople). I trigger di sync vengono quando
-- arriverà il modello completo con role.
--
-- Nota commit migration counter: il briefing originale prevedeva 055, ma
-- 055 è già occupata da intervention_reports (Sprint 1c-bis, ADR-006).
-- Slot libero: 056. Confermato con Andrea pre-implementazione.
--
-- DOWN: 056_intervention_participants_down.sql

-- ── 1. TABELLA intervention_participants ───────────────────────────────
-- Pattern denormalizzato coerente col resto schema ManuTech:
--   * user_name_snapshot: il nome dell'utente al momento dell'aggiunta
--     (resta leggibile anche se l'utente viene rinominato / disabilitato)
--   * added_by_name: idem per chi ha fatto l'aggiunta
--   * org_id: TEXT NOT NULL DEFAULT 'default' (allineato a interventions
--     mig 053; conversione a UUID in Sprint 1d / ADR-007)
--
-- UNIQUE (intervention_id, user_id) impedisce doppi inserimenti dello
-- stesso utente sullo stesso intervento.
CREATE TABLE IF NOT EXISTS public.intervention_participants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id    UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  user_name_snapshot TEXT NOT NULL,
  added_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  added_by_name      TEXT,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id             TEXT NOT NULL DEFAULT 'default',
  UNIQUE (intervention_id, user_id)
);

COMMENT ON TABLE public.intervention_participants IS
  'Sprint 1c MVP — utenti aggiuntivi coinvolti in un intervento, oltre ad assigned_to e supervised_by. Senza role/status (additivo da ADR-008 quando OQ #1 #3 saranno chiuse).';


-- ── 2. INDICI ──────────────────────────────────────────────────────────
-- Lookup principali:
--   - per intervento → tutti i partecipanti (form edit, dettaglio)
--   - per utente → tutti gli interventi a cui partecipa (calendario scope='mine')
--   - per org → filtri RLS in casi cross-table
CREATE INDEX IF NOT EXISTS idx_intervention_participants_intervention
  ON public.intervention_participants(intervention_id);

CREATE INDEX IF NOT EXISTS idx_intervention_participants_user
  ON public.intervention_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_intervention_participants_org
  ON public.intervention_participants(org_id);


-- ── 3. TRIGGER updated_at ──────────────────────────────────────────────
-- Riusa la funzione standard public.handle_updated_at() già definita in
-- schema.sql (usata da interventions, reports, ecc.).
DROP TRIGGER IF EXISTS intervention_participants_updated_at ON public.intervention_participants;
CREATE TRIGGER intervention_participants_updated_at
  BEFORE UPDATE ON public.intervention_participants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── 4. ROW LEVEL SECURITY ──────────────────────────────────────────────
-- Pattern MVP: tutti gli utenti dell'org possono leggere/scrivere
-- partecipazioni della propria org. Coerente con il vincolo di scope
-- "single-tenant fiduciario": tutti gli utenti dell'org possono già
-- vedere tutti gli interventi della propria org tramite RLS di
-- `interventions`, quindi non aggiungiamo restrizioni di ruolo qui.
--
-- TECH DEBT: quando ADR-008 OQ #1 (workflow approvazione) sarà chiusa,
-- valutare se restringere INSERT/DELETE a role IN ('admin','tecnico')
-- come fa intervention_reports (mig 055). Annotato.
ALTER TABLE public.intervention_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ip_select" ON public.intervention_participants;
CREATE POLICY "ip_select" ON public.intervention_participants
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "ip_insert" ON public.intervention_participants;
CREATE POLICY "ip_insert" ON public.intervention_participants
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "ip_update" ON public.intervention_participants;
CREATE POLICY "ip_update" ON public.intervention_participants
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "ip_delete" ON public.intervention_participants;
CREATE POLICY "ip_delete" ON public.intervention_participants
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id());


-- ── 5. REALTIME ────────────────────────────────────────────────────────
-- Aggiunta a publication: aggiungere/rimuovere un participant da un
-- device deve aggiornare il form aperto su altri device entro 2s
-- (acceptance criteria Sprint 1c). Coerente con intervention_reports.
ALTER PUBLICATION supabase_realtime ADD TABLE public.intervention_participants;
