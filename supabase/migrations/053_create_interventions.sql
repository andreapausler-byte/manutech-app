-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 053 — Interventions (Sprint 1a foundation)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Nuova entità di pianificazione. Si colloca tra reports/maintenance_plans
-- (origini) e maintenance_logs (consuntivo): rappresenta la "prenotazione"
-- di un intervento sul campo, eseguito da tecnico interno o fornitore esterno.
--
-- Vocabolari allineati a reports:
--   type     ∈ ('correttiva','preventiva','migliorativa','ispezione')
--   severity ∈ ('bassa','media','alta','critica')
-- Workflow specifico interventi:
--   status   ∈ ('bozza','pianificato','confermato','in_corso','completato','annullato')
-- Origine (vincolata):
--   origin   ∈ ('report','maintenance_plan','manuale')
--
-- Polimorfismo audit log: aggiunge intervention_id a activities, notifications,
-- maintenance_logs (stesso pattern di spare_order_id introdotto in mig 051).
-- activities.report_id diventa NULLABLE per supportare interventi 'manuale'.
--
-- View reports_with_planning aggrega lo stato di pianificazione dei reports:
-- usata dalla lista admin per il badge planning_state.
--
-- DOWN: 053_create_interventions_down.sql

-- ── 1. TABELLA interventions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interventions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL DEFAULT 'default',

  -- Vocabolario allineato a reports
  type        TEXT NOT NULL DEFAULT 'correttiva'
              CHECK (type IN ('correttiva','preventiva','migliorativa','ispezione')),
  severity    TEXT NOT NULL DEFAULT 'media'
              CHECK (severity IN ('bassa','media','alta','critica')),

  -- Workflow specifico interventi
  status      TEXT NOT NULL DEFAULT 'pianificato'
              CHECK (status IN ('bozza','pianificato','confermato','in_corso','completato','annullato')),

  -- Contenuto descrittivo
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',

  -- Macchinario (pattern reports: FK + snapshot nome)
  machine_id   UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  machine_name TEXT,

  -- Origine: zero o una FK valorizzata. Vincolata via constraint sotto.
  report_id            UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  maintenance_plan_id  UUID REFERENCES public.maintenance_plans(id) ON DELETE SET NULL,
  origin               TEXT NOT NULL DEFAULT 'manuale'
                       CHECK (origin IN ('report','maintenance_plan','manuale')),

  -- Assegnazione (pattern reports: FK + snapshot nome + snapshot ruolo)
  assigned_to       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_name  TEXT,
  assigned_to_role  TEXT,

  -- Pianificazione temporale
  scheduled_start_at       TIMESTAMPTZ,
  scheduled_end_at         TIMESTAMPTZ,
  estimated_duration_min   INTEGER,

  -- Esecuzione effettiva
  actual_start_at  TIMESTAMPTZ,
  actual_end_at    TIMESTAMPTZ,

  -- Posizione fisica (denormalizzata)
  location        TEXT,

  -- Note di pianificazione (es. "concordato via mail il 09/05, conferma fornitore pendente")
  planning_notes  TEXT,

  -- Audit standard
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),

  -- Allegati ed estensioni (jsonb come da pattern ManuTech)
  media       JSONB DEFAULT '[]'::jsonb,
  extra_data  JSONB DEFAULT '{}'::jsonb,

  -- Solo una FK di origine valorizzata
  CONSTRAINT interventions_single_origin CHECK (
    (CASE WHEN report_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN maintenance_plan_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  ),

  -- Coerenza tra campo origin e FK valorizzata
  CONSTRAINT interventions_origin_consistency CHECK (
    (origin = 'report'            AND report_id IS NOT NULL) OR
    (origin = 'maintenance_plan'  AND maintenance_plan_id IS NOT NULL) OR
    (origin = 'manuale'           AND report_id IS NULL AND maintenance_plan_id IS NULL)
  )
);


-- ── 2. INDICI ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interventions_org_scheduled
  ON public.interventions(org_id, scheduled_start_at);

CREATE INDEX IF NOT EXISTS idx_interventions_assigned
  ON public.interventions(assigned_to, scheduled_start_at)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_report
  ON public.interventions(report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_plan
  ON public.interventions(maintenance_plan_id)
  WHERE maintenance_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_machine
  ON public.interventions(machine_id)
  WHERE machine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_status
  ON public.interventions(org_id, status);


-- ── 3. TRIGGER updated_at ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_interventions_updated ON public.interventions;
CREATE TRIGGER trg_interventions_updated
  BEFORE UPDATE ON public.interventions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── 4. ROW LEVEL SECURITY (mirror maintenance_plans) ───────────────────
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interventions_select" ON public.interventions
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "interventions_insert" ON public.interventions
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','tecnico')
  );

-- Admin modifica tutto; assegnatario modifica i propri (per started/completed)
CREATE POLICY "interventions_update" ON public.interventions
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND (
      public.get_my_role() = 'admin'
      OR assigned_to = public.get_my_user_id()
    )
  );

