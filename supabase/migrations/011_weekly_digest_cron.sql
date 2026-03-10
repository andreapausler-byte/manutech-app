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
