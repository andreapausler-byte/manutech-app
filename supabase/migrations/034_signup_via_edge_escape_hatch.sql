-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 034: Escape-hatch _signup_via_edge nel trigger handle_new_user
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Permette all'Edge Function signup-org di gestire manualmente la
-- creazione del profilo public.users senza che il trigger faccia
-- INSERT automatica. Vedi ADR completo in:
--   • /supabase/functions/signup-org/index.ts (header)
--   • /CLAUDE.md sezione "Multi-tenancy"
--
-- Comportamento:
--   • Se NEW.raw_user_meta_data->>'_signup_via_edge' = 'true':
--     → Trigger ritorna immediatamente, NESSUNA INSERT in public.users
--     → L'Edge Function è responsabile di INSERT esplicito
--   • Altrimenti: comportamento invariato (signup client legacy/futuro,
--     accept_invite, signup diretto)
--
-- ⚠️ SECURITY: il flag DEVE essere usato SOLO da signup-org Edge Function
-- (chiamata server-side con service_role). Non è esposto al client.
-- Se mai dovesse trapelare a un client anon/authenticated, otterrebbe
-- un auth user senza profilo (utente fantasma, RLS lo blocca completamente).
--
-- DOWN: 034_signup_via_edge_escape_hatch_down.sql ripristina la versione
-- 032 della funzione (senza escape-hatch).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _existing_id  UUID;
  _org_id_meta  TEXT;
  _org_name     TEXT;
  _slug         TEXT;
  _new_org_id   UUID;
  _final_org_id TEXT;
  _role         TEXT;
  _name         TEXT;
BEGIN
  -- ── ESCAPE-HATCH per Edge Function signup-org ──
  -- Se il caller (Edge Function con service_role) marca esplicitamente
  -- la signUp con _signup_via_edge='true', il trigger non fa nulla.
  -- L'Edge Function gestisce INSERT in public.users manualmente.
  IF (NEW.raw_user_meta_data->>'_signup_via_edge') = 'true' THEN
    RETURN NEW;
  END IF;

  -- ── Resto del codice IDENTICO a migration 032 ──
  -- (CREATE OR REPLACE richiede di ridichiarare l'intero corpo)

  -- Se l'utente esiste già (invito pending), linka solo auth_id
  SELECT id INTO _existing_id FROM public.users
    WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    UPDATE public.users
       SET auth_id = NEW.id, updated_at = now()
     WHERE id = _existing_id;
    RETURN NEW;
  END IF;

  _org_id_meta := NEW.raw_user_meta_data->>'org_id';
  _org_name    := NEW.raw_user_meta_data->>'org_name';
  _name        := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  -- Caso A: signup di una nuova organizzazione (org_name in metadata)
  IF _org_name IS NOT NULL AND trim(_org_name) <> '' THEN
    _slug := lower(regexp_replace(trim(_org_name), '[^a-zA-Z0-9]+', '-', 'g'));
    _slug := trim(both '-' from _slug);
    IF _slug = '' THEN _slug := encode(gen_random_bytes(6), 'hex'); END IF;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = _slug) LOOP
      _slug := _slug || '-' || encode(gen_random_bytes(2), 'hex');
    END LOOP;
    INSERT INTO public.organizations (name, slug)
      VALUES (trim(_org_name), _slug)
      RETURNING id INTO _new_org_id;
    _final_org_id := _new_org_id::text;
    _role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');

  -- Caso B: signup in una organization esistente (org_id in metadata)
  ELSIF _org_id_meta IS NOT NULL AND _org_id_meta <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id::text = _org_id_meta) THEN
      RAISE EXCEPTION 'Organizzazione non trovata: %', _org_id_meta;
    END IF;
    _final_org_id := _org_id_meta;
    _role := COALESCE(NEW.raw_user_meta_data->>'role', 'operatore');

  ELSE
    RAISE EXCEPTION 'Registrazione non consentita: nome organizzazione richiesto';
  END IF;

  INSERT INTO public.users (auth_id, email, name, role, org_id, status)
  VALUES (NEW.id, NEW.email, _name, _role, _final_org_id, 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
