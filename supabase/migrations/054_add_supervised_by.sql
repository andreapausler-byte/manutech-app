-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 054 — interventions.supervised_by (Sprint 1a-bis)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Aggiunge il ruolo "Supervisore della pianificazione" agli interventi.
-- Distinto da `assigned_to` (l'esecutore): supervised_by è chi monitora
-- lo stato della pianificazione, pungola il fornitore, decide rinvii.
--
-- UX prevista (form lato client):
--   - Se created_by ha role='admin', il form pre-seleziona
--     supervised_by = created_by automaticamente.
--   - Picker collassato di default, espandibile via "Cambia supervisore".
--   - Picker assigned_to (esecutore) resta sempre visibile.
--
-- supervised_by_name è snapshot del nome al momento del set, coerente con
-- assigned_to_name e created_by_name (pattern denormalizzato ManuTech: i
-- nomi restano leggibili anche se l'utente cambia name o viene disabilitato).
--
-- DOWN: 054_add_supervised_by_down.sql

ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS supervised_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervised_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_interventions_supervised_by
  ON public.interventions(supervised_by)
  WHERE supervised_by IS NOT NULL;
