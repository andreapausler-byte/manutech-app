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
