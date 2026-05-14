-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 055 — DOWN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Reverte 055_intervention_reports.sql.
--
-- ⚠ DESTRUCTIVE: il rollback ricrea interventions.report_id solo dal
-- record con is_origin=true. I link aggiunti dopo la mig 055 (con
-- is_origin=false, sia resolves_report=true che false) vengono PERSI
-- assieme alla table intervention_reports.
--
-- Esempio scenario perdita dati:
--   Intervento INT-X linkato a 3 report dopo la mig 055:
--     (R1, is_origin=true,  resolves=true)
--     (R2, is_origin=false, resolves=true)
--     (R3, is_origin=false, resolves=false, contesto)
--   Down: INT-X.report_id = R1. R2 e R3 → orfani, link irrecuperabili.
--
-- Eseguire DOWN solo dopo backup esplicito di intervention_reports.

-- ── 1. Realtime ────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime DROP TABLE public.intervention_reports;

-- ── 2. Trigger + Function ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_intervention_completed_close_reports ON public.interventions;
DROP FUNCTION IF EXISTS public.on_intervention_completed();

-- ── 3. View — ripristina la versione 053 (1:1) ─────────────────────────
DROP VIEW IF EXISTS public.reports_with_planning;
CREATE OR REPLACE VIEW public.reports_with_planning AS
SELECT
  r.*,
  COUNT(i.id) FILTER (WHERE i.status NOT IN ('annullato','completato')) AS active_interventions_count,
  COUNT(i.id) AS total_interventions_count,
  MIN(i.scheduled_start_at) FILTER (WHERE i.status NOT IN ('annullato','completato')) AS next_intervention_at,
  CASE
    WHEN COUNT(i.id) FILTER (WHERE i.status NOT IN ('annullato','completato')) = 0
         AND r.status = 'aperta'
      THEN 'da_pianificare'
    WHEN BOOL_OR(i.status = 'in_corso')      THEN 'in_corso'
    WHEN COUNT(i.id) FILTER (WHERE i.status IN ('pianificato','confermato')) > 0
                                             THEN 'pianificato'
    WHEN r.status = 'risolta'                THEN 'risolta'
    ELSE 'altro'
  END AS planning_state
FROM public.reports r
LEFT JOIN public.interventions i ON i.report_id = r.id
GROUP BY r.id;

-- ── 4. Ricrea colonna interventions.report_id ──────────────────────────
ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS report_id UUID
    REFERENCES public.reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_report
  ON public.interventions(report_id)
  WHERE report_id IS NOT NULL;

-- ── 5. Restore dati: ogni intervento riceve indietro il suo report origin
--     (i link non-origin vengono persi col DROP TABLE successivo)
UPDATE public.interventions i
SET report_id = ir.report_id
FROM public.intervention_reports ir
WHERE ir.intervention_id = i.id
  AND ir.is_origin = true;

-- ── 6. DROP table intervention_reports ─────────────────────────────────
-- RLS, indici, unique constraint vengono droppati con la tabella.
DROP TABLE IF EXISTS public.intervention_reports;
