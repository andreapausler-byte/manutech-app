-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 018: ManuCoin — Wallet token + catalogo premi
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── Configurazione token per organizzazione ──
CREATE TABLE IF NOT EXISTS public.token_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL DEFAULT 'default',
  token_name  TEXT NOT NULL DEFAULT 'ManuCoin',
  token_symbol TEXT NOT NULL DEFAULT 'MC',
  token_value_eur NUMERIC(10,4) NOT NULL DEFAULT 0.50,
  monthly_budget NUMERIC(10,2) DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);

-- ── Registro transazioni token (immutabile) ──
CREATE TABLE IF NOT EXISTS public.token_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   TEXT,
  type        TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'bonus', 'refund')),
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  reason_code TEXT,
  reference_id TEXT,
  balance_after INTEGER NOT NULL DEFAULT 0,
  hash        TEXT,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user ON public.token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_org ON public.token_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_created ON public.token_transactions(created_at DESC);

-- ── Catalogo premi ──
CREATE TABLE IF NOT EXISTS public.reward_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  cost        INTEGER NOT NULL,
  category    TEXT NOT NULL DEFAULT 'altro'
              CHECK (category IN ('buono', 'tempo_libero', 'gadget', 'formazione', 'altro')),
  icon        TEXT DEFAULT '🎁',
  image_url   TEXT,
  stock       INTEGER DEFAULT NULL,
  active      BOOLEAN DEFAULT true,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_catalog_org ON public.reward_catalog(org_id);

-- ── Riscatti premi ──
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   TEXT,
  reward_id   UUID NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  reward_name TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'delivered', 'rejected')),
  admin_note  TEXT,
  org_id      TEXT NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_org ON public.reward_redemptions(org_id);

-- ── RLS ──
ALTER TABLE public.token_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- token_config: admin read/write, altri read
CREATE POLICY "tc_select" ON public.token_config
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "tc_insert" ON public.token_config
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "tc_update" ON public.token_config
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- token_transactions: tutti vedono le proprie, admin vede tutte dell'org
CREATE POLICY "tt_select_own" ON public.token_transactions
  FOR SELECT TO authenticated USING (
    org_id = public.get_my_org_id() AND (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
      OR public.get_my_role() = 'admin'
    )
  );

-- reward_catalog: tutti leggono, admin gestisce
CREATE POLICY "rc_select" ON public.reward_catalog
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());
CREATE POLICY "rc_insert" ON public.reward_catalog
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "rc_update" ON public.reward_catalog
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');
CREATE POLICY "rc_delete" ON public.reward_catalog
  FOR DELETE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- reward_redemptions: proprie + admin tutte
CREATE POLICY "rr_select" ON public.reward_redemptions
  FOR SELECT TO authenticated USING (
    org_id = public.get_my_org_id() AND (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
      OR public.get_my_role() = 'admin'
    )
  );
CREATE POLICY "rr_insert" ON public.reward_redemptions
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "rr_update" ON public.reward_redemptions
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── RPC: accredita token (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION public.credit_tokens(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _reason_code TEXT DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _type TEXT DEFAULT 'earn'
)
RETURNS JSONB AS $$
DECLARE
  _org_id TEXT;
  _role TEXT;
  _user_name TEXT;
  _current_balance INTEGER;
  _new_balance INTEGER;
  _hash TEXT;
  _result JSONB;
BEGIN
  SELECT org_id, role INTO _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role != 'admin' AND _type != 'earn' THEN RAISE EXCEPTION 'Solo admin può accreditare token'; END IF;

  SELECT name INTO _user_name FROM public.users WHERE id = _user_id;

  -- Calcola saldo corrente
  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _current_balance
    FROM public.token_transactions WHERE user_id = _user_id;

  _new_balance := _current_balance + _amount;
  _hash := encode(digest(_user_id::text || _amount::text || _reason || now()::text, 'sha256'), 'hex');

  INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
  VALUES (_user_id, _user_name, _type, _amount, _reason, _reason_code, _reference_id, _new_balance, _hash, _org_id)
  RETURNING to_jsonb(token_transactions.*) INTO _result;

  RETURN _result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: riscatta premio (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION public.redeem_reward(
  _reward_id UUID
)
RETURNS JSONB AS $$
DECLARE
  _user_id UUID;
  _user_name TEXT;
  _org_id TEXT;
  _reward RECORD;
  _balance INTEGER;
  _new_balance INTEGER;
  _hash TEXT;
  _redemption JSONB;
BEGIN
  SELECT id, name, org_id INTO _user_id, _user_name, _org_id
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;

  IF _user_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  SELECT * INTO _reward FROM public.reward_catalog WHERE id = _reward_id AND active = true;
  IF _reward IS NULL THEN RAISE EXCEPTION 'Premio non disponibile'; END IF;
  IF _reward.stock IS NOT NULL AND _reward.stock <= 0 THEN RAISE EXCEPTION 'Premio esaurito'; END IF;

  -- Calcola saldo
  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _balance
    FROM public.token_transactions WHERE user_id = _user_id;

  IF _balance < _reward.cost THEN RAISE EXCEPTION 'Saldo insufficiente: % MC disponibili, % MC richiesti', _balance, _reward.cost; END IF;

  _new_balance := _balance - _reward.cost;
  _hash := encode(digest(_user_id::text || _reward.cost::text || 'redeem' || now()::text, 'sha256'), 'hex');

  -- Registra transazione
  INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
  VALUES (_user_id, _user_name, 'spend', _reward.cost, 'Riscatto: ' || _reward.name, 'reward_redeem', _reward_id::text, _new_balance, _hash, _org_id);

  -- Registra riscatto
  INSERT INTO public.reward_redemptions (user_id, user_name, reward_id, reward_name, cost, org_id)
  VALUES (_user_id, _user_name, _reward_id, _reward.name, _reward.cost, _org_id)
  RETURNING to_jsonb(reward_redemptions.*) INTO _redemption;

  -- Decrementa stock se limitato
  IF _reward.stock IS NOT NULL THEN
    UPDATE public.reward_catalog SET stock = stock - 1 WHERE id = _reward_id;
  END IF;

  RETURN _redemption;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: saldo utente ──
CREATE OR REPLACE FUNCTION public.get_token_balance(_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  _uid UUID;
  _balance INTEGER;
BEGIN
  IF _user_id IS NOT NULL THEN
    _uid := _user_id;
  ELSE
    SELECT id INTO _uid FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _balance
    FROM public.token_transactions WHERE user_id = _uid;

  RETURN _balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
