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
