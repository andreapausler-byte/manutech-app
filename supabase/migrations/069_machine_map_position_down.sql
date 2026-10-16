-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 069 DOWN — Mappa impianto
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Si perdono le posizioni, anche quelle corrette a mano. Se serve
-- tenerle, prima del rollback:
--   SELECT id, name, map_position FROM public.machines
--    WHERE map_position IS NOT NULL;

DROP FUNCTION IF EXISTS public.set_machine_map_position(UUID, NUMERIC, NUMERIC);

ALTER TABLE public.machines DROP COLUMN IF EXISTS map_position;
