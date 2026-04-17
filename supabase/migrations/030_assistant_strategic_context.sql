-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 030: Assistant — Anagrafica + insight strategici  ║
-- ║                                                                ║
-- ║  Fa evolvere l'assistente AI da "lookup diagnostico" a vero   ║
-- ║  strumento di governance della manutenzione. Aggiunge:        ║
-- ║                                                                ║
-- ║   - get_machines_inventory()      → anagrafica completa       ║
-- ║       (matricole, modelli, produttori, reparto, stato...)     ║
-- ║   - get_assistant_strategic_insights()                        ║
-- ║       ranking macchine a rischio, manutenzioni scadute,       ║
-- ║       pattern di guasto ricorrenti, riparazioni lunghe        ║
-- ║   - get_machine_history() [REPLACE] ora include               ║
-- ║       serial_number / manufacturer / model / year / location  ║
-- ║       department / criticality                                ║
-- ║                                                                ║
-- ║  Tutte SECURITY DEFINER + filtrate per org via get_my_org_id. ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────
-- 1. RPC: get_machines_inventory
-- ────────────────────────────────────────────────────────────────
-- Ritorna l'anagrafica macchinari dell'org.
-- Usata dall'AI per rispondere a domande del tipo:
--   "Dammi le matricole di tutti i macchinari"
--   "Che modello è la X?"
--   "Quali macchine sono dismesse?"
-- Cap a 200 per evitare context overflow su org molto grandi.

