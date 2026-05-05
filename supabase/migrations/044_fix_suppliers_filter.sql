-- ──────────────────────────────────────────────────────────────────────────
-- Migration 044 — Fix anagrafica fornitori AI: filtro su supplier_profiles
-- ──────────────────────────────────────────────────────────────────────────
-- Bug nella RPC get_assistant_suppliers_overview() introdotta dalla 043:
-- filtrava `WHERE u.role = 'supplier'`, ma in pratica i fornitori sono
-- registrati con role='tecnico' (o altro) + una riga in supplier_profiles
-- (e.g. PTS S.R.L, AEB SpA, KOSME Service Line, SERC SRL).
--
-- Risultato: la AI vedeva solo i fornitori che combaciavano per nome con
-- maintenance_logs.contractor_name (es. Manara), saltando completamente
-- chi non aveva interventi storici.
--
-- Fix: il discrimine non e' piu' il role ma la PRESENZA di una riga in
-- supplier_profiles. Cosi' chi viene gestito come fornitore nell'app
-- viene visto come tale anche dalla AI.

CREATE OR REPLACE FUNCTION public.get_assistant_suppliers_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_role   TEXT;
  v_result JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  v_role   := public.get_my_role();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Org non disponibile';
  END IF;
  IF v_role NOT IN ('admin', 'tecnico', 'super_admin') THEN
    RAISE EXCEPTION 'Accesso riservato a tecnici e admin';
  END IF;

  -- Fornitori registrati: chi ha una riga in supplier_profiles
  -- (indipendentemente dal role utente) E/O ha role='supplier'.
  WITH supplier_users AS (
    SELECT DISTINCT
      u.id            AS user_id,
      COALESCE(sp.company_name, u.name) AS supplier_name,
      sp.referent_name,
      sp.specialties,
      sp.city,
      u.status        AS user_status
    FROM public.users u
    LEFT JOIN public.supplier_profiles sp ON sp.user_id = u.id
    WHERE u.org_id = v_org_id
      AND (sp.user_id IS NOT NULL OR u.role = 'supplier')
  ),
  open_per_supplier AS (
    SELECT
      r.assigned_to,
      jsonb_agg(
        jsonb_build_object(
          'report_id', r.id,
          'title', r.title,
          'severity', r.severity,
          'status', r.status,
          'machine', r.machine,
          'age_hours', GREATEST(0, EXTRACT(EPOCH FROM (now() - r.created_at)) / 3600)::INT
        ) ORDER BY r.created_at DESC
      ) AS open_reports,
      COUNT(*)::INT AS open_count
    FROM public.reports r
    WHERE r.org_id = v_org_id
      AND r.status NOT IN ('risolta', 'chiuso')
      AND r.assigned_to IN (SELECT user_id FROM supplier_users)
    GROUP BY r.assigned_to
  ),
  resolved_per_supplier AS (
    SELECT
      r.assigned_to,
      COUNT(*)::INT AS resolved_12m
    FROM public.reports r
    WHERE r.org_id = v_org_id
      AND r.status IN ('risolta', 'chiuso')
      AND r.closed_at >= now() - INTERVAL '12 months'
      AND r.assigned_to IN (SELECT user_id FROM supplier_users)
    GROUP BY r.assigned_to
  ),
  logs_per_named_supplier AS (
    SELECT
      su.user_id,
      COUNT(*)::INT AS interventions_total,
      MAX(ml.performed_at)::TEXT AS last_intervention_at
    FROM public.maintenance_logs ml
    JOIN supplier_users su ON ml.contractor_name ILIKE '%' || su.supplier_name || '%'
    WHERE ml.org_id = v_org_id AND ml.is_external = true
    GROUP BY su.user_id
  ),
  shadow_contractors AS (
    SELECT
      ml.contractor_name AS supplier_name,
      COUNT(*)::INT AS interventions_total,
      MAX(ml.performed_at)::TEXT AS last_intervention_at,
      array_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL) AS machines
    FROM public.maintenance_logs ml
    LEFT JOIN public.machines m ON ml.machine_id = m.id
    WHERE ml.org_id = v_org_id
      AND ml.is_external = true
      AND ml.contractor_name IS NOT NULL
      AND TRIM(ml.contractor_name) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM supplier_users su
        WHERE ml.contractor_name ILIKE '%' || su.supplier_name || '%'
      )
    GROUP BY ml.contractor_name
  ),
  registered AS (
    SELECT
      jsonb_build_object(
        'kind', 'registered',
        'user_id', su.user_id,
        'supplier_name', su.supplier_name,
        'referent_name', su.referent_name,
        'specialties', su.specialties,
        'city', su.city,
        'user_status', su.user_status,
        'open_count', COALESCE(ops.open_count, 0),
        'open_reports', COALESCE(ops.open_reports, '[]'::jsonb),
        'resolved_12m', COALESCE(rps.resolved_12m, 0),
        'interventions_total', COALESCE(lps.interventions_total, 0),
        'last_intervention_at', lps.last_intervention_at
      ) AS supplier_obj,
      COALESCE(ops.open_count, 0) + COALESCE(rps.resolved_12m, 0) + COALESCE(lps.interventions_total, 0) AS activity_score
    FROM supplier_users su
    LEFT JOIN open_per_supplier ops ON ops.assigned_to = su.user_id
    LEFT JOIN resolved_per_supplier rps ON rps.assigned_to = su.user_id
    LEFT JOIN logs_per_named_supplier lps ON lps.user_id = su.user_id
  ),
  shadow AS (
    SELECT
      jsonb_build_object(
        'kind', 'shadow',
        'supplier_name', sc.supplier_name,
        'machines', to_jsonb(sc.machines),
        'open_count', 0,
        'open_reports', '[]'::jsonb,
        'resolved_12m', 0,
        'interventions_total', sc.interventions_total,
        'last_intervention_at', sc.last_intervention_at
      ) AS supplier_obj,
      sc.interventions_total AS activity_score
    FROM shadow_contractors sc
  )
  SELECT jsonb_agg(supplier_obj ORDER BY activity_score DESC, supplier_obj->>'supplier_name')
  INTO v_result
  FROM (
    SELECT * FROM registered
    UNION ALL
    SELECT * FROM shadow
  ) all_suppliers;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
