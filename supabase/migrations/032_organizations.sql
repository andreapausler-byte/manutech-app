-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 032: Organizations table + multi-tenant signup
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Introduce la tabella organizations come fonte di verità per i tenant.
-- Prima di questa migration org_id era una stringa libera ('default')
-- senza FK. Ora ogni org_id deve corrispondere a una riga in organizations.
--
-- Modifiche:
--   1. Tabella organizations (id, name, slug, plan, status, created_at)
--   2. Migra i dati esistenti con org_id='default' verso una nuova org seed
--   3. Aggiorna get_my_org_id() per risolvere via JOIN con organizations
--   4. Aggiorna handle_new_user() per supportare signup con creazione org
--   5. RLS sulla tabella organizations
--   6. Rimuove i DEFAULT 'default' dalle colonne org_id

-- ── 1. Tabella organizations ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'free'
              CHECK (plan IN ('free', 'base', 'pro')),
  status      TEXT NOT NULL DEFAULT 'trial'
              CHECK (status IN ('active', 'trial', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- ── 2. Org seed per backfill dati esistenti ─────────────────
-- UUID fisso per la migrazione dei record che avevano org_id='default'.
DO $$
DECLARE
  _seed_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  _seed_id_text TEXT := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.organizations (id, name, slug, plan, status)
  VALUES (_seed_id, 'Organizzazione Demo', 'demo', 'free', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Backfill: tutte le tabelle con org_id='default' → seed UUID
  PERFORM 1;
  UPDATE public.users               SET org_id = _seed_id_text WHERE org_id = 'default';
  UPDATE public.machines            SET org_id = _seed_id_text WHERE org_id = 'default';
  UPDATE public.reports             SET org_id = _seed_id_text WHERE org_id = 'default';
  UPDATE public.comments            SET org_id = _seed_id_text WHERE org_id = 'default';
  UPDATE public.activities          SET org_id = _seed_id_text WHERE org_id = 'default';
  UPDATE public.notifications       SET org_id = _seed_id_text WHERE org_id = 'default';

  -- Tabelle opzionali: aggiorna solo se esistono
  IF to_regclass('public.maintenance_plans') IS NOT NULL THEN
    EXECUTE format('UPDATE public.maintenance_plans SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.maintenance_logs') IS NOT NULL THEN
    EXECUTE format('UPDATE public.maintenance_logs SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    EXECUTE format('UPDATE public.notification_preferences SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    EXECUTE format('UPDATE public.push_subscriptions SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.conversations') IS NOT NULL THEN
    EXECUTE format('UPDATE public.conversations SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.direct_messages') IS NOT NULL THEN
    EXECUTE format('UPDATE public.direct_messages SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.dm_reads') IS NOT NULL THEN
    EXECUTE format('UPDATE public.dm_reads SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.token_transactions') IS NOT NULL THEN
    EXECUTE format('UPDATE public.token_transactions SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.token_config') IS NOT NULL THEN
    EXECUTE format('UPDATE public.token_config SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.reward_catalog') IS NOT NULL THEN
    EXECUTE format('UPDATE public.reward_catalog SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.reward_redemptions') IS NOT NULL THEN
    EXECUTE format('UPDATE public.reward_redemptions SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.spare_parts') IS NOT NULL THEN
    EXECUTE format('UPDATE public.spare_parts SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.areas') IS NOT NULL THEN
    EXECUTE format('UPDATE public.areas SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.machine_components') IS NOT NULL THEN
    EXECUTE format('UPDATE public.machine_components SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.machine_instructions') IS NOT NULL THEN
    EXECUTE format('UPDATE public.machine_instructions SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.knowledge_chunks') IS NOT NULL THEN
    EXECUTE format('UPDATE public.knowledge_chunks SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
  IF to_regclass('public.supplier_profiles') IS NOT NULL THEN
    EXECUTE format('UPDATE public.supplier_profiles SET org_id = %L WHERE org_id = %L', _seed_id_text, 'default');
  END IF;
END $$;

-- ── 3. Rimuovi i DEFAULT 'default' dalle colonne org_id ─────
ALTER TABLE public.users          ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE public.machines       ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE public.reports        ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE public.comments       ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE public.activities     ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE public.notifications  ALTER COLUMN org_id DROP DEFAULT;

-- ── 4. get_my_org_id(): risolve via JOIN con organizations ──
-- Restituisce NULL se l'utente non è linkato a una org valida.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS TEXT AS $$
  SELECT o.id::text
    FROM public.users u
    JOIN public.organizations o ON o.id::text = u.org_id
   WHERE u.auth_id = auth.uid()
   LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 5. handle_new_user(): supporta creazione nuova org ──────
-- Comportamento:
--   • Se esiste già una riga users con la stessa email (invito pending),
--     aggiorna solo auth_id e preserva tutto il resto.
--   • Altrimenti crea una nuova riga. Se il metadata contiene `org_name`
--     crea anche una nuova organization e imposta role='admin'.
--   • Se manca sia org_name che org_id valido → eccezione.
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

  -- Caso A: signup di una nuova organizzazione
  IF _org_name IS NOT NULL AND trim(_org_name) <> '' THEN
    _slug := lower(regexp_replace(trim(_org_name), '[^a-zA-Z0-9]+', '-', 'g'));
    _slug := trim(both '-' from _slug);
    IF _slug = '' THEN _slug := encode(gen_random_bytes(6), 'hex'); END IF;
    -- Risolvi collisioni di slug
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = _slug) LOOP
      _slug := _slug || '-' || encode(gen_random_bytes(2), 'hex');
    END LOOP;
    INSERT INTO public.organizations (name, slug)
      VALUES (trim(_org_name), _slug)
      RETURNING id INTO _new_org_id;
    _final_org_id := _new_org_id::text;
    _role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');

  -- Caso B: signup in una organization esistente (legacy/futuro)
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

-- ── 6. RLS su organizations ─────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Lettura: solo gli utenti membri della propria org possono leggere
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (id::text = public.get_my_org_id());

-- Aggiornamento: solo admin della propria org
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id::text = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- INSERT: gestita esclusivamente via handle_new_user (SECURITY DEFINER).
-- Nessuna policy → nessun client può inserire direttamente.

-- ── 7. Grants ───────────────────────────────────────────────
GRANT SELECT ON public.organizations TO authenticated;
