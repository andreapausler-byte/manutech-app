-- Rollback migration 046

-- Ripristina RPC originale (migration 022)
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

  UPDATE public.spare_part_orders
    SET status = 'ricevuto', received_at = now(), updated_at = now()
    WHERE id = _order_id AND org_id = _org_id
    RETURNING * INTO _order;

  IF _order IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;

  IF _order.spare_part_id IS NOT NULL THEN
    UPDATE public.spare_parts
      SET stock_qty = stock_qty + _order.quantity, updated_at = now()
      WHERE id = _order.spare_part_id;
  END IF;

  IF _order.report_id IS NOT NULL THEN
    UPDATE public.reports
      SET status = 'in_lavorazione', updated_at = now()
      WHERE id = _order.report_id AND status = 'in_attesa_ricambi';
  END IF;

  SELECT to_jsonb(_order) INTO _result;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop indici creati da 046
DROP INDEX IF EXISTS idx_spo_status_requested;
DROP INDEX IF EXISTS idx_spo_requested_by;

-- Drop FK supplier (se esiste)
ALTER TABLE public.spare_part_orders
  DROP CONSTRAINT IF EXISTS spo_supplier_fk;

-- Drop colonne aggiunte
ALTER TABLE public.spare_part_orders
  DROP COLUMN IF EXISTS images,
  DROP COLUMN IF EXISTS urgency,
  DROP COLUMN IF EXISTS requested_by,
  DROP COLUMN IF EXISTS supplier_id;
