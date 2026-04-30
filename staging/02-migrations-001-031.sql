-- ============================================================
-- ManuTech Staging Bundle 2/3 — migrations 001..031
-- ============================================================
-- Tutte le migration esistenti pre-Sprint 1, in ordine.
-- Esegui DOPO aver applicato 01-schema-base.sql.
-- ============================================================


-- ─── PRE-MIGRATION FIXUP: drift schema.sql ─────────────────
-- schema.sql (bundle 01) crea maintenance_logs SENZA report_id.
-- Migration 005 lo aggiungerebbe ma usa CREATE TABLE IF NOT EXISTS
-- (no-op se tabella esiste). Aggiungo esplicitamente qui per
-- evitare che CREATE INDEX successivo fallisca.

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- 001_add_media_to_comments.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Migration 001                                    ║
-- ║  Aggiunge colonna `media` alla tabella comments              ║
-- ║                                                              ║
-- ║  Esegui in: Supabase Dashboard → SQL Editor → Run            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Aggiunge supporto media (foto, video, audio) ai commenti chat
-- Formato: JSONB array di { type: 'photo'|'video'|'audio', url: string, name: string }
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS media JSONB DEFAULT NULL;

-- Indice GIN per query su commenti con media (utile per analytics future)
CREATE INDEX IF NOT EXISTS idx_comments_media
ON public.comments USING gin(media)
WHERE media IS NOT NULL;

-- ✅ Migrazione completata


-- ────────────────────────────────────────────────────────────
-- 002_add_sort_order_to_machines.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Migration 002                                    ║
-- ║  Aggiunge colonna sort_order ai macchinari                   ║
-- ║  Per gestire l'ordine nella catena di montaggio              ║
-- ║                                                              ║
-- ║  Esegui in: Supabase Dashboard → SQL Editor → Run            ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.machines
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Inizializza l'ordine dei macchinari esistenti in base alla data di creazione
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.machines
)
UPDATE public.machines m
SET sort_order = r.rn
FROM ranked r
WHERE m.id = r.id;

-- Indice per query ordinate veloci
CREATE INDEX IF NOT EXISTS idx_machines_sort_order
ON public.machines (org_id, sort_order);


-- ────────────────────────────────────────────────────────────
-- 003_chat_reads.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 003 — Chat Reads (tracciamento messaggi letti)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Tabella per tracciare l'ultima lettura di ogni utente per ogni report
CREATE TABLE IF NOT EXISTS public.chat_reads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_id)
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_chat_reads_user ON public.chat_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_reads_report ON public.chat_reads(report_id);

-- RLS
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_reads_select" ON public.chat_reads
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "chat_reads_insert" ON public.chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "chat_reads_update" ON public.chat_reads
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Abilita Realtime sulla tabella comments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
END $$;
-- ────────────────────────────────────────────────────────────
-- 004-enable-realtime.sql
-- ────────────────────────────────────────────────────────────
-- ============================================================
-- Sprint 3.6c: Enable Realtime on notifications + comments
-- ============================================================
-- Run this in Supabase SQL Editor if you already have the schema
-- 
-- This enables Supabase Realtime subscriptions so clients
-- receive instant notifications without polling.

-- Enable Realtime for notifications table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
-- Enable Realtime for comments table (chat)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
END $$;
-- Verify:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';


-- ────────────────────────────────────────────────────────────
-- 004_report_delete_policy.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 004 — Delete policy per reports (solo admin)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE POLICY "reports_delete" ON public.reports
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );


-- ────────────────────────────────────────────────────────────
-- 005_machine_maintenance.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 005 — Scheda Tecnica + Piani Manutenzione + Registro
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Campi tecnici macchinario
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS responsible_user UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Piani di manutenzione programmata
CREATE TABLE IF NOT EXISTS public.maintenance_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency_days  INTEGER NOT NULL,
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  instructions    TEXT,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mplans_machine ON public.maintenance_plans(machine_id);

-- 3. Registro interventi (programmati + straordinari)
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  plan_id         UUID REFERENCES public.maintenance_plans(id) ON DELETE SET NULL,
  report_id       UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'programmata' CHECK (type IN ('programmata', 'straordinaria')),
  title           TEXT NOT NULL,
  description     TEXT,
  performed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  parts_replaced  TEXT,
  media           JSONB DEFAULT '[]'::jsonb,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mlogs_machine ON public.maintenance_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_mlogs_plan ON public.maintenance_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_mlogs_report ON public.maintenance_logs(report_id);

-- 4. RLS
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mplans_select" ON public.maintenance_plans
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mplans_insert" ON public.maintenance_plans
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "mplans_update" ON public.maintenance_plans
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mplans_delete" ON public.maintenance_plans
  FOR DELETE TO authenticated USING (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_select" ON public.maintenance_logs
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mlogs_insert" ON public.maintenance_logs
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "mlogs_update" ON public.maintenance_logs
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mlogs_delete" ON public.maintenance_logs
  FOR DELETE TO authenticated USING (org_id = public.get_my_org_id());

-- 5. Trigger updated_at
DROP TRIGGER IF EXISTS trg_mplans_updated ON public.maintenance_plans;
CREATE TRIGGER trg_mplans_updated
  BEFORE UPDATE ON public.maintenance_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ────────────────────────────────────────────────────────────
-- 006_maintenance_status_workflow.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 006 — Stato workflow manutenzioni programmate
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Stato corrente del ciclo di manutenzione
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'da_eseguire'
  CHECK (current_status IN ('da_eseguire', 'in_corso', 'completata'));

-- Chi ha preso in carico e quando
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS taken_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS taken_by_name TEXT;
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

-- Aggiunge supporto media ai log di manutenzione (foto/file del report)
-- (la colonna media JSONB esiste già dalla migration 005)


-- ────────────────────────────────────────────────────────────
-- 007_push_subscriptions.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 007 — Push Subscriptions + Notification Prefs  ║
-- ║  Web Push per notifiche in background (Android/iOS)       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── PUSH SUBSCRIPTIONS ───────────────────────────────────────
-- Salva le subscription Web Push per ogni utente/dispositivo
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_org  ON public.push_subscriptions(org_id);

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Utenti vedono solo le proprie subscription
CREATE POLICY "push_sub_select" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id());

-- Utenti inseriscono solo per sé stessi
CREATE POLICY "push_sub_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

-- Utenti cancellano solo le proprie
CREATE POLICY "push_sub_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id());

-- Policy per service_role (Edge Function) — accesso completo
-- Le Edge Functions usano la service_role key, che bypassa RLS di default


-- ── NOTIFICATION PREFERENCES ─────────────────────────────────
-- Preferenze notifiche persistite nel DB (migrazione da localStorage)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('operatore', 'tecnico', 'admin')),
  prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_org_default BOOLEAN DEFAULT false,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  -- user_id è NULL per org defaults (is_org_default = true)
  -- user_id è NOT NULL per preferenze personali
  UNIQUE(user_id) -- una riga per utente (preferenze personali)
);

-- Indice per org defaults
CREATE INDEX IF NOT EXISTS idx_notif_prefs_org ON public.notification_preferences(org_id, is_org_default);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON public.notification_preferences(user_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_notif_prefs_updated ON public.notification_preferences;
CREATE TRIGGER trg_notif_prefs_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Tutti vedono i default org della propria org
CREATE POLICY "notif_prefs_select" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      user_id = public.get_my_user_id()
      OR is_org_default = true
    )
  );

-- Utenti inseriscono le proprie preferenze
CREATE POLICY "notif_prefs_insert" ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND (
      (user_id = public.get_my_user_id() AND is_org_default = false)
      OR (is_org_default = true AND public.get_my_role() = 'admin')
    )
  );

-- Utenti aggiornano le proprie, admin aggiorna org defaults
CREATE POLICY "notif_prefs_update" ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      user_id = public.get_my_user_id()
      OR (is_org_default = true AND public.get_my_role() = 'admin')
    )
  );

-- Utenti cancellano solo le proprie preferenze personali
CREATE POLICY "notif_prefs_delete" ON public.notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id() AND is_org_default = false);


-- ────────────────────────────────────────────────────────────
-- 008_push_sub_update_policy.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 008 — Fix: aggiunge UPDATE policy per          ║
-- ║  push_subscriptions (necessaria per upsert)               ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Senza questa policy, l'upsert in savePushSubscription fallisce
-- silenziosamente perché Supabase upsert richiede sia INSERT che UPDATE.
CREATE POLICY "push_sub_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = public.get_my_user_id())
  WITH CHECK (user_id = public.get_my_user_id());


-- ────────────────────────────────────────────────────────────
-- 009_push_notification_trigger.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 009 — Auto Push Notification via pg_net         ║
-- ║                                                            ║
-- ║  Trigger che chiama automaticamente la Edge Function       ║
-- ║  send-push-notification su ogni INSERT nella tabella       ║
-- ║  notifications. Usa pg_net per HTTP asincrono.             ║
-- ║                                                            ║
-- ║  SETUP RICHIESTO (una volta sola):                         ║
-- ║  Dopo aver eseguito questa migration, esegui:              ║
-- ║                                                            ║
-- ║  INSERT INTO public.push_config (key, value) VALUES        ║
-- ║    ('edge_function_url',                                   ║
-- ║     'https://<PROJECT_REF>.supabase.co/functions/v1/'      ║
-- ║     'send-push-notification'),                             ║
-- ║    ('service_role_key', '<LA_TUA_SERVICE_ROLE_KEY>')        ║
-- ║  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;   ║
-- ║                                                            ║
-- ║  Trova la service_role_key in:                              ║
-- ║  Supabase Dashboard → Settings → API → service_role        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Abilita pg_net (disponibile su Supabase hosted)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Tabella config per URL e chiave ─────────────────────────
CREATE TABLE IF NOT EXISTS public.push_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Solo service_role può leggere (trigger usa SECURITY DEFINER)
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;

-- Admin può gestire la config
CREATE POLICY "push_config_admin" ON public.push_config
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');


-- ── Funzione trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_notification()
RETURNS TRIGGER AS $$
DECLARE
  fn_url TEXT;
  fn_key TEXT;
  payload JSONB;
