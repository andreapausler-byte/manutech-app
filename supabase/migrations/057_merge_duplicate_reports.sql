-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 057 — Merge duplicati segnalazioni
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Permette a tecnici/admin/super_admin di unire una segnalazione "duplicata" a
-- una "master": la duplicata viene chiusa (status='chiuso', closed_reason=
-- 'duplicato') e collegata via duplicate_of_id. Operazione ATOMICA e
-- REVERSIBILE (unmerge_report). Nessuna fusione fisica dei dati: media e
-- commenti restano sulla duplicata, il link è il punto d'accesso.
--
-- Riferimento: briefing "Merge duplicati segnalazioni" (destino ADR-012).
-- Divergenze briefing↔codebase risolte a favore del codebase e documentate in
-- sprint1-handoff-corrections.md (Passo 0). In sintesi:
--   * tabella reale `public.reports` (non `segnalazioni`); PK `id`.
--   * colonna stato `status` TEXT+CHECK, slug
--     ('aperta','assegnata','in_lavorazione','in_attesa_ricambi','risolta',
--     'chiuso'); "Completato" (UI) = slug 'risolta'. Terminali = risolta/chiuso.
--   * attore -> public.users(id) via get_my_user_id() (come created_by/
--     assigned_to), NON auth.users/auth.uid().
--   * ruolo via get_my_role(); org via get_my_org_id() (TEXT) — stesso
--     meccanismo delle policy RLS esistenti.
--
-- ⚠️  APPLICARE via Supabase Dashboard SQL Editor PRIMA del deploy frontend
--     (vedi "Sequenza di rilascio" nel briefing / corrections §10).
--
-- DOWN: 057_merge_duplicate_reports_down.sql


-- ── 1. Colonne + indice ────────────────────────────────────────────────
-- duplicate_of_id: self-FK alla master. ON DELETE SET NULL così l'eliminazione
-- di una master non blocca con errore FK: gli (eventuali) figli si sganciano e
-- restano segnalazioni chiuse normali (il banner sparisce). Reversibilità non
-- compromessa per il flusso standard (unmerge prima della delete).
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID NULL
    REFERENCES public.reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT NULL
    CHECK (closed_reason IN ('duplicato', 'risolta', 'annullata', 'altro')),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS merged_by UUID NULL
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_duplicate_of
  ON public.reports (duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL;


-- ── 2. RPC merge_reports ───────────────────────────────────────────────
-- SECURITY DEFINER: bypassa RLS ma applica esplicitamente gli stessi controlli
-- org/ruolo delle policy. search_path bloccato a public (hardening standard).
CREATE OR REPLACE FUNCTION public.merge_reports(p_duplicate_id UUID, p_master_id UUID)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup    public.reports;
  v_master public.reports;
  v_role   TEXT;
  v_org    TEXT;
BEGIN
  IF p_duplicate_id = p_master_id THEN
    RAISE EXCEPTION 'Una segnalazione non può essere duplicato di sé stessa';
  END IF;

  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('tecnico', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Permesso negato: solo tecnici e admin possono unire segnalazioni';
  END IF;

  v_org := public.get_my_org_id();

  -- Lock in ordine deterministico (per id) per evitare deadlock tra merge
  -- concorrenti che toccano la stessa coppia in ordine opposto.
  IF p_duplicate_id < p_master_id THEN
    SELECT * INTO v_dup    FROM public.reports WHERE id = p_duplicate_id AND org_id = v_org FOR UPDATE;
    SELECT * INTO v_master FROM public.reports WHERE id = p_master_id    AND org_id = v_org FOR UPDATE;
  ELSE
    SELECT * INTO v_master FROM public.reports WHERE id = p_master_id    AND org_id = v_org FOR UPDATE;
    SELECT * INTO v_dup    FROM public.reports WHERE id = p_duplicate_id AND org_id = v_org FOR UPDATE;
  END IF;

  -- Righe assenti o di un'altra org → "non trovata" (lo scope org_id sopra
  -- impedisce anche merge cross-org).
  IF v_dup.id IS NULL OR v_master.id IS NULL THEN
    RAISE EXCEPTION 'Segnalazione non trovata';
  END IF;
  IF v_dup.duplicate_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'La segnalazione è già stata unita a un''altra';
  END IF;
  IF v_master.duplicate_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'La destinazione è essa stessa un duplicato: unisci direttamente alla segnalazione principale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reports WHERE duplicate_of_id = v_dup.id AND org_id = v_org) THEN
    RAISE EXCEPTION 'Questa segnalazione include altre segnalazioni unite: scollegale prima';
  END IF;
  IF v_master.status IN ('risolta', 'chiuso') THEN
    RAISE EXCEPTION 'La destinazione è chiusa: scegli una segnalazione attiva';
  END IF;

  UPDATE public.reports SET
    status          = 'chiuso',
    closed_reason   = 'duplicato',
    duplicate_of_id = p_master_id,
    merged_at       = now(),
    merged_by       = public.get_my_user_id()
  WHERE id = p_duplicate_id
  RETURNING * INTO v_dup;

  RETURN v_dup;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_reports(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_reports(UUID, UUID) TO authenticated;


-- ── 3. RPC unmerge_report ──────────────────────────────────────────────
-- Reverte un merge: ripristina lo stato pre-merge e azzera i campi di unione.
CREATE OR REPLACE FUNCTION public.unmerge_report(p_duplicate_id UUID)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup        public.reports;
  v_role       TEXT;
  v_org        TEXT;
  v_new_status TEXT;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('tecnico', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Permesso negato: solo tecnici e admin possono annullare un''unione';
  END IF;

  v_org := public.get_my_org_id();

  SELECT * INTO v_dup FROM public.reports WHERE id = p_duplicate_id AND org_id = v_org FOR UPDATE;

  IF v_dup.id IS NULL THEN
    RAISE EXCEPTION 'Segnalazione non trovata';
  END IF;
  IF v_dup.duplicate_of_id IS NULL THEN
    RAISE EXCEPTION 'Questa segnalazione non è unita ad alcuna master';
  END IF;

  -- Ripristino: 'assegnata' se ha un assegnatario, altrimenti 'aperta'.
  v_new_status := CASE WHEN v_dup.assigned_to IS NOT NULL THEN 'assegnata' ELSE 'aperta' END;

  UPDATE public.reports SET
    status          = v_new_status,
    closed_reason   = NULL,
    duplicate_of_id = NULL,
    merged_at       = NULL,
    merged_by       = NULL
  WHERE id = p_duplicate_id
  RETURNING * INTO v_dup;

  RETURN v_dup;
END;
$$;

REVOKE ALL ON FUNCTION public.unmerge_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unmerge_report(UUID) TO authenticated;
