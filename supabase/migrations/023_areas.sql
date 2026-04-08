-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 023: Aree Impianto — Macro-zone per organizzare macchinari
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#7c6aff',
  sort_order  INTEGER DEFAULT 0,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_areas_org ON public.areas(org_id);

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_select" ON public.areas
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "areas_insert" ON public.areas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "areas_update" ON public.areas
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "areas_delete" ON public.areas
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── Aggiunge area_id alle macchine ──
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS area_id UUID DEFAULT NULL
  REFERENCES public.areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_machines_area ON public.machines(area_id);
