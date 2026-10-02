-- ╔══════════════════════════════════════════════════════════════╗
-- ║  067 — Premi: si guadagna ogni mese, si riscatta davvero      ║
-- ║                                                                ║
-- ║  Il wallet della 018 aveva cinque difetti:                    ║
-- ║   1. I badge e i livelli pagavano UNA volta nella vita (chiave ║
-- ║      badge_x senza mese): dopo il primo mese il saldo si       ║
-- ║      fermava, e nessuno arrivava al prezzo di un premio.       ║
-- ║   2. Il rifiuto di un riscatto non restituiva i ManuCoin.      ║
-- ║   3. Eliminare un premio cancellava in cascata i suoi         ║
-- ║      riscatti, anche quelli già pagati e in attesa.            ║
-- ║   4. credit_tokens accettava 'earn' da chiunque, per          ║
-- ║      chiunque e di qualunque importo: dalla console del        ║
-- ║      browser ci si poteva accreditare quello che si voleva.    ║
-- ║      E la deduplica dei badge stava nel localStorage: ogni     ║
-- ║      telefono nuovo li pagava di nuovo.                       ║
-- ║   5. Chiunque poteva inserire un riscatto senza pagarlo        ║
-- ║      (policy rr_insert) e due tocchi veloci potevano          ║
-- ║      spendere due volte lo stesso saldo.                       ║
-- ║                                                                ║
-- ║  Applica:                                                     ║
-- ║   - reward_redemptions.reward_id → ON DELETE SET NULL         ║
-- ║   - riscatti scritti solo dalle funzioni (via rr_insert e     ║
-- ║     rr_update)                                                 ║
-- ║   - credit_tokens: importi fissi e chiave del mese per chi    ║
-- ║     non è admin, nessun doppio accredito, avviso sul bonus     ║
-- ║   - redeem_reward: premio della propria org, lock su premio   ║
-- ║     e saldo, avviso agli admin                                 ║
-- ║   - review_redemption (nuova): approva / rifiuta (con         ║
-- ║     rimborso e stock restituito) / consegnato                  ║
-- ║   - get_token_balance: solo il proprio saldo, o admin         ║
-- ║   - get_org_token_balances (nuova): saldi per l'admin         ║
-- ║                                                                ║
-- ║  Il registro token resta immutabile: nessun movimento già     ║
-- ║  scritto viene toccato. Rieseguibile.                         ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ─── 1. Lo storico dei riscatti sopravvive al premio ──────────
-- reward_name e cost sono già copiati nel riscatto: senza premio
-- resta leggibile.
ALTER TABLE public.reward_redemptions ALTER COLUMN reward_id DROP NOT NULL;
ALTER TABLE public.reward_redemptions
  DROP CONSTRAINT IF EXISTS reward_redemptions_reward_id_fkey;
ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_reward_id_fkey
  FOREIGN KEY (reward_id) REFERENCES public.reward_catalog(id) ON DELETE SET NULL;


-- ─── 2. I riscatti si scrivono solo dalle funzioni ────────────
-- rr_insert lasciava creare un riscatto senza pagarlo, rr_update
-- lasciava rifiutare senza rimborso. Ora passano da redeem_reward
-- e review_redemption (SECURITY DEFINER). La lettura resta.
DROP POLICY IF EXISTS "rr_insert" ON public.reward_redemptions;
DROP POLICY IF EXISTS "rr_update" ON public.reward_redemptions;

-- Ricerca dei doppioni per chiave (non unico: i doppioni già nel
-- registro, nati dai telefoni nuovi, restano dove sono).
CREATE INDEX IF NOT EXISTS idx_token_tx_reference
  ON public.token_transactions(user_id, reason_code, reference_id)
  WHERE reference_id IS NOT NULL;


