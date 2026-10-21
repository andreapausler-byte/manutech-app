# Migration 070 — Mappa impianto: il contorno di ogni area

> **Cosa fa**: aggiunge ad `areas` la colonna `map_shape` (JSONB) con il contorno dell'area sulla planimetria, un vincolo leggero sul formato, e scrive i **5 contorni** di Birra Amarcord, con **Sala Cottura e Cantina riviste il 21/10/2026**. Porta anche `areas.color` sui colori della mappa: da qui un'area ha lo stesso colore in Macchinari e sulla planimetria.
>
> **Tempo stimato**: 2 minuti.
>
> **Rischio**: minimo. Una colonna nuova con default `NULL`, un vincolo che accetta tutto quello che c'è già, nessuna policy cambiata (la scrittura passa da `areas_update`, già admin-only dalla 023). I contorni iniziali si scrivono solo dove `map_shape` è vuota: rieseguirla non sovrascrive quelli corretti dalla mappa.

---

## 1. Esegui la migration

1. Apri `supabase/migrations/070_area_map_shape.sql` dal repo e copia tutto.
2. Supabase → **SQL Editor** → **New query** → incolla → **Run**.

Risultato atteso: `Success. No rows returned`.

**Quando**: prima del merge o subito dopo. Senza la 070 la mappa funziona come prima (contorni del codice, agganciati per nome, già con Sala Cottura e Cantina corrette), ma salvare un contorno o creare un'area dalla mappa risponde "Per salvare le aree sulla mappa va eseguita la migration 070".

---

## 2. Verifica

```sql
-- I 5 contorni ci sono, con i colori della mappa
SELECT name, color,
       jsonb_array_length(map_shape->'polys') AS pezzi,
       map_shape->>'basis' AS origine
  FROM public.areas
 WHERE org_id = 'default'
 ORDER BY sort_order;

-- Il vincolo c'è
SELECT conname FROM pg_constraint WHERE conname = 'areas_map_shape_polys';
```

Atteso oggi:

| name | color | pezzi | origine |
|---|---|---|---|
| Confezionamento | #ef6a62 | 1 | Dalla planimetria |
| Cantina | #9a8cff | 3 | Dalla planimetria, rivista il 21/10/2026 |
| Ausiliari | #d9be4a | 5 | Dalla planimetria |
| Depurazione | #33c1d6 | 1 | Dalla planimetria |
| Sala Cottura | #e0904a | 2 | Dalla planimetria, rivista il 21/10/2026 |

e una riga `areas_map_shape_polys`.

Poi dall'app (da admin):

1. **Console** → **Mappa impianto**: FV1 ora sta dentro la Cantina; i due BBT a sud della sala cottura sono Cantina; i serbatoi acqua e acqua calda in testa al parco serbatoi sono Sala Cottura.
2. **Aree** (in alto a destra, accanto a Esplora e Posiziona) → tocca un'area → trascina un vertice → **Salva** → "Area «…» salvata". Nell'elenco delle aree: "Rivista il … da …".
3. **Nuova area** → nome, colore, sistema il rettangolo → **Salva**: l'area compare anche in **Macchinari**, con lo stesso colore.
4. **Macchinari**: i gruppi delle aree hanno i colori della mappa.
5. Da un telefono **tecnico**: **Macchine** → **Mappa** → la modalità **Aree** non c'è (solo Esplora e Posiziona).

```sql
-- I contorni toccati dall'app
SELECT name, map_shape->>'updated_by_name' AS da, map_shape->>'updated_at' AS quando
  FROM public.areas
 WHERE map_shape ? 'updated_by'
 ORDER BY map_shape->>'updated_at' DESC;
```

---

## Rollback

`supabase/migrations/070_area_map_shape_down.sql`: rimette i colori di prima (solo dove nessuno li ha cambiati dopo), toglie il vincolo e la colonna. **Si perdono i contorni** corretti o creati dalla mappa; le aree create dalla mappa restano, senza contorno. Se servono, prima salva il risultato di

```sql
SELECT id, name, color, map_shape FROM public.areas WHERE map_shape IS NOT NULL;
```
