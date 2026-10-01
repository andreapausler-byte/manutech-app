# Migration 064 — "Mi è servita" sulle chiusure

> **Cosa fa**: la tabella `reactions` (059) accetta un nuovo tipo, `servito`, e un trigger accredita **5 ManuCoin** al tecnico della chiusura (`reports.assigned_to`) la prima volta che un collega la vota. Serve alla v5.23.
>
> **Tempo stimato**: 5 minuti.
>
> **Rischio**: basso. Nessuna colonna nuova, nessun dato esistente cambia: si allarga un CHECK e si aggiunge un trigger. Il rollback è nel file `_down`.

---

## 0. Quando applicarla

**Prima** del deploy del frontend v5.23.

- **Migration prima, frontend dopo** → nessun problema: il frontend vecchio non usa il tipo `servito`.
- **Frontend prima, migration dopo** → il tasto **Mi è servita** risponde *"Non riuscito"* (il CHECK rifiuta il tipo) e i conteggi restano a zero. Niente si rompe altrove, ma è una brutta prima impressione per i ragazzi.

---

## 1. Esegui la migration

1. Apri `supabase/migrations/064_closure_helpful.sql` dal repo
2. **Copia tutto il contenuto**
3. **app.supabase.com** → progetto ManuTech → **SQL Editor** → **New query**
4. **Incolla** e premi **Run**

Risultato atteso: *"Success. No rows returned"*.

Se vedi un errore su `reactions`: la 059 non è applicata su questo ambiente — applicala prima.

---

## 2. Verifica

### 2.1 Il CHECK accetta `servito`

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'reactions_type_check';
```

Atteso: la lista contiene `'servito'`.

### 2.2 Il trigger esiste

```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_reward_helpful_closure';
```

Atteso: una riga.

---

## 3. Prova funzionale (dopo il deploy frontend)

1. Da mobile, con un tecnico **diverso** da chi ha chiuso: Archivio → una segnalazione risolta → tocca **Mi è servita**.
2. Il tecnico che l'ha chiusa trova **+5 ManuCoin** nel wallet, con la causale *"La tua chiusura è servita a …"*.
3. Togli e rimetti il voto: **nessun** secondo accredito.
4. Chi ha chiuso, aprendo la propria segnalazione, vede *"È servita a 1 collega: …"* — e non ha il tasto (non si vota da solo).
5. Admin → **Archivio interventi** → *Ordina: più utili ai colleghi*: la segnalazione votata sale in cima.

---

## 4. Rollback

Esegui `supabase/migrations/064_closure_helpful_down.sql`: toglie trigger e funzione, cancella i voti `servito` e ripristina il CHECK della 059. **I ManuCoin già accreditati restano**: il registro token è immutabile per costruzione (018).
