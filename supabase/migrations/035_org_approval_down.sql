-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 035 DOWN: Rollback approval workflow
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Ripristina schema pre-035. Non recupera dati di approvazione.
-- ⚠️ Eseguire SOLO se 036 è stato già rolled back (036 dipende da
--    approval_status indirettamente via list_pending_orgs).

-- ── 1. Ripristina resolve_my_profile versione 029 ──────────
CREATE OR REPLACE FUNCTION public.resolve_my_profile()
RETURNS JSONB AS $$
DECLARE
  _auth_id UUID := auth.uid();
  _email   TEXT;
  _user    RECORD;
  _result  JSONB;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _auth_id;
  IF _email IS NULL THEN RAISE EXCEPTION 'Utente auth non trovato'; END IF;

  SELECT * INTO _user FROM public.users WHERE auth_id = _auth_id LIMIT 1;

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

  IF _user IS NULL THEN
    RAISE EXCEPTION 'Account non autorizzato. Richiedi un invito all''amministratore.';
  END IF;

  IF _user.status = 'pending' THEN
    RAISE EXCEPTION 'Account in attesa di attivazione';
  ELSIF _user.status = 'disabled' THEN
    RAISE EXCEPTION 'Account disabilitato. Contatta l''amministratore.';
  END IF;

  SELECT to_jsonb(u.*) INTO _result FROM public.users u WHERE u.id = _user.id;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Drop index parziale ─────────────────────────────────
DROP INDEX IF EXISTS public.idx_organizations_approval_pending;

-- ── 3. Drop colonne approval ───────────────────────────────
ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approval_status;
