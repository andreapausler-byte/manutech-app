# Migration 063 — Piani di manutenzione per componente

> **Cosa fa**: aggiunge la colonna opzionale `maintenance_plans.component_id` e sostituisce la RPC `create_maintenance_plan` con una versione a 7 parametri (la vecchia a 6 viene **droppata**). Serve alla v5.21: un piano resta della macchina ma può nominare il pezzo, e il log confermato lo eredita.
>
> **Tempo stimato**: 5 minuti.
>
> **Rischio**: basso. Aggiunge una colonna nullable (nessun dato esistente cambia) e ricrea una funzione. Il rollback è nel file `_down`.

---

## 0. Quando applicarla

**Prima** del deploy del frontend v5.21 — questo è l'unico ordine sicuro.

- **Migration prima, frontend dopo** → nessun problema: il frontend vecchio chiama la RPC con 6 argomenti nominati e la nuova funzione li accetta (il settimo ha `DEFAULT NULL`).
- **Frontend prima, migration dopo** → **si rompe la creazione dei piani**: il client manda `_component_id` a una funzione che non lo conosce, e il fallback a insert diretto scrive su una colonna che non esiste ancora.

---

## 1. Cosa serve

- [ ] Accesso al Dashboard Supabase del progetto ManuTech (ruolo Owner o Admin)
- [ ] Il file `supabase/migrations/063_plan_component.sql` aperto (repo locale o GitHub web)

---

## 2. Backup (consigliato)

La migration tocca una tabella vera (`maintenance_plans`), quindi vale il backup precauzionale:

- Dashboard Supabase → *Database → Backups → Download*

L'`ALTER TABLE ... ADD COLUMN` di una colonna nullable non riscrive la tabella e non blocca le letture: su un'anagrafica piani da qualche centinaio di righe è istantaneo.

---

## 3. Esegui la migration

1. Apri `supabase/migrations/063_plan_component.sql` dal repo
2. **Copia tutto il contenuto** (Ctrl+A, Ctrl+C)
3. Vai su **app.supabase.com** → progetto ManuTech
4. Menu sinistra → **SQL Editor** → **New query**
5. **Incolla** e premi **Run** (o Ctrl+Enter)

Risultato atteso: *"Success. No rows returned"*.

Se vedi un errore rosso, **fermati** e non rieseguire: leggi il messaggio. Il caso più probabile è che la 021 (`machine_components`) non sia stata applicata su questo ambiente — la colonna ha una foreign key verso quella tabella.

---

## 4. Verifica

### 4.1 La colonna esiste ed è nullable

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'maintenance_plans'
  AND column_name = 'component_id';
```

Atteso: una riga, `uuid`, `is_nullable = YES`.

### 4.2 Esiste UNA SOLA `create_maintenance_plan`, con 7 argomenti

È la verifica più importante: se ne restano due, PostgREST fallisce con *"function is not unique"* e **nessun piano si crea più**.

```sql
SELECT proname, pronargs, prosecdef
FROM pg_proc
WHERE proname = 'create_maintenance_plan';
```

Atteso: **una sola riga**, `pronargs = 7`, `prosecdef = true`.

Se ne vedi due, droppa a mano quella a 6 argomenti:

```sql
DROP FUNCTION IF EXISTS public.create_maintenance_plan(UUID, TEXT, INTEGER, UUID, TEXT, TEXT);
```

### 4.3 I piani esistenti sono intatti

```sql
SELECT count(*) AS piani, count(component_id) AS con_pezzo
FROM public.maintenance_plans;
```

Atteso: `piani` uguale a prima della migration, `con_pezzo = 0` (nessuno ha ancora un pezzo: si attribuiscono dall'app).

---

## 5. Rollback

Esegui `supabase/migrations/063_plan_component_down.sql`: ripristina la RPC a 6 parametri della 017.

La colonna `component_id` **non** viene droppata di default (le due righe finali del file sono commentate apposta): contiene un'attribuzione fatta da una persona, e riaggiungere la colonna dopo non la riporta indietro. Scommenta solo se vuoi davvero buttarla via.

Attenzione: se fai rollback del DB devi fare rollback anche del frontend, altrimenti la creazione dei piani si rompe (vedi §0).

---

## 6. Prova funzionale (dopo il deploy frontend)

1. **Admin → Macchinari** → una macchina che ha componenti → tab **Manutenzioni** → *Nuovo piano*: deve comparire il menu **Componente** con "Intero macchinario" come default. Crea un piano su un pezzo.
2. **Admin → Manutenzioni**: il piano appena creato mostra la pastiglia ciano del pezzo sotto il nome.
3. Registra l'intervento su quel piano: il form parte **già** con il pezzo selezionato.
4. Da mobile, su una segnalazione di una macchina con componenti: la card **Pezzo interessato** compare sotto le pastiglie; *Attribuisci* apre l'elenco; il cambio finisce in **Cronologia**.
5. Chiudi la segnalazione: il form di chiusura ha il campo **Pezzo interessato** già valorizzato con quanto attribuito.
6. **Scheda macchina → tab Componenti → il pezzo**: gli interventi e le segnalazioni attribuiti compaiono nella sua scheda.

---

## FAQ

**Devo aggiornare `supabase/schema.sql`?**
No. È uno snapshot del DB iniziale; le migration successive vivono solo come file numerati in `supabase/migrations/`.

**Ho staging e prod: dove applico prima?**
Staging, verifichi con §4, poi prod. Stesso file, nessuna differenza.

**I piani già esistenti vanno rifatti?**
No. Restano esattamente com'erano, con `component_id` a NULL — cioè "intero macchinario", che è il comportamento di sempre. Il pezzo si aggiunge quando serve, modificando il piano.
