# Migration 065 — Le scadenze di manutenzione le controlla il server

> **Cosa fa**: crea il registro `maintenance_alerts`, la funzione `check_maintenance_deadlines()` e un job `pg_cron` che la esegue **ogni mattina alle 06:45** (ora estiva; 05:45 in inverno). Gli avvisi diventano righe in `notifications`, quindi push ed email come tutto il resto. Serve alla v5.25, che toglie il controllo dal telefono.
>
> **Tempo stimato**: 5 minuti.
>
> **Rischio**: basso. Una tabella nuova, una funzione, un job. Nessun dato esistente cambia. Rollback nel file `_down`.

---

## 0. Quando applicarla

**Prima** del deploy del frontend v5.25.

- **Migration prima, frontend dopo** → per qualche ora convivono il telefono (vecchio) e il server: al massimo qualche avviso doppio, come oggi.
- **Frontend prima, migration dopo** → **nessun avviso di scadenza** finché la migration non è applicata: il telefono non li genera più.

---

## 1. Esegui la migration

1. Apri `supabase/migrations/065_maintenance_deadlines_cron.sql` dal repo e copia tutto.
2. Supabase → **SQL Editor** → **New query** → incolla → **Run**.

Risultato atteso: una tabellina con `schedule` = un numero (l'id del job). Va bene così.

Se vedi un errore su `pg_cron`: l'estensione non è attiva. Supabase → **Database** → **Extensions** → cerca `pg_cron` → abilitala, poi riesegui.

---

## 2. Verifica

```sql
-- Il job esiste, con l'orario giusto
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'maintenance-deadlines';

-- Le scadenze già in corso sono registrate come "già avvisate" (niente raffica domattina)
SELECT kind, count(*) FROM public.maintenance_alerts GROUP BY kind;
```

Atteso: una riga per il job (`45 4 * * *`, `active = true`); per il registro, il numero di piani oggi scaduti (`overdue`) e in scadenza entro 5 giorni (`reminder`).

### Prova a mano (facoltativa)
```sql
SELECT public.check_maintenance_deadlines() AS avvisi_inviati;
```
Subito dopo la migration risponde **0**: è corretto, le scadenze di oggi sono già state segnalate. Il primo richiamo degli scaduti arriva fra 3 giorni.

---

## 3. Come si comporta

| Situazione | Avviso | A chi |
|---|---|---|
| Mancano 5 giorni o meno | 🔔 "in scadenza", **una volta** per ciclo | Tecnico del piano, o tutta l'org se il piano non ha assegnatario |
| Scade oggi o è scaduta | ⚠️ "scaduta", subito e poi **ogni 3 giorni** | Come sopra |
| Scaduta ma presa in carico (in corso) | Nessun richiamo finché è in corso | — |
| Registrato l'intervento | Ciclo nuovo: gli avvisi ripartono da capo | — |

Chi riceve davvero il push dipende anche dalle preferenze notifiche per ruolo.

---

## 4. Rollback

Esegui `supabase/migrations/065_maintenance_deadlines_cron_down.sql`: toglie job, funzione e registro. **Attenzione**: il frontend v5.25 non genera più gli avvisi dal telefono, quindi senza la 065 non arriva nessun allarme di scadenza finché non fai rollback anche del frontend.
