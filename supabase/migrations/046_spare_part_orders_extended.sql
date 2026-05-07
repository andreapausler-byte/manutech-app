-- ──────────────────────────────────────────────────────────────────────────
-- Migration 046 — spare_part_orders: campi estesi + nuovo stato "richiesto"
-- + notifiche all'arrivo del ricambio
-- ──────────────────────────────────────────────────────────────────────────
-- Centralizza il flusso di richiesta ricambi del tecnico:
-- 1. Il tecnico crea una richiesta dal ticket con foto targhetta + titolo +
--    note. La richiesta nasce in stato "richiesto" (in attesa elaborazione
--    admin), non più direttamente "ordinato".
-- 2. L'admin elabora la richiesta: sceglie fornitore, conferma costo e data
--    prevista → status passa a "ordinato".
-- 3. Quando l'admin marca "ricevuto", la RPC notifica il tecnico richiedente
--    e l'operatore che ha aperto il ticket.
--
-- Campi aggiunti a spare_part_orders:
--   images        JSONB   array di {url, name} con la prima foto = targhetta
--   urgency       TEXT    bassa|media|alta|urgente (default media)
--   requested_by  UUID    chi ha aperto la richiesta (può differire da ordered_by)
--   supplier_id   UUID    FK opzionale ad anagrafica suppliers (supplier TEXT
--                          resta come fallback testo libero)
--
-- DOWN: 046_spare_part_orders_extended_down.sql

-- ── 1. Nuovi campi ─────────────────────────────────────────────────────
ALTER TABLE public.spare_part_orders
  ADD COLUMN IF NOT EXISTS images       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS urgency      TEXT    NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS requested_by UUID    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id  UUID;

-- supplier_id: FK opzionale verso supplier_profiles(user_id).
-- supplier_profiles ha user_id come PK (1-a-1 con users), quindi il FK
-- punta lì invece di duplicare l'anagrafica.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'supplier_profiles')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_name = 'spo_supplier_fk'
                     AND table_name = 'spare_part_orders') THEN
    ALTER TABLE public.spare_part_orders
      ADD CONSTRAINT spo_supplier_fk
      FOREIGN KEY (supplier_id) REFERENCES public.supplier_profiles(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indice per filtrare velocemente le richieste da elaborare
CREATE INDEX IF NOT EXISTS idx_spo_status_requested
  ON public.spare_part_orders(status)
  WHERE status = 'richiesto';

CREATE INDEX IF NOT EXISTS idx_spo_requested_by
  ON public.spare_part_orders(requested_by);

-- ── 2. RPC receive_spare_part_order: notifiche + check multi-ordine ────
-- Riscrive la RPC esistente:
--   - aggiorna ordine + stock come prima
--   - cambia stato report SOLO se non esistono altri ordini aperti per
--     quel report (richiesto|ordinato|spedito) → evita di sbloccare un
--     ticket multi-ricambio prematuramente
--   - inserisce notifiche per: requested_by + reports.created_by
--     (esclusi se coincidono con l'admin che marca ricevuto)
CREATE OR REPLACE FUNCTION public.receive_spare_part_order(
  _order_id UUID
)
RETURNS JSONB AS $$
DECLARE
  _org_id           TEXT;
  _role             TEXT;
  _admin_user_id    UUID;
  _order            RECORD;
  _report           RECORD;
  _other_open_count INTEGER;
  _result           JSONB;
  _recipients       UUID[];
  _r                UUID;
BEGIN
  SELECT id, org_id, role
    INTO _admin_user_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Solo admin può ricevere ordini';
  END IF;

  -- Aggiorna ordine
  UPDATE public.spare_part_orders
    SET status = 'ricevuto', received_at = now(), updated_at = now()
    WHERE id = _order_id AND org_id = _org_id
    RETURNING * INTO _order;

  IF _order IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;

  -- Aggiorna stock catalogo
  IF _order.spare_part_id IS NOT NULL THEN
    UPDATE public.spare_parts
      SET stock_qty = stock_qty + _order.quantity, updated_at = now()
      WHERE id = _order.spare_part_id;
  END IF;

  -- Sblocca il report SOLO se non ci sono altri ordini aperti
  IF _order.report_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _other_open_count
      FROM public.spare_part_orders
      WHERE report_id = _order.report_id
        AND id <> _order.id
        AND status IN ('richiesto', 'ordinato', 'spedito');

    IF _other_open_count = 0 THEN
      UPDATE public.reports
        SET status = 'in_lavorazione', updated_at = now()
        WHERE id = _order.report_id AND status = 'in_attesa_ricambi'
        RETURNING * INTO _report;
    ELSE
      SELECT * INTO _report FROM public.reports WHERE id = _order.report_id;
    END IF;

    -- Notifiche: requested_by + reports.created_by (escludi self)
    _recipients := ARRAY[]::UUID[];
    IF _order.requested_by IS NOT NULL
       AND _order.requested_by <> _admin_user_id THEN
      _recipients := array_append(_recipients, _order.requested_by);
    END IF;
    IF _report IS NOT NULL
       AND _report.created_by IS NOT NULL
       AND _report.created_by <> _admin_user_id
       AND NOT (_report.created_by = ANY(_recipients)) THEN
      _recipients := array_append(_recipients, _report.created_by);
    END IF;

    FOREACH _r IN ARRAY _recipients LOOP
      INSERT INTO public.notifications (
        type, title, body, report_id, from_user, target_user, org_id
      ) VALUES (
        'spare_received',
        'Ricambio arrivato: ' || COALESCE(_order.spare_part_name, 'ricambio'),
        CASE
          WHEN _other_open_count = 0
            THEN 'Il ricambio è disponibile, puoi riprendere l''intervento.'
          ELSE 'Pezzo ricevuto. Altri ricambi ancora in attesa.'
        END,
        _order.report_id,
        _admin_user_id,
        _r,
        _org_id
      );
    END LOOP;
  END IF;

  SELECT to_jsonb(_order) INTO _result;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
