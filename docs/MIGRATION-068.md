# Migration 068 — Interventi registrati: note dopo e cronologia

> **Cosa fa**: aggiunge a `maintenance_logs` la colonna `extra_data` (JSONB), dove la v5.32 tiene le **note aggiunte dopo** a una manutenzione registrata e la **cronologia** di chi ha corretto cosa. È lo stesso schema delle note sulle chiusure delle segnalazioni (`reports.extra_data.closure_notes`).
>
> **Tempo stimato**: 2 minuti.
>
> **Rischio**: minimo. Solo l'aggiunta di una colonna con default `'{}'`: nessun dato esistente toccato, nessuna policy cambiata (aggiornano tecnici e admin come dalla 020, elimina solo l'admin). Rieseguibile.

---

## 1. Esegui la migration

1. Apri `supabase/migrations/068_maintenance_log_extra_data.sql` dal repo e copia tutto.
2. Supabase → **SQL Editor** → **New query** → incolla → **Run**.

Risultato atteso: `Success. No rows returned`.

**Quando**: prima del merge o subito dopo. Senza la 068 l'app funziona lo stesso, con due limiti:
- **Correggi** e gli **allegati aggiunti o tolti dopo** si salvano, ma non lasciano la riga in cronologia;
- **una nota scritta dopo non si salva**: l'app risponde "Per salvare le note sugli interventi va eseguita la migration 068".

---

## 2. Verifica

```sql
-- La colonna c'è, con il default
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'maintenance_logs' AND column_name = 'extra_data';

-- Tutte le righe esistenti hanno '{}'
SELECT count(*) AS interventi, count(*) FILTER (WHERE extra_data = '{}'::jsonb) AS vuoti
  FROM public.maintenance_logs;
```

Atteso: una riga `extra_data | jsonb | '{}'::jsonb`; `interventi = vuoti`.

Poi dall'app, da un telefono tecnico:

1. Scheda macchina → **Storico** → tocca un intervento: si apre "Intervento registrato".
2. **Aggiungi nota, foto o PDF** → scrivi una nota → **Aggiungi**: compare sotto "Aggiunto dopo".
3. **Correggi** → cambia la durata → **Salva correzione** → apri **Cronologia**: c'è la riga "Durata: … → …".

```sql
-- Le note e la cronologia scritte dall'app
SELECT title, performed_at::date, extra_data
  FROM public.maintenance_logs
 WHERE extra_data <> '{}'::jsonb
 ORDER BY performed_at DESC LIMIT 5;
```

---

## Rollback

`supabase/migrations/068_maintenance_log_extra_data_down.sql`: toglie la colonna. Le correzioni già salvate (durata, ricambi, data, testo, allegati) restano, perché stanno nelle colonne di sempre; si perdono solo le note aggiunte dopo e la cronologia.
