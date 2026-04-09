-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 024: Aggiunge component_id a maintenance_logs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Permette di associare un intervento a un componente specifico
-- del macchinario (se presente).

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS component_id UUID REFERENCES public.machine_components(id) ON DELETE SET NULL;
