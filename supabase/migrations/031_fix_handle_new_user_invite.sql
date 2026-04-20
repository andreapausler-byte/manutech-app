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
-- Fix: INSERT ... ON CONFLICT (email) DO UPDATE. Se la riga esiste
-- gia' (pending/disabled da invito), aggiorniamo solo auth_id +
-- updated_at preservando status e tutti gli altri campi: accept_invite
-- si occupera' di attivare lo status quando l'utente completa il flow.
-- Se non esiste, INSERT standard con status='active' (comportamento
-- pre-invite, per signup diretti da Supabase Auth UI).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, name, role, org_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operatore'),
    COALESCE(NEW.raw_user_meta_data->>'org_id', 'default'),
    'active'
  )
  ON CONFLICT (email) DO UPDATE
  SET auth_id = EXCLUDED.auth_id,
      updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Il trigger on_auth_user_created esiste gia' (definito in schema.sql),
-- CREATE OR REPLACE FUNCTION sopra lo aggiorna automaticamente.
