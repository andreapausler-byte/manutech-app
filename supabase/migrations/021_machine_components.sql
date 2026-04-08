-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 021: Componenti Macchina — Sotto-macchinari a 2 livelli
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.machine_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT DEFAULT NULL,
  serial_number   TEXT DEFAULT NULL,
  manufacturer    TEXT DEFAULT NULL,
  model           TEXT DEFAULT NULL,
  year            INTEGER DEFAULT NULL,
  photo_url       TEXT DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  sort_order      INTEGER DEFAULT 0,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_components_machine ON public.machine_components(machine_id);
CREATE INDEX idx_components_org ON public.machine_components(org_id);

-- RLS
ALTER TABLE public.machine_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_select" ON public.machine_components
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "comp_insert" ON public.machine_components
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "comp_update" ON public.machine_components
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

CREATE POLICY "comp_delete" ON public.machine_components
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── Aggiorna reports: campo component_id opzionale ──
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS component_id UUID DEFAULT NULL
  REFERENCES public.machine_components(id) ON DELETE SET NULL;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS component_name TEXT DEFAULT NULL;

-- ── RPC per insert sicuro ──
CREATE OR REPLACE FUNCTION public.create_machine_component(
  _machine_id UUID,
  _name TEXT,
  _type TEXT DEFAULT NULL,
  _serial_number TEXT DEFAULT NULL,
  _manufacturer TEXT DEFAULT NULL,
  _model TEXT DEFAULT NULL,
  _year INTEGER DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role != 'admin' THEN RAISE EXCEPTION 'Solo admin può creare componenti'; END IF;

  INSERT INTO public.machine_components (machine_id, name, type, serial_number, manufacturer, model, year, notes, org_id)
  VALUES (_machine_id, _name, _type, _serial_number, _manufacturer, _model, _year, _notes, _org_id)
  RETURNING to_jsonb(machine_components.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
