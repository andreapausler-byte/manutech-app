-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DOWN — Migration 056 — intervention_participants
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Rollback Sprint 1c MVP. Tabella additiva: il drop non rompe nessun
-- dato esistente (interventions.assigned_to / supervised_by sono
-- indipendenti).
--
-- NOTA: usa DROP TABLE ... CASCADE per pulire anche i trigger e i
-- riferimenti dalla publication realtime.

ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.intervention_participants;

DROP TABLE IF EXISTS public.intervention_participants CASCADE;
