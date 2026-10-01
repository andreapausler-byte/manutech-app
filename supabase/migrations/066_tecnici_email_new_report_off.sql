-- ╔══════════════════════════════════════════════════════════════╗
-- ║  066 — Email dei ticket non critici: ai tecnici non più       ║
-- ║                                                                ║
-- ║  Dalla v5.26 il default di sistema per i tecnici è            ║
-- ║  email_new_report = false: un nuovo ticket non critico va per ║
-- ║  email solo agli admin (i critici arrivano a tutti come      ║
-- ║  prima). Il default però non basta: le impostazioni salvano   ║
-- ║  TUTTE le preferenze al primo interruttore toccato, default   ║
-- ║  compresi, quindi molti tecnici hanno email_new_report = true ║
-- ║  memorizzato senza averlo mai scelto. Lo stesso vale per il   ║
-- ║  default aziendale del ruolo tecnico, se un admin l'ha        ║
-- ║  salvato da "Notifiche aziendali".                            ║
-- ║                                                                ║
-- ║  Qui si spegne quel valore e si tiene una copia delle righe   ║
-- ║  toccate, così il rollback le rimette com'erano. Il tecnico   ║
-- ║  che lo vuole lo riaccende da Impostazioni → Notifiche email. ║
-- ║  Rieseguirla non tocca le righe già cambiate una volta.       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Copia delle righe cambiate (per il rollback). RLS senza policy: la
-- leggono solo SQL Editor e service role, non l'app.
CREATE TABLE IF NOT EXISTS public._backup_066_notif_prefs (
  id        UUID PRIMARY KEY,
  prefs     JSONB NOT NULL,
  saved_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_066_notif_prefs ENABLE ROW LEVEL SECURITY;

WITH changed AS (
  INSERT INTO public._backup_066_notif_prefs (id, prefs)
  SELECT np.id, np.prefs
    FROM public.notification_preferences np
    LEFT JOIN public.users u ON u.id = np.user_id
   WHERE np.prefs->>'email_new_report' = 'true'
     AND (
       (COALESCE(np.is_org_default, false) AND np.role = 'tecnico')       -- default aziendale del ruolo
       OR (NOT COALESCE(np.is_org_default, false) AND u.role = 'tecnico') -- preferenze personali
     )
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE public.notification_preferences np
   SET prefs = jsonb_set(np.prefs, '{email_new_report}', 'false'::jsonb)
 WHERE np.id IN (SELECT id FROM changed);
