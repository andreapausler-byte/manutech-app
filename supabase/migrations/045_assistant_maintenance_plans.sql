-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 045: Assistant — Overview piani di manutenzione    ║
-- ║                                                                ║
-- ║  Aggiunge una RPC che fornisce all'assistente AI un censimento ║
-- ║  completo di TUTTI i piani di manutenzione attivi dell'org,    ║
-- ║  non solo quelli scaduti (che erano gia' coperti da            ║
-- ║  get_assistant_strategic_insights con finestra 7 giorni).      ║
-- ║                                                                ║
-- ║  Risolve il caso d'uso: "quanti piani di manutenzione          ║
-- ║  abbiamo?" / "quali piani sono attivi?" / "che cadenza hanno   ║
-- ║  i piani della macchina X?".                                   ║
-- ╚══════════════════════════════════════════════════════════════╝


CREATE OR REPLACE FUNCTION public.get_assistant_maintenance_plans_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
  v_total INTEGER;
  v_machines_with_plans INTEGER;
  v_by_status JSONB;
  v_by_frequency JSONB;
  v_per_machine JSONB;
  v_plans JSONB;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0,
      'machines_with_plans', 0,
      'by_status', '[]'::jsonb,
      'by_frequency', '[]'::jsonb,
      'per_machine', '[]'::jsonb,
      'plans', '[]'::jsonb
    );
  END IF;

  -- Totale piani attivi nell'org
  SELECT COUNT(*) INTO v_total
  FROM public.maintenance_plans
  WHERE org_id = v_org_id;

  -- Macchine distinte coperte da almeno 1 piano
  SELECT COUNT(DISTINCT machine_id) INTO v_machines_with_plans
  FROM public.maintenance_plans
  WHERE org_id = v_org_id;

  -- Distribuzione per current_status (da_eseguire / in_corso / completata)
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.count DESC), '[]'::jsonb)
  INTO v_by_status
  FROM (
    SELECT
      COALESCE(current_status, 'da_eseguire') AS status,
      COUNT(*)::INTEGER AS count
    FROM public.maintenance_plans
    WHERE org_id = v_org_id
    GROUP BY COALESCE(current_status, 'da_eseguire')
  ) s;

  -- Distribuzione per frequenza in giorni (utile per capire mix
  -- routine breve vs lunga)
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.frequency_days ASC), '[]'::jsonb)
  INTO v_by_frequency
  FROM (
    SELECT
      frequency_days,
      COUNT(*)::INTEGER AS count
    FROM public.maintenance_plans
    WHERE org_id = v_org_id
    GROUP BY frequency_days
    ORDER BY frequency_days ASC
    LIMIT 20
  ) f;

  -- Piani aggregati per macchina (per rispondere a "quali macchine
  -- hanno piani?" e "quanti piani per macchina?")
  SELECT COALESCE(jsonb_agg(row_to_json(pm) ORDER BY pm.plans_count DESC, pm.machine_name ASC), '[]'::jsonb)
  INTO v_per_machine
  FROM (
    SELECT
      mch.id AS machine_id,
      COALESCE(mch.name, '—') AS machine_name,
      mch.serial_number,
      mch.department,
      COUNT(mp.id)::INTEGER AS plans_count
    FROM public.maintenance_plans mp
    LEFT JOIN public.machines mch ON mch.id = mp.machine_id AND mch.org_id = v_org_id
    WHERE mp.org_id = v_org_id
    GROUP BY mch.id, mch.name, mch.serial_number, mch.department
    LIMIT 60
  ) pm;

  -- Lista dettagliata dei piani con prossima scadenza calcolata
  -- dall'ultimo log + frequenza (stesso pattern di get_machine_history).
  -- Cap a 80 per non sovraccaricare il context dell'AI.
  -- Nome assegnatario via LEFT JOIN su users (no dipendenza da
  -- colonne denormalizzate eventualmente assenti in alcune org).
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.days_to_due ASC NULLS LAST), '[]'::jsonb)
  INTO v_plans
  FROM (
    SELECT
      mp.name AS plan_name,
      mp.frequency_days,
      COALESCE(mp.current_status, 'da_eseguire') AS current_status,
      u.name AS assigned_to_name,
      COALESCE(mch.name, '—') AS machine_name,
      mch.serial_number,
      mch.department,
      to_char(next_due, 'DD/MM/YYYY') AS next_due_label,
      EXTRACT(DAY FROM (next_due - NOW()))::INTEGER AS days_to_due,
      to_char(last_performed_at, 'DD/MM/YYYY') AS last_performed_at_label
    FROM (
      SELECT
        mp.id,
        mp.name,
        mp.frequency_days,
        mp.machine_id,
        mp.current_status,
        mp.assigned_to,
        (SELECT MAX(performed_at) FROM public.maintenance_logs
          WHERE plan_id = mp.id) AS last_performed_at,
        COALESCE(
          (SELECT MAX(performed_at) FROM public.maintenance_logs
            WHERE plan_id = mp.id),
          mp.created_at
        ) + (mp.frequency_days || ' days')::INTERVAL AS next_due
      FROM public.maintenance_plans mp
      WHERE mp.org_id = v_org_id
    ) mp
    LEFT JOIN public.machines mch ON mch.id = mp.machine_id AND mch.org_id = v_org_id
    LEFT JOIN public.users u ON u.id = mp.assigned_to AND u.org_id = v_org_id
    LIMIT 80
  ) p;

  RETURN jsonb_build_object(
    'total', v_total,
    'machines_with_plans', v_machines_with_plans,
    'by_status', v_by_status,
    'by_frequency', v_by_frequency,
    'per_machine', v_per_machine,
    'plans', v_plans
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistant_maintenance_plans_overview() TO authenticated;
