-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 020: Fix RLS maintenance_logs — ricrea policies + RPC insert
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Problema: la INSERT fallisce con "violates row-level security policy"
-- Soluzione: RPC SECURITY DEFINER che inietta org_id dal server

-- ── 1. Ricrea policies in modo pulito ──
DROP POLICY IF EXISTS "mlogs_select" ON public.maintenance_logs;
DROP POLICY IF EXISTS "mlogs_insert" ON public.maintenance_logs;
DROP POLICY IF EXISTS "mlogs_update" ON public.maintenance_logs;
DROP POLICY IF EXISTS "mlogs_delete" ON public.maintenance_logs;

ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mlogs_select" ON public.maintenance_logs
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_insert" ON public.maintenance_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_update" ON public.maintenance_logs
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mlogs_delete" ON public.maintenance_logs
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── 2. RPC SECURITY DEFINER per insert log ──
-- Bypassa RLS, inietta org_id e performed_by dal server
CREATE OR REPLACE FUNCTION public.create_maintenance_log(
  _machine_id UUID,
  _title TEXT,
  _plan_id UUID DEFAULT NULL,
  _report_id UUID DEFAULT NULL,
  _type TEXT DEFAULT 'programmata',
  _description TEXT DEFAULT NULL,
  _performed_by_name TEXT DEFAULT NULL,
  _duration_minutes INTEGER DEFAULT NULL,
  _parts_replaced TEXT DEFAULT NULL,
  _performed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _user_id UUID;
  _result JSONB;
BEGIN
  -- Recupera org_id, role e user_id dell'utente corrente
  SELECT id, org_id, role INTO _user_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  -- Verifica permessi
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  -- Inserisci log
  INSERT INTO public.maintenance_logs (
    machine_id, plan_id, report_id, type, title, description,
    performed_by, performed_by_name, duration_minutes, parts_replaced,
    performed_at, org_id
  ) VALUES (
    _machine_id, _plan_id, _report_id, _type, _title, _description,
    _user_id, _performed_by_name, _duration_minutes, _parts_replaced,
    _performed_at, _org_id
  )
  RETURNING to_jsonb(maintenance_logs.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
