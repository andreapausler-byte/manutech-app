-- ──────────────────────────────────────────────────────────────────────────
-- Migration 049 — Richieste esterne: kind + interventi + timeline polimorfica
-- ──────────────────────────────────────────────────────────────────────────
-- Generalizza spare_part_orders: oltre ai ricambi (kind='ricambio') ora
-- gestisce anche interventi esterni (kind='intervento'), tracciati con la
-- stessa pipeline (richiesto → preventivo → ordinato → ricevuto/completato).
--
-- Nuovi campi su spare_part_orders:
--   kind         TEXT     'ricambio' | 'intervento' (default 'ricambio')
--   scheduled_at TIMESTAMPTZ  data programmata dell'intervento (intervento)
--   duration_h   NUMERIC  durata stimata in ore (intervento)
--   location     TEXT     dove avviene l'intervento (intervento)
--   specialty    TEXT     specialità richiesta (intervento, mappa SUPPLIER_SPECIALTIES)
--
-- Polimorfismo timeline:
--   comments.spare_order_id  UUID nullable → permette commenti
--                            specifici di una singola richiesta
--   activities.spare_order_id UUID nullable → idem per cambi stato/eventi
--
-- Le righe esistenti restano valide (kind='ricambio' di default). Nessuna
-- breaking change.
--
-- DOWN: 049_external_requests_down.sql

-- ── 1. spare_part_orders: kind + campi intervento ──────────────────────
ALTER TABLE public.spare_part_orders
  ADD COLUMN IF NOT EXISTS kind         TEXT NOT NULL DEFAULT 'ricambio',
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_h   NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS specialty    TEXT DEFAULT NULL;

-- Vincolo sui valori ammessi per kind
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'spo_kind_check'
    AND table_name = 'spare_part_orders'
  ) THEN
    ALTER TABLE public.spare_part_orders
      ADD CONSTRAINT spo_kind_check CHECK (kind IN ('ricambio', 'intervento'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_spo_kind ON public.spare_part_orders(kind);
CREATE INDEX IF NOT EXISTS idx_spo_scheduled ON public.spare_part_orders(scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- ── 2. comments.spare_order_id (timeline polimorfica) ──────────────────
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS spare_order_id UUID
    REFERENCES public.spare_part_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_spare_order
  ON public.comments(spare_order_id)
  WHERE spare_order_id IS NOT NULL;

-- Permette nuovo kind dei comment 'request_chat' (chat dentro la richiesta)
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_kind_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_kind_check CHECK (kind IN (
    'chat',
    'voice_new_ticket',
    'voice_update',
    'voice_close',
    'voice_note',
    'voice_spare_request',
    'spare_request',
    'request_chat'
  ));

-- ── 3. activities.spare_order_id ───────────────────────────────────────
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS spare_order_id UUID
    REFERENCES public.spare_part_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_activities_spare_order
  ON public.activities(spare_order_id)
  WHERE spare_order_id IS NOT NULL;
