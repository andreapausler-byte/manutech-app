-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 012: Phase 1 Gap Fix                            ║
-- ║  - Campi macchina (model, serial, manufacturer, year)      ║
-- ║  - Stato "dismessa" + criticità macchina                   ║
-- ║  - Tipo ticket + nuovi stati + campi chiusura              ║
-- ║  - Tabelle mancanti nello schema                           ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── MACHINES: nuovi campi + stato dismessa ──
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS criticality TEXT DEFAULT 'media';

-- Aggiorna CHECK per includere 'dismessa'
ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_status_check;
ALTER TABLE public.machines ADD CONSTRAINT machines_status_check
  CHECK (status IN ('attivo', 'in_manutenzione', 'fuori_servizio', 'dismessa'));

ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_criticality_check;
ALTER TABLE public.machines ADD CONSTRAINT machines_criticality_check
  CHECK (criticality IN ('alta', 'media', 'bassa'));

-- ── REPORTS: tipo ticket + nuovi stati + campi chiusura ──
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'correttiva',
  ADD COLUMN IF NOT EXISTS closure_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS closure_parts TEXT,
  ADD COLUMN IF NOT EXISTS closure_root_cause TEXT,
  ADD COLUMN IF NOT EXISTS closure_action TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Aggiorna CHECK status per includere nuovi stati
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_type_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_type_check
  CHECK (type IN ('correttiva', 'preventiva', 'migliorativa', 'ispezione'));

-- Indice per il nuovo campo type
CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(type);
