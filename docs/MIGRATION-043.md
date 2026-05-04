# Migration 043 — Anagrafica fornitori per Assistente AI

> **Cosa fa**: aggiunge la RPC `get_assistant_suppliers_overview()` che ritorna l'elenco completo dei fornitori esterni dell'org con ticket aperti, storico interventi e ultimo intervento. L'edge function `assistant-chat` la chiama ad ogni richiesta e include il payload nel prompt come blocco `## Fornitori esterni`. Senza questa migration, la RPC non esiste e l'AI continua a vedere i fornitori solo indirettamente (via `assigned_to_name` nei ticket aperti top per severità).
>
> **Tempo stimato**: 2 minuti.
>
> **Rischio**: bassissimo. È una funzione di sola lettura, nessuna tabella tocca dati. Rollback istantaneo.

---

## 1. Cosa serve

- Accesso al Dashboard Supabase (Owner o Admin)
- File `supabase/migrations/043_assistant_suppliers.sql` aperto

---

## 2. Esegui la migration

1. `app.supabase.com` → progetto **prod** (o staging prima)
2. Sidebar → **SQL Editor** → **New query**
3. Copia tutto il contenuto di `supabase/migrations/043_assistant_suppliers.sql`
4. Incolla → **Run**

Atteso: messaggio verde "Success. No rows returned".

---

## 3. Verifica

```sql
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'get_assistant_suppliers_overview';
```

Atteso: 1 riga, `prosecdef = true`.

Test funzionale (eseguito come admin via SQL Editor non funzionerà perché serve auth.uid; ma l'edge function lo userà col JWT corretto):

```sql
-- Mostra il numero di fornitori che la AI vedra'
SELECT jsonb_array_length(public.get_assistant_suppliers_overview()) AS n;
```

(Nota: dal SQL Editor sei `postgres`, non un utente, quindi `get_my_org_id()` ritorna NULL e la RPC fallisce con "Org non disponibile". È normale — testa direttamente dall'app.)

---

## 4. Test funzionale dall'app

- Apri ManuTech come admin
- Sidebar → **Assistente AI**
- Domanda: *"quali fornitori esterni abbiamo? Quanti ticket aperti hanno?"*
- Risposta attesa: lista completa con conteggi (es. *"PTS S.R.L — 1 ticket aperto, 1 risolto. Manara — 4 interventi storici. ..."*)

Domanda specifica: *"cosa pendente con PTS?"* → l'AI deve elencare i ticket di PTS con titolo, severità, giorni aperti.

---

## 5. Rollback (se serve)

```sql
-- File: supabase/migrations/043_assistant_suppliers_down.sql
DROP FUNCTION IF EXISTS public.get_assistant_suppliers_overview();
```

L'edge function ha fallback graceful: senza la RPC, il blocco "Fornitori esterni" sparisce dal prompt ma il resto della AI continua a funzionare.

---

## 6. Promemoria multi-ambiente

Applica prima su **staging**, verifica che l'edge function non dia errori, poi su **prod**.
