-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 060 DOWN — Galleria media per macchinario
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Le foto promosse restano in machines.attachments: sono dati
-- dell'utente, non struttura. Si riconoscono dal campo
-- `promoted_from` se serve ripulirle a mano.

DROP FUNCTION IF EXISTS public.toggle_machine_media_feature(UUID, JSONB);
DROP FUNCTION IF EXISTS public.get_machine_media(UUID, INT, INT);
DROP INDEX IF EXISTS public.idx_reports_machine;
