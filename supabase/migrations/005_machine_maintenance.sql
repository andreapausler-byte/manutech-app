-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 005 — Scheda Tecnica + Piani Manutenzione + Registro
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Campi tecnici macchinario
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS responsible_user UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Piani di manutenzione programmata
CREATE TABLE IF NOT EXISTS public.maintenance_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency_days  INTEGER NOT NULL,
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  instructions    TEXT,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mplans_machine ON public.maintenance_plans(machine_id);

-- 3. Registro interventi (programmati + straordinari)
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  plan_id         UUID REFERENCES public.maintenance_plans(id) ON DELETE SET NULL,
  report_id       UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'programmata' CHECK (type IN ('programmata', 'straordinaria')),
  title           TEXT NOT NULL,
  description     TEXT,
  performed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  parts_replaced  TEXT,
  media           JSONB DEFAULT '[]'::jsonb,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mlogs_machine ON public.maintenance_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_mlogs_plan ON public.maintenance_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_mlogs_report ON public.maintenance_logs(report_id);

-- 4. RLS
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mplans_select" ON public.maintenance_plans
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mplans_insert" ON public.maintenance_plans
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "mplans_update" ON public.maintenance_plans
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mplans_delete" ON public.maintenance_plans
  FOR DELETE TO authenticated USING (org_id = public.get_my_org_id());

CREATE POLICY "mlogs_select" ON public.maintenance_logs
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mlogs_insert" ON public.maintenance_logs
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "mlogs_update" ON public.maintenance_logs
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "mlogs_delete" ON public.maintenance_logs
  FOR DELETE TO authenticated USING (org_id = public.get_my_org_id());

-- 5. Trigger updated_at
DROP TRIGGER IF EXISTS trg_mplans_updated ON public.maintenance_plans;
CREATE TRIGGER trg_mplans_updated
  BEFORE UPDATE ON public.maintenance_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