-- ─── 3. Accredito ─────────────────────────────────────────────
-- Admin: qualunque tipo, a chiunque della propria org.
-- Gli altri: solo 'earn', e
--   - dentro un trigger (pg_trigger_depth() > 0) l'importo lo
--     decide il trigger: è il caso di "Mi è servita" (064), che
--     accredita il tecnico della chiusura nella sessione di chi vota;
--   - chiamato dall'app, solo a sé stessi e solo i traguardi del
--     mese: badge 5, livello 20, con la chiave del mese corrente
--     (badge_<id>:YYYY-MM). Gli id sono quelli di BADGES e LEVELS in
--     src/hooks/useOperatorScore.js: un badge nuovo va aggiunto
--     anche qui, finché non c'è non paga.
-- Una chiave già pagata non paga di nuovo: restituisce il
-- movimento esistente.
CREATE OR REPLACE FUNCTION public.credit_tokens(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _reason_code TEXT DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _type TEXT DEFAULT 'earn'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _caller_id UUID;
  _org_id TEXT;
  _role TEXT;
  _target_org TEXT;
  _user_name TEXT;
  _month TEXT := to_char(now() AT TIME ZONE 'Europe/Rome', 'YYYY-MM');
  _existing JSONB;
  _current_balance INTEGER;
  _new_balance INTEGER;
  _hash TEXT;
  _token_name TEXT;
  _result JSONB;
BEGIN
  SELECT id, org_id, role INTO _caller_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
  IF _type IS NULL OR _type NOT IN ('earn', 'spend', 'bonus', 'refund') THEN
    RAISE EXCEPTION 'Tipo di movimento non valido';
  END IF;

  SELECT name, org_id INTO _user_name, _target_org
    FROM public.users WHERE id = _user_id;
  IF _target_org IS DISTINCT FROM _org_id THEN RAISE EXCEPTION 'Utente non trovato'; END IF;

  IF _role <> 'admin' THEN
    IF _type <> 'earn' THEN RAISE EXCEPTION 'Solo admin può accreditare token'; END IF;

    IF pg_trigger_depth() = 0 THEN
      IF _user_id <> _caller_id THEN
        RAISE EXCEPTION 'Accredito non consentito';
      END IF;
      -- IS NOT TRUE e non NOT: con una chiave NULL il confronto vale NULL
      -- e un IF NOT (...) lascerebbe passare l'accredito.
      IF (
        (_reason_code = 'badge_unlock' AND _amount = 5 AND _reference_id IN (
          SELECT 'badge_' || b || ':' || _month FROM unnest(ARRAY[
            'first_report', 'reports_10', 'reports_25', 'reports_50', 'reports_100',
            'quick_5', 'quick_20', 'photos_5', 'photos_20',
            'critical_3', 'critical_10', 'streak_3', 'streak_7', 'streak_30',
            'detailed_10'
          ]) AS b))
        OR
        (_reason_code = 'level_up' AND _amount = 20 AND _reference_id IN (
          SELECT 'level_' || l || ':' || _month
            FROM unnest(ARRAY['argento', 'oro', 'platino', 'diamante']) AS l))
      ) IS NOT TRUE THEN
        RAISE EXCEPTION 'Accredito non consentito';
      END IF;
    END IF;
  END IF;

  -- Un movimento alla volta per persona: saldo e doppioni si leggono
  -- con il lock preso (stesso lock di redeem_reward e review_redemption).
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || _user_id::text, 0));

  IF _reference_id IS NOT NULL AND _reason_code IS NOT NULL THEN
    SELECT to_jsonb(t.*) INTO _existing
      FROM public.token_transactions t
     WHERE t.user_id = _user_id
       AND t.reason_code = _reason_code
       AND t.reference_id = _reference_id
     LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _current_balance
    FROM public.token_transactions WHERE user_id = _user_id;

  _new_balance := _current_balance
    + CASE WHEN _type IN ('earn', 'bonus', 'refund') THEN _amount ELSE -_amount END;
  _hash := encode(digest(_user_id::text || _amount::text || _reason || now()::text, 'sha256'), 'hex');

  INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
  VALUES (_user_id, _user_name, _type, _amount, _reason, _reason_code, _reference_id, _new_balance, _hash, _org_id)
  RETURNING to_jsonb(token_transactions.*) INTO _result;

  -- Il bonus dell'admin arriva come avviso: è un riconoscimento,
  -- deve saperlo subito (gli accrediti automatici restano nel wallet).
  IF _type = 'bonus' AND _user_id <> _caller_id THEN
    SELECT token_name INTO _token_name FROM public.token_config WHERE org_id = _org_id;
    INSERT INTO public.notifications (type, title, body, from_user, target_user, org_id)
    VALUES ('token_bonus',
            '🎉 +' || _amount || ' ' || COALESCE(_token_name, 'ManuCoin'),
            _reason, _caller_id, _user_id, _org_id);
  END IF;

  RETURN _result;