BEGIN
  -- Leggi config
  SELECT value INTO fn_url FROM public.push_config WHERE key = 'edge_function_url';
  SELECT value INTO fn_key FROM public.push_config WHERE key = 'service_role_key';

  -- Se manca la config, skip silenzioso (non blocca INSERT)
  IF fn_url IS NULL OR fn_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Payload formato Database Webhook standard
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'notifications',
    'schema', 'public',
    'record', row_to_json(NEW)::jsonb
  );

  -- Invia HTTP POST asincrono (non-blocking, non rallenta INSERT)
  PERFORM net.http_post(
    url     := fn_url,
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || fn_key
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Mai bloccare l'INSERT per errori push
  RAISE WARNING '[Push Trigger] Errore: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_push_on_new_notification ON public.notifications;
CREATE TRIGGER trg_push_on_new_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_notification();


-- ────────────────────────────────────────────────────────────
-- 010_email_notification.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 010 — Email Notifications via Resend            ║
-- ║                                                            ║
-- ║  Estende il trigger handle_new_notification() per chiamare ║
-- ║  anche la Edge Function send-email-notification.           ║
-- ║                                                            ║
-- ║  SETUP RICHIESTO (una volta sola):                         ║
-- ║  INSERT INTO public.push_config (key, value) VALUES        ║
-- ║    ('email_function_url',                                  ║
-- ║     'https://<PROJECT_REF>.supabase.co/functions/v1/'      ║
-- ║     'send-email-notification')                             ║
-- ║  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;   ║
-- ║                                                            ║
-- ║  Secrets Edge Function (Supabase Dashboard):               ║
-- ║    RESEND_API_KEY — chiave API Resend                      ║
-- ║    EMAIL_FROM     — es. "ManuTech <notifiche@manutech.it>" ║
-- ║    APP_URL        — es. "https://app.manutech.it"          ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Aggiorna la funzione trigger per inviare anche email
CREATE OR REPLACE FUNCTION public.handle_new_notification()
RETURNS TRIGGER AS $$
DECLARE
  fn_url TEXT;
  email_url TEXT;
  fn_key TEXT;
  payload JSONB;
BEGIN
  -- Leggi config
  SELECT value INTO fn_url FROM public.push_config WHERE key = 'edge_function_url';
  SELECT value INTO email_url FROM public.push_config WHERE key = 'email_function_url';
  SELECT value INTO fn_key FROM public.push_config WHERE key = 'service_role_key';

  -- Se manca la chiave, skip tutto
  IF fn_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Payload formato Database Webhook standard
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'notifications',
    'schema', 'public',
    'record', row_to_json(NEW)::jsonb
  );

  -- Invia Push notification (se configurato)
  IF fn_url IS NOT NULL THEN
    PERFORM net.http_post(
      url     := fn_url,
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || fn_key
      )
    );
  END IF;

  -- Invia Email notification (se configurato)
  IF email_url IS NOT NULL THEN
    PERFORM net.http_post(
      url     := email_url,
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || fn_key
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Mai bloccare l'INSERT per errori di notifica
  RAISE WARNING '[Notification Trigger] Errore: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 011_weekly_digest_cron.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 011 — Weekly Digest via pg_cron                 ║
-- ║                                                            ║
-- ║  Schedula l'invio del riepilogo settimanale ogni lunedì    ║
-- ║  alle 7:00 UTC (8:00 CET / 9:00 CEST).                    ║
-- ║                                                            ║
-- ║  SETUP RICHIESTO (una volta sola):                         ║
-- ║  INSERT INTO public.push_config (key, value) VALUES        ║
-- ║    ('digest_function_url',                                 ║
-- ║     'https://<PROJECT_REF>.supabase.co/functions/v1/'      ║
-- ║     'send-weekly-digest')                                  ║
-- ║  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;   ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Abilita pg_cron (disponibile su Supabase Pro e superiori)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Funzione helper che chiama la Edge Function digest
CREATE OR REPLACE FUNCTION public.trigger_weekly_digest()
RETURNS void AS $$
DECLARE
  digest_url TEXT;
  fn_key TEXT;
BEGIN
  SELECT value INTO digest_url FROM public.push_config WHERE key = 'digest_function_url';
  SELECT value INTO fn_key FROM public.push_config WHERE key = 'service_role_key';

  IF digest_url IS NULL OR fn_key IS NULL THEN
    RAISE NOTICE '[Digest Cron] URL o chiave mancante, skip';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := digest_url,
    body    := '{}'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || fn_key
    )
  );

  RAISE NOTICE '[Digest Cron] Richiesta inviata a %', digest_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedula: ogni lunedì alle 7:00 UTC (= 8:00 CET)
-- Sintassi cron: minuto ora giorno_mese mese giorno_settimana
-- 0 7 * * 1 = ogni lunedì alle 7:00 UTC
SELECT cron.schedule(
  'weekly-digest',
  '0 7 * * 1',
  $$SELECT public.trigger_weekly_digest()$$
);


-- ────────────────────────────────────────────────────────────
-- 012_phase1_gaps.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 012: Phase 1 Gap Fix                            ║
-- ║  - Campi macchina (model, serial, manufacturer, year)      ║
-- ║  - Stato "dismessa" + criticità macchina                   ║
-- ║  - Tipo ticket + nuovi stati + campi chiusura              ║
-- ║  - Tabelle mancanti nello schema                           ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── MACHINES: nuovi campi + stato dismessa ──
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS criticality TEXT DEFAULT 'media';

-- Aggiorna CHECK per includere 'dismessa'
ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_status_check;
ALTER TABLE public.machines ADD CONSTRAINT machines_status_check
  CHECK (status IN ('attivo', 'in_manutenzione', 'fuori_servizio', 'dismessa'));

ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_criticality_check;
ALTER TABLE public.machines ADD CONSTRAINT machines_criticality_check
  CHECK (criticality IN ('alta', 'media', 'bassa'));

-- ── REPORTS: tipo ticket + nuovi stati + campi chiusura ──
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'correttiva',
  ADD COLUMN IF NOT EXISTS closure_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS closure_parts TEXT,
  ADD COLUMN IF NOT EXISTS closure_root_cause TEXT,
  ADD COLUMN IF NOT EXISTS closure_action TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Aggiorna CHECK status per includere nuovi stati
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_type_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_type_check
  CHECK (type IN ('correttiva', 'preventiva', 'migliorativa', 'ispezione'));

-- Indice per il nuovo campo type
CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(type);


-- ────────────────────────────────────────────────────────────
-- 013_add_type_to_reports.sql
-- ────────────────────────────────────────────────────────────
-- Aggiunge la colonna 'type' alla tabella reports per il tipo di intervento
-- (correttiva, preventiva, migliorativa, ispezione)
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'correttiva'
  CHECK (type IN ('correttiva', 'preventiva', 'migliorativa', 'ispezione'));


-- ────────────────────────────────────────────────────────────
-- 014_resolve_profile_rpc.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RPC: resolve_my_profile
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Gestisce il recupero/linking profilo al login, bypassando RLS.
-- Scenari:
--   1. Profilo trovato per auth_id → restituisce
--   2. Profilo trovato per email ma auth_id mancante → linka e restituisce
--   3. Nessun profilo → crea automaticamente e restituisce

CREATE OR REPLACE FUNCTION public.resolve_my_profile()
RETURNS JSONB AS $$
DECLARE
  _auth_id UUID := auth.uid();
  _email   TEXT;
  _result  JSONB;
BEGIN
  -- Recupera email dall'utente auth
  SELECT email INTO _email FROM auth.users WHERE id = _auth_id;
  IF _email IS NULL THEN
    RAISE EXCEPTION 'Utente auth non trovato';
  END IF;

  -- 1. Cerca per auth_id
  SELECT to_jsonb(u.*) INTO _result
    FROM public.users u WHERE u.auth_id = _auth_id LIMIT 1;
  IF _result IS NOT NULL THEN
    RETURN _result;
  END IF;

  -- 2. Cerca per email e linka auth_id
  UPDATE public.users
    SET auth_id = _auth_id, updated_at = now()
    WHERE email = _email AND (auth_id IS NULL OR auth_id != _auth_id)
    RETURNING to_jsonb(users.*) INTO _result;
  IF _result IS NOT NULL THEN
    RETURN _result;
  END IF;

  -- 3. Crea profilo da metadati auth
  INSERT INTO public.users (auth_id, email, name, role, org_id)
    SELECT
      _auth_id,
      _email,
      COALESCE(raw_user_meta_data->>'name', split_part(_email, '@', 1)),
      COALESCE(raw_user_meta_data->>'role', 'operatore'),
      COALESCE(raw_user_meta_data->>'org_id', 'default')
    FROM auth.users WHERE id = _auth_id
    RETURNING to_jsonb(users.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 015_fix_reports_status_check.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 015: Fix reports_status_check constraint        ║
-- ║                                                            ║
-- ║  Il CHECK constraint originale potrebbe non includere      ║
-- ║  gli stati 'in_attesa_ricambi' e 'chiuso', causando       ║
-- ║  errore quando un tecnico aggiorna lo stato.               ║
-- ║  Questa migration ricrea il constraint con tutti gli stati.║
-- ╚══════════════════════════════════════════════════════════════╝

-- Drop qualsiasi constraint esistente sullo status
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;

-- Ricrea con TUTTI gli stati validi
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso'));


-- ────────────────────────────────────────────────────────────
-- 016_direct_messages.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Migrazione 016: Chat Diretta (DM)             ║
-- ║  Tabelle: conversations, direct_messages, dm_reads         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── CONVERSATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at   TIMESTAMPTZ,
  last_message_by   UUID REFERENCES public.users(id),
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(participant_1, participant_2)
);

-- ── DIRECT MESSAGES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.users(id),
  sender_name     TEXT,
  sender_role     TEXT,
  text            TEXT NOT NULL,
  media           JSONB DEFAULT NULL,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── DM READS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conv_p1        ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conv_p2        ON public.conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_conv_org       ON public.conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg  ON public.conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_conversation ON public.direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_created      ON public.direct_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_org          ON public.direct_messages(org_id);

CREATE INDEX IF NOT EXISTS idx_dm_reads_user   ON public.dm_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_reads_conv   ON public.dm_reads(conversation_id);

-- ── TRIGGER updated_at ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_conv_updated ON public.conversations;
CREATE TRIGGER trg_conv_updated
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_reads ENABLE ROW LEVEL SECURITY;

-- Conversations: solo partecipanti nella stessa org
CREATE POLICY "conv_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id())
  );

CREATE POLICY "conv_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id())
  );

CREATE POLICY "conv_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id())
  );

-- Direct messages: solo partecipanti della conversazione
CREATE POLICY "dm_select" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1 = public.get_my_user_id() OR participant_2 = public.get_my_user_id()
    )
  );

CREATE POLICY "dm_insert" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND sender_id = public.get_my_user_id()
  );

-- DM reads: solo le proprie
CREATE POLICY "dm_reads_select" ON public.dm_reads
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id());

CREATE POLICY "dm_reads_upsert" ON public.dm_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id());

CREATE POLICY "dm_reads_update" ON public.dm_reads
  FOR UPDATE TO authenticated
  USING (user_id = public.get_my_user_id());

-- ── REALTIME ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
END $$;
-- ────────────────────────────────────────────────────────────
-- 017_fix_maintenance_plans_rls.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 017: Fix RLS maintenance_plans — ricrea policies + RPC insert
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Problema: la INSERT fallisce con "violates row-level security policy"
-- perché le policy potrebbero essere in stato inconsistente (migration 005
-- vs schema.sql). Questa migration:
-- 1. Ricrea le policies in modo pulito
-- 2. Aggiunge un RPC SECURITY DEFINER come fallback sicuro

