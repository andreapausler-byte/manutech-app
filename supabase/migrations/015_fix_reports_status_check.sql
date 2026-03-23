-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 015: Fix reports_status_check constraint        ║
-- ║                                                            ║
-- ║  Il CHECK constraint originale potrebbe non includere      ║
-- ║  gli stati 'in_attesa_ricambi' e 'chiuso', causando       ║
-- ║  errore quando un tecnico aggiorna lo stato.               ║
-- ║  Questa migration ricrea il constraint con tutti gli stati.║
-- ╚══════════════════════════════════════════════════════════════╝

-- Drop qualsiasi constraint esistente sullo status
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;

-- Ricrea con TUTTI gli stati validi
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso'));
