-- ──────────────────────────────────────────────────────────────────────────
-- Migration 037 — Optimization KPIs (dashboard "Ottimizzazione")
-- ──────────────────────────────────────────────────────────────────────────
-- Aggiunge una RPC SECURITY DEFINER che restituisce in un'unica chiamata i
-- KPI per la dashboard Ottimizzazione: MTTR, MTBF, ratio preventiva/reattiva,
-- top macchine problematiche, top cause radice, trend 30/90 giorni.
--
-- Usa una finestra di 90gg (window) e confronta con i 90gg precedenti
-- (window_prev) per calcolare i delta. Aggregazioni unicamente sull'org_id
-- dell'utente loggato (get_my_org_id) e ristrette al ruolo admin.
--
-- Restituisce un singolo JSONB con la forma documentata in src/lib/db/analytics.js.

CREATE OR REPLACE FUNCTION public.get_optimization_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_role   TEXT;
  v_now    TIMESTAMPTZ := now();
  v_w_start TIMESTAMPTZ := now() - INTERVAL '90 days';
  v_w_prev  TIMESTAMPTZ := now() - INTERVAL '180 days';

  v_mttr_curr NUMERIC;
  v_mttr_prev NUMERIC;
  v_mtbf_days NUMERIC;
  v_mtbf_prev NUMERIC;

  v_prev_count_curr INT;
  v_corr_count_curr INT;
  v_prev_count_prev INT;
  v_corr_count_prev INT;
  v_prev_ratio_curr NUMERIC;
  v_prev_ratio_prev NUMERIC;

  v_open_critical INT;
  v_open_high INT;
  v_overdue_plans INT;

  v_top_machines JSONB;
  v_top_root_causes JSONB;
  v_trend_30 JSONB;
  v_total_machines INT;