-- ── 1. Ricrea policies in modo pulito ──
DROP POLICY IF EXISTS "mplans_select" ON public.maintenance_plans;
DROP POLICY IF EXISTS "mplans_insert" ON public.maintenance_plans;
DROP POLICY IF EXISTS "mplans_update" ON public.maintenance_plans;
DROP POLICY IF EXISTS "mplans_delete" ON public.maintenance_plans;

ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mplans_select" ON public.maintenance_plans
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "mplans_insert" ON public.maintenance_plans
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mplans_update" ON public.maintenance_plans
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mplans_delete" ON public.maintenance_plans
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── 2. RPC SECURITY DEFINER per insert piano ──
-- Bypassa RLS, inietta org_id e role dal server
CREATE OR REPLACE FUNCTION public.create_maintenance_plan(
  _machine_id UUID,
  _name TEXT,
  _frequency_days INTEGER DEFAULT 30,
  _assigned_to UUID DEFAULT NULL,
  _assigned_to_name TEXT DEFAULT NULL,
  _instructions TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _result JSONB;
BEGIN
  -- Recupera org_id e role dell'utente corrente
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  -- Verifica permessi
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  -- Inserisci piano
  INSERT INTO public.maintenance_plans (
    machine_id, name, frequency_days, assigned_to, assigned_to_name, instructions, org_id
  ) VALUES (
    _machine_id, _name, _frequency_days, _assigned_to, _assigned_to_name, _instructions, _org_id
  )
  RETURNING to_jsonb(maintenance_plans.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 018_manucoin_wallet.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 018: ManuCoin — Wallet token + catalogo premi
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── Configurazione token per organizzazione ──
CREATE TABLE IF NOT EXISTS public.token_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL DEFAULT 'default',
  token_name  TEXT NOT NULL DEFAULT 'ManuCoin',
  token_symbol TEXT NOT NULL DEFAULT 'MC',
  token_value_eur NUMERIC(10,4) NOT NULL DEFAULT 0.50,
  monthly_budget NUMERIC(10,2) DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);

-- ── Registro transazioni token (immutabile) ──
CREATE TABLE IF NOT EXISTS public.token_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   TEXT,
  type        TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'bonus', 'refund')),
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  reason_code TEXT,
  reference_id TEXT,
  balance_after INTEGER NOT NULL DEFAULT 0,
  hash        TEXT,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user ON public.token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_org ON public.token_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_created ON public.token_transactions(created_at DESC);

-- ── Catalogo premi ──
CREATE TABLE IF NOT EXISTS public.reward_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  cost        INTEGER NOT NULL,
  category    TEXT NOT NULL DEFAULT 'altro'
              CHECK (category IN ('buono', 'tempo_libero', 'gadget', 'formazione', 'altro')),
  icon        TEXT DEFAULT '🎁',
  image_url   TEXT,
  stock       INTEGER DEFAULT NULL,
  active      BOOLEAN DEFAULT true,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_catalog_org ON public.reward_catalog(org_id);

-- ── Riscatti premi ──
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   TEXT,
  reward_id   UUID NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  reward_name TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'delivered', 'rejected')),
  admin_note  TEXT,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_org ON public.reward_redemptions(org_id);

-- ── RLS ──
ALTER TABLE public.token_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- token_config: admin read/write, altri read
CREATE POLICY "tc_select" ON public.token_config
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "tc_insert" ON public.token_config
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "tc_update" ON public.token_config
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- token_transactions: tutti vedono le proprie, admin vede tutte dell'org
CREATE POLICY "tt_select_own" ON public.token_transactions
  FOR SELECT TO authenticated USING (
    org_id = public.get_my_org_id() AND (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
      OR public.get_my_role() = 'admin'
    )
  );

-- reward_catalog: tutti leggono, admin gestisce
CREATE POLICY "rc_select" ON public.reward_catalog
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "rc_insert" ON public.reward_catalog
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "rc_update" ON public.reward_catalog
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "rc_delete" ON public.reward_catalog
  FOR DELETE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- reward_redemptions: proprie + admin tutte
CREATE POLICY "rr_select" ON public.reward_redemptions
  FOR SELECT TO authenticated USING (
    org_id = public.get_my_org_id() AND (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
      OR public.get_my_role() = 'admin'
    )
  );
