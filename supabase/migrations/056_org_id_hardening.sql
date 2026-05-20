-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ⚠️  DO NOT APPLY — sospeso 2026-05-20 (sera)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Il pre-check Step 1 ha rivelato 2424 record con org_id='default' su
-- 22 tabelle in produzione — NON sporcizia residua, è il valore
-- sistematicamente usato dall'inizio dell'app. La tabella organizations
-- citata in mig 032 non esiste in produzione (mig 032 dichiarata ma
-- mai applicata davvero). Lo schema attuale è pre-multi-tenant by
-- design, non sporco da bonificare.
--
-- Applicare questa migration ora rifiuterebbe 2424 record esistenti
-- + ogni INSERT futuro (il client passa 'default' via getMyOrgId
-- fallback). L'aborto al pre-check è il comportamento corretto.
--
-- Questo file resta nel repo come riferimento per il futuro Sprint
-- Multi-Tenant Foundations, che dovrà PRIMA creare organizations reale
-- + backfill, POI applicare hardening tipo questo.
--
-- Vedi ADR-007 sezione "Scoperta 2026-05-20 — pre-check mig 056
-- abortito" per il contesto completo.
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 056 — org_id schema hardening (ADR-007, opzione C)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Realizza l'intento di ADR-007 (multi-tenant safety + UUID validation)
-- senza toccare RLS o get_my_org_id(). Approccio "TEXT + CHECK":
--
--   1. Verifica pre-migration: nessun record con org_id='default'.
--      Mig 032 aveva già backfillato i record esistenti, ma alcune
--      tabelle hanno mantenuto DEFAULT 'default' "dormiente". Se un
--      INSERT senza org_id è arrivato tra 032 e 056, lo intercetta qui.
--   2. Verifica pre-migration: tutti gli org_id sono UUID-shape validi.
--   3. DROP DEFAULT idempotent su 27 tabelle (6 già coperte da mig 032,
--      no-op safe sulle altre 21).
--   4. ADD CHECK constraint <table>_org_id_uuid_check su tutte le 27
--      tabelle: rifiuta 'default' e qualunque stringa non-UUID-shape.
--
-- Anti-pattern eliminato: INSERT senza org_id che generava record
-- "fantasma" invisibili a tutte le org.
--
-- Get_my_org_id() resta TEXT (return o.id::text). Tutte le RLS policy
-- che usano `org_id = get_my_org_id()` continuano a funzionare invariate
-- (TEXT = TEXT, anche con la nuova CHECK il valore è sempre UUID-stringa).
--
-- Conversione full TEXT → UUID type è documentata come Opzione B nel
-- ADR-007 ma differita: cambierebbe il return type del helper e
-- richiederebbe DROP+CREATE di ~92 RLS policy.
--
-- Idempotent: ALTER COLUMN DROP DEFAULT è no-op se non c'è default,
-- ADD CONSTRAINT è preceduto da DROP CONSTRAINT IF EXISTS.
--
-- DOWN: 056_org_id_hardening_down.sql (rimuove i CHECK, non ripristina
-- i DEFAULT — quel default era anti-pattern).

-- ── 0. Lista canonica delle 27 tabelle con org_id ──────────────────────
-- Variabile riusata in 4 step. Mantenuta in funzione locale per evitare
-- duplicazione e drift fra step.
CREATE OR REPLACE FUNCTION public._mig056_target_tables()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
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
  ]::TEXT[]
$$;

-- ── 1. Pre-check: nessun record con org_id='default' ───────────────────
DO $$
DECLARE
  _table       TEXT;
  _bad_count   INT;
  _total_bad   INT := 0;
  _report      TEXT := '';
BEGIN
  FOREACH _table IN ARRAY public._mig056_target_tables() LOOP
    IF to_regclass('public.' || _table) IS NULL THEN
      CONTINUE; -- tabella non ancora creata in questo ambiente, skip
    END IF;
    EXECUTE format(
      'SELECT COUNT(*) FROM public.%I WHERE org_id = %L',
      _table, 'default'
    ) INTO _bad_count;
    IF _bad_count > 0 THEN
      _total_bad := _total_bad + _bad_count;
      _report := _report || format(E'  - %s: %s record\n', _table, _bad_count);
    END IF;
  END LOOP;

  IF _total_bad > 0 THEN
    RAISE EXCEPTION
      E'Migration 056 aborted: % record con org_id=''default'' su tabelle:\n%\nBackfill manuale richiesto (UPDATE ... SET org_id = ''<seed-uuid>'' WHERE org_id=''default'') prima di riapplicare 056.',
      _total_bad, _report;
  END IF;
