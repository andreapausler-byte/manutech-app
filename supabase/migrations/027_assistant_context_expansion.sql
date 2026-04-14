-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 027: Espansione contesto Assistente AI            ║
-- ║                                                                ║
-- ║  Aggiunge nuove fonti dati per l'edge function assistant-chat ║
-- ║  così che l'AI possa rispondere anche a domande meta          ║
-- ║  ("quale macchinario ha più segnalazioni?") e guidare         ║
-- ║  l'operatore con visibilità su report aperti, storia macchina ║
-- ║  e ricambi ricorrenti.                                        ║
-- ║                                                                ║
-- ║  Nuove RPC (tutte SECURITY DEFINER, filtrate per org):        ║
-- ║   - get_assistant_org_stats()                                 ║
-- ║   - get_open_reports_snapshot(p_machine_id)                   ║
-- ║   - get_machine_history(p_machine_id)                         ║
-- ║   - search_similar_reports(..., p_include_open) [extended]    ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ────────────────────────────────────────────────────────────────
-- 1. RPC: get_assistant_org_stats
-- ────────────────────────────────────────────────────────────────
-- Aggrega statistiche di organizzazione utili all'assistente:
--   - totali (report, aperti, risolti %, critici aperti, ultimi 30gg)
--   - top 10 macchinari per numero di segnalazioni con breakdown
-- Ritorna un singolo JSONB facile da consumare lato edge function.

