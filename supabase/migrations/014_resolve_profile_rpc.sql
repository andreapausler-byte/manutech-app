-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RPC: resolve_my_profile
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Gestisce il recupero/linking profilo al login, bypassando RLS.
-- Scenari:
--   1. Profilo trovato per auth_id → restituisce
--   2. Profilo trovato per email ma auth_id mancante → linka e restituisce
--   3. Nessun profilo → crea automaticamente e restituisce

CREATE OR REPLACE FUNCTION public.resolve_my_profile()
RETURNS JSONB AS $$
DECLARE
  _auth_id UUID := auth.uid();
  _email   TEXT;
  _result  JSONB;
BEGIN
  -- Recupera email dall'utente auth
  SELECT email INTO _email FROM auth.users WHERE id = _auth_id;
  IF _email IS NULL THEN
    RAISE EXCEPTION 'Utente auth non trovato';
  END IF;

  -- 1. Cerca per auth_id
  SELECT to_jsonb(u.*) INTO _result
    FROM public.users u WHERE u.auth_id = _auth_id LIMIT 1;
  IF _result IS NOT NULL THEN
    RETURN _result;
  END IF;

  -- 2. Cerca per email e linka auth_id
  UPDATE public.users
    SET auth_id = _auth_id, updated_at = now()
    WHERE email = _email AND (auth_id IS NULL OR auth_id != _auth_id)
    RETURNING to_jsonb(users.*) INTO _result;
  IF _result IS NOT NULL THEN
    RETURN _result;
  END IF;

  -- 3. Crea profilo da metadati auth
  INSERT INTO public.users (auth_id, email, name, role, org_id)
    SELECT
      _auth_id,
      _email,
      COALESCE(raw_user_meta_data->>'name', split_part(_email, '@', 1)),
      COALESCE(raw_user_meta_data->>'role', 'operatore'),
      COALESCE(raw_user_meta_data->>'org_id', 'default')
    FROM auth.users WHERE id = _auth_id
    RETURNING to_jsonb(users.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
