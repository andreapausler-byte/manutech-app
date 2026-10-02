-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 067 DOWN — Premi: si guadagna ogni mese, si riscatta davvero
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Rimette le funzioni e le policy della 018. I movimenti, i
-- rimborsi e gli avvisi scritti nel frattempo restano: il registro
-- token è immutabile per costruzione.
--
-- reward_id resta NULLABLE: i riscatti dei premi eliminati dopo la
-- 067 hanno reward_id NULL, e rimettere il NOT NULL vorrebbe dire
-- cancellarli. La FK torna ON DELETE CASCADE.
--
-- Dopo il down l'app della v5.29 non può più gestire i riscatti
-- (review_redemption non esiste): va tolta anche quella.

DROP FUNCTION IF EXISTS public.review_redemption(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_org_token_balances();
DROP INDEX IF EXISTS public.idx_token_tx_reference;

ALTER TABLE public.reward_redemptions
  DROP CONSTRAINT IF EXISTS reward_redemptions_reward_id_fkey;
ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_reward_id_fkey
  FOREIGN KEY (reward_id) REFERENCES public.reward_catalog(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "rr_insert" ON public.reward_redemptions;
CREATE POLICY "rr_insert" ON public.reward_redemptions
  FOR INSERT TO authenticated WITH CHECK (org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "rr_update" ON public.reward_redemptions;
CREATE POLICY "rr_update" ON public.reward_redemptions
  FOR UPDATE TO authenticated USING (org_id = public.get_my_org_id() AND public.get_my_role() = 'admin');

-- ── Funzioni della 018, testuali ──
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
