-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 033 DOWN — ripristina SCHEMA pre-033, NON i dati
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ⚠️ ATTENZIONE — perdita dati attesa:
--   • Le organizzazioni create dopo la UP saranno PERSE
--     (constraint plan IN ('free','base','pro') le rifiuta)
--   • Org con plan='trial'|'enterprise' o status='cancelled' devono
--     essere convertite PRIMA del rollback (vedi UPDATE in fondo)
--   • Record nelle tabelle multi-tenant con org_id non-Amarcord
--     restano orfani (puntano a UUID inesistenti, ma TEXT non vincola)
--   • Rinomina "Birra Amarcord" NON viene revocata (è un dato reale)
--
-- Procedura di rollback:
--   1. Backup pre-rollback (`pg_dump` completo)
--   2. Cleanup dati incompatibili (UPDATE finale di questo file)
--   3. Esegui questo DOWN
--   4. Ridispiega l'app col codice pre-033

-- ── PRE-CLEANUP: converte valori incompatibili coi vecchi enum ──
-- Eseguire MANUALMENTE prima del DOWN se ci sono dati live:
--   UPDATE public.organizations SET plan='free'
--     WHERE plan IN ('trial','enterprise');
--   UPDATE public.organizations SET status='suspended'
--     WHERE status='cancelled';
-- (lasciato commentato per evitare lossy auto-cleanup non voluto)

-- ── 1. Drop trigger validate_org_id_format ──────────────────
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
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.validate_org_id_format();
DROP FUNCTION IF EXISTS public.check_slug_available(TEXT);

-- ── 2. Ripristina policy organizations_update originale (032) ──
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id::text = public.get_my_org_id() AND public.get_my_role() = 'admin'
  );

-- ── 3. Ripristina enum plan/status originali (032) ──────────
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('free', 'base', 'pro'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('active', 'trial', 'suspended'));

ALTER TABLE public.organizations ALTER COLUMN plan SET DEFAULT 'free';

-- ── 4. Drop trigger updated_at ──────────────────────────────
DROP TRIGGER IF EXISTS trg_organizations_updated ON public.organizations;

-- ── 5. Drop colonne aggiunte da 033 ─────────────────────────
DROP INDEX IF EXISTS public.idx_organizations_owner;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS settings,
  DROP COLUMN IF EXISTS owner_user_id,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS trial_ends_at;

-- NOTA: name='Birra Amarcord' resta. È un dato reale, non un default.
