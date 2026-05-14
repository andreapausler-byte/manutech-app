-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 055 — N→M intervention ↔ reports (Sprint 1c)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Trasforma la relazione 1:1 (interventions.report_id) in N→M tramite
-- nuova table di join intervention_reports. Use case primario: PTS
-- elettricista raggruppa più segnalazioni elettriche aperte sotto un
-- unico intervento.
--
-- Schema γ (single source of truth):
--   - drop colonna interventions.report_id
--   - is_origin BOOLEAN: il report da cui è partita la creazione
--     (max 1 per intervento, unique partial index)
--   - resolves_report BOOLEAN DEFAULT true: se l'intervento, una volta
--     completato, deve chiudere automaticamente questo report. Link con
--     resolves_report=false sono "di contesto" (fornitore in visita
--     menziona altri ticket per consultazione, ma non li risolve).
--
-- Auto-close via trigger PG (no Edge Function): quando un intervento
-- passa a status='completato', i report linkati con resolves_report=true
-- e status NOT IN ('risolta','chiuso') vengono chiusi atomicamente nella
-- stessa transaction. Activity log type='auto_closed_by_intervention'
-- scritto per ogni report chiuso, con user_id=NULL user_name='Sistema'
-- (azione di sistema, non dell'assignee).
--
-- View reports_with_planning aggiornata: planning_state aggrega solo i
-- link con resolves_report=true (corretto: report associati per contesto
-- restano "da_pianificare" perché serve un intervento dedicato).
-- Aggiunta colonna informativa linked_interventions_count = TUTTI i link
-- (anche contesto), per UI "Segnalazioni associate (N)".
--
-- DOWN: 055_intervention_reports_down.sql

-- ── 1. TABELLA intervention_reports ────────────────────────────────────
-- org_id: TEXT NOT NULL SENZA DEFAULT 'default'. Anti-pattern noto: il
-- default fasullo causa record invisibili tramite RLS. Il client DB layer
-- DEVE passare l'org_id esplicito (UUID stringa via getMyOrgId()).
--
-- TECH DEBT: org_id TEXT è allineamento con resto schema. Conversione a
-- UUID + rimozione 'default' fallback pianificato in Sprint 1d (vedi
-- ADR-007). Non bloccare 1c per questo.
CREATE TABLE IF NOT EXISTS public.intervention_reports (
  intervention_id   UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  report_id         UUID NOT NULL REFERENCES public.reports(id)       ON DELETE CASCADE,
  is_origin         BOOLEAN NOT NULL DEFAULT false,
  resolves_report   BOOLEAN NOT NULL DEFAULT true,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  added_by_name     TEXT,
  org_id            TEXT NOT NULL,
  PRIMARY KEY (intervention_id, report_id)
);

COMMENT ON TABLE public.intervention_reports IS
  'Join N→M tra interventions e reports. is_origin=true marca il report di creazione (max 1 per intervento). resolves_report=true significa che il completamento dell''intervento chiude automaticamente il report.';


-- ── 2. INDICI ──────────────────────────────────────────────────────────
-- Lookup veloce: dato un report → tutti gli interventi associati
CREATE INDEX IF NOT EXISTS idx_intervention_reports_report
  ON public.intervention_reports(report_id);

-- Filtro per resolves_report (usato dal trigger auto-close + view)
CREATE INDEX IF NOT EXISTS idx_intervention_reports_resolves
  ON public.intervention_reports(intervention_id)
  WHERE resolves_report = true;

-- Unique partial: max 1 link "origine" per intervento
CREATE UNIQUE INDEX IF NOT EXISTS uniq_intervention_origin
  ON public.intervention_reports(intervention_id)
  WHERE is_origin = true;


-- ── 3. ROW LEVEL SECURITY ──────────────────────────────────────────────
-- Pattern denormalizzato: org_id propria della join table → RLS semplici
-- come per interventions/comments/activities.
ALTER TABLE public.intervention_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intervention_reports_select" ON public.intervention_reports
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "intervention_reports_insert" ON public.intervention_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','tecnico')
  );

CREATE POLICY "intervention_reports_update" ON public.intervention_reports
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','tecnico')
  );

CREATE POLICY "intervention_reports_delete" ON public.intervention_reports
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );


-- ── 4. DATA MIGRATION ──────────────────────────────────────────────────
-- Preserva i link esistenti (interventions.report_id IS NOT NULL) come
-- is_origin=true + resolves_report=true. Eseguito PRIMA di droppare la
-- colonna report_id. ON CONFLICT DO NOTHING per idempotenza (es. retry
-- dopo un fallimento al DROP COLUMN successivo).
INSERT INTO public.intervention_reports (
  intervention_id, report_id, is_origin, resolves_report,
  added_at, added_by, added_by_name, org_id
)
SELECT
  i.id,
  i.report_id,
  true,            -- is_origin: questo è il report di creazione
  true,            -- resolves_report: comportamento "as if" il completamento risolve
  i.created_at,
  i.created_by,
  i.created_by_name,
  i.org_id
FROM public.interventions i
WHERE i.report_id IS NOT NULL
ON CONFLICT (intervention_id, report_id) DO NOTHING;