BEGIN
  v_org_id := public.get_my_org_id();
  v_role   := public.get_my_role();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Org non disponibile';
  END IF;
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Accesso riservato agli admin';
  END IF;

  -- ── MTTR (Mean Time To Repair) — ore medie risoluzione, ultimi 90gg ──
  SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600.0)
    INTO v_mttr_curr
    FROM public.reports
   WHERE org_id = v_org_id
     AND closed_at IS NOT NULL
     AND closed_at >= v_w_start;

  SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600.0)
    INTO v_mttr_prev
    FROM public.reports
   WHERE org_id = v_org_id
     AND closed_at IS NOT NULL
     AND closed_at >= v_w_prev
     AND closed_at < v_w_start;

  -- ── MTBF — giorni medi tra guasti consecutivi per macchina, finestra 90gg ──
  WITH gaps AS (
    SELECT
      machine_id,
      EXTRACT(EPOCH FROM (
        created_at - LAG(closed_at) OVER (PARTITION BY machine_id ORDER BY created_at)
      )) / 86400.0 AS gap_days
    FROM public.reports
    WHERE org_id = v_org_id
      AND machine_id IS NOT NULL
      AND type = 'correttiva'
      AND closed_at IS NOT NULL
      AND closed_at >= v_w_start
  )
  SELECT AVG(gap_days) INTO v_mtbf_days FROM gaps WHERE gap_days > 0;

  WITH gaps_prev AS (
    SELECT
      machine_id,
      EXTRACT(EPOCH FROM (
        created_at - LAG(closed_at) OVER (PARTITION BY machine_id ORDER BY created_at)
      )) / 86400.0 AS gap_days
    FROM public.reports
    WHERE org_id = v_org_id
      AND machine_id IS NOT NULL
      AND type = 'correttiva'
      AND closed_at IS NOT NULL
      AND closed_at >= v_w_prev
      AND closed_at < v_w_start
  )
  SELECT AVG(gap_days) INTO v_mtbf_prev FROM gaps_prev WHERE gap_days > 0;

  -- ── Ratio preventiva/reattiva ──
  -- Manutenzione preventiva = maintenance_logs (interventi programmati)
  -- Manutenzione reattiva   = reports type='correttiva'
  SELECT COUNT(*) INTO v_prev_count_curr
    FROM public.maintenance_logs
   WHERE org_id = v_org_id
     AND performed_at >= v_w_start;

  SELECT COUNT(*) INTO v_corr_count_curr
    FROM public.reports
   WHERE org_id = v_org_id
     AND type = 'correttiva'
     AND created_at >= v_w_start;

  SELECT COUNT(*) INTO v_prev_count_prev
    FROM public.maintenance_logs
   WHERE org_id = v_org_id
     AND performed_at >= v_w_prev
     AND performed_at < v_w_start;

  SELECT COUNT(*) INTO v_corr_count_prev
    FROM public.reports
   WHERE org_id = v_org_id
     AND type = 'correttiva'
     AND created_at >= v_w_prev
     AND created_at < v_w_start;

  v_prev_ratio_curr := CASE
    WHEN (v_prev_count_curr + v_corr_count_curr) > 0
    THEN (v_prev_count_curr::NUMERIC / (v_prev_count_curr + v_corr_count_curr)) * 100
    ELSE NULL
  END;
  v_prev_ratio_prev := CASE
    WHEN (v_prev_count_prev + v_corr_count_prev) > 0
    THEN (v_prev_count_prev::NUMERIC / (v_prev_count_prev + v_corr_count_prev)) * 100
    ELSE NULL
  END;

  -- ── Stato attuale: aperti per severità + piani in ritardo ──
  SELECT COUNT(*) INTO v_open_critical
    FROM public.reports
   WHERE org_id = v_org_id
     AND severity = 'critica'
     AND status NOT IN ('risolta', 'chiuso');

  SELECT COUNT(*) INTO v_open_high
    FROM public.reports
   WHERE org_id = v_org_id
     AND severity = 'alta'
     AND status NOT IN ('risolta', 'chiuso');

  -- Piani scaduti = ultimo log + frequency_days < oggi
  WITH last_log AS (
    SELECT plan_id, MAX(performed_at) AS last_at
      FROM public.maintenance_logs
     WHERE org_id = v_org_id AND plan_id IS NOT NULL
     GROUP BY plan_id
  )
  SELECT COUNT(*) INTO v_overdue_plans
    FROM public.maintenance_plans p
    LEFT JOIN last_log l ON l.plan_id = p.id
   WHERE p.org_id = v_org_id
     AND COALESCE(l.last_at, p.created_at) + (p.frequency_days || ' days')::INTERVAL < v_now;

  -- ── Top 5 macchine problematiche per ore-fermo ──
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'downtime_hours')::NUMERIC DESC), '[]'::jsonb)
    INTO v_top_machines
    FROM (
      SELECT jsonb_build_object(
        'machine_id', m.id,
        'machine_name', m.name,
        'incident_count', COUNT(r.id),
        'downtime_hours', ROUND(
          COALESCE(SUM(EXTRACT(EPOCH FROM (r.closed_at - r.created_at)) / 3600.0), 0)::NUMERIC,
          1
        ),
        'open_count', COUNT(*) FILTER (WHERE r.status NOT IN ('risolta', 'chiuso'))
      ) AS t
      FROM public.machines m
      JOIN public.reports r
        ON r.machine_id = m.id
       AND r.org_id = m.org_id
       AND r.created_at >= v_w_start
      WHERE m.org_id = v_org_id
      GROUP BY m.id, m.name
      ORDER BY SUM(EXTRACT(EPOCH FROM (COALESCE(r.closed_at, v_now) - r.created_at)) / 3600.0) DESC
      LIMIT 5
    ) sub;

  -- ── Top 5 cause radice ──
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::INT DESC), '[]'::jsonb)
    INTO v_top_root_causes
    FROM (
      SELECT jsonb_build_object(
        'cause', closure_root_cause,
        'count', COUNT(*)
      ) AS t
      FROM public.reports
      WHERE org_id = v_org_id
        AND closure_root_cause IS NOT NULL
        AND TRIM(closure_root_cause) <> ''
        AND closed_at >= v_w_start
      GROUP BY closure_root_cause
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) sub;

  -- ── Trend ultimi 30gg vs precedenti 30gg ──
  SELECT jsonb_build_object(
    'corrective_now',  COUNT(*) FILTER (WHERE type = 'correttiva' AND created_at >= v_now - INTERVAL '30 days'),
    'corrective_prev', COUNT(*) FILTER (WHERE type = 'correttiva' AND created_at >= v_now - INTERVAL '60 days' AND created_at < v_now - INTERVAL '30 days')
  ) INTO v_trend_30
  FROM public.reports
  WHERE org_id = v_org_id;

  v_trend_30 := v_trend_30 || jsonb_build_object(
    'preventive_now',  (SELECT COUNT(*) FROM public.maintenance_logs WHERE org_id = v_org_id AND performed_at >= v_now - INTERVAL '30 days'),
    'preventive_prev', (SELECT COUNT(*) FROM public.maintenance_logs WHERE org_id = v_org_id AND performed_at >= v_now - INTERVAL '60 days' AND performed_at < v_now - INTERVAL '30 days')
  );

  SELECT COUNT(*) INTO v_total_machines FROM public.machines WHERE org_id = v_org_id;

  RETURN jsonb_build_object(
    'mttr_hours', ROUND(COALESCE(v_mttr_curr, 0)::NUMERIC, 1),
    'mttr_hours_prev', ROUND(COALESCE(v_mttr_prev, 0)::NUMERIC, 1),
    'mtbf_days', ROUND(COALESCE(v_mtbf_days, 0)::NUMERIC, 1),
    'mtbf_days_prev', ROUND(COALESCE(v_mtbf_prev, 0)::NUMERIC, 1),
    'preventive_ratio_pct', ROUND(COALESCE(v_prev_ratio_curr, 0)::NUMERIC, 1),
    'preventive_ratio_prev_pct', ROUND(COALESCE(v_prev_ratio_prev, 0)::NUMERIC, 1),
    'preventive_count', v_prev_count_curr,
    'corrective_count', v_corr_count_curr,
    'open_critical', v_open_critical,
    'open_high', v_open_high,
    'overdue_plans', v_overdue_plans,
    'total_machines', v_total_machines,
    'top_machines', v_top_machines,
    'top_root_causes', v_top_root_causes,
    'trend_30d', v_trend_30,
    'window_days', 90,
    'generated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_optimization_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_optimization_dashboard() TO authenticated;

COMMENT ON FUNCTION public.get_optimization_dashboard() IS
  'KPI ottimizzazione manutenzione (90gg + delta vs 90gg prec.). Solo admin.';
