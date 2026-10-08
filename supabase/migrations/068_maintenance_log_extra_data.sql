-- ╔══════════════════════════════════════════════════════════════╗
-- ║  068 — Interventi registrati: note dopo e cronologia          ║
-- ║                                                                ║
-- ║  Una manutenzione registrata si può aggiornare come la        ║
-- ║  chiusura di una segnalazione (v5.32): correggere durata,     ║
-- ║  ricambi, data e testo, aggiungere una nota o una foto dopo,  ║
-- ║  togliere un allegato sbagliato. Note e cronologia stanno in  ║
-- ║  `extra_data`, come `closure_notes` sulle segnalazioni:       ║
-- ║                                                                ║
-- ║    notes:   [{ text, user_id, user_name, created_at }]        ║
-- ║    history: [{ detail, user_id, user_name, created_at }]      ║
-- ║                                                                ║
-- ║  Le policy restano quelle della 020: aggiornano tecnici e     ║
-- ║  admin della stessa organizzazione, elimina solo l'admin.     ║
-- ║  Solo aggiunta di una colonna: rieseguibile, nessun dato      ║
-- ║  esistente toccato.                                           ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS extra_data JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.maintenance_logs.extra_data IS
  'Note aggiunte dopo (notes) e cronologia delle correzioni (history) di un intervento registrato. v5.32';