-- ── 5. CONSISTENCY CHECK pre-DROP ──────────────────────────────────────
-- Confronta count source vs count migrated PRIMA del DROP COLUMN.
-- Se non quadrano → RAISE EXCEPTION abortisce l'intera transaction
-- (la migration deve essere atomica: o tutto o niente).
-- Se quadrano → RAISE NOTICE con il numero (audit log della migration).
DO $$
DECLARE
  v_source_count INTEGER;
  v_migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_source_count
    FROM public.interventions
    WHERE report_id IS NOT NULL;

  SELECT COUNT(*) INTO v_migrated_count
    FROM public.intervention_reports
    WHERE is_origin = true;

  IF v_source_count <> v_migrated_count THEN
    RAISE EXCEPTION '[mig 055] Data migration mismatch: % link in interventions.report_id ma % righe is_origin=true in intervention_reports. ABORT prima del DROP COLUMN.',
      v_source_count, v_migrated_count;
  END IF;

  RAISE NOTICE '[mig 055] Data migration OK: % link preservati come is_origin=true.', v_source_count;
END $$;


-- ── 6. DROP VIEW reports_with_planning ────────────────────────────────
-- La view creata in mig 053 referenzia interventions.report_id. Va
-- droppata PRIMA del DROP COLUMN (PostgreSQL non droppa colonne usate
-- da view senza CASCADE). Verrà ricreata dopo il DROP COLUMN con la
-- nuova logica N→M.
DROP VIEW IF EXISTS public.reports_with_planning;


-- ── 7. DROP colonna interventions.report_id + indice ──────────────────
DROP INDEX IF EXISTS idx_interventions_report;

ALTER TABLE public.interventions
  DROP COLUMN IF EXISTS report_id;


-- ── 8. RICREA VIEW reports_with_planning (nuova logica N→M) ───────────
-- IMPORTANTE: aggregazione planning_state filtra resolves_report=true
-- (un report associato "per contesto" deve restare 'da_pianificare').
-- Colonna linked_interventions_count = TUTTI i link, per UI informativa.
CREATE VIEW public.reports_with_planning AS
SELECT
  r.*,
  COUNT(i.id) FILTER (WHERE i.status NOT IN ('annullato','completato')) AS active_interventions_count,
  COUNT(i.id) AS total_interventions_count,
  MIN(i.scheduled_start_at) FILTER (WHERE i.status NOT IN ('annullato','completato')) AS next_intervention_at,
  -- Conteggio informativo: include link "di contesto" (resolves_report=false)
  (SELECT COUNT(*) FROM public.intervention_reports
    WHERE report_id = r.id) AS linked_interventions_count,
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
LEFT JOIN public.intervention_reports ir
  ON ir.report_id = r.id AND ir.resolves_report = true
LEFT JOIN public.interventions i ON i.id = ir.intervention_id
GROUP BY r.id;

COMMENT ON VIEW public.reports_with_planning IS
  'Estende reports con stato di pianificazione aggregato. JOIN su intervention_reports filtra resolves_report=true (i link "di contesto" non contano per planning_state). Colonna linked_interventions_count include TUTTI i link (anche contesto) come dato informativo.';


-- ── 9. TRIGGER AUTO-CLOSE on intervention completed ───────────────────
-- Si attiva quando un intervento passa a status='completato'. Per ogni
-- report linkato con resolves_report=true e status NOT IN
-- ('risolta','chiuso'), update a 'risolta' + activity log.
--
-- IMPORTANTE: l'activity di auto-close è scritta come AZIONE DI SISTEMA:
--   user_id = NULL, user_name = 'Sistema'
-- L'audit trail risale al vero umano leggendo l'activity precedente
-- 'intervention_status_changed' (scritta da updateIntervention nel DB
-- layer client) che porta lo status da 'in_corso' a 'completato'.
--
-- SECURITY DEFINER: bypassa RLS perché esegue per conto del trigger system.
CREATE OR REPLACE FUNCTION public.on_intervention_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link RECORD;
BEGIN
  IF NEW.status = 'completato'
     AND (OLD.status IS NULL OR OLD.status <> 'completato') THEN

    FOR v_link IN
      SELECT report_id
      FROM public.intervention_reports
      WHERE intervention_id = NEW.id
        AND resolves_report = true
    LOOP
      -- Update report a 'risolta' (skip se già chiuso)
      UPDATE public.reports
      SET status = 'risolta',
          updated_at = now()
      WHERE id = v_link.report_id
        AND status NOT IN ('risolta', 'chiuso');

      -- Activity log SOLO se l'update ha cambiato qualcosa.
      -- user_id NULL + user_name 'Sistema': azione di sistema, non
      -- attribuita all'assignee dell'intervento.
      IF FOUND THEN
        INSERT INTO public.activities (
          report_id, intervention_id, type, detail,
          user_id, user_name, org_id, from_status, to_status
        ) VALUES (
          v_link.report_id, NEW.id, 'auto_closed_by_intervention',
          'Chiuso automaticamente alla completazione dell''intervento',
          NULL, 'Sistema', NEW.org_id,
          NULL, 'risolta'
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intervention_completed_close_reports ON public.interventions;
CREATE TRIGGER trg_intervention_completed_close_reports
  AFTER UPDATE OF status ON public.interventions
  FOR EACH ROW
  EXECUTE FUNCTION public.on_intervention_completed();


-- ── 10. REALTIME ──────────────────────────────────────────────────────
-- Aggiunta intervention_reports alla publication. Motivazione: il badge
-- "Segnalazioni associate (N)" sulla scheda report deve aggiornarsi LIVE
-- quando l'admin aggiunge/rimuove un link mentre un operatore guarda
-- quel report. Senza realtime su questa table, il badge resta stale fino
-- al prossimo refresh manuale.
ALTER PUBLICATION supabase_realtime ADD TABLE public.intervention_reports;
