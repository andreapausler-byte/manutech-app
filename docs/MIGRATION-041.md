# Migration 041 — Knowledge base ticket risolti

> **Cosa fa**: estende il `CHECK` constraint sulla colonna `source_kind` di `document_chunks` per ammettere il nuovo tipo `'report_chat'`. Senza questa migration, l'edge function `ingest-knowledge` fallisce con `violates check constraint` quando prova a inserire chunks da ticket chiusi.
>
> **Tempo stimato**: 2 minuti.
>
> **Rischio**: bassissimo. Nessun dato viene toccato — si modifica solo il vincolo. Rollback istantaneo se serve.

---

## 1. Cosa serve

- Accesso al Dashboard Supabase del progetto ManuTech (Owner o Admin)
- Il file `supabase/migrations/041_document_chunks_report_chat.sql` aperto da qualche parte (repo locale o GitHub web)

---

## 2. Esegui la migration

1. Apri `supabase/migrations/041_document_chunks_report_chat.sql` dal repo
2. Copia tutto il contenuto (pochissime righe)
3. Vai su **app.supabase.com** → progetto ManuTech (per **prod**, ricordati di fare prima staging)
4. Menu sinistra → **SQL Editor** → bottone **New query**
5. Incolla → **Run**

Risultato atteso: messaggio verde *"Success. No rows returned"*.

---

## 3. Verifica

```sql
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'document_chunks'
  AND c.conname = 'document_chunks_source_kind_check';
```

Atteso: una riga con `CHECK ... ANY (ARRAY[..., 'report_chat'::text])` (in qualunque ordine).

---

## 4. Backfill — popolare la knowledge base con i ticket gia' chiusi

Adesso che la migration e' applicata, i nuovi ticket chiusi vengono indicizzati automaticamente (l'app chiama `queueMachineReindex` dopo `handleClosureSubmit`).

Per i ticket **gia' chiusi prima di oggi**: serve riindicizzare le macchine. Due opzioni:

### Opzione A — manuale, una macchina alla volta
1. Vai in **Macchinari** → apri ogni macchina
2. Clicca il bottone **"Reindex AI"** (gia' presente sulla scheda macchina)
3. Aspetta il toast di conferma

### Opzione B — bulk, una sola query SQL
Usa la RPC `queue_machine_reindex` se esiste, altrimenti esegui questo script in SQL Editor:

```sql
-- Lista delle macchine con ticket chiusi (per capire quante reindexare)
SELECT m.id, m.name, COUNT(r.id) AS closed_tickets
FROM public.machines m
JOIN public.reports r ON r.machine_id = m.id AND r.status IN ('risolta', 'chiuso')
WHERE m.org_id = public.get_my_org_id()
GROUP BY m.id, m.name
ORDER BY closed_tickets DESC;
```

Poi per ogni `machine_id`, richiama l'edge function `ingest-knowledge` da terminale (oppure dall'UI macchina). Esempio terminale:

```bash
curl -X POST 'https://<project>.supabase.co/functions/v1/ingest-knowledge' \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "apikey: <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"machine_id": "<uuid>"}'
```

---

## 5. Rollback (se serve)

```sql
-- File: supabase/migrations/041_document_chunks_report_chat_down.sql
DELETE FROM public.document_chunks WHERE source_kind = 'report_chat';

ALTER TABLE public.document_chunks DROP CONSTRAINT IF EXISTS document_chunks_source_kind_check;
ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_source_kind_check
  CHECK (source_kind IN ('attachment','usage_instructions','maintenance_instructions','maintenance_log'));
```

⚠️ Il rollback **cancella** i chunk indicizzati dai ticket chiusi (solo i loro chunks knowledge — i ticket originali non vengono toccati, sono nella tabella `reports`).

---

## 6. Promemoria multi-ambiente

Applica prima su **staging** (`manutech-staging`), verifica che l'edge function `ingest-knowledge` non dia errori, poi su **prod**.