CREATE POLICY "interventions_delete" ON public.interventions
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() = 'admin'
  );


-- ── 5. ALTER activities: report_id nullable + intervention_id ──────────
-- Gli interventi 'manuale' non hanno un report di origine, quindi serve
-- consentire activities senza report_id. Esistenti righe restano valide.
ALTER TABLE public.activities
  ALTER COLUMN report_id DROP NOT NULL;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS intervention_id UUID
    REFERENCES public.interventions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_activities_intervention
  ON public.activities(intervention_id)
  WHERE intervention_id IS NOT NULL;


-- ── 6. ALTER notifications: intervention_id ────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS intervention_id UUID
    REFERENCES public.interventions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_intervention
  ON public.notifications(intervention_id)
  WHERE intervention_id IS NOT NULL;


-- ── 7. ALTER maintenance_logs: intervention_id ─────────────────────────
-- Quando un intervento viene completato e genera un log, lo collega qui.
ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS intervention_id UUID
    REFERENCES public.interventions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_intervention
  ON public.maintenance_logs(intervention_id)
  WHERE intervention_id IS NOT NULL;


-- ── 8. VIEW reports_with_planning ──────────────────────────────────────
-- Aggrega lo stato di pianificazione dei reports tramite gli interventi
-- collegati. Usata dalla lista admin per il badge planning_state.
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
    WHEN BOOL_OR(i.status = 'in_corso')
      THEN 'in_corso'
    WHEN COUNT(i.id) FILTER (WHERE i.status IN ('pianificato','confermato')) > 0
      THEN 'pianificato'
    WHEN r.status = 'risolta'
      THEN 'risolta'
    ELSE 'altro'
  END AS planning_state
FROM public.reports r
LEFT JOIN public.interventions i ON i.report_id = r.id
GROUP BY r.id;

COMMENT ON VIEW public.reports_with_planning IS
  'Estende reports con stato di pianificazione aggregato dagli interventi collegati. Usata da calendario e lista segnalazioni admin.';


-- ── 9. REALTIME ────────────────────────────────────────────────────────
-- ManuTech usa publication per-table. Aggiungiamo interventions.
ALTER PUBLICATION supabase_realtime ADD TABLE public.interventions;


-- ── 10. SEED DEV-ONLY ──────────────────────────────────────────────────
-- Genera 5 interventi di esempio collegati ai primi 5 reports 'aperta'.
-- Guard: esegue solo se org_id 1235103f-... esiste. NON eseguire in produzione.
DO $$
DECLARE
  v_org_id        TEXT := '1235103f-45e5-4fa5-a256-3ca5f39dcf1e';
  v_sample_report RECORD;
  v_admin_user    RECORD;
  v_tech_user     RECORD;
  v_counter       INT := 0;
BEGIN
  -- Recupera un admin
  SELECT id, name, role INTO v_admin_user
  FROM public.users
  WHERE org_id = v_org_id AND role = 'admin'
  LIMIT 1;

  IF v_admin_user.id IS NULL THEN
    RAISE NOTICE '[053-seed] Nessun admin trovato per org %, skip seed', v_org_id;
    RETURN;
  END IF;

  -- Recupera un tecnico (opzionale)
  SELECT id, name, role INTO v_tech_user
  FROM public.users
  WHERE org_id = v_org_id AND role = 'tecnico'
  LIMIT 1;

  -- Genera interventi dai primi 5 reports aperti
  FOR v_sample_report IN
    SELECT r.id, r.title, r.machine_id, r.machine, r.severity, r.type
    FROM public.reports r
    WHERE r.org_id = v_org_id AND r.status = 'aperta'
    LIMIT 5
  LOOP
    v_counter := v_counter + 1;
    INSERT INTO public.interventions (
      org_id, type, severity, status,
      title, description,
      machine_id, machine_name,
      report_id, origin,
      assigned_to, assigned_to_name, assigned_to_role,
      scheduled_start_at, scheduled_end_at, estimated_duration_min,
      created_by, created_by_name
    ) VALUES (
      v_org_id,
      COALESCE(v_sample_report.type, 'correttiva'),
      COALESCE(v_sample_report.severity, 'media'),
      'pianificato',
      'Intervento per: ' || v_sample_report.title,
      'Generato da seed di sviluppo (mig 053)',
      v_sample_report.machine_id,
      v_sample_report.machine,
      v_sample_report.id,
      'report',
      v_tech_user.id,
      v_tech_user.name,
      v_tech_user.role,
      now() + (v_counter || ' days')::interval,
      now() + (v_counter || ' days')::interval + interval '2 hours',
      120,
      v_admin_user.id,
      v_admin_user.name
    );
  END LOOP;

  RAISE NOTICE '[053-seed] % interventi seed creati', v_counter;
END $$;
