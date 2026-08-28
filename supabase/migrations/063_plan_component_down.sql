-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 063 DOWN — Piano di manutenzione per componente
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Ripristina la RPC a sei parametri della 017. La colonna
-- `component_id` NON viene droppata di default: contiene
-- un'attribuzione fatta da una persona, e riaggiungerla dopo non la
-- riporta indietro. Scommentare l'ALTER solo se si vuole davvero
-- buttarla via.

DROP FUNCTION IF EXISTS public.create_maintenance_plan(UUID, TEXT, INTEGER, UUID, TEXT, TEXT, UUID);

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
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Profilo utente non trovato';
  END IF;
  IF _role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Permesso negato: ruolo % non autorizzato', _role;
  END IF;

  INSERT INTO public.maintenance_plans (
    machine_id, name, frequency_days, assigned_to, assigned_to_name, instructions, org_id
  ) VALUES (
    _machine_id, _name, _frequency_days, _assigned_to, _assigned_to_name, _instructions, _org_id
  )
  RETURNING to_jsonb(maintenance_plans.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DROP INDEX IF EXISTS public.idx_mplans_component;
-- ALTER TABLE public.maintenance_plans DROP COLUMN IF EXISTS component_id;
