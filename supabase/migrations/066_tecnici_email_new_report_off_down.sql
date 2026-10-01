-- Rollback 066: riaccende email_new_report sulle righe spente dalla 066.
-- Rimette solo quella chiave: le altre preferenze cambiate nel frattempo
-- restano. Chi l'ha già riaccesa a mano non viene toccato.
UPDATE public.notification_preferences np
   SET prefs = jsonb_set(np.prefs, '{email_new_report}', 'true'::jsonb)
  FROM public._backup_066_notif_prefs b
 WHERE np.id = b.id
   AND np.prefs->>'email_new_report' = 'false';

DROP TABLE IF EXISTS public._backup_066_notif_prefs;
