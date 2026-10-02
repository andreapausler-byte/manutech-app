# Migration 067 — Premi: si guadagna ogni mese, si riscatta davvero

> **Cosa fa**: rende sicuro e completo il ciclo dei premi. Il rifiuto di un riscatto restituisce i ManuCoin e il pezzo allo stock; eliminare un premio non cancella più i riscatti; i badge e i livelli pagano una volta **al mese** (non più una volta nella vita) e solo con gli importi previsti; nessuno può più accreditarsi ManuCoin a piacere né creare un riscatto senza pagarlo; due tocchi veloci non spendono due volte. Gli admin ricevono un avviso a ogni riscatto, chi riscatta lo riceve quando viene approvato o rifiutato, chi riceve un bonus lo sa subito. Serve alla v5.29.
>
> **Tempo stimato**: 5 minuti (2 per la diagnosi, 1 per la migration, 2 per la verifica).
>
> **Rischio**: basso. Riscrive tre funzioni della 018 (`credit_tokens`, `redeem_reward`, `get_token_balance`), ne aggiunge due, toglie due policy di scrittura su `reward_redemptions` e cambia la FK `reward_id` in `ON DELETE SET NULL`. Nessun movimento già scritto viene toccato. Rieseguibile.

---

## 0. Prima: com'è messa la situazione (facoltativo, utile per il confronto)

Supabase → **SQL Editor** → **New query**:

```sql
-- Premi nel catalogo: se non ce n'è nessuno visibile, nessuno può riscattare
SELECT active AS visibile, count(*) AS premi, min(cost) AS piu_economico, max(cost) AS piu_caro
  FROM public.reward_catalog GROUP BY active;

-- Saldi di operatori e tecnici, con l'ultimo movimento
SELECT u.name, u.role,
       COALESCE(SUM(CASE WHEN t.type IN ('earn','bonus','refund') THEN t.amount ELSE -t.amount END), 0) AS saldo,
       max(t.created_at)::date AS ultimo_movimento
  FROM public.users u
  LEFT JOIN public.token_transactions t ON t.user_id = u.id
 WHERE u.role IN ('operatore', 'tecnico') AND u.status = 'active'
 GROUP BY u.id, u.name, u.role
 ORDER BY saldo DESC;

-- Riscatti per stato
SELECT status, count(*) FROM public.reward_redemptions GROUP BY status;

-- Badge pagati più volte (lo stesso badge da due telefoni)
SELECT user_name, reference_id, count(*) AS volte
  FROM public.token_transactions
 WHERE reason_code IN ('badge_unlock', 'level_up')
 GROUP BY user_name, reference_id HAVING count(*) > 1;
```

Cosa aspettarsi: saldi bassi e fermi da mesi per gli operatori (dalla nuova app operatore non guadagnavano più nulla), quasi zero per i tecnici. I doppioni restano nel registro: la 067 impedisce i nuovi, non cancella i vecchi.

---

## 1. Esegui la migration

1. Apri `supabase/migrations/067_premi_riscatto.sql` dal repo e copia tutto.
2. SQL Editor → **New query** → incolla → **Run**.

Risultato atteso: `Success. No rows returned` (eventuali NOTICE "does not exist, skipping" sono normali).

**Quando**: prima del merge o subito dopo. Finché l'app nuova gira senza la 067, l'operatore riscatta ancora con la funzione vecchia, ma l'admin non può approvare né rifiutare ("Manca un aggiornamento del database (migration 067)") e il tab Saldi resta vuoto con un avviso.

---

## 2. Verifica

```sql
-- Le due funzioni nuove ci sono
SELECT proname FROM pg_proc WHERE proname IN ('review_redemption', 'get_org_token_balances') ORDER BY 1;

-- Sui riscatti resta solo la policy di lettura
SELECT polname FROM pg_policy WHERE polrelid = 'public.reward_redemptions'::regclass;

-- Eliminare un premio non cancella più i riscatti ('n' = SET NULL)
SELECT confdeltype FROM pg_constraint WHERE conname = 'reward_redemptions_reward_id_fkey';

-- credit_tokens è quella nuova
SELECT count(*) AS nuova FROM pg_proc WHERE proname = 'credit_tokens' AND prosrc LIKE '%pg_trigger_depth%';
```

Atteso: `get_org_token_balances` e `review_redemption`; solo `rr_select`; `n`; `nuova = 1`.

Poi dall'app:

1. Console admin → **Premi** → **Saldi**: compaiono operatori e tecnici con saldo e guadagno del mese. Dai un bonus di prova a qualcuno (anche 1 ManuCoin): riceve un avviso "🎉 +1 ManuCoin".
2. Se il catalogo è vuoto: **Catalogo** → "Aggiungi 5 premi di esempio (nascosti)", correggi nomi e prezzi, rendili visibili con l'occhio.
3. Da un telefono operatore: **Profilo → Wallet e premi → Premi → Riscatta**. L'admin riceve l'avviso; in **Riscatti** lo approva o lo rifiuta. Se lo rifiuta, i ManuCoin tornano nel wallet dell'operatore (movimento "Rimborso").

---

## 3. Rimborsi arretrati (facoltativo)

Prima della 067 il rifiuto non restituiva i ManuCoin. Per vedere se è successo:

```sql
SELECT r.user_name, r.reward_name, r.cost, r.updated_at::date
  FROM public.reward_redemptions r
 WHERE r.status = 'rejected'
   AND NOT EXISTS (SELECT 1 FROM public.token_transactions t
                    WHERE t.reason_code = 'reward_refund' AND t.reference_id = r.id::text);
```

Se ci sono righe e vuoi restituire quei ManuCoin:

```sql
INSERT INTO public.token_transactions (user_id, user_name, type, amount, reason, reason_code, reference_id, balance_after, org_id)
SELECT r.user_id, r.user_name, 'refund', r.cost, 'Rimborso arretrato: ' || r.reward_name, 'reward_refund', r.id::text,
       (SELECT COALESCE(SUM(CASE WHEN t.type IN ('earn','bonus','refund') THEN t.amount ELSE -t.amount END), 0)
          FROM public.token_transactions t WHERE t.user_id = r.user_id) + r.cost,
       r.org_id
  FROM public.reward_redemptions r
 WHERE r.status = 'rejected'
   AND NOT EXISTS (SELECT 1 FROM public.token_transactions t
                    WHERE t.reason_code = 'reward_refund' AND t.reference_id = r.id::text);
```

Rieseguirla non rimborsa due volte. Il saldo mostrato accanto al movimento (`balance_after`) è indicativo se la stessa persona ha più rimborsi arretrati; il saldo vero si ricalcola sempre dai movimenti.

---

## 4. Rollback

Esegui `supabase/migrations/067_premi_riscatto_down.sql`: rimette le funzioni e le policy della 018 e la FK in cascata. Restano i movimenti, i rimborsi e gli avvisi scritti nel frattempo (il registro è immutabile), e `reward_id` resta nullable (i riscatti dei premi eliminati nel frattempo hanno `reward_id` NULL). Con il down l'admin non può più approvare né rifiutare dall'app v5.29: va tolta anche quella.
