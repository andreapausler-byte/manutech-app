-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 031: Fix handle_new_user per sistema invite-only
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Bug: la migration 029 ha introdotto gli utenti "pending" (riga
-- public.users creata da invite_user prima del signUp), ma ha lasciato
-- intatto il trigger on_auth_user_created definito in schema.sql che
-- fa sempre un INSERT "secco" in public.users. Quando l'invitato fa
-- supabase.auth.signUp(), il trigger prova a creare una seconda riga
-- con la stessa email -> UNIQUE violation su users_email_key ->
-- "Database error saving new user".
--
-- Fix: se esiste gia' una riga pending/disabled per quella email,
-- il trigger si limita a collegare auth_id alla riga esistente
-- (preservando status='pending' finche' accept_invite non attiva).
-- Altrimenti fallback al comportamento pre-invite (insert diretto).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _existing_id UUID;
BEGIN
  -- 1. Riga gia' presente in public.users (tipicamente da invite_user):
  --    collega auth_id e lascia che accept_invite gestisca lo status.
  SELECT id INTO _existing_id
  FROM public.users
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.users
    SET auth_id = NEW.id,
        updated_at = now()
    WHERE id = _existing_id;
    RETURN NEW;
  END IF;

  -- 2. Nessuna riga preesistente (signup diretto senza invito):
  --    crea profilo con status='active' come da comportamento storico.
  INSERT INTO public.users (auth_id, email, name, role, org_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operatore'),
    COALESCE(NEW.raw_user_meta_data->>'org_id', 'default'),
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Il trigger on_auth_user_created esiste gia' (definito in schema.sql),
-- CREATE OR REPLACE FUNCTION sopra lo aggiorna automaticamente.
