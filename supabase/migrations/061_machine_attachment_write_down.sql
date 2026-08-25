-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 061 DOWN — Scrittura allegati macchina dal campo
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- I file caricati restano in machines.attachments e nello storage:
-- sono dati dell'utente, non struttura. Si riconoscono dal campo
-- `uploaded_from: 'campo'` se serve ripulirli a mano.

DROP FUNCTION IF EXISTS public.add_machine_attachment(UUID, JSONB);