END;
$$;


-- ─── 4. Riscatto ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_reward(
  _reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _user_id UUID;
  _user_name TEXT;
  _org_id TEXT;
  _reward public.reward_catalog%ROWTYPE;
  _symbol TEXT;
  _balance INTEGER;
  _new_balance INTEGER;
  _hash TEXT;
  _redemption public.reward_redemptions%ROWTYPE;
BEGIN
  SELECT id, name, org_id INTO _user_id, _user_name, _org_id
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  -- Il premio resta bloccato fino alla fine: due riscatti dell'ultimo
  -- pezzo non passano entrambi.
  SELECT * INTO _reward FROM public.reward_catalog
   WHERE id = _reward_id AND org_id = _org_id AND active = true
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Premio non disponibile'; END IF;
  IF _reward.stock IS NOT NULL AND _reward.stock <= 0 THEN RAISE EXCEPTION 'Premio esaurito'; END IF;

  SELECT token_symbol INTO _symbol FROM public.token_config WHERE org_id = _org_id;
  _symbol := COALESCE(_symbol, 'MC');

  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || _user_id::text, 0));

  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _balance
    FROM public.token_transactions WHERE user_id = _user_id;

  IF _balance < _reward.cost THEN
    RAISE EXCEPTION 'Saldo insufficiente: % % disponibili, % richiesti', _balance, _symbol, _reward.cost;
  END IF;

  INSERT INTO public.reward_redemptions (user_id, user_name, reward_id, reward_name, cost, org_id)
  VALUES (_user_id, _user_name, _reward_id, _reward.name, _reward.cost, _org_id)
  RETURNING * INTO _redemption;

  -- Il movimento punta al riscatto: il rimborso lo ritrova.
  _new_balance := _balance - _reward.cost;
  _hash := encode(digest(_user_id::text || _reward.cost::text || 'redeem' || now()::text, 'sha256'), 'hex');
  INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
  VALUES (_user_id, _user_name, 'spend', _reward.cost, 'Riscatto: ' || _reward.name, 'reward_redeem', _redemption.id::text, _new_balance, _hash, _org_id);

  IF _reward.stock IS NOT NULL THEN
    UPDATE public.reward_catalog SET stock = stock - 1, updated_at = now() WHERE id = _reward_id;
  END IF;

  -- Gli admin lo sanno subito: il premio va approvato e consegnato.
  INSERT INTO public.notifications (type, title, body, from_user, target_user, org_id)
  SELECT 'reward_redeemed',
         '🎁 ' || COALESCE(NULLIF(_user_name, ''), 'Un collega') || ' ha riscattato un premio',
         COALESCE(_reward.icon || ' ', '') || _reward.name || ' — ' || _reward.cost || ' ' || _symbol
           || '. Da approvare in Premi → Riscatti.',
         _user_id, u.id, _org_id
    FROM public.users u
   WHERE u.org_id = _org_id AND u.role = 'admin' AND u.status = 'active' AND u.id <> _user_id;

  RETURN to_jsonb(_redemption);
END;
$$;


