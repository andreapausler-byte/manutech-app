-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 036: super_admin role + RPC per moderazione organizations
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Estende users.role con 'super_admin': moderatore globale che approva
-- o rifiuta nuove organizzazioni. Le sue azioni sono gated da SECURITY
-- DEFINER RPC che bypassano RLS per leggere/aggiornare TUTTE le org.
--
-- Convenzione: super_admin appartiene comunque a un'org (es. Amarcord).
-- Il suo "potere meta" è codificato nelle 3 RPC sotto, non in policy RLS
-- speciali (per non aprire bug pre-026 di policy con escape-hatch globali).
--
-- Promote di un utente esistente a super_admin (one-time, da console SQL):
--   UPDATE public.users SET role = 'super_admin'
--    WHERE email = 'andrea.pausler@gmail.com';
--
-- DOWN: 036_super_admin_role_down.sql

-- ── 1. Estende check constraint role ───────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('operatore', 'tecnico', 'admin', 'super_admin'));

-- ── 2. RPC list_pending_orgs ───────────────────────────────
-- Restituisce le organizations in coda approvazione, JOIN con dati owner.
CREATE OR REPLACE FUNCTION public.list_pending_orgs()
RETURNS TABLE (
  id                UUID,
  name              TEXT,
  slug              TEXT,
  plan              TEXT,
  status            TEXT,
  trial_ends_at     TIMESTAMPTZ,
  owner_user_id     UUID,
  owner_email       TEXT,
  owner_name        TEXT,
  approval_status   TEXT,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ
) AS $$
BEGIN
  IF public.get_my_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'Accesso negato: super_admin richiesto';
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.name, o.slug, o.plan, o.status, o.trial_ends_at,
    o.owner_user_id,
    au.email::TEXT       AS owner_email,
    pu.name              AS owner_name,
    o.approval_status,
    o.rejection_reason,
    o.created_at
  FROM public.organizations o
  LEFT JOIN auth.users   au ON au.id = o.owner_user_id
  LEFT JOIN public.users pu ON pu.auth_id = o.owner_user_id
  WHERE o.approval_status = 'pending'
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.list_pending_orgs() TO authenticated;

-- ── 3. RPC approve_org ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_org(_org_id UUID)
RETURNS JSONB AS $$
DECLARE _result JSONB;
BEGIN
  IF public.get_my_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'Accesso negato: super_admin richiesto';
  END IF;

  UPDATE public.organizations
     SET approval_status  = 'approved',
         approved_at      = now(),
         approved_by      = auth.uid(),
         rejection_reason = NULL
   WHERE id = _org_id AND approval_status = 'pending'
  RETURNING to_jsonb(organizations.*) INTO _result;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'Organizzazione non trovata o già processata';
  END IF;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.approve_org(UUID) TO authenticated;

-- ── 4. RPC reject_org ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_org(_org_id UUID, _reason TEXT)
RETURNS JSONB AS $$
DECLARE _result JSONB;
BEGIN
  IF public.get_my_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'Accesso negato: super_admin richiesto';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo del rifiuto richiesto (min 3 caratteri)';
  END IF;

  UPDATE public.organizations
     SET approval_status  = 'rejected',
         approved_at      = now(),
         approved_by      = auth.uid(),
         rejection_reason = trim(_reason)
   WHERE id = _org_id AND approval_status = 'pending'
  RETURNING to_jsonb(organizations.*) INTO _result;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'Organizzazione non trovata o già processata';
  END IF;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reject_org(UUID, TEXT) TO authenticated;
