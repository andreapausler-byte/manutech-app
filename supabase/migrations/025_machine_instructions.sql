-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 025: Aggiunge campi istruzioni ai macchinari
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Permette di salvare istruzioni d'uso e di manutenzione
-- direttamente sulla scheda del macchinario.

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS usage_instructions TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_instructions TEXT;
