-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 022: Ricambi — Magazzino + Ordini collegati ai report
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── Catalogo Ricambi ──
CREATE TABLE IF NOT EXISTS public.spare_parts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  code            TEXT DEFAULT NULL,
  manufacturer    TEXT DEFAULT NULL,
  unit_cost       NUMERIC(10,2) DEFAULT 0,
  stock_qty       INTEGER NOT NULL DEFAULT 0,
  min_stock       INTEGER NOT NULL DEFAULT 0,
  location        TEXT DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  photo_url       TEXT DEFAULT NULL,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_spare_parts_org ON public.spare_parts(org_id);

-- ── Compatibilità ricambio → macchina/componente ──
CREATE TABLE IF NOT EXISTS public.spare_part_compatibility (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id   UUID NOT NULL REFERENCES public.spare_parts(id) ON DELETE CASCADE,
  machine_id      UUID REFERENCES public.machines(id) ON DELETE CASCADE,
  component_id    UUID REFERENCES public.machine_components(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT at_least_one CHECK (machine_id IS NOT NULL OR component_id IS NOT NULL)
);

CREATE INDEX idx_spc_spare ON public.spare_part_compatibility(spare_part_id);
CREATE INDEX idx_spc_machine ON public.spare_part_compatibility(machine_id);
CREATE INDEX idx_spc_component ON public.spare_part_compatibility(component_id);

-- ── Ordini Ricambi ──
CREATE TABLE IF NOT EXISTS public.spare_part_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id   UUID REFERENCES public.spare_parts(id) ON DELETE SET NULL,
  spare_part_name TEXT NOT NULL,
  report_id       UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  machine_id      UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  component_id    UUID REFERENCES public.machine_components(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_cost       NUMERIC(10,2) DEFAULT 0,
  supplier        TEXT DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'ordinato',
  ordered_at      TIMESTAMPTZ DEFAULT now(),
  expected_at     TIMESTAMPTZ DEFAULT NULL,
  received_at     TIMESTAMPTZ DEFAULT NULL,
  installed_at    TIMESTAMPTZ DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  ordered_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  org_id          TEXT NOT NULL DEFAULT 'default',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_spo_org ON public.spare_part_orders(org_id);
CREATE INDEX idx_spo_report ON public.spare_part_orders(report_id);
CREATE INDEX idx_spo_status ON public.spare_part_orders(status);
CREATE INDEX idx_spo_spare ON public.spare_part_orders(spare_part_id);

-- ── RLS per tutte le tabelle ──
ALTER TABLE public.spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part_orders ENABLE ROW LEVEL SECURITY;

-- spare_parts
CREATE POLICY "sp_select" ON public.spare_parts
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "sp_insert" ON public.spare_parts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "sp_update" ON public.spare_parts
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "sp_delete" ON public.spare_parts
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- spare_part_compatibility
CREATE POLICY "spc_select" ON public.spare_part_compatibility
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "spc_insert" ON public.spare_part_compatibility
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "spc_delete" ON public.spare_part_compatibility
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- spare_part_orders (tecnici possono vedere, admin può tutto)
CREATE POLICY "spo_select" ON public.spare_part_orders
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "spo_insert" ON public.spare_part_orders
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "spo_update" ON public.spare_part_orders
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "spo_delete" ON public.spare_part_orders
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── RPC: registra arrivo ricambio (aggiorna stock + notifica) ──
CREATE OR REPLACE FUNCTION public.receive_spare_part_order(
  _order_id UUID
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _order RECORD;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role != 'admin' THEN RAISE EXCEPTION 'Solo admin può ricevere ordini'; END IF;

  -- Aggiorna ordine
  UPDATE public.spare_part_orders
    SET status = 'ricevuto', received_at = now(), updated_at = now()
    WHERE id = _order_id AND org_id = _org_id
    RETURNING * INTO _order;

  IF _order IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;

  -- Aggiorna stock
  IF _order.spare_part_id IS NOT NULL THEN
    UPDATE public.spare_parts
      SET stock_qty = stock_qty + _order.quantity, updated_at = now()
      WHERE id = _order.spare_part_id;
  END IF;

  -- Se collegato a un report, aggiorna stato report
  IF _order.report_id IS NOT NULL THEN
    UPDATE public.reports
      SET status = 'in_lavorazione', updated_at = now()
      WHERE id = _order.report_id AND status = 'in_attesa_ricambi';
  END IF;

  SELECT to_jsonb(_order) INTO _result;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
