-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 029: Invite-only signup system
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Rimuove la possibilità di registrazione pubblica. Solo gli admin
-- possono invitare nuovi utenti. Il flusso:
--   1. Admin chiama invite_user() → crea riga users con status='pending' + token
--   2. Admin condivide il link /invite/<token> con il destinatario
--   3. Utente imposta password → supabase.auth.signUp() + accept_invite(token)
--   4. accept_invite linka auth_id, attiva account, invalida token
--   5. Login normale richiede status='active' (verificato in resolve_my_profile)

-- ── 1. Colonne per invito ───────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'disabled')),
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_invite_token ON public.users(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- Utenti già esistenti restano 'active' (default della colonna)

-- ── 2. RPC: invita utente (solo admin) ──────────────────────
CREATE OR REPLACE FUNCTION public.invite_user(
  _email TEXT,
  _name  TEXT,
  _role  TEXT DEFAULT 'operatore',
  _expires_hours INT DEFAULT 168
)
RETURNS JSONB AS $$
DECLARE
  _caller_id   UUID;
  _caller_role TEXT;
  _caller_org  TEXT;
  _existing    RECORD;
  _token       TEXT;
  _expires     TIMESTAMPTZ;
  _result      JSONB;
BEGIN
  SELECT id, role, org_id INTO _caller_id, _caller_role, _caller_org
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _caller_id IS NULL THEN RAISE EXCEPTION 'Profilo chiamante non trovato'; END IF;
  IF _caller_role != 'admin' THEN RAISE EXCEPTION 'Solo gli amministratori possono invitare utenti'; END IF;
  IF _role NOT IN ('operatore', 'tecnico', 'admin') THEN RAISE EXCEPTION 'Ruolo non valido: %', _role; END IF;
  IF _email IS NULL OR trim(_email) = '' THEN RAISE EXCEPTION 'Email obbligatoria'; END IF;
  IF _name  IS NULL OR trim(_name)  = '' THEN RAISE EXCEPTION 'Nome obbligatorio'; END IF;

  _email := lower(trim(_email));
  _token := encode(gen_random_bytes(24), 'hex');
  _expires := now() + (_expires_hours || ' hours')::interval;

  SELECT * INTO _existing FROM public.users WHERE lower(email) = _email LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    IF _existing.status = 'active' THEN
      RAISE EXCEPTION 'Esiste già un utente attivo con questa email';
    END IF;
    -- Rigenera invito (status pending o disabled)
    UPDATE public.users SET
      name = _name,
      role = _role,
      status = 'pending',
      invited_by = _caller_id,
      invited_at = now(),
      invite_token = _token,
      invite_expires_at = _expires,
      invite_accepted_at = NULL,
      updated_at = now()
    WHERE id = _existing.id
    RETURNING to_jsonb(users.*) INTO _result;
  ELSE
    INSERT INTO public.users (
      email, name, role, org_id, status,
      invited_by, invited_at, invite_token, invite_expires_at
    ) VALUES (
      _email, _name, _role, _caller_org, 'pending',
      _caller_id, now(), _token, _expires
    )
    RETURNING to_jsonb(users.*) INTO _result;
  END IF;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. RPC: anteprima invito (pubblica, per pagina accept) ──
CREATE OR REPLACE FUNCTION public.get_invite_info(_token TEXT)
RETURNS JSONB AS $$
DECLARE
  _user RECORD;
BEGIN
  SELECT email, name, role, status, invite_expires_at
    INTO _user
    FROM public.users
    WHERE invite_token = _token
    LIMIT 1;

  IF _user IS NULL THEN RAISE EXCEPTION 'Invito non valido'; END IF;
  IF _user.status != 'pending' THEN RAISE EXCEPTION 'Invito già utilizzato o revocato'; END IF;
  IF _user.invite_expires_at < now() THEN RAISE EXCEPTION 'Invito scaduto'; END IF;

  RETURN jsonb_build_object(
    'email', _user.email,
    'name',  _user.name,
    'role',  _user.role,
    'expires_at', _user.invite_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. RPC: accetta invito (dopo signUp) ────────────────────
CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS JSONB AS $$
DECLARE
  _auth_id UUID := auth.uid();
  _auth_email TEXT;
  _user RECORD;
  _result JSONB;
BEGIN
  IF _auth_id IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;

  SELECT email INTO _auth_email FROM auth.users WHERE id = _auth_id;

  SELECT * INTO _user FROM public.users WHERE invite_token = _token LIMIT 1;
  IF _user IS NULL THEN RAISE EXCEPTION 'Invito non valido'; END IF;
  IF _user.status != 'pending' THEN RAISE EXCEPTION 'Invito già utilizzato o revocato'; END IF;
  IF _user.invite_expires_at < now() THEN RAISE EXCEPTION 'Invito scaduto'; END IF;
  IF lower(_user.email) != lower(_auth_email) THEN
    RAISE EXCEPTION 'Email dell''account (%) diversa dall''email dell''invito (%)', _auth_email, _user.email;
  END IF;

  UPDATE public.users SET
    auth_id = _auth_id,
    status = 'active',
    invite_token = NULL,
    invite_expires_at = NULL,
    invite_accepted_at = now(),
    updated_at = now()
  WHERE id = _user.id
  RETURNING to_jsonb(users.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RPC: revoca invito / disabilita utente (solo admin) ──
CREATE OR REPLACE FUNCTION public.revoke_invite(_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  _caller_role TEXT;
  _caller_org  TEXT;
  _target      RECORD;
  _result      JSONB;
BEGIN
  SELECT role, org_id INTO _caller_role, _caller_org
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  IF _caller_role != 'admin' THEN RAISE EXCEPTION 'Solo gli amministratori possono revocare inviti'; END IF;

  SELECT * INTO _target FROM public.users WHERE id = _user_id LIMIT 1;
  IF _target IS NULL THEN RAISE EXCEPTION 'Utente non trovato'; END IF;
  IF _target.org_id != _caller_org THEN RAISE EXCEPTION 'Non puoi revocare inviti di altre organizzazioni'; END IF;
  IF _target.status != 'pending' THEN RAISE EXCEPTION 'Solo gli inviti in attesa possono essere revocati'; END IF;

  UPDATE public.users SET
    status = 'disabled',
    invite_token = NULL,
    invite_expires_at = NULL,
    updated_at = now()
  WHERE id = _user_id
  RETURNING to_jsonb(users.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Aggiorna resolve_my_profile per rifiutare non-active ──
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

  -- 4. Verifica stato
  IF _user.status = 'pending' THEN
    RAISE EXCEPTION 'Account in attesa di attivazione';
  ELSIF _user.status = 'disabled' THEN
    RAISE EXCEPTION 'Account disabilitato. Contatta l''amministratore.';
  END IF;

  SELECT to_jsonb(u.*) INTO _result FROM public.users u WHERE u.id = _user.id;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. Grants ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_info(TEXT) TO anon, authenticated;