CREATE OR REPLACE FUNCTION public.get_assistant_org_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_totals JSONB;
  v_top_machines JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('totals', NULL, 'top_machines', '[]'::jsonb);
  END IF;

  -- Totali organizzazione
  SELECT jsonb_build_object(
    'reports_total', COUNT(*),
    'reports_open', COUNT(*) FILTER (WHERE status NOT IN ('risolta', 'chiuso')),
    'reports_resolved', COUNT(*) FILTER (WHERE status IN ('risolta', 'chiuso')),
    'resolved_pct', CASE WHEN COUNT(*) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('risolta', 'chiuso')) / COUNT(*))
        ELSE 0 END,
    'critical_open', COUNT(*) FILTER (WHERE severity = 'critica' AND status NOT IN ('risolta', 'chiuso')),
    'reports_last_30d', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')
  ) INTO v_totals
  FROM public.reports
  WHERE org_id = v_org_id;

  -- Top macchinari per numero di report (usa campo denormalizzato `machine`,
  -- stesso pattern di useKPIStats hook)
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.total DESC), '[]'::jsonb)
  INTO v_top_machines
  FROM (
    SELECT
      r.machine AS name,
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE r.status = 'aperta')::INTEGER AS open,
      COUNT(*) FILTER (WHERE r.status = 'assegnata')::INTEGER AS assigned,
      COUNT(*) FILTER (WHERE r.status = 'in_lavorazione')::INTEGER AS in_progress,
      COUNT(*) FILTER (WHERE r.status = 'in_attesa_ricambi')::INTEGER AS awaiting_parts,
      COUNT(*) FILTER (WHERE r.status IN ('risolta', 'chiuso'))::INTEGER AS resolved,
      COUNT(*) FILTER (WHERE r.severity = 'critica' AND r.status NOT IN ('risolta', 'chiuso'))::INTEGER AS critical_open,
      to_char(MAX(r.created_at), 'DD/MM/YYYY') AS last_report_at
    FROM public.reports r
    WHERE r.org_id = v_org_id
      AND r.machine IS NOT NULL
      AND r.machine <> ''
    GROUP BY r.machine
    ORDER BY total DESC
    LIMIT 10
  ) m;

  RETURN jsonb_build_object(
    'totals', v_totals,
    'top_machines', v_top_machines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_org_stats() TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2. RPC: get_open_reports_snapshot
-- ────────────────────────────────────────────────────────────────
-- Snapshot dei report attualmente aperti.
-- Se p_machine_id è valorizzato, filtra solo per quella macchina (max 20).
-- Altrimenti restituisce i 20 più critici/più vecchi a livello org.
-- Severità ordinata: critica > alta > media > bassa.

CREATE OR REPLACE FUNCTION public.get_open_reports_snapshot(
  p_machine_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT,
  type TEXT,
  machine TEXT,
  machine_id UUID,
  assigned_to_name TEXT,
  age_hours INTEGER,
  created_at TIMESTAMPTZ
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
    r.id,
    r.title,
    LEFT(COALESCE(r.description, ''), 300) AS description,
    r.severity,
    r.status,
    r.type,
    r.machine,
    r.machine_id,
    r.assigned_to_name,
    EXTRACT(EPOCH FROM (NOW() - r.created_at))::INTEGER / 3600 AS age_hours,
    r.created_at
  FROM public.reports r
  WHERE r.org_id = v_org_id
    AND r.status NOT IN ('risolta', 'chiuso')
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
  ORDER BY
    CASE r.severity
      WHEN 'critica' THEN 1
      WHEN 'alta'    THEN 2
      WHEN 'media'   THEN 3
      WHEN 'bassa'   THEN 4
      ELSE 5
    END,
    r.created_at ASC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_open_reports_snapshot(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 3. RPC: get_machine_history
-- ────────────────────────────────────────────────────────────────
-- Storia operativa di una specifica macchina:
--   - tipi guasto ricorrenti (group by type)
--   - MTTR (tempo medio risoluzione in ore)
--   - ultime 5 manutenzioni eseguite (maintenance_logs)
--   - manutenzioni in scadenza/scadute (maintenance_plans)
--   - ricambi più usati (estratti da closure_parts dei report risolti)

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
  v_machine_name TEXT;
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

  -- Nome macchina
  SELECT name INTO v_machine_name
  FROM public.machines
  WHERE id = p_machine_id AND org_id = v_org_id;

  IF v_machine_name IS NULL THEN
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
  -- Calcoliamo prossima scadenza come (last_log + frequency_days) o (created_at + frequency_days)
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
    'machine_name', v_machine_name,
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
-- 4. EXTEND: search_similar_reports → p_include_open
-- ────────────────────────────────────────────────────────────────
-- Aggiunge il parametro p_include_open. Quando true:
--   - allarga il filtro a TUTTI gli stati (non solo risolti/chiusi)
--   - rilassa il check su closure_root_cause/closure_action
-- Default false: comportamento identico a 026.

CREATE OR REPLACE FUNCTION public.search_similar_reports(
  query_text TEXT,
  p_limit INTEGER DEFAULT 5,
  p_machine_id UUID DEFAULT NULL,
  p_include_open BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT,
  type TEXT,
  machine_id UUID,
  closure_root_cause TEXT,
  closure_action TEXT,
  closure_parts TEXT,
  closure_hours NUMERIC,
  closed_at TIMESTAMPTZ,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_query tsquery;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  v_query := websearch_to_tsquery('italian', coalesce(query_text, ''));
  IF v_query IS NULL OR v_query::text = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.description,
    r.severity,
    r.status,
    r.type,
    r.machine_id,
    r.closure_root_cause,
    r.closure_action,
    r.closure_parts,
    r.closure_hours,
    r.closed_at,
    ts_rank(r.search_vector, v_query) AS similarity
  FROM public.reports r
  WHERE r.org_id = v_org_id
    AND r.search_vector @@ v_query
    AND (p_machine_id IS NULL OR r.machine_id = p_machine_id)
    AND (
      p_include_open
      OR (
        r.status IN ('risolta', 'chiuso')
        AND (r.closure_root_cause IS NOT NULL OR r.closure_action IS NOT NULL)
      )
    )
  ORDER BY similarity DESC, COALESCE(r.closed_at, r.created_at) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;

-- Drop vecchia signature a 3 parametri (se ancora deployata) per evitare ambiguità
DROP FUNCTION IF EXISTS public.search_similar_reports(TEXT, INTEGER, UUID);

GRANT EXECUTE ON FUNCTION public.search_similar_reports(TEXT, INTEGER, UUID, BOOLEAN) TO authenticated;
