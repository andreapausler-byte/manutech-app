-- ──────────────────────────────────────────────────────────────────────────
-- Migration 048 — spare_part_orders: stato 'preventivo' + tracking quotes
-- ──────────────────────────────────────────────────────────────────────────
-- Aggiunge una fase di gara fornitori tra "richiesto" e "ordinato":
--
--   richiesto  → admin riceve la richiesta del tecnico
--   preventivo → admin ha chiesto preventivo a 1-N fornitori (NUOVO)
--   ordinato   → admin ha accettato un preventivo
--   spedito    → fornitore ha spedito (sub-stato operativo)
--   ricevuto   → ricambio arrivato in azienda
--   installato → ricambio installato (post-intervento)
--
-- Colonna `quotes` JSONB: array di richieste preventivo, un elemento
-- per fornitore contattato:
--   [{
--     id: 'q1',
--     supplier_id: '<uuid>' | null,
--     supplier_name: 'Comac S.p.A.',
--     asked_at: '2026-05-07T...',
--     note: 'Chiesto urgente, risposta entro venerdì',
--     status: 'pending' | 'received' | 'accepted' | 'rejected',
--     quoted_price: 245.50 | null,
--     quoted_lead_time_days: 7 | null,
--     received_at: '...' | null,
--     decided_at: '...' | null,
--     decided_by: '<user_id>' | null
--   }]
--
-- Quando l'admin accetta un preventivo:
--   - quote selezionata: status='accepted', decided_at/by valorizzati
--   - tutte le altre 'pending'/'received' diventano 'rejected'
--   - order.status = 'ordinato', supplier_id/supplier/expected_at/unit_cost
--     copiati dalla quote accettata
--
-- DOWN: 048_spare_part_quotes_down.sql

ALTER TABLE public.spare_part_orders
  ADD COLUMN IF NOT EXISTS quotes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Indice GIN per query del tipo "quote pending per supplier X"
CREATE INDEX IF NOT EXISTS idx_spo_quotes ON public.spare_part_orders USING GIN (quotes);

-- ── RPC: estende receive_spare_part_order per gestire anche notifiche
-- quando il pezzo arriva (immutato rispetto a 046, lasciato come fallback)

-- ── RPC: accept_spare_part_quote ─────────────────────────────────────
-- Accetta un preventivo (quote_id) di un ordine, marca le altre rejected,
-- copia i campi del fornitore vincitore sull'ordine, passa a 'ordinato'.
-- Notifica il requested_by se diverso dall'admin.
CREATE OR REPLACE FUNCTION public.accept_spare_part_quote(
  _order_id UUID,
  _quote_id TEXT,
  _expected_at TIMESTAMPTZ DEFAULT NULL,
  _unit_cost NUMERIC DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  _org_id        TEXT;
  _role          TEXT;
  _admin_user_id UUID;
  _order         RECORD;
  _new_quotes    JSONB;
  _accepted      JSONB;
  _supplier_id   UUID;
  _supplier_name TEXT;
  _final_cost    NUMERIC;
  _final_eta     TIMESTAMPTZ;
  _result        JSONB;
BEGIN
  SELECT id, org_id, role
    INTO _admin_user_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Solo admin può accettare preventivi';
  END IF;

  SELECT * INTO _order FROM public.spare_part_orders
    WHERE id = _order_id AND org_id = _org_id;
  IF _order IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;

  -- Trova la quote target ed estrai i campi commerciali
  SELECT q INTO _accepted
    FROM jsonb_array_elements(_order.quotes) q
    WHERE q->>'id' = _quote_id LIMIT 1;
  IF _accepted IS NULL THEN RAISE EXCEPTION 'Preventivo non trovato'; END IF;

  _supplier_id := NULLIF(_accepted->>'supplier_id', '')::UUID;
  _supplier_name := _accepted->>'supplier_name';
  _final_cost := COALESCE(_unit_cost, NULLIF(_accepted->>'quoted_price', '')::NUMERIC, 0);
  _final_eta := COALESCE(
    _expected_at,
    CASE
      WHEN (_accepted->>'quoted_lead_time_days') IS NOT NULL
      THEN now() + ((_accepted->>'quoted_lead_time_days')::INTEGER || ' days')::INTERVAL
      ELSE NULL
    END
  );

  -- Riscrivi quotes: target=accepted, altre pending/received → rejected
  SELECT jsonb_agg(
    CASE
      WHEN q->>'id' = _quote_id THEN
        q || jsonb_build_object(
          'status', 'accepted',
          'decided_at', to_jsonb(now()),
          'decided_by', to_jsonb(_admin_user_id)
        )
      WHEN q->>'status' IN ('pending', 'received') THEN
        q || jsonb_build_object(
          'status', 'rejected',
          'decided_at', to_jsonb(now()),
          'decided_by', to_jsonb(_admin_user_id)
        )
      ELSE q
    END
  ) INTO _new_quotes
  FROM jsonb_array_elements(_order.quotes) q;

  UPDATE public.spare_part_orders
    SET status = 'ordinato',
        quotes = _new_quotes,
        supplier_id = _supplier_id,
        supplier = _supplier_name,
        expected_at = _final_eta,
        unit_cost = _final_cost,
        ordered_at = COALESCE(ordered_at, now()),
        ordered_by = COALESCE(ordered_by, _admin_user_id),
        updated_at = now()
    WHERE id = _order_id
    RETURNING * INTO _order;

  -- Notifica requested_by (se diverso dall'admin)
  IF _order.requested_by IS NOT NULL
     AND _order.requested_by <> _admin_user_id THEN
    INSERT INTO public.notifications (
      type, title, body, report_id, from_user, target_user, org_id
    ) VALUES (
      'spare_quote_accepted',
      'Preventivo accettato: ' || _order.spare_part_name,
      'Fornitore: ' || COALESCE(_supplier_name, 'n.d.') ||
        CASE WHEN _final_eta IS NOT NULL
          THEN ' · arrivo previsto ' || to_char(_final_eta, 'DD/MM/YYYY')
          ELSE ''
        END,
      _order.report_id,
      _admin_user_id,
      _order.requested_by,
      _org_id
    );
  END IF;

  SELECT to_jsonb(_order) INTO _result;
  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