CREATE OR REPLACE FUNCTION public.get_machines_inventory()
RETURNS TABLE (
  id UUID,
  name TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,
  year INTEGER,
  department TEXT,
  location TEXT,
  status TEXT,
  criticality TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.serial_number,
    m.manufacturer,
    m.model,
    m.year,
    m.department,
    m.location,
    m.status,
    m.criticality
  FROM public.machines m
  WHERE m.org_id = v_org_id
  ORDER BY
    CASE m.criticality WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
    m.name ASC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machines_inventory() TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2. RPC: get_machine_history (REPLACE — aggiunta anagrafica)
-- ────────────────────────────────────────────────────────────────
-- Versione estesa rispetto a migration 027. Include i campi
-- identificativi (serial_number, manufacturer, model, year,
-- location, department, criticality) così che l'AI, quando
-- l'utente sta guardando una macchina specifica, possa
-- rispondere a domande tipo "che matricola ha?".

CREATE OR REPLACE FUNCTION public.get_machine_history(
  p_machine_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_machine RECORD;
  v_recurring JSONB;
  v_mttr_hours NUMERIC;
  v_total_reports INTEGER;
  v_recent_maintenance JSONB;
  v_upcoming_maintenance JSONB;
  v_top_parts JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL OR p_machine_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Anagrafica macchina
  SELECT
    m.name, m.serial_number, m.manufacturer, m.model, m.year,
    m.department, m.location, m.status, m.criticality
  INTO v_machine
  FROM public.machines m
  WHERE m.id = p_machine_id AND m.org_id = v_org_id;

  IF v_machine IS NULL OR v_machine.name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Conteggio totale report sulla macchina
  SELECT COUNT(*) INTO v_total_reports
  FROM public.reports
  WHERE machine_id = p_machine_id AND org_id = v_org_id;

  -- Tipi guasto ricorrenti
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::jsonb)
  INTO v_recurring
  FROM (
    SELECT type, COUNT(*)::INTEGER AS count
    FROM public.reports
    WHERE machine_id = p_machine_id AND org_id = v_org_id AND type IS NOT NULL
    GROUP BY type
    ORDER BY count DESC
    LIMIT 5
  ) t;

  -- MTTR su report risolti
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)::numeric, 1)
  INTO v_mttr_hours
  FROM public.reports
  WHERE machine_id = p_machine_id
    AND org_id = v_org_id
    AND status IN ('risolta', 'chiuso')
    AND closed_at IS NOT NULL
    AND created_at IS NOT NULL;

  -- Ultime 5 manutenzioni eseguite
  SELECT COALESCE(jsonb_agg(row_to_json(ml) ORDER BY ml.performed_at DESC), '[]'::jsonb)
  INTO v_recent_maintenance
  FROM (
    SELECT
      title,
      type,
      LEFT(COALESCE(description, ''), 200) AS description,
      LEFT(COALESCE(parts_replaced, ''), 200) AS parts_replaced,
      performed_by_name,
      to_char(performed_at, 'DD/MM/YYYY') AS performed_at_label,
      performed_at
    FROM public.maintenance_logs
    WHERE machine_id = p_machine_id AND org_id = v_org_id
    ORDER BY performed_at DESC
    LIMIT 5
  ) ml;

  -- Piani manutenzione in scadenza/scadute
  SELECT COALESCE(jsonb_agg(row_to_json(mp) ORDER BY mp.days_to_due ASC), '[]'::jsonb)
  INTO v_upcoming_maintenance
  FROM (
    SELECT
      mp.name,
      mp.frequency_days,
      mp.current_status,
      to_char(next_due, 'DD/MM/YYYY') AS next_due_label,
      EXTRACT(DAY FROM (next_due - NOW()))::INTEGER AS days_to_due
    FROM (
      SELECT
        mp.id,
        mp.name,
        mp.frequency_days,
        mp.current_status,
        COALESCE(
          (SELECT MAX(performed_at) FROM public.maintenance_logs
            WHERE plan_id = mp.id),
          mp.created_at
        ) + (mp.frequency_days || ' days')::INTERVAL AS next_due
      FROM public.maintenance_plans mp
      WHERE mp.machine_id = p_machine_id AND mp.org_id = v_org_id
    ) mp
    WHERE next_due < NOW() + INTERVAL '30 days'
    ORDER BY next_due ASC
    LIMIT 5
  ) mp;

  -- Ricambi più citati nei closure_parts dei report risolti (raw text)
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.usage_count DESC), '[]'::jsonb)
  INTO v_top_parts
  FROM (
    SELECT
      LEFT(closure_parts, 80) AS parts,
      COUNT(*)::INTEGER AS usage_count
    FROM public.reports
    WHERE machine_id = p_machine_id
      AND org_id = v_org_id
      AND closure_parts IS NOT NULL
      AND closure_parts <> ''
    GROUP BY closure_parts
    ORDER BY usage_count DESC
    LIMIT 5
  ) p;

  RETURN jsonb_build_object(
    'machine_name', v_machine.name,
    'serial_number', v_machine.serial_number,
    'manufacturer', v_machine.manufacturer,
    'model', v_machine.model,
    'year', v_machine.year,
    'department', v_machine.department,
    'location', v_machine.location,
    'status', v_machine.status,
    'criticality', v_machine.criticality,
    'total_reports', v_total_reports,
    'mttr_hours', v_mttr_hours,
    'recurring_types', v_recurring,
    'recent_maintenance', v_recent_maintenance,
    'upcoming_maintenance', v_upcoming_maintenance,
    'top_parts', v_top_parts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machine_history(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 3. RPC: get_assistant_strategic_insights
-- ────────────────────────────────────────────────────────────────
-- KPI strategici per guidare il manager della manutenzione.
-- Pensato per rispondere a domande tipo:
--   "Su quali macchine devo concentrarmi per ridurre i fermi?"
--   "Quali manutenzioni preventive sono scadute?"
--   "Qual è il pattern di guasto più comune?"
--   "Dove sto perdendo più tempo in riparazioni?"
--
-- Ritorna 4 blocchi:
--   1. machines_at_risk  — ranking per (critici aperti, aperti, MTTR)
--   2. overdue_preventive — piani manutenzione scaduti (= rischio fermo)
--   3. recurring_failures — tipi guasto ricorrenti a livello org
--   4. long_repairs       — riparazioni lunghe (outlier ore) recenti
--
-- Finestra temporale: ultimi 90 giorni per le metriche dinamiche.

CREATE OR REPLACE FUNCTION public.get_assistant_strategic_insights()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_machines_at_risk JSONB;
  v_overdue_preventive JSONB;
  v_recurring_failures JSONB;
  v_long_repairs JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'machines_at_risk', '[]'::jsonb,
      'overdue_preventive', '[]'::jsonb,
      'recurring_failures', '[]'::jsonb,
      'long_repairs', '[]'::jsonb
    );
  END IF;

  -- 1. Macchine a rischio: ranking basato su segnalazioni aperte,
  -- criticità aperte, MTTR. Incluse solo macchine con almeno 1 report.
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.risk_score DESC), '[]'::jsonb)
  INTO v_machines_at_risk
  FROM (
    SELECT
      r.machine_id,
      COALESCE(mch.name, r.machine) AS machine_name,
      mch.serial_number,
      mch.criticality AS machine_criticality,
      COUNT(*)::INTEGER AS total_reports,
      COUNT(*) FILTER (WHERE r.status NOT IN ('risolta', 'chiuso'))::INTEGER AS open_reports,
      COUNT(*) FILTER (
        WHERE r.severity = 'critica' AND r.status NOT IN ('risolta', 'chiuso')
      )::INTEGER AS critical_open,
      COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '90 days')::INTEGER AS reports_last_90d,
      ROUND(AVG(
        EXTRACT(EPOCH FROM (r.closed_at - r.created_at)) / 3600
      ) FILTER (
        WHERE r.status IN ('risolta', 'chiuso')
          AND r.closed_at IS NOT NULL
          AND r.created_at IS NOT NULL
      )::numeric, 1) AS mttr_hours,
      to_char(MAX(r.created_at) FILTER (WHERE r.severity = 'critica'), 'DD/MM/YYYY') AS last_critical_at,
      -- Risk score empirico
      (COUNT(*) FILTER (
          WHERE r.severity = 'critica' AND r.status NOT IN ('risolta', 'chiuso')
        ) * 3
        + COUNT(*) FILTER (WHERE r.status NOT IN ('risolta', 'chiuso')) * 1.5
        + COALESCE(ROUND(AVG(
            EXTRACT(EPOCH FROM (r.closed_at - r.created_at)) / 3600
          ) FILTER (
            WHERE r.status IN ('risolta', 'chiuso')
              AND r.closed_at IS NOT NULL
              AND r.created_at IS NOT NULL
          )::numeric, 1), 0) * 0.1
        + COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '90 days') * 0.5
        + CASE mch.criticality WHEN 'alta' THEN 2 WHEN 'media' THEN 1 ELSE 0 END
      )::NUMERIC AS risk_score
    FROM public.reports r
    LEFT JOIN public.machines mch ON mch.id = r.machine_id AND mch.org_id = v_org_id
    WHERE r.org_id = v_org_id
      AND (r.machine_id IS NOT NULL OR (r.machine IS NOT NULL AND r.machine <> ''))
    GROUP BY r.machine_id, mch.name, r.machine, mch.serial_number, mch.criticality
    ORDER BY risk_score DESC
    LIMIT 10
  ) m;

  -- 2. Manutenzioni preventive scadute o prossime (entro 7 giorni).
  -- Proxy dei fermi imprevisti: se una preventiva è saltata,
  -- il rischio di fermo straordinario aumenta.
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.days_overdue DESC), '[]'::jsonb)
  INTO v_overdue_preventive
  FROM (
    SELECT
      mp.name AS plan_name,
      mp.frequency_days,
      COALESCE(mch.name, '—') AS machine_name,
      mch.serial_number,
      to_char(next_due, 'DD/MM/YYYY') AS next_due_label,
      GREATEST(0, -EXTRACT(DAY FROM (next_due - NOW()))::INTEGER) AS days_overdue,
      EXTRACT(DAY FROM (next_due - NOW()))::INTEGER AS days_to_due
    FROM (
      SELECT
        mp.id,
        mp.name,
        mp.frequency_days,
        mp.machine_id,
        COALESCE(
          (SELECT MAX(performed_at) FROM public.maintenance_logs
            WHERE plan_id = mp.id),
          mp.created_at
        ) + (mp.frequency_days || ' days')::INTERVAL AS next_due
      FROM public.maintenance_plans mp
      WHERE mp.org_id = v_org_id
    ) mp
    LEFT JOIN public.machines mch ON mch.id = mp.machine_id AND mch.org_id = v_org_id
    WHERE next_due < NOW() + INTERVAL '7 days'
    ORDER BY next_due ASC
    LIMIT 15
  ) p;

  -- 3. Pattern di guasto ricorrenti a livello organizzazione
  -- (ultimi 90 giorni). Aiuta a identificare problemi sistemici.
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.count DESC), '[]'::jsonb)
  INTO v_recurring_failures
  FROM (
    SELECT
      COALESCE(r.type, '—') AS type,
      COUNT(*)::INTEGER AS count,
      COUNT(DISTINCT r.machine_id)::INTEGER AS distinct_machines,
      COUNT(*) FILTER (WHERE r.severity = 'critica')::INTEGER AS critical_count
    FROM public.reports r
    WHERE r.org_id = v_org_id
      AND r.created_at > NOW() - INTERVAL '90 days'
      AND r.type IS NOT NULL
    GROUP BY r.type
    ORDER BY count DESC
    LIMIT 8
  ) f;

  -- 4. Riparazioni lunghe: top closure_hours degli ultimi 90gg.
  -- Candidati per analisi approfondita e formazione tecnici.
  SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY l.closure_hours DESC), '[]'::jsonb)
  INTO v_long_repairs
  FROM (
    SELECT
      r.title,
      COALESCE(mch.name, r.machine) AS machine_name,
      r.severity,
      r.type,
      r.closure_hours,
      LEFT(COALESCE(r.closure_root_cause, ''), 200) AS closure_root_cause,
      to_char(r.closed_at, 'DD/MM/YYYY') AS closed_at_label
    FROM public.reports r
    LEFT JOIN public.machines mch ON mch.id = r.machine_id AND mch.org_id = v_org_id
    WHERE r.org_id = v_org_id
      AND r.status IN ('risolta', 'chiuso')
      AND r.closure_hours IS NOT NULL
      AND r.closure_hours > 0
      AND r.closed_at > NOW() - INTERVAL '90 days'
    ORDER BY r.closure_hours DESC
    LIMIT 5
  ) l;

  RETURN jsonb_build_object(
    'machines_at_risk', v_machines_at_risk,
    'overdue_preventive', v_overdue_preventive,
    'recurring_failures', v_recurring_failures,
    'long_repairs', v_long_repairs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_strategic_insights() TO authenticated;
