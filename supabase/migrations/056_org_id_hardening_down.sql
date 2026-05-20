-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ⚠️  DO NOT APPLY — sospeso 2026-05-20 (sera)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Down della mig 056, anch'essa sospesa. La mig 056 non è mai stata
-- applicata in produzione (pre-check abortito): non c'è nulla da
-- revertire oggi. Questo file resta come riferimento per il futuro
-- Sprint Multi-Tenant Foundations.
--
-- Vedi ADR-007 sezione "Scoperta 2026-05-20 — pre-check mig 056
-- abortito" per il contesto completo.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 056 DOWN — rimuove CHECK constraints org_id UUID-shape
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Rimuove i 27 CHECK constraint <table>_org_id_uuid_check introdotti da
-- mig 056. **NON ripristina i DEFAULT 'default'**: erano un anti-pattern
-- noto (mig 032 li aveva già parzialmente rimossi) e reintrodurli sarebbe
-- regressivo. Se serve davvero rollback completo, va fatto manualmente
-- con conoscenza del business.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS è no-op se non c'è.

DO $$
DECLARE
  _table       TEXT;
  _constraint  TEXT;
  _tables      TEXT[] := ARRAY[
    'activities',
    'areas',
    'assistant_conversations',
    'comments',
    'conversations',
    'direct_messages',
    'document_chunks',
    'guest_tokens',
    'intervention_reports',
    'interventions',
    'machine_components',
    'machines',
    'maintenance_logs',
    'maintenance_plans',
    'notification_preferences',
    'notifications',
    'push_subscriptions',
    'reports',
    'reward_catalog',
    'reward_redemptions',
    'spare_part_compatibility',
    'spare_part_orders',
    'spare_parts',
    'supplier_profiles',
    'token_config',
    'token_transactions',
    'users'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    IF to_regclass('public.' || _table) IS NULL THEN
      CONTINUE;
    END IF;
    _constraint := _table || '_org_id_uuid_check';
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      _table, _constraint
    );
  END LOOP;
END $$;
