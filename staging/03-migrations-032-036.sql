-- ============================================================
-- ManuTech Staging Bundle 3/3 — Sprint 1 migrations 032..036
-- ============================================================
-- Multi-tenancy completa:
--   032: organizations table base + handle_new_user trigger
--   033: organizations v2 (trial, owner, settings, validate_org_id)
--   034: escape-hatch _signup_via_edge nel trigger
--   035: approval workflow (pending/approved/rejected)
--   036: super_admin role + RPC list/approve/reject


-- ─── PRE-MIGRATION FIXUP: drift schema da bundle 02 ────────
-- dm_reads (creata in migration 016) NON ha la colonna org_id.
-- Migration 032 in questo bundle prova a UPDATE org_id su dm_reads,
-- quindi aggiungiamo la colonna prima.

ALTER TABLE public.dm_reads
  ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- Esegui DOPO aver applicato 01 e 02.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 032_organizations.sql
-- ────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────
-- 033_organizations_v2.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 033: Organizations v2 — estende per signup self-service
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Estende la tabella creata in 032:
--   • Trial 30 giorni con scadenza esplicita (trial_ends_at)
--   • Owner tracking (owner_user_id → auth.users)
--   • Settings configurabili (JSONB)
--   • Plan esteso: + trial, + enterprise
--   • Status esteso: + cancelled
--   • Validazione formato org_id (UUID + existence) via trigger
--   • Rinomina seed org "Organizzazione Demo" → "Birra Amarcord"
--   • RPC pubblica check_slug_available per signup realtime
--
-- IMPORTANTE: org_id resta TEXT in tutte le tabelle (UUID stringificato).
-- Conversione UUID strict deferrata a sprint dedicato per non rompere
-- le ~30 policy RLS esistenti su Amarcord.
--
-- DOWN: 033_organizations_v2_down.sql ripristina SCHEMA, non DATI.

-- ── 1. Aggiunge colonne mancanti ────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS owner_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settings       JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_organizations_owner
  ON public.organizations(owner_user_id);

-- ── 2. Estende enum plan e status ───────────────────────────
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('trial', 'free', 'base', 'pro', 'enterprise'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('active', 'trial', 'suspended', 'cancelled'));

-- Default: nuove org entrano in trial (signup self-service)
ALTER TABLE public.organizations ALTER COLUMN plan SET DEFAULT 'trial';

