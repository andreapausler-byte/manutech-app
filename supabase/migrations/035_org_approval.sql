-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 035: Organization approval workflow (manual review queue)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Aggiunge approval_status alle organizations per moderazione manuale
-- dei nuovi signup. Le org create via Edge Function signup-org partono
-- in 'pending'. Un super_admin (vedi 036) le approva o rifiuta.
--
-- Effetto applicativo:
--   • Org 'pending'      → utenti possono fare login MA vedono la
--                          PendingApprovalScreen invece dell'app normale
--   • Org 'approved'     → accesso normale alla piattaforma
--   • Org 'rejected'     → utenti vedono RejectedScreen con motivazione
--
-- IMPORTANTE: la seed Amarcord viene auto-approvata per non rompere prod.
--
-- DOWN: 035_org_approval_down.sql ripristina SCHEMA, non DATI.

-- ── 1. Aggiunge colonne approval ────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS approval_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- ── 2. Auto-approva seed Amarcord (regression-safe) ────────
UPDATE public.organizations
   SET approval_status = 'approved',
       approved_at     = COALESCE(approved_at, now())
 WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 3. Index parziale per coda super-admin ─────────────────
-- Solo le pending sono interrogate frequentemente; gli altri stati
-- vengono letti solo nel contesto di una specifica org.
CREATE INDEX IF NOT EXISTS idx_organizations_approval_pending
  ON public.organizations(created_at DESC)
  WHERE approval_status = 'pending';

-- ── 4. Estende resolve_my_profile con org_approval_status ──
-- Il client (AuthContext) usa questo flag per decidere se mostrare
-- l'app o la PendingApprovalScreen. NON solleva eccezione per pending:
-- l'utente DEVE poter loggarsi per vedere il messaggio.
CREATE OR REPLACE FUNCTION public.resolve_my_profile()
RETURNS JSONB AS $$
DECLARE
  _auth_id      UUID := auth.uid();
  _email        TEXT;
  _user         RECORD;
  _result       JSONB;
  _org_approval TEXT;
  _org_rejection TEXT;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _auth_id;
  IF _email IS NULL THEN RAISE EXCEPTION 'Utente auth non trovato'; END IF;

  -- 1. Cerca per auth_id
  SELECT * INTO _user FROM public.users WHERE auth_id = _auth_id LIMIT 1;

  -- 2. Cerca per email e linka (solo se già active, es. admin seed)
  IF _user IS NULL THEN
    SELECT * INTO _user FROM public.users
      WHERE lower(email) = lower(_email) AND status = 'active'
      LIMIT 1;
    IF _user IS NOT NULL THEN
      UPDATE public.users SET auth_id = _auth_id, updated_at = now()
        WHERE id = _user.id
        RETURNING * INTO _user;
    END IF;
  END IF;

  -- 3. Nessun profilo → accesso non autorizzato (invite-only)
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Account non autorizzato. Richiedi un invito all''amministratore.';
  END IF;

  -- 4. Verifica stato user
  IF _user.status = 'pending' THEN
    RAISE EXCEPTION 'Account in attesa di attivazione';
  ELSIF _user.status = 'disabled' THEN
    RAISE EXCEPTION 'Account disabilitato. Contatta l''amministratore.';
  END IF;

  -- 5. Fetch approval_status + rejection_reason della org
  --    (NULL-safe: se org_id non risolve, il client interpreta come 'approved'
  --     per backward compat con dati pre-035)
  SELECT approval_status, rejection_reason
    INTO _org_approval, _org_rejection
    FROM public.organizations WHERE id::text = _user.org_id LIMIT 1;

  SELECT to_jsonb(u.*)
       || jsonb_build_object(
            'org_approval_status', COALESCE(_org_approval, 'approved'),
            'org_rejection_reason', _org_rejection
          )
    INTO _result
    FROM public.users u WHERE u.id = _user.id;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.resolve_my_profile() TO authenticated;