END $$;

-- ── 2. Pre-check: tutti gli org_id sono UUID-shape validi ──────────────
DO $$
DECLARE
  _table       TEXT;
  _bad_count   INT;
  _total_bad   INT := 0;
  _report      TEXT := '';
  _uuid_regex  TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  FOREACH _table IN ARRAY public._mig056_target_tables() LOOP
    IF to_regclass('public.' || _table) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT COUNT(*) FROM public.%I WHERE org_id !~* %L',
      _table, _uuid_regex
    ) INTO _bad_count;
    IF _bad_count > 0 THEN
      _total_bad := _total_bad + _bad_count;
      _report := _report || format(E'  - %s: %s record\n', _table, _bad_count);
    END IF;
  END LOOP;

  IF _total_bad > 0 THEN
    RAISE EXCEPTION
      E'Migration 056 aborted: % record con org_id non-UUID-shape su tabelle:\n%\nCleanup manuale richiesto (DELETE o UPDATE) prima di riapplicare 056.',
      _total_bad, _report;
  END IF;
END $$;

-- ── 3. DROP DEFAULT su tutte le 27 tabelle (idempotent) ────────────────
-- Mig 032 aveva già fatto DROP DEFAULT su 6 tabelle (users, machines,
-- reports, comments, activities, notifications). Le altre 21 hanno
-- ancora DEFAULT 'default'. ALTER COLUMN DROP DEFAULT è no-op se non
-- c'è default, quindi safe ovunque.
DO $$
DECLARE
  _table TEXT;
BEGIN
  FOREACH _table IN ARRAY public._mig056_target_tables() LOOP
    IF to_regclass('public.' || _table) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN org_id DROP DEFAULT',
      _table
    );
  END LOOP;
END $$;

-- ── 4. ADD CHECK constraint UUID-shape su tutte le 27 tabelle ──────────
-- CHECK rifiuta 'default' (esplicito) e qualunque stringa non-UUID-shape.
-- Pattern: <table>_org_id_uuid_check. DROP IF EXISTS prima del CREATE
-- per garantire idempotency anche se la migration è riapplicata.
DO $$
DECLARE
  _table          TEXT;
  _constraint     TEXT;
  _uuid_regex     TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  FOREACH _table IN ARRAY public._mig056_target_tables() LOOP
    IF to_regclass('public.' || _table) IS NULL THEN
      CONTINUE;
    END IF;
    _constraint := _table || '_org_id_uuid_check';
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      _table, _constraint
    );
    EXECUTE format(
      $sql$ALTER TABLE public.%I ADD CONSTRAINT %I
            CHECK (org_id <> 'default' AND org_id ~* %L)$sql$,
      _table, _constraint, _uuid_regex
    );
  END LOOP;
END $$;

-- ── 5. Cleanup helper temporaneo ───────────────────────────────────────
DROP FUNCTION IF EXISTS public._mig056_target_tables();

-- ── Fine migration 056 ─────────────────────────────────────────────────
-- Verifica post-migration manuale (SQL Editor Supabase):
--   1) Smoke test CHECK:
--      INSERT INTO public.activities (org_id, type, user_name)
--        VALUES ('default', 'test', 'test');
--      → deve fallire con: "new row for relation activities violates check
--         constraint activities_org_id_uuid_check"
--
--   2) Sanity count (deve ritornare 27):
--      SELECT COUNT(*) FROM pg_constraint
--       WHERE conname LIKE '%_org_id_uuid_check';
--
--   3) Sanity defaults (deve ritornare 0):
--      SELECT table_name, column_default
--        FROM information_schema.columns
--       WHERE table_schema='public' AND column_name='org_id'
--         AND column_default IS NOT NULL;
