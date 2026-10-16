# Migration 069 — Mappa impianto: dove sta ogni macchina

> **Cosa fa**: aggiunge a `machines` la colonna `map_position` (JSONB) con il punto della macchina sulla planimetria, la funzione `set_machine_map_position` con cui admin e tecnici spostano o confermano un punto, e mette le **41 posizioni** ricavate dalla planimetria nella mappa costruita su claude.ai (16/10/2026).
>
> **Tempo stimato**: 2 minuti.
>
> **Rischio**: minimo. Una colonna nuova con default `NULL`, una funzione nuova, nessuna policy cambiata. Le posizioni iniziali si scrivono solo dove `map_position` è vuota: rieseguirla non sovrascrive i punti corretti a mano.

---

## 1. Esegui la migration

1. Apri `supabase/migrations/069_machine_map_position.sql` dal repo e copia tutto.
2. Supabase → **SQL Editor** → **New query** → incolla → **Run**.

Risultato atteso: `Success. No rows returned`.

**Quando**: prima del merge o subito dopo. Senza la 069 la pagina si apre lo stesso, ma la planimetria è vuota (tutte le macchine sono "da posizionare") e spostare un punto risponde "Per salvare le posizioni sulla mappa va eseguita la migration 069".

---

## 2. Verifica

```sql
-- La colonna c'è e le posizioni iniziali sono arrivate
SELECT count(*) AS macchine,
       count(map_position) AS sulla_mappa,
       count(*) FILTER (WHERE map_position->>'conf' IN ('stimata', 'media', 'area')) AS da_verificare
  FROM public.machines;

-- La funzione c'è
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'set_machine_map_position';
```

Atteso oggi: `macchine = 41`, `sulla_mappa = 41`, `da_verificare = 29`; una riga `set_machine_map_position | true`.

Poi dall'app:

1. **Console** → **Mappa impianto**: i punti ci sono, colorati dai ticket aperti (verde nessuno, ambra aperti, rosso con gravità alta o critica). I tratteggiati sono stime.
2. **Posiziona** → trascina un punto → "Posizione salvata". Aprilo: "Confermata — Posizionata a mano sulla mappa", con data e nome.
3. Da un telefono **tecnico**: **Macchine** → **Mappa** → stessa planimetria; in **Posiziona** il tecnico può spostare e confermare. Un operatore no (la funzione risponde "Solo admin e tecnici possono spostare le macchine sulla mappa").

```sql
-- I punti toccati dall'app
SELECT name, map_position->>'conf' AS conf, map_position->>'updated_by_name' AS da, map_position->>'updated_at' AS quando
  FROM public.machines
 WHERE map_position ? 'updated_by'
 ORDER BY map_position->>'updated_at' DESC LIMIT 10;
```

---

## Rollback

`supabase/migrations/069_machine_map_position_down.sql`: toglie la funzione e la colonna. **Si perdono le posizioni**, anche quelle corrette a mano: se servono, prima salva il risultato di

```sql
SELECT id, name, map_position FROM public.machines WHERE map_position IS NOT NULL;
```
