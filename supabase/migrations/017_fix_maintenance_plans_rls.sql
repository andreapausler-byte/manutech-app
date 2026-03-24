-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 017: Fix RLS maintenance_plans — ricrea policies + RPC insert
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Problema: la INSERT fallisce con "violates row-level security policy"
-- perché le policy potrebbero essere in stato inconsistente (migration 005
-- vs schema.sql). Questa migration:
-- 1. Ricrea le policies in modo pulito
-- 2. Aggiunge un RPC SECURITY DEFINER come fallback sicuro

-- ── 1. Ricrea policies in modo pulito ──
DROP POLICY IF EXISTS "mplans_select" ON public.maintenance_plans;
DROP POLICY IF EXISTS "mplans_insert" ON public.maintenance_plans;
DROP POLICY IF EXISTS "mplans_update" ON public.maintenance_plans;
DROP POLICY IF EXISTS "mplans_delete" ON public.maintenance_plans;

ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mplans_select" ON public.maintenance_plans
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "mplans_insert" ON public.maintenance_plans
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mplans_update" ON public.maintenance_plans
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin', 'tecnico'));

CREATE POLICY "mplans_delete" ON public.maintenance_plans
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');


-- ── 2. RPC SECURITY DEFINER per insert piano ──
-- Bypassa RLS, inietta org_id e role dal server
CREATE OR REPLACE FUNCTION public.create_maintenance_plan(
  _machine_id UUID,
  _name TEXT,
  _frequency_days INTEGER DEFAULT 30,
  _assigned_to UUID DEFAULT NULL,
  _assigned_to_name TEXT DEFAULT NULL,
  _instructions TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _result JSONB;
BEGIN
  -- Recupera org_id e role dell'utente corrente
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  -- Verifica permessi
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  -- Inserisci piano
  INSERT INTO public.maintenance_plans (
    machine_id, name, frequency_days, assigned_to, assigned_to_name, instructions, org_id
  ) VALUES (
    _machine_id, _name, _frequency_days, _assigned_to, _assigned_to_name, _instructions, _org_id
  )
  RETURNING to_jsonb(maintenance_plans.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