CREATE POLICY "rr_insert" ON public.reward_redemptions
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "rr_update" ON public.reward_redemptions
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── RPC: accredita token (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION public.credit_tokens(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _reason_code TEXT DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _type TEXT DEFAULT 'earn'
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _user_name TEXT;
  _current_balance INTEGER;
  _new_balance INTEGER;
  _hash TEXT;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role != 'admin' AND _type != 'earn' THEN RAISE EXCEPTION 'Solo admin può accreditare token'; END IF;

  SELECT name INTO _user_name FROM public.users WHERE id = _user_id;

  -- Calcola saldo corrente
  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _current_balance
    FROM public.token_transactions WHERE user_id = _user_id;

  _new_balance := _current_balance + _amount;
  _hash := encode(digest(_user_id::text || _amount::text || _reason || now()::text, 'sha256'), 'hex');

  INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
  VALUES (_user_id, _user_name, _type, _amount, _reason, _reason_code, _reference_id, _new_balance, _hash, _org_id)
  RETURNING to_jsonb(token_transactions.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: riscatta premio (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION public.redeem_reward(
  _reward_id UUID
)
RETURNS JSONB AS $$
DECLARE
  _user_id UUID;
  _user_name TEXT;
  _org_id TEXT;
  _reward RECORD;
  _balance INTEGER;
  _new_balance INTEGER;
  _hash TEXT;
  _redemption JSONB;
BEGIN
  SELECT id, name, org_id INTO _user_id, _user_name, _org_id
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _user_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  SELECT * INTO _reward FROM public.reward_catalog WHERE id = _reward_id AND active = true;
  IF _reward IS NULL THEN RAISE EXCEPTION 'Premio non disponibile'; END IF;
  IF _reward.stock IS NOT NULL AND _reward.stock <= 0 THEN RAISE EXCEPTION 'Premio esaurito'; END IF;

  -- Calcola saldo
  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _balance
    FROM public.token_transactions WHERE user_id = _user_id;

  IF _balance < _reward.cost THEN RAISE EXCEPTION 'Saldo insufficiente: % MC disponibili, % MC richiesti', _balance, _reward.cost; END IF;

  _new_balance := _balance - _reward.cost;
  _hash := encode(digest(_user_id::text || _reward.cost::text || 'redeem' || now()::text, 'sha256'), 'hex');

  -- Registra transazione
  INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
  VALUES (_user_id, _user_name, 'spend', _reward.cost, 'Riscatto: ' || _reward.name, 'reward_redeem', _reward_id::text, _new_balance, _hash, _org_id);

  -- Registra riscatto
  INSERT INTO public.reward_redemptions (user_id, user_name, reward_id, reward_name, cost, org_id)
  VALUES (_user_id, _user_name, _reward_id, _reward.name, _reward.cost, _org_id)
  RETURNING to_jsonb(reward_redemptions.*) INTO _redemption;

  -- Decrementa stock se limitato
  IF _reward.stock IS NOT NULL THEN
    UPDATE public.reward_catalog SET stock = stock - 1 WHERE id = _reward_id;
  END IF;

  RETURN _redemption;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: saldo utente ──
CREATE OR REPLACE FUNCTION public.get_token_balance(_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  _uid UUID;
  _balance INTEGER;
BEGIN
  IF _user_id IS NOT NULL THEN
    _uid := _user_id;
  ELSE
    SELECT id INTO _uid FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _balance
    FROM public.token_transactions WHERE user_id = _uid;

  RETURN _balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ────────────────────────────────────────────────────────────
-- 019_add_closed_at_to_reports.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 019: Aggiunge colonna closed_at alla tabella reports
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Errore: "Could not find the 'closed_at' column of 'reports' in the schema cache"
-- La colonna è usata nel codice per chiusura intervento ma non esiste nel DB live.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_hours NUMERIC;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_parts TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_root_cause TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS closure_action TEXT;


-- ────────────────────────────────────────────────────────────
-- 020_fix_maintenance_logs_rls.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 020: Fix RLS maintenance_logs — ricrea policies + RPC insert
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Problema: la INSERT fallisce con "violates row-level security policy"
-- Soluzione: RPC SECURITY DEFINER che inietta org_id dal server

-- ── 1. Ricrea policies in modo pulito ──
DROP POLICY IF EXISTS "mlogs_select" ON public.maintenance_logs;
DROP POLICY IF EXISTS "mlogs_insert" ON public.maintenance_logs;
DROP POLICY IF EXISTS "mlogs_update" ON public.maintenance_logs;
DROP POLICY IF EXISTS "mlogs_delete" ON public.maintenance_logs;

ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mlogs_select" ON public.maintenance_logs
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_insert" ON public.maintenance_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_update" ON public.maintenance_logs
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mlogs_delete" ON public.maintenance_logs
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── 2. RPC SECURITY DEFINER per insert log ──
-- Bypassa RLS, inietta org_id e performed_by dal server
CREATE OR REPLACE FUNCTION public.create_maintenance_log(
  _machine_id UUID,
  _title TEXT,
  _plan_id UUID DEFAULT NULL,
  _report_id UUID DEFAULT NULL,
  _type TEXT DEFAULT 'programmata',
  _description TEXT DEFAULT NULL,
  _performed_by_name TEXT DEFAULT NULL,
  _duration_minutes INTEGER DEFAULT NULL,
  _parts_replaced TEXT DEFAULT NULL,
  _performed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _user_id UUID;
  _result JSONB;
BEGIN
  -- Recupera org_id, role e user_id dell'utente corrente
  SELECT id, org_id, role INTO _user_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  -- Verifica permessi
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  -- Inserisci log
  INSERT INTO public.maintenance_logs (
    machine_id, plan_id, report_id, type, title, description,
    performed_by, performed_by_name, duration_minutes, parts_replaced,
    performed_at, org_id
  ) VALUES (
    _machine_id, _plan_id, _report_id, _type, _title, _description,
    _user_id, _performed_by_name, _duration_minutes, _parts_replaced,
    _performed_at, _org_id
  )
  RETURNING to_jsonb(maintenance_logs.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 021_machine_components.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 021: Componenti Macchina — Sotto-macchinari a 2 livelli
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.machine_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT DEFAULT NULL,
  serial_number   TEXT DEFAULT NULL,
  manufacturer    TEXT DEFAULT NULL,
  model           TEXT DEFAULT NULL,
  year            INTEGER DEFAULT NULL,
  photo_url       TEXT DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  sort_order      INTEGER DEFAULT 0,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_components_machine ON public.machine_components(machine_id);
CREATE INDEX idx_components_org ON public.machine_components(org_id);

-- RLS
ALTER TABLE public.machine_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_select" ON public.machine_components
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "comp_insert" ON public.machine_components
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "comp_update" ON public.machine_components
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "comp_delete" ON public.machine_components
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── Aggiorna reports: campo component_id opzionale ──
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS component_id UUID DEFAULT NULL
  REFERENCES public.machine_components(id) ON DELETE SET NULL;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS component_name TEXT DEFAULT NULL;

-- ── RPC per insert sicuro ──
CREATE OR REPLACE FUNCTION public.create_machine_component(
  _machine_id UUID,
  _name TEXT,
  _type TEXT DEFAULT NULL,
  _serial_number TEXT DEFAULT NULL,
  _manufacturer TEXT DEFAULT NULL,
  _model TEXT DEFAULT NULL,
  _year INTEGER DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role != 'admin' THEN RAISE EXCEPTION 'Solo admin può creare componenti'; END IF;

  INSERT INTO public.machine_components (machine_id, name, type, serial_number, manufacturer, model, year, notes, org_id)
  VALUES (_machine_id, _name, _type, _serial_number, _manufacturer, _model, _year, _notes, _org_id)
  RETURNING to_jsonb(machine_components.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 022_spare_parts.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 022: Ricambi — Magazzino + Ordini collegati ai report
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── Catalogo Ricambi ──
CREATE TABLE IF NOT EXISTS public.spare_parts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  code            TEXT DEFAULT NULL,
  manufacturer    TEXT DEFAULT NULL,
  unit_cost       NUMERIC(10,2) DEFAULT 0,
  stock_qty       INTEGER NOT NULL DEFAULT 0,
  min_stock       INTEGER NOT NULL DEFAULT 0,
  location        TEXT DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  photo_url       TEXT DEFAULT NULL,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_spare_parts_org ON public.spare_parts(org_id);

-- ── Compatibilità ricambio → macchina/componente ──
CREATE TABLE IF NOT EXISTS public.spare_part_compatibility (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id   UUID NOT NULL REFERENCES public.spare_parts(id) ON DELETE CASCADE,
  machine_id      UUID REFERENCES public.machines(id) ON DELETE CASCADE,
  component_id    UUID REFERENCES public.machine_components(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT at_least_one CHECK (machine_id IS NOT NULL OR component_id IS NOT NULL)
);

CREATE INDEX idx_spc_spare ON public.spare_part_compatibility(spare_part_id);
CREATE INDEX idx_spc_machine ON public.spare_part_compatibility(machine_id);
CREATE INDEX idx_spc_component ON public.spare_part_compatibility(component_id);

-- ── Ordini Ricambi ──
CREATE TABLE IF NOT EXISTS public.spare_part_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id   UUID REFERENCES public.spare_parts(id) ON DELETE SET NULL,
  spare_part_name TEXT NOT NULL,
  report_id       UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  machine_id      UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  component_id    UUID REFERENCES public.machine_components(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_cost       NUMERIC(10,2) DEFAULT 0,
  supplier        TEXT DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'ordinato',
  ordered_at      TIMESTAMPTZ DEFAULT now(),
  expected_at     TIMESTAMPTZ DEFAULT NULL,
  received_at     TIMESTAMPTZ DEFAULT NULL,
  installed_at    TIMESTAMPTZ DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  ordered_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_spo_org ON public.spare_part_orders(org_id);
CREATE INDEX idx_spo_report ON public.spare_part_orders(report_id);
CREATE INDEX idx_spo_status ON public.spare_part_orders(status);
CREATE INDEX idx_spo_spare ON public.spare_part_orders(spare_part_id);

-- ── RLS per tutte le tabelle ──
ALTER TABLE public.spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part_orders ENABLE ROW LEVEL SECURITY;

-- spare_parts
CREATE POLICY "sp_select" ON public.spare_parts
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "sp_insert" ON public.spare_parts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "sp_update" ON public.spare_parts
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "sp_delete" ON public.spare_parts
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- spare_part_compatibility
CREATE POLICY "spc_select" ON public.spare_part_compatibility
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "spc_insert" ON public.spare_part_compatibility
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "spc_delete" ON public.spare_part_compatibility
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- spare_part_orders (tecnici possono vedere, admin può tutto)
CREATE POLICY "spo_select" ON public.spare_part_orders
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "spo_insert" ON public.spare_part_orders
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "spo_update" ON public.spare_part_orders
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "spo_delete" ON public.spare_part_orders
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── RPC: registra arrivo ricambio (aggiorna stock + notifica) ──
CREATE OR REPLACE FUNCTION public.receive_spare_part_order(
  _order_id UUID
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _order RECORD;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role != 'admin' THEN RAISE EXCEPTION 'Solo admin può ricevere ordini'; END IF;

  -- Aggiorna ordine
  UPDATE public.spare_part_orders
    SET status = 'ricevuto', received_at = now(), updated_at = now()
    WHERE id = _order_id AND org_id = _org_id
    RETURNING * INTO _order;

  IF _order IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;

  -- Aggiorna stock
  IF _order.spare_part_id IS NOT NULL THEN
    UPDATE public.spare_parts
      SET stock_qty = stock_qty + _order.quantity, updated_at = now()
      WHERE id = _order.spare_part_id;
  END IF;

  -- Se collegato a un report, aggiorna stato report
  IF _order.report_id IS NOT NULL THEN
    UPDATE public.reports
      SET status = 'in_lavorazione', updated_at = now()
      WHERE id = _order.report_id AND status = 'in_attesa_ricambi';
  END IF;

  SELECT to_jsonb(_order) INTO _result;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 023_areas.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 023: Aree Impianto — Macro-zone per organizzare macchinari
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#7c6aff',
  sort_order  INTEGER DEFAULT 0,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_areas_org ON public.areas(org_id);

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_select" ON public.areas
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "areas_insert" ON public.areas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "areas_update" ON public.areas
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "areas_delete" ON public.areas
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── Aggiunge area_id alle macchine ──
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS area_id UUID DEFAULT NULL
  REFERENCES public.areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_machines_area ON public.machines(area_id);


-- ────────────────────────────────────────────────────────────
-- 024_maintenance_log_component.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 024: Aggiunge component_id a maintenance_logs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Permette di associare un intervento a un componente specifico
-- del macchinario (se presente).

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS component_id UUID REFERENCES public.machine_components(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- 025_machine_instructions.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 025: Aggiunge campi istruzioni ai macchinari
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Permette di salvare istruzioni d'uso e di manutenzione
-- direttamente sulla scheda del macchinario.

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS usage_instructions TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_instructions TEXT;


-- ────────────────────────────────────────────────────────────
-- 026_assistant_bot.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 026: Assistente AI per tecnici (RAG + Claude)    ║
-- ║  - Tabelle assistant_conversations + assistant_messages     ║
-- ║  - Indice FTS italiano su reports (title+desc+closure_*)    ║
-- ║  - RPC search_similar_reports per retrieval                 ║
-- ║  - RPC count_assistant_messages_last_hour per rate limit    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ────────────────────────────────────────────────────────────────
-- 1. FULL-TEXT SEARCH SU REPORTS (ricerca semantica "lite")
-- ────────────────────────────────────────────────────────────────
-- Colonna generata con tsvector italiano che indicizza:
-- titolo + descrizione + causa radice + azione risolutiva.
-- Quest'ultimi due sono oro: contengono il know-how del tecnico.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('italian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('italian', coalesce(closure_root_cause, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(closure_action, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(closure_parts, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_reports_search_vector
  ON public.reports USING gin(search_vector);

-- ────────────────────────────────────────────────────────────────
-- 2. RPC: search_similar_reports
-- ────────────────────────────────────────────────────────────────
-- Ricerca top-N report RISOLTI o CHIUSI simili alla query utente,
-- filtrati per org (tramite get_my_org_id) e opzionalmente per macchina.
-- SECURITY DEFINER perché deve leggere report chiusi indipendentemente
-- da eventuali policy più restrittive dell'utente chiamante.

CREATE OR REPLACE FUNCTION public.search_similar_reports(
  query_text TEXT,
  p_limit INTEGER DEFAULT 5,
  p_machine_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  type TEXT,
  machine_id UUID,
  closure_root_cause TEXT,
  closure_action TEXT,
  closure_parts TEXT,
  closure_hours NUMERIC,
  closed_at TIMESTAMPTZ,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_query tsquery;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- websearch_to_tsquery gestisce input "naturale" senza operatori
  v_query := websearch_to_tsquery('italian', coalesce(query_text, ''));
  IF v_query IS NULL OR v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.description,
    r.severity,
    r.type,
    r.machine_id,
    r.closure_root_cause,
    r.closure_action,
    r.closure_parts,
    r.closure_hours,
    r.closed_at,
    ts_rank(r.search_vector, v_query) AS similarity
  FROM public.reports r
  WHERE r.org_id = v_org_id
    AND r.status IN ('risolta', 'chiuso')
    AND r.search_vector @@ v_query
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
    -- include solo report con almeno un campo di chiusura valorizzato
    AND (r.closure_root_cause IS NOT NULL OR r.closure_action IS NOT NULL)
  ORDER BY similarity DESC, r.closed_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_similar_reports(TEXT, INTEGER, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3. TABELLA assistant_conversations
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL DEFAULT 'Nuova conversazione',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conv_user
  ON public.assistant_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conv_org
  ON public.assistant_conversations(org_id);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

-- L'utente vede solo le proprie conversazioni nella propria org
CREATE POLICY assistant_conv_select ON public.assistant_conversations
  FOR SELECT TO authenticated
  USING (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

CREATE POLICY assistant_conv_insert ON public.assistant_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

CREATE POLICY assistant_conv_update ON public.assistant_conversations
  FOR UPDATE TO authenticated
  USING (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

CREATE POLICY assistant_conv_delete ON public.assistant_conversations
  FOR DELETE TO authenticated
  USING (user_id = public.get_my_user_id() AND org_id = public.get_my_org_id());

-- ────────────────────────────────────────────────────────────────
-- 4. TABELLA assistant_messages
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,   -- [{report_id, title, similarity}]
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_msg_conv
  ON public.assistant_messages(conversation_id, created_at);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

-- L'utente vede solo i messaggi delle proprie conversazioni
CREATE POLICY assistant_msg_select ON public.assistant_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = public.get_my_user_id()
    )
  );

CREATE POLICY assistant_msg_insert ON public.assistant_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = public.get_my_user_id()
    )
  );

-- ────────────────────────────────────────────────────────────────
-- 5. RPC: count_assistant_messages_last_hour (rate limit)
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_assistant_messages_last_hour()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := public.get_my_user_id();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.assistant_messages m
  JOIN public.assistant_conversations c ON c.id = m.conversation_id
  WHERE c.user_id = v_user_id
    AND m.role = 'user'
    AND m.created_at > NOW() - INTERVAL '1 hour';

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_assistant_messages_last_hour() TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 6. Trigger: aggiorna updated_at su conversations
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bump_assistant_conv_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.assistant_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assistant_msg_bump_conv ON public.assistant_messages;
CREATE TRIGGER trg_assistant_msg_bump_conv
  AFTER INSERT ON public.assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_assistant_conv_updated_at();


-- ────────────────────────────────────────────────────────────
-- 027_assistant_context_expansion.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 027: Espansione contesto Assistente AI            ║
-- ║                                                                ║
-- ║  Aggiunge nuove fonti dati per l'edge function assistant-chat ║
-- ║  così che l'AI possa rispondere anche a domande meta          ║
-- ║  ("quale macchinario ha più segnalazioni?") e guidare         ║
-- ║  l'operatore con visibilità su report aperti, storia macchina ║
-- ║  e ricambi ricorrenti.                                        ║
-- ║                                                                ║
-- ║  Nuove RPC (tutte SECURITY DEFINER, filtrate per org):        ║
-- ║   - get_assistant_org_stats()                                 ║
-- ║   - get_open_reports_snapshot(p_machine_id)                   ║
-- ║   - get_machine_history(p_machine_id)                         ║
-- ║   - search_similar_reports(..., p_include_open) [extended]    ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────
-- 1. RPC: get_assistant_org_stats
-- ────────────────────────────────────────────────────────────────
-- Aggrega statistiche di organizzazione utili all'assistente:
--   - totali (report, aperti, risolti %, critici aperti, ultimi 30gg)
--   - top 10 macchinari per numero di segnalazioni con breakdown
-- Ritorna un singolo JSONB facile da consumare lato edge function.

CREATE OR REPLACE FUNCTION public.get_assistant_org_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_totals JSONB;
  v_top_machines JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('totals', NULL, 'top_machines', '[]'::jsonb);
  END IF;

  -- Totali organizzazione
  SELECT jsonb_build_object(
    'reports_total', COUNT(*),
    'reports_open', COUNT(*) FILTER (WHERE status NOT IN ('risolta', 'chiuso')),
    'reports_resolved', COUNT(*) FILTER (WHERE status IN ('risolta', 'chiuso')),
    'resolved_pct', CASE WHEN COUNT(*) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('risolta', 'chiuso')) / COUNT(*))
        ELSE 0 END,
    'critical_open', COUNT(*) FILTER (WHERE severity = 'critica' AND status NOT IN ('risolta', 'chiuso')),
    'reports_last_30d', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')
  ) INTO v_totals
  FROM public.reports
  WHERE org_id = v_org_id;

  -- Top macchinari per numero di report (usa campo denormalizzato `machine`,
  -- stesso pattern di useKPIStats hook)
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.total DESC), '[]'::jsonb)
  INTO v_top_machines
  FROM (
    SELECT
      r.machine AS name,
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE r.status = 'aperta')::INTEGER AS open,
      COUNT(*) FILTER (WHERE r.status = 'assegnata')::INTEGER AS assigned,
      COUNT(*) FILTER (WHERE r.status = 'in_lavorazione')::INTEGER AS in_progress,
      COUNT(*) FILTER (WHERE r.status = 'in_attesa_ricambi')::INTEGER AS awaiting_parts,
      COUNT(*) FILTER (WHERE r.status IN ('risolta', 'chiuso'))::INTEGER AS resolved,
      COUNT(*) FILTER (WHERE r.severity = 'critica' AND r.status NOT IN ('risolta', 'chiuso'))::INTEGER AS critical_open,
      to_char(MAX(r.created_at), 'DD/MM/YYYY') AS last_report_at
    FROM public.reports r
    WHERE r.org_id = v_org_id
      AND r.machine IS NOT NULL
      AND r.machine <> ''
    GROUP BY r.machine
    ORDER BY total DESC
    LIMIT 10
  ) m;

  RETURN jsonb_build_object(
    'totals', v_totals,
    'top_machines', v_top_machines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_org_stats() TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2. RPC: get_open_reports_snapshot
-- ────────────────────────────────────────────────────────────────
-- Snapshot dei report attualmente aperti.
-- Se p_machine_id è valorizzato, filtra solo per quella macchina (max 20).
-- Altrimenti restituisce i 20 più critici/più vecchi a livello org.
-- Severità ordinata: critica > alta > media > bassa.

CREATE OR REPLACE FUNCTION public.get_open_reports_snapshot(
  p_machine_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT,
  type TEXT,
  machine TEXT,
  machine_id UUID,
  assigned_to_name TEXT,
  age_hours INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    LEFT(COALESCE(r.description, ''), 300) AS description,
    r.severity,
    r.status,
    r.type,
    r.machine,
    r.machine_id,
    r.assigned_to_name,
    EXTRACT(EPOCH FROM (NOW() - r.created_at))::INTEGER / 3600 AS age_hours,
    r.created_at
  FROM public.reports r
  WHERE r.org_id = v_org_id
    AND r.status NOT IN ('risolta', 'chiuso')
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
  ORDER BY
    CASE r.severity
      WHEN 'critica' THEN 1
      WHEN 'alta'    THEN 2
      WHEN 'media'   THEN 3
      WHEN 'bassa'   THEN 4
      ELSE 5
    END,
    r.created_at ASC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_open_reports_snapshot(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 3. RPC: get_machine_history
-- ────────────────────────────────────────────────────────────────
-- Storia operativa di una specifica macchina:
--   - tipi guasto ricorrenti (group by type)
--   - MTTR (tempo medio risoluzione in ore)
--   - ultime 5 manutenzioni eseguite (maintenance_logs)
--   - manutenzioni in scadenza/scadute (maintenance_plans)
--   - ricambi più usati (estratti da closure_parts dei report risolti)

CREATE OR REPLACE FUNCTION public.get_machine_history(
  p_machine_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_machine_name TEXT;
  v_recurring JSONB;
  v_mttr_hours NUMERIC;
  v_total_reports INTEGER;
  v_recent_maintenance JSONB;
  v_upcoming_maintenance JSONB;
  v_top_parts JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL OR p_machine_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Nome macchina
  SELECT name INTO v_machine_name
  FROM public.machines
  WHERE id = p_machine_id AND org_id = v_org_id;

  IF v_machine_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Conteggio totale report sulla macchina
  SELECT COUNT(*) INTO v_total_reports
  FROM public.reports
  WHERE machine_id = p_machine_id AND org_id = v_org_id;

  -- Tipi guasto ricorrenti
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::jsonb)
  INTO v_recurring
  FROM (
    SELECT type, COUNT(*)::INTEGER AS count
    FROM public.reports
    WHERE machine_id = p_machine_id AND org_id = v_org_id AND type IS NOT NULL
    GROUP BY type
    ORDER BY count DESC
    LIMIT 5
  ) t;

  -- MTTR su report risolti
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)::numeric, 1)
  INTO v_mttr_hours
  FROM public.reports
  WHERE machine_id = p_machine_id
    AND org_id = v_org_id
    AND status IN ('risolta', 'chiuso')
    AND closed_at IS NOT NULL
    AND created_at IS NOT NULL;

  -- Ultime 5 manutenzioni eseguite
  SELECT COALESCE(jsonb_agg(row_to_json(ml) ORDER BY ml.performed_at DESC), '[]'::jsonb)
  INTO v_recent_maintenance
  FROM (
    SELECT
      title,
      type,
      LEFT(COALESCE(description, ''), 200) AS description,
      LEFT(COALESCE(parts_replaced, ''), 200) AS parts_replaced,
      performed_by_name,
      to_char(performed_at, 'DD/MM/YYYY') AS performed_at_label,
      performed_at
    FROM public.maintenance_logs
    WHERE machine_id = p_machine_id AND org_id = v_org_id
    ORDER BY performed_at DESC
    LIMIT 5
  ) ml;

  -- Piani manutenzione in scadenza/scadute
  -- Calcoliamo prossima scadenza come (last_log + frequency_days) o (created_at + frequency_days)
  SELECT COALESCE(jsonb_agg(row_to_json(mp) ORDER BY mp.days_to_due ASC), '[]'::jsonb)
  INTO v_upcoming_maintenance
  FROM (
    SELECT
      mp.name,
      mp.frequency_days,
      mp.current_status,
      to_char(next_due, 'DD/MM/YYYY') AS next_due_label,
      EXTRACT(DAY FROM (next_due - NOW()))::INTEGER AS days_to_due
    FROM (
      SELECT
        mp.id,
        mp.name,
        mp.frequency_days,
        mp.current_status,
        COALESCE(
          (SELECT MAX(performed_at) FROM public.maintenance_logs
            WHERE plan_id = mp.id),
          mp.created_at
        ) + (mp.frequency_days || ' days')::INTERVAL AS next_due
      FROM public.maintenance_plans mp
      WHERE mp.machine_id = p_machine_id AND mp.org_id = v_org_id
    ) mp
    WHERE next_due < NOW() + INTERVAL '30 days'
    ORDER BY next_due ASC
    LIMIT 5
  ) mp;

  -- Ricambi più citati nei closure_parts dei report risolti (raw text)
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.usage_count DESC), '[]'::jsonb)
  INTO v_top_parts
  FROM (
    SELECT
      LEFT(closure_parts, 80) AS parts,
      COUNT(*)::INTEGER AS usage_count
    FROM public.reports
    WHERE machine_id = p_machine_id
      AND org_id = v_org_id
      AND closure_parts IS NOT NULL
      AND closure_parts <> ''
    GROUP BY closure_parts
    ORDER BY usage_count DESC
    LIMIT 5
  ) p;

  RETURN jsonb_build_object(
    'machine_name', v_machine_name,
    'total_reports', v_total_reports,
    'mttr_hours', v_mttr_hours,
    'recurring_types', v_recurring,
    'recent_maintenance', v_recent_maintenance,
    'upcoming_maintenance', v_upcoming_maintenance,
    'top_parts', v_top_parts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machine_history(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 4. EXTEND: search_similar_reports → p_include_open
-- ────────────────────────────────────────────────────────────────
-- Aggiunge il parametro p_include_open. Quando true:
--   - allarga il filtro a TUTTI gli stati (non solo risolti/chiusi)
--   - rilassa il check su closure_root_cause/closure_action
-- Default false: comportamento identico a 026.

CREATE OR REPLACE FUNCTION public.search_similar_reports(
  query_text TEXT,
  p_limit INTEGER DEFAULT 5,
  p_machine_id UUID DEFAULT NULL,
  p_include_open BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT,
  type TEXT,
  machine_id UUID,
  closure_root_cause TEXT,
  closure_action TEXT,
  closure_parts TEXT,
  closure_hours NUMERIC,
  closed_at TIMESTAMPTZ,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_query tsquery;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  v_query := websearch_to_tsquery('italian', coalesce(query_text, ''));
  IF v_query IS NULL OR v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.description,
    r.severity,
    r.status,
    r.type,
    r.machine_id,
    r.closure_root_cause,
    r.closure_action,
    r.closure_parts,
    r.closure_hours,
    r.closed_at,
    ts_rank(r.search_vector, v_query) AS similarity
  FROM public.reports r
  WHERE r.org_id = v_org_id
    AND r.search_vector @@ v_query
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
    AND (
      p_include_open
      OR (
        r.status IN ('risolta', 'chiuso')
        AND (r.closure_root_cause IS NOT NULL OR r.closure_action IS NOT NULL)
      )
    )
  ORDER BY similarity DESC, COALESCE(r.closed_at, r.created_at) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

-- Drop vecchia signature a 3 parametri (se ancora deployata) per evitare ambiguità
DROP FUNCTION IF EXISTS public.search_similar_reports(TEXT, INTEGER, UUID);

GRANT EXECUTE ON FUNCTION public.search_similar_reports(TEXT, INTEGER, UUID, BOOLEAN) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 028_knowledge_base.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 028: Knowledge Base AI                            ║
-- ║                                                                ║
-- ║  Trasforma le schede macchina in biblioteca tecnica           ║
-- ║  interrogabile via AI (RAG con embeddings Voyage).            ║
-- ║                                                                ║
-- ║  Tabelle/modifiche:                                           ║
-- ║   - Estensione pgvector                                       ║
-- ║   - NEW: document_chunks (chunks indicizzati)                 ║
-- ║   - ALTER: maintenance_logs (+ contractor fields, + media)    ║
-- ║   - RPC: search_knowledge (hybrid vector+FTS)                 ║
-- ║   - RPC: queue_machine_reindex (cancella chunks vecchi)       ║
-- ║   - RPC: get_knowledge_stats (per badge UI)                   ║
-- ║   - RPC: create_maintenance_log (esteso con contractor+media) ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────
-- 1. pgvector extension
-- ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;


-- ────────────────────────────────────────────────────────────────
-- 2. Estensione maintenance_logs con campi ditta esterna e media
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contractor_name TEXT,
  ADD COLUMN IF NOT EXISTS contractor_reference TEXT;

-- `media` è già presente come JSONB DEFAULT '[]' (vedi schema.sql:161)
-- quindi non serve aggiungerla, la popoliamo direttamente con
-- [{type, category, name, url}] analogo a machines.attachments


-- ────────────────────────────────────────────────────────────────
-- 3. Tabella document_chunks
-- ────────────────────────────────────────────────────────────────
-- Ogni chunk rappresenta una porzione indicizzata di una fonte
-- (manuale PDF, istruzioni testuali, maintenance_log).
-- embedding è vector(1024) perché Voyage multilingual-2 usa 1024 dim.

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,

  -- Identificazione della sorgente
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'attachment',                 -- file in machines.attachments
    'usage_instructions',         -- machines.usage_instructions (testo libero)
    'maintenance_instructions',   -- machines.maintenance_instructions
    'maintenance_log'             -- riga di maintenance_logs
  )),
  source_ref TEXT,     -- url file per attachment, uuid log per maintenance_log
  source_label TEXT,   -- etichetta human-readable citata dall'AI
  category TEXT,       -- manuale_uso, scheda_tecnica, intervento_esterno, ecc.

  -- Contenuto e ricerca
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  page_number INTEGER,           -- se PDF
  embedding vector(1024),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('italian', coalesce(content, ''))
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_machine ON public.document_chunks(machine_id);
CREATE INDEX IF NOT EXISTS idx_chunks_org ON public.document_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON public.document_chunks(machine_id, source_kind, source_ref);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON public.document_chunks USING GIN(search_vector);
-- HNSW per ricerca semantica veloce su embedding
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.document_chunks USING hnsw (embedding vector_cosine_ops);


-- ────────────────────────────────────────────────────────────────
-- 4. RLS document_chunks (read per org, write solo via service role)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chunks_select ON public.document_chunks;
CREATE POLICY chunks_select ON public.document_chunks
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

-- INSERT/UPDATE/DELETE solo via edge function con service_role
-- (la pipeline ingest-knowledge usa SERVICE_ROLE_KEY)


-- ────────────────────────────────────────────────────────────────
-- 5. RPC: search_knowledge (hybrid vector + FTS)
-- ────────────────────────────────────────────────────────────────
-- Se query_embedding è fornito: ricerca semantica cosine similarity
-- Se solo query_text: fallback FTS italiano
-- Filtra per org_id sempre, opzionalmente per machine_id

CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_text TEXT,
  query_embedding vector(1024) DEFAULT NULL,
  p_machine_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  machine_id UUID,
  source_kind TEXT,
  source_ref TEXT,
  source_label TEXT,
  category TEXT,
  content TEXT,
  page_number INTEGER,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_query tsquery;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Ramo 1: ricerca semantica se abbiamo embedding
  IF query_embedding IS NOT NULL THEN
    RETURN QUERY
    SELECT
      c.id,
      c.machine_id,
      c.source_kind,
      c.source_ref,
      c.source_label,
      c.category,
      c.content,
      c.page_number,
      (1 - (c.embedding <=> query_embedding))::real AS similarity
    FROM public.document_chunks c
    WHERE c.org_id = v_org_id
      AND (p_machine_id IS NULL OR c.machine_id = p_machine_id)
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT GREATEST(1, LEAST(p_limit, 20));
    RETURN;
  END IF;

  -- Ramo 2: fallback FTS italiano
  v_query := websearch_to_tsquery('italian', coalesce(query_text, ''));
  IF v_query IS NULL OR v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.machine_id,
    c.source_kind,
    c.source_ref,
    c.source_label,
    c.category,
    c.content,
    c.page_number,
    ts_rank(c.search_vector, v_query) AS similarity
  FROM public.document_chunks c
  WHERE c.org_id = v_org_id
    AND (p_machine_id IS NULL OR c.machine_id = p_machine_id)
    AND c.search_vector @@ v_query
  ORDER BY similarity DESC
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge(TEXT, vector, UUID, INTEGER)
  TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 6. RPC: get_knowledge_stats (badge UI "Biblioteca AI")
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_knowledge_stats(p_machine_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_result JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('chunks', 0, 'sources', 0, 'last_indexed_at', NULL);
  END IF;

  SELECT jsonb_build_object(
    'chunks', COUNT(*),
    'sources', COUNT(DISTINCT (source_kind, source_ref)),
    'last_indexed_at', MAX(created_at),
    'by_kind', jsonb_object_agg(source_kind, kind_count)
  ) INTO v_result
  FROM (
    SELECT
      source_kind,
      source_ref,
      created_at,
      COUNT(*) OVER (PARTITION BY source_kind) AS kind_count
    FROM public.document_chunks
    WHERE machine_id = p_machine_id AND org_id = v_org_id
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('chunks', 0, 'sources', 0, 'last_indexed_at', NULL));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_knowledge_stats(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 7. RPC: queue_machine_reindex (purge chunks per una macchina)
-- ────────────────────────────────────────────────────────────────
-- Chiamata lato client quando l'utente modifica documenti/istruzioni.
-- Cancella i chunks esistenti così che la pipeline ingest-knowledge
-- possa ricrearli da zero. In realtà la pipeline lo fa già in maniera
-- idempotente, ma questa RPC offre un modo "pulito" per forzare reindex
-- senza aspettare la edge function.

CREATE OR REPLACE FUNCTION public.queue_machine_reindex(p_machine_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_deleted INTEGER;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN RETURN 0; END IF;

  -- Verifica che l'utente abbia diritto sulla macchina (stessa org)
  IF NOT EXISTS (
    SELECT 1 FROM public.machines
    WHERE id = p_machine_id AND org_id = v_org_id
  ) THEN
    RETURN 0;
  END IF;

  -- L'edge function ricreerà i chunks. Questa RPC è opzionale:
  -- serve solo a segnalare che il "versione vecchia" non è più valida.
  -- In pratica noi NON cancelliamo qui: lasciamo che l'edge function
  -- faccia DELETE+INSERT per sorgente specifica. Se il client vuole
  -- forzare un reset totale, può chiamare DELETE diretto.

  SELECT COUNT(*) INTO v_deleted
  FROM public.document_chunks
  WHERE machine_id = p_machine_id AND org_id = v_org_id;

  RETURN v_deleted;  -- ritorna chunks attuali (per info UI)
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_machine_reindex(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 8. RPC: create_maintenance_log (v2 con contractor + media)
-- ────────────────────────────────────────────────────────────────
-- Sostituisce la versione in 020_fix_maintenance_logs_rls.sql
-- aggiungendo: is_external, contractor_name, contractor_reference, media

CREATE OR REPLACE FUNCTION public.create_maintenance_log(
  _machine_id UUID,
  _title TEXT,
  _plan_id UUID DEFAULT NULL,
  _report_id UUID DEFAULT NULL,
  _component_id UUID DEFAULT NULL,
  _type TEXT DEFAULT 'programmata',
  _description TEXT DEFAULT NULL,
  _performed_by_name TEXT DEFAULT NULL,
  _duration_minutes INTEGER DEFAULT NULL,
  _parts_replaced TEXT DEFAULT NULL,
  _performed_at TIMESTAMPTZ DEFAULT now(),
  _is_external BOOLEAN DEFAULT FALSE,
  _contractor_name TEXT DEFAULT NULL,
  _contractor_reference TEXT DEFAULT NULL,
  _media JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _user_id UUID;
  _result JSONB;
BEGIN
  SELECT id, org_id, role INTO _user_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  INSERT INTO public.maintenance_logs (
    machine_id, plan_id, report_id, component_id, type, title, description,
    performed_by, performed_by_name, duration_minutes, parts_replaced,
    performed_at, org_id,
    is_external, contractor_name, contractor_reference, media
  ) VALUES (
    _machine_id, _plan_id, _report_id, _component_id, _type, _title, _description,
    _user_id, _performed_by_name, _duration_minutes, _parts_replaced,
    _performed_at, _org_id,
    COALESCE(_is_external, FALSE), _contractor_name, _contractor_reference, COALESCE(_media, '[]'::jsonb)
  )
  RETURNING to_jsonb(maintenance_logs.*) INTO _result;

  RETURN _result;
END;
$$;

-- Drop signature vecchia (10 params) per evitare ambiguità di overloading
DROP FUNCTION IF EXISTS public.create_maintenance_log(
  UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMPTZ
);


-- ────────────────────────────────────────────────────────────
-- 029_invite_only_system.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 029: Invite-only signup system
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Rimuove la possibilità di registrazione pubblica. Solo gli admin
-- possono invitare nuovi utenti. Il flusso:
--   1. Admin chiama invite_user() → crea riga users con status='pending' + token
--   2. Admin condivide il link /invite/<token> con il destinatario
--   3. Utente imposta password → supabase.auth.signUp() + accept_invite(token)
--   4. accept_invite linka auth_id, attiva account, invalida token
--   5. Login normale richiede status='active' (verificato in resolve_my_profile)

-- ── 1. Colonne per invito ───────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'disabled')),
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_invite_token ON public.users(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- Utenti già esistenti restano 'active' (default della colonna)

-- ── 2. RPC: invita utente (solo admin) ──────────────────────
CREATE OR REPLACE FUNCTION public.invite_user(
  _email TEXT,
  _name  TEXT,
  _role  TEXT DEFAULT 'operatore',
  _expires_hours INT DEFAULT 168
)
RETURNS JSONB AS $$
DECLARE
  _caller_id   UUID;
  _caller_role TEXT;
  _caller_org  TEXT;
  _existing    RECORD;
  _token       TEXT;
  _expires     TIMESTAMPTZ;
  _result      JSONB;
BEGIN
  SELECT id, role, org_id INTO _caller_id, _caller_role, _caller_org
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _caller_id IS NULL THEN RAISE EXCEPTION 'Profilo chiamante non trovato'; END IF;
  IF _caller_role != 'admin' THEN RAISE EXCEPTION 'Solo gli amministratori possono invitare utenti'; END IF;
  IF _role NOT IN ('operatore', 'tecnico', 'admin') THEN RAISE EXCEPTION 'Ruolo non valido: %', _role; END IF;
  IF _email IS NULL OR trim(_email) = '' THEN RAISE EXCEPTION 'Email obbligatoria'; END IF;
  IF _name  IS NULL OR trim(_name)  = '' THEN RAISE EXCEPTION 'Nome obbligatorio'; END IF;

  _email := lower(trim(_email));
  _token := encode(gen_random_bytes(24), 'hex');
  _expires := now() + (_expires_hours || ' hours')::interval;

  SELECT * INTO _existing FROM public.users WHERE lower(email) = _email LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    IF _existing.status = 'active' THEN
      RAISE EXCEPTION 'Esiste già un utente attivo con questa email';
    END IF;
    -- Rigenera invito (status pending o disabled)
    UPDATE public.users SET
      name = _name,
      role = _role,
      status = 'pending',
      invited_by = _caller_id,
      invited_at = now(),
      invite_token = _token,
      invite_expires_at = _expires,
      invite_accepted_at = NULL,
      updated_at = now()
    WHERE id = _existing.id
    RETURNING to_jsonb(users.*) INTO _result;
  ELSE
    INSERT INTO public.users (
      email, name, role, org_id, status,
      invited_by, invited_at, invite_token, invite_expires_at
    ) VALUES (
      _email, _name, _role, _caller_org, 'pending',
      _caller_id, now(), _token, _expires
    )
    RETURNING to_jsonb(users.*) INTO _result;
  END IF;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. RPC: anteprima invito (pubblica, per pagina accept) ──
CREATE OR REPLACE FUNCTION public.get_invite_info(_token TEXT)
RETURNS JSONB AS $$
DECLARE
  _user RECORD;
BEGIN
  SELECT email, name, role, status, invite_expires_at
    INTO _user
    FROM public.users
    WHERE invite_token = _token
    LIMIT 1;

  IF _user IS NULL THEN RAISE EXCEPTION 'Invito non valido'; END IF;
  IF _user.status != 'pending' THEN RAISE EXCEPTION 'Invito già utilizzato o revocato'; END IF;
  IF _user.invite_expires_at < now() THEN RAISE EXCEPTION 'Invito scaduto'; END IF;

  RETURN jsonb_build_object(
    'email', _user.email,
    'name',  _user.name,
    'role',  _user.role,
    'expires_at', _user.invite_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. RPC: accetta invito (dopo signUp) ────────────────────
CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS JSONB AS $$
DECLARE
  _auth_id UUID := auth.uid();
  _auth_email TEXT;
  _user RECORD;
  _result JSONB;
BEGIN
  IF _auth_id IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;

  SELECT email INTO _auth_email FROM auth.users WHERE id = _auth_id;

  SELECT * INTO _user FROM public.users WHERE invite_token = _token LIMIT 1;
  IF _user IS NULL THEN RAISE EXCEPTION 'Invito non valido'; END IF;
  IF _user.status != 'pending' THEN RAISE EXCEPTION 'Invito già utilizzato o revocato'; END IF;
  IF _user.invite_expires_at < now() THEN RAISE EXCEPTION 'Invito scaduto'; END IF;
  IF lower(_user.email) != lower(_auth_email) THEN
    RAISE EXCEPTION 'Email dell''account (%) diversa dall''email dell''invito (%)', _auth_email, _user.email;
  END IF;

  UPDATE public.users SET
    auth_id = _auth_id,
    status = 'active',
    invite_token = NULL,
    invite_expires_at = NULL,
    invite_accepted_at = now(),
    updated_at = now()
  WHERE id = _user.id
  RETURNING to_jsonb(users.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RPC: revoca invito / disabilita utente (solo admin) ──
CREATE OR REPLACE FUNCTION public.revoke_invite(_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  _caller_role TEXT;
  _caller_org  TEXT;
  _target      RECORD;
  _result      JSONB;
BEGIN
  SELECT role, org_id INTO _caller_role, _caller_org
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  IF _caller_role != 'admin' THEN RAISE EXCEPTION 'Solo gli amministratori possono revocare inviti'; END IF;

  SELECT * INTO _target FROM public.users WHERE id = _user_id LIMIT 1;
  IF _target IS NULL THEN RAISE EXCEPTION 'Utente non trovato'; END IF;
  IF _target.org_id != _caller_org THEN RAISE EXCEPTION 'Non puoi revocare inviti di altre organizzazioni'; END IF;
  IF _target.status != 'pending' THEN RAISE EXCEPTION 'Solo gli inviti in attesa possono essere revocati'; END IF;

  UPDATE public.users SET
    status = 'disabled',
    invite_token = NULL,
    invite_expires_at = NULL,
    updated_at = now()
  WHERE id = _user_id
  RETURNING to_jsonb(users.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Aggiorna resolve_my_profile per rifiutare non-active ──
CREATE OR REPLACE FUNCTION public.resolve_my_profile()
RETURNS JSONB AS $$
DECLARE
  _auth_id UUID := auth.uid();
  _email   TEXT;
  _user    RECORD;
  _result  JSONB;
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

  -- 4. Verifica stato
  IF _user.status = 'pending' THEN
    RAISE EXCEPTION 'Account in attesa di attivazione';
  ELSIF _user.status = 'disabled' THEN
    RAISE EXCEPTION 'Account disabilitato. Contatta l''amministratore.';
  END IF;

  SELECT to_jsonb(u.*) INTO _result FROM public.users u WHERE u.id = _user.id;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. Grants ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_info(TEXT) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 030_assistant_strategic_context.sql
-- ────────────────────────────────────────────────────────────
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 030: Assistant — Anagrafica + insight strategici  ║
-- ║                                                                ║
-- ║  Fa evolvere l'assistente AI da "lookup diagnostico" a vero   ║
-- ║  strumento di governance della manutenzione. Aggiunge:        ║
-- ║                                                                ║
-- ║   - get_machines_inventory()      → anagrafica completa       ║
-- ║       (matricole, modelli, produttori, reparto, stato...)     ║
-- ║   - get_assistant_strategic_insights()                        ║
-- ║       ranking macchine a rischio, manutenzioni scadute,       ║
-- ║       pattern di guasto ricorrenti, riparazioni lunghe        ║
-- ║   - get_machine_history() [REPLACE] ora include               ║
-- ║       serial_number / manufacturer / model / year / location  ║
-- ║       department / criticality                                ║
-- ║                                                                ║
-- ║  Tutte SECURITY DEFINER + filtrate per org via get_my_org_id. ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────
-- 1. RPC: get_machines_inventory
-- ────────────────────────────────────────────────────────────────
-- Ritorna l'anagrafica macchinari dell'org.
-- Usata dall'AI per rispondere a domande del tipo:
--   "Dammi le matricole di tutti i macchinari"
--   "Che modello è la X?"
--   "Quali macchine sono dismesse?"
-- Cap a 200 per evitare context overflow su org molto grandi.

CREATE OR REPLACE FUNCTION public.get_machines_inventory()
RETURNS TABLE (
  id UUID,
  name TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,
  year INTEGER,
  department TEXT,
  location TEXT,
  status TEXT,
  criticality TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.serial_number,
    m.manufacturer,
    m.model,
    m.year,
    m.department,
    m.location,
    m.status,
    m.criticality
  FROM public.machines m
  WHERE m.org_id = v_org_id
  ORDER BY
    CASE m.criticality WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
    m.name ASC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machines_inventory() TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2. RPC: get_machine_history (REPLACE — aggiunta anagrafica)
-- ────────────────────────────────────────────────────────────────
-- Versione estesa rispetto a migration 027. Include i campi
-- identificativi (serial_number, manufacturer, model, year,
-- location, department, criticality) così che l'AI, quando
-- l'utente sta guardando una macchina specifica, possa
-- rispondere a domande tipo "che matricola ha?".

CREATE OR REPLACE FUNCTION public.get_machine_history(
  p_machine_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_machine RECORD;
  v_recurring JSONB;
  v_mttr_hours NUMERIC;
  v_total_reports INTEGER;
  v_recent_maintenance JSONB;
  v_upcoming_maintenance JSONB;
  v_top_parts JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL OR p_machine_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Anagrafica macchina
  SELECT
    m.name, m.serial_number, m.manufacturer, m.model, m.year,
    m.department, m.location, m.status, m.criticality
  INTO v_machine
  FROM public.machines m
  WHERE m.id = p_machine_id AND m.org_id = v_org_id;

  IF v_machine IS NULL OR v_machine.name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Conteggio totale report sulla macchina
  SELECT COUNT(*) INTO v_total_reports
  FROM public.reports
  WHERE machine_id = p_machine_id AND org_id = v_org_id;

  -- Tipi guasto ricorrenti
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::jsonb)
  INTO v_recurring
  FROM (
    SELECT type, COUNT(*)::INTEGER AS count
    FROM public.reports
    WHERE machine_id = p_machine_id AND org_id = v_org_id AND type IS NOT NULL
    GROUP BY type
    ORDER BY count DESC
    LIMIT 5
  ) t;

  -- MTTR su report risolti
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)::numeric, 1)
  INTO v_mttr_hours
  FROM public.reports
  WHERE machine_id = p_machine_id
    AND org_id = v_org_id
    AND status IN ('risolta', 'chiuso')
    AND closed_at IS NOT NULL
    AND created_at IS NOT NULL;

  -- Ultime 5 manutenzioni eseguite
  SELECT COALESCE(jsonb_agg(row_to_json(ml) ORDER BY ml.performed_at DESC), '[]'::jsonb)
  INTO v_recent_maintenance
  FROM (
    SELECT
      title,
      type,
      LEFT(COALESCE(description, ''), 200) AS description,
      LEFT(COALESCE(parts_replaced, ''), 200) AS parts_replaced,
      performed_by_name,
      to_char(performed_at, 'DD/MM/YYYY') AS performed_at_label,
      performed_at
    FROM public.maintenance_logs
    WHERE machine_id = p_machine_id AND org_id = v_org_id
    ORDER BY performed_at DESC
    LIMIT 5
  ) ml;

  -- Piani manutenzione in scadenza/scadute
  SELECT COALESCE(jsonb_agg(row_to_json(mp) ORDER BY mp.days_to_due ASC), '[]'::jsonb)
  INTO v_upcoming_maintenance
  FROM (
    SELECT
      mp.name,
      mp.frequency_days,
      mp.current_status,
      to_char(next_due, 'DD/MM/YYYY') AS next_due_label,
      EXTRACT(DAY FROM (next_due - NOW()))::INTEGER AS days_to_due
    FROM (
      SELECT
        mp.id,
        mp.name,
        mp.frequency_days,
        mp.current_status,
        COALESCE(
          (SELECT MAX(performed_at) FROM public.maintenance_logs
            WHERE plan_id = mp.id),
          mp.created_at
        ) + (mp.frequency_days || ' days')::INTERVAL AS next_due
      FROM public.maintenance_plans mp
      WHERE mp.machine_id = p_machine_id AND mp.org_id = v_org_id
    ) mp
    WHERE next_due < NOW() + INTERVAL '30 days'
    ORDER BY next_due ASC
    LIMIT 5
  ) mp;

  -- Ricambi più citati nei closure_parts dei report risolti (raw text)
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.usage_count DESC), '[]'::jsonb)
  INTO v_top_parts
  FROM (
    SELECT
      LEFT(closure_parts, 80) AS parts,
      COUNT(*)::INTEGER AS usage_count
    FROM public.reports
    WHERE machine_id = p_machine_id
      AND org_id = v_org_id
      AND closure_parts IS NOT NULL
      AND closure_parts <> ''
    GROUP BY closure_parts
    ORDER BY usage_count DESC
    LIMIT 5
  ) p;

  RETURN jsonb_build_object(
    'machine_name', v_machine.name,
    'serial_number', v_machine.serial_number,
    'manufacturer', v_machine.manufacturer,
    'model', v_machine.model,
    'year', v_machine.year,
    'department', v_machine.department,
    'location', v_machine.location,
    'status', v_machine.status,
    'criticality', v_machine.criticality,
    'total_reports', v_total_reports,
    'mttr_hours', v_mttr_hours,
    'recurring_types', v_recurring,
    'recent_maintenance', v_recent_maintenance,
    'upcoming_maintenance', v_upcoming_maintenance,
    'top_parts', v_top_parts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machine_history(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 3. RPC: get_assistant_strategic_insights
-- ────────────────────────────────────────────────────────────────
-- KPI strategici per guidare il manager della manutenzione.
-- Pensato per rispondere a domande tipo:
--   "Su quali macchine devo concentrarmi per ridurre i fermi?"
--   "Quali manutenzioni preventive sono scadute?"
--   "Qual è il pattern di guasto più comune?"
--   "Dove sto perdendo più tempo in riparazioni?"
--
-- Ritorna 4 blocchi:
--   1. machines_at_risk  — ranking per (critici aperti, aperti, MTTR)
--   2. overdue_preventive — piani manutenzione scaduti (= rischio fermo)
--   3. recurring_failures — tipi guasto ricorrenti a livello org
--   4. long_repairs       — riparazioni lunghe (outlier ore) recenti
--
-- Finestra temporale: ultimi 90 giorni per le metriche dinamiche.

CREATE OR REPLACE FUNCTION public.get_assistant_strategic_insights()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_machines_at_risk JSONB;
  v_overdue_preventive JSONB;
  v_recurring_failures JSONB;
  v_long_repairs JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'machines_at_risk', '[]'::jsonb,
      'overdue_preventive', '[]'::jsonb,
      'recurring_failures', '[]'::jsonb,
      'long_repairs', '[]'::jsonb
    );
  END IF;

  -- 1. Macchine a rischio: ranking basato su segnalazioni aperte,
  -- criticità aperte, MTTR. Incluse solo macchine con almeno 1 report.
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.risk_score DESC), '[]'::jsonb)
  INTO v_machines_at_risk
  FROM (
    SELECT
      r.machine_id,
      COALESCE(mch.name, r.machine) AS machine_name,
      mch.serial_number,
      mch.criticality AS machine_criticality,
      COUNT(*)::INTEGER AS total_reports,
      COUNT(*) FILTER (WHERE r.status NOT IN ('risolta', 'chiuso'))::INTEGER AS open_reports,
      COUNT(*) FILTER (
        WHERE r.severity = 'critica' AND r.status NOT IN ('risolta', 'chiuso')
      )::INTEGER AS critical_open,
      COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '90 days')::INTEGER AS reports_last_90d,
      ROUND(AVG(
        EXTRACT(EPOCH FROM (r.closed_at - r.created_at)) / 3600
      ) FILTER (
        WHERE r.status IN ('risolta', 'chiuso')
          AND r.closed_at IS NOT NULL
          AND r.created_at IS NOT NULL
      )::numeric, 1) AS mttr_hours,
      to_char(MAX(r.created_at) FILTER (WHERE r.severity = 'critica'), 'DD/MM/YYYY') AS last_critical_at,
      -- Risk score empirico
      (COUNT(*) FILTER (
          WHERE r.severity = 'critica' AND r.status NOT IN ('risolta', 'chiuso')
        ) * 3
        + COUNT(*) FILTER (WHERE r.status NOT IN ('risolta', 'chiuso')) * 1.5
        + COALESCE(ROUND(AVG(
            EXTRACT(EPOCH FROM (r.closed_at - r.created_at)) / 3600
          ) FILTER (
            WHERE r.status IN ('risolta', 'chiuso')
              AND r.closed_at IS NOT NULL
              AND r.created_at IS NOT NULL
          )::numeric, 1), 0) * 0.1
        + COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '90 days') * 0.5
        + CASE mch.criticality WHEN 'alta' THEN 2 WHEN 'media' THEN 1 ELSE 0 END
      )::NUMERIC AS risk_score
    FROM public.reports r
    LEFT JOIN public.machines mch ON mch.id = r.machine_id AND mch.org_id = v_org_id
    WHERE r.org_id = v_org_id
      AND (r.machine_id IS NOT NULL OR (r.machine IS NOT NULL AND r.machine <> ''))
    GROUP BY r.machine_id, mch.name, r.machine, mch.serial_number, mch.criticality
    ORDER BY risk_score DESC
    LIMIT 10
  ) m;

  -- 2. Manutenzioni preventive scadute o prossime (entro 7 giorni).
  -- Proxy dei fermi imprevisti: se una preventiva è saltata,
  -- il rischio di fermo straordinario aumenta.
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.days_overdue DESC), '[]'::jsonb)
  INTO v_overdue_preventive
  FROM (
    SELECT
      mp.name AS plan_name,
      mp.frequency_days,
      COALESCE(mch.name, '—') AS machine_name,
      mch.serial_number,
      to_char(next_due, 'DD/MM/YYYY') AS next_due_label,
      GREATEST(0, -EXTRACT(DAY FROM (next_due - NOW()))::INTEGER) AS days_overdue,
      EXTRACT(DAY FROM (next_due - NOW()))::INTEGER AS days_to_due
    FROM (
      SELECT
        mp.id,
        mp.name,
        mp.frequency_days,
        mp.machine_id,
        COALESCE(
          (SELECT MAX(performed_at) FROM public.maintenance_logs
            WHERE plan_id = mp.id),
          mp.created_at
        ) + (mp.frequency_days || ' days')::INTERVAL AS next_due
      FROM public.maintenance_plans mp
      WHERE mp.org_id = v_org_id
    ) mp
    LEFT JOIN public.machines mch ON mch.id = mp.machine_id AND mch.org_id = v_org_id
    WHERE next_due < NOW() + INTERVAL '7 days'
    ORDER BY next_due ASC
    LIMIT 15
  ) p;

  -- 3. Pattern di guasto ricorrenti a livello organizzazione
  -- (ultimi 90 giorni). Aiuta a identificare problemi sistemici.
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.count DESC), '[]'::jsonb)
  INTO v_recurring_failures
  FROM (
    SELECT
      COALESCE(r.type, '—') AS type,
      COUNT(*)::INTEGER AS count,
      COUNT(DISTINCT r.machine_id)::INTEGER AS distinct_machines,
      COUNT(*) FILTER (WHERE r.severity = 'critica')::INTEGER AS critical_count
    FROM public.reports r
    WHERE r.org_id = v_org_id
      AND r.created_at > NOW() - INTERVAL '90 days'
      AND r.type IS NOT NULL
    GROUP BY r.type
    ORDER BY count DESC
    LIMIT 8
  ) f;

  -- 4. Riparazioni lunghe: top closure_hours degli ultimi 90gg.
  -- Candidati per analisi approfondita e formazione tecnici.
  SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY l.closure_hours DESC), '[]'::jsonb)
  INTO v_long_repairs
  FROM (
    SELECT
      r.title,
      COALESCE(mch.name, r.machine) AS machine_name,
      r.severity,
      r.type,
      r.closure_hours,
      LEFT(COALESCE(r.closure_root_cause, ''), 200) AS closure_root_cause,
      to_char(r.closed_at, 'DD/MM/YYYY') AS closed_at_label
    FROM public.reports r
    LEFT JOIN public.machines mch ON mch.id = r.machine_id AND mch.org_id = v_org_id
    WHERE r.org_id = v_org_id
      AND r.status IN ('risolta', 'chiuso')
      AND r.closure_hours IS NOT NULL
      AND r.closure_hours > 0
      AND r.closed_at > NOW() - INTERVAL '90 days'
    ORDER BY r.closure_hours DESC
    LIMIT 5
  ) l;

  RETURN jsonb_build_object(
    'machines_at_risk', v_machines_at_risk,
    'overdue_preventive', v_overdue_preventive,
    'recurring_failures', v_recurring_failures,
    'long_repairs', v_long_repairs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_strategic_insights() TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 030_supplier_profiles.sql
-- ────────────────────────────────────────────────────────────
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 030: Anagrafica estesa fornitori esterni
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Tabella separata supplier_profiles (1-a-1 con users) per evitare
-- di appesantire users con 20+ colonne usate solo dai fornitori.

CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  user_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,

  -- Anagrafica
  company_name     TEXT NOT NULL,
  referent_name    TEXT,
  vat_number       TEXT,
  tax_code         TEXT,

  -- Contatti
  phone            TEXT,
  whatsapp         TEXT,
  email_public     TEXT,

  -- Operatività
  specialties      TEXT[] DEFAULT ARRAY[]::TEXT[],
  city             TEXT,
  availability     TEXT CHECK (availability IN ('feriali', 'h24', 'weekend', 'su_chiamata')),

  -- Commerciale
  hourly_rate      NUMERIC(10,2),
  notes            TEXT,

  -- Opzionali / futuri
  address          TEXT,
  website          TEXT,
  admin_contact    TEXT,
  iban             TEXT,
  certifications   JSONB DEFAULT '[]'::JSONB,
  equipment        TEXT[] DEFAULT ARRAY[]::TEXT[],
  rating           NUMERIC(3,2) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  photo_url        TEXT,
  metadata         JSONB DEFAULT '{}'::JSONB,

  org_id           TEXT NOT NULL DEFAULT 'default',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_profiles_org ON public.supplier_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_supplier_profiles_specialties ON public.supplier_profiles USING GIN(specialties);
CREATE INDEX IF NOT EXISTS idx_supplier_profiles_city ON public.supplier_profiles(city);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.supplier_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_profiles_updated ON public.supplier_profiles;
CREATE TRIGGER trg_supplier_profiles_updated
  BEFORE UPDATE ON public.supplier_profiles
  FOR EACH ROW EXECUTE FUNCTION public.supplier_profiles_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;

-- Admin: full access nell'organizzazione
CREATE POLICY "sp_admin_all" ON public.supplier_profiles
  FOR ALL TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin')
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- Fornitore: vede e aggiorna solo il proprio profilo
CREATE POLICY "sp_self_select" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_my_org_id() AND
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "sp_self_update" ON public.supplier_profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id() AND
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Tecnici/operatori: read-only (per mostrare info fornitore assegnato su report)
CREATE POLICY "sp_read_assigned" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());


-- ────────────────────────────────────────────────────────────
-- 031_fix_handle_new_user_invite.sql
-- ────────────────────────────────────────────────────────────
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

