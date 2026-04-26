-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 034 DOWN — rimuove escape-hatch _signup_via_edge dal trigger
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ⚠️ ATTENZIONE — pre-condizioni del rollback:
--   • L'Edge Function signup-org SMETTE di funzionare immediatamente
--     (auth.admin.createUser fallirà perché il trigger ESIGE org_name
--     o org_id nel metadata, e _signup_via_edge non viene più riconosciuto)
--   • Disabilitare/rimuovere il deploy della Edge Function PRIMA di
--     applicare questo DOWN, oppure accettare che il signup self-service
--     sia bloccato fino al re-apply di 034
--   • I dati creati dall'Edge Function (org, users, ecc.) sopravvivono
--     intatti — il rollback è solo della logica del trigger
--
-- Procedura di rollback:
--   1. Backup pre-rollback (best practice)
--   2. Rimuovere/disabilitare Edge Function signup-org da Supabase Dashboard
--   3. Esegui questo DOWN
--   4. Comunicare a utenti/team che il signup self-service è temporaneamente
--      disabilitato

-- Ripristina la versione 032 di handle_new_user (senza escape-hatch).
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
  -- (versione 032: senza escape-hatch _signup_via_edge)

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