-- ─── 5. Gestione del riscatto (admin) ─────────────────────────
-- pending  → approved | rejected
-- approved → delivered | rejected
-- Il rifiuto restituisce i ManuCoin (movimento 'refund' che punta
-- al riscatto) e il pezzo allo stock. Chi ha riscattato riceve un
-- avviso per approvato e rifiutato; per consegnato no: il premio
-- l'ha appena ricevuto in mano.
CREATE OR REPLACE FUNCTION public.review_redemption(
  _redemption_id UUID,
  _status TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _admin_id UUID;
  _org_id TEXT;
  _role TEXT;
  _red public.reward_redemptions%ROWTYPE;
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
  _symbol TEXT;
  _balance INTEGER;
  _hash TEXT;
  _result JSONB;
BEGIN
  SELECT id, org_id, role INTO _admin_id, _org_id, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  IF _org_id IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF _role <> 'admin' THEN RAISE EXCEPTION 'Solo admin può gestire i riscatti'; END IF;

  SELECT * INTO _red FROM public.reward_redemptions
   WHERE id = _redemption_id AND org_id = _org_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riscatto non trovato'; END IF;

  IF NOT (
    (_red.status = 'pending'  AND _status IN ('approved', 'rejected')) OR
    (_red.status = 'approved' AND _status IN ('delivered', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'Passaggio non consentito: da % a %', _red.status, _status;
  END IF;

  SELECT token_symbol INTO _symbol FROM public.token_config WHERE org_id = _org_id;
  _symbol := COALESCE(_symbol, 'MC');

  IF _status = 'rejected' THEN
    -- Prima il premio, poi il saldo: stesso ordine di redeem_reward.
    IF _red.reward_id IS NOT NULL THEN
      UPDATE public.reward_catalog SET stock = stock + 1, updated_at = now()
       WHERE id = _red.reward_id AND stock IS NOT NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || _red.user_id::text, 0));
    SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
      INTO _balance
      FROM public.token_transactions WHERE user_id = _red.user_id;
    _hash := encode(digest(_red.user_id::text || _red.cost::text || 'refund' || now()::text, 'sha256'), 'hex');
    INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, hash, org_id)
    VALUES (_red.user_id, _red.user_name, 'refund', _red.cost, 'Rimborso: ' || _red.reward_name,
            'reward_refund', _red.id::text, _balance + _red.cost, _hash, _org_id);
  END IF;

  UPDATE public.reward_redemptions
     SET status = _status,
         admin_note = COALESCE(_note_clean, admin_note),
         updated_at = now()
   WHERE id = _red.id
  RETURNING to_jsonb(reward_redemptions.*) INTO _result;

  IF _status IN ('approved', 'rejected') AND _red.user_id <> _admin_id THEN
    INSERT INTO public.notifications (type, title, body, from_user, target_user, org_id)
    VALUES ('reward_status',
            CASE WHEN _status = 'approved'
                 THEN '✅ Premio approvato: ' || _red.reward_name
                 ELSE '↩️ Riscatto rifiutato: ' || _red.reward_name END,
            CASE WHEN _status = 'approved'
                 THEN COALESCE(_note_clean, 'Te lo consegnano a breve.')
                 ELSE 'Ti sono stati restituiti ' || _red.cost || ' ' || _symbol || '.'
                      || COALESCE(' Motivo: ' || _note_clean, '') END,
            _admin_id, _red.user_id, _org_id);
  END IF;

  RETURN _result;
END;
$$;


-- ─── 6. Saldo: il proprio, o di qualcuno della propria org se admin
CREATE OR REPLACE FUNCTION public.get_token_balance(_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _caller UUID;
  _org TEXT;
  _role TEXT;
  _uid UUID;
  _balance INTEGER;
BEGIN
  SELECT id, org_id, role INTO _caller, _org, _role
    FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
  IF _caller IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;

  _uid := COALESCE(_user_id, _caller);
  IF _uid <> _caller AND NOT (
    _role = 'admin' AND EXISTS (SELECT 1 FROM public.users WHERE id = _uid AND org_id = _org)
  ) THEN
    RAISE EXCEPTION 'Saldo non visibile';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('earn','bonus','refund') THEN amount ELSE -amount END), 0)
    INTO _balance
    FROM public.token_transactions WHERE user_id = _uid;

  RETURN _balance;
END;
$$;


-- ─── 7. Saldi dell'org (admin) ────────────────────────────────
-- Per capire se i prezzi sono raggiungibili: saldo di ciascuno e
-- quanto ha guadagnato nel mese corrente (earn + bonus). Per chi
-- non è admin restituisce zero righe.
CREATE OR REPLACE FUNCTION public.get_org_token_balances()
RETURNS TABLE (user_id UUID, balance INTEGER, earned_month INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.user_id,
         COALESCE(SUM(CASE WHEN t.type IN ('earn','bonus','refund') THEN t.amount ELSE -t.amount END), 0)::INTEGER,
         COALESCE(SUM(CASE WHEN t.type IN ('earn','bonus')
                            AND t.created_at >= (date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome')
                           THEN t.amount ELSE 0 END), 0)::INTEGER
    FROM public.token_transactions t
   WHERE t.org_id = public.get_my_org_id()
     AND public.get_my_role() = 'admin'
   GROUP BY t.user_id
$$;
