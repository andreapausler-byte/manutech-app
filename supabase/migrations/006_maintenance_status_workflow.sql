-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 006 — Stato workflow manutenzioni programmate
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Stato corrente del ciclo di manutenzione
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'da_eseguire'
  CHECK (current_status IN ('da_eseguire', 'in_corso', 'completata'));

-- Chi ha preso in carico e quando
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS taken_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS taken_by_name TEXT;
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

-- Aggiunge supporto media ai log di manutenzione (foto/file del report)
-- (la colonna media JSONB esiste già dalla migration 005)
