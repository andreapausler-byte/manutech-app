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