-- ── 3. Trigger updated_at ───────────────────────────────────
-- handle_updated_at() è già definita in schema.sql:252 (init del progetto).
-- Skippato il CREATE OR REPLACE per evitare duplicazione.
DROP TRIGGER IF EXISTS trg_organizations_updated ON public.organizations;
CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 4. Rinomina seed: "Organizzazione Demo" → "Birra Amarcord" ──
-- Filtra SOLO per UUID seed (stabile per definizione, scelto in 032).
-- Il filtro slug='demo' è stato rimosso: vogliamo OVERWRITE deterministico,
-- non skip silenzioso.
UPDATE public.organizations
   SET name = 'Birra Amarcord',
       slug = 'amarcord',
       plan = 'enterprise',
       status = 'active',
       trial_ends_at = NULL,
       updated_at = now()
 WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Verifica: la riga seed DEVE esistere (significherebbe che 032 non è
-- stata applicata, o che qualcuno l'ha cancellata manualmente).
DO $$
DECLARE
  _affected INT;
BEGIN
  GET DIAGNOSTICS _affected = ROW_COUNT;
  IF _affected = 0 THEN
    RAISE EXCEPTION 'Migration 033 fallita: seed org % non trovata. '
                    'Verifica che 032 sia stata applicata.',
                    '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

-- ── 5. Validazione formato org_id (trigger su tutte le tabelle) ──
-- Verifica: NEW.org_id è UUID valido E esiste in organizations.id
-- Sostituisce la futura FK strict (deferrata).
--
-- Performance: early return se UPDATE non cambia org_id. Evita lookup
-- inutili su tabelle ad alta scrittura (activities, notifications,
-- direct_messages) quando si aggiornano altre colonne.
CREATE OR REPLACE FUNCTION public.validate_org_id_format()
RETURNS TRIGGER AS $$
DECLARE
  _uuid_re CONSTANT TEXT :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  -- Skip se UPDATE che non cambia org_id (il trigger fires comunque
  -- se org_id è in SET, anche con stesso valore)
  IF TG_OP = 'UPDATE' AND OLD.org_id IS NOT DISTINCT FROM NEW.org_id THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'org_id NULL non ammesso su %', TG_TABLE_NAME;
  END IF;
  IF NEW.org_id !~ _uuid_re THEN
    RAISE EXCEPTION 'org_id "%" non è un UUID valido (tabella %)',
      NEW.org_id, TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id::text = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'org_id "%" non esiste in organizations (% su %)',
      NEW.org_id, TG_OP, TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applica il trigger a tutte le tabelle multi-tenant esistenti
DO $$
DECLARE
  _t TEXT;
  _tables TEXT[] := ARRAY[
    'users', 'machines', 'reports', 'comments', 'activities', 'notifications',
    'maintenance_plans', 'maintenance_logs', 'notification_preferences',
    'push_subscriptions', 'conversations', 'direct_messages', 'dm_reads',
    'token_transactions', 'token_config', 'reward_catalog', 'reward_redemptions',
    'spare_parts', 'areas', 'machine_components', 'machine_instructions',
    'knowledge_chunks', 'supplier_profiles', 'guest_tokens'
  ];
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF to_regclass('public.' || _t) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_%I_validate_org_id ON public.%I', _t, _t);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_validate_org_id
           BEFORE INSERT OR UPDATE OF org_id ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.validate_org_id_format()',
        _t, _t);
    END IF;
  END LOOP;
END $$;

-- ── 6. Policy update: anche owner_user_id può modificare la org ──
-- Logica:
--   • Edge function signup-org assegna role='admin' al creatore via
--     metadata { role: 'admin' } → trigger handle_new_user → users.role
--   • Quindi nel caso normale BOTH conditions sono vere (admin + owner)
--   • La OR è SAFE REDUNDANCY: protegge se in futuro
--       a) un admin demota l'owner a operatore mantenendo owner_user_id
--       b) modifiche dirette al DB cambiano users.role
--     L'owner conserva il diritto di gestire la propria org indipendentemente
--     dal ruolo applicativo.
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id::text = public.get_my_org_id()
    AND (public.get_my_role() = 'admin' OR owner_user_id = auth.uid())
  );

-- ── 7. RPC pubblica check_slug_available (per signup realtime) ──
-- Restituisce true se lo slug è formalmente valido E non ancora preso.
-- SECURITY DEFINER per bypassare RLS su organizations (necessario per anon).
--
-- ⚠️ RATE LIMITING — DA CONFIGURARE PRIMA DEL GO-LIVE
-- Questa RPC è chiamata da SignupPage con debounce 300ms su ogni
-- keystroke dello slug. È esposta ad anon → potenziale abuse vector
-- (enumeration di slug esistenti, DoS).
--
-- Configurare nel Supabase Dashboard:
--   Project Settings → API → Rate Limits → Custom RPC
--   • Path: /rest/v1/rpc/check_slug_available
--   • Limit: 30 req/min per IP
--   • Burst: 10
--
-- TODO già aggiunto in CLAUDE.md (sezione "Pre go-live checklist").
CREATE OR REPLACE FUNCTION public.check_slug_available(_slug TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF _slug IS NULL OR _slug !~ '^[a-z0-9-]{3,30}$' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = _slug);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_slug_available(TEXT) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 034_signup_via_edge_escape_hatch.sql
-- ────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────
-- 035_org_approval.sql
-- ────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────
-- 036_super_admin_role.sql
-- ────────────────────────────────────────────────────────────
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

