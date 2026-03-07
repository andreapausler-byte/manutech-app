-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ManuTech — Migration 002                                    ║
-- ║  Aggiunge colonna sort_order ai macchinari                   ║
-- ║  Per gestire l'ordine nella catena di montaggio              ║
-- ║                                                              ║
-- ║  Esegui in: Supabase Dashboard → SQL Editor → Run            ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.machines
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Inizializza l'ordine dei macchinari esistenti in base alla data di creazione
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.machines
)
UPDATE public.machines m
SET sort_order = r.rn
FROM ranked r
WHERE m.id = r.id;

-- Indice per query ordinate veloci
CREATE INDEX IF NOT EXISTS idx_machines_sort_order
ON public.machines (org_id, sort_order);
