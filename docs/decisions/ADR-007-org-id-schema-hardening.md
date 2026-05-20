# ADR-007 — org_id schema hardening

**Status**: **superseded by future Sprint Multi-Tenant Foundations** · **Date**: 2026-05-14 · **Last update**: 2026-05-20 (sera) · **Sprint target originale**: 1d (sospeso 20/5 sera) · **Priorità**: posticipata (multi-tenant fuori focus corrente)

---

## Scoperta 2026-05-20 — pre-check mig 056 abortito

A fine giornata 20/5, dopo audit client pulito (`docs/audits/2026-05-20-org-id-client-audit.md`) e proposta migration `056_org_id_hardening.sql` (opzione C) pronta per review, l'esecuzione del solo Step 1 (pre-check `org_id='default'`) ha fatto abortire la migration con uno scenario radicalmente diverso da quello assunto in tutto questo ADR.

### Fatti scoperti via SQL diagnostico in produzione

1. **2424 record con `org_id='default'` su 22 tabelle**. Non è "sporcizia residua" da cleanup, è il **valore di default usato sistematicamente dall'inizio** dell'app. Ogni INSERT che è andato in produzione finora ha scritto `org_id='default'` perché nessuna org reale è mai esistita.

2. **`users.org_id` ha un solo valore distinto: `'default'`** (29 utenti su 29). Gli utenti che usano ManuTech oggi (Andrea + manutentore reale + utenti demo + tester) appartengono tutti alla stessa "org fittizia" rappresentata dalla stringa letterale `'default'`.

3. **Nessuna tabella `organizations` / `orgs` / `tenants` / `companies` esiste nel public schema**. La discovery contraddice direttamente quanto dichiarato in `032_organizations.sql`, che ipotizzava di averla creata e di aver fatto backfill verso un seed UUID. **Quella migration non è mai stata applicata in produzione**, oppure è stata revertita senza traccia. Il codice client la presume esistente (vedi `_client.js:29` che invoca `supabase.rpc('get_my_org_id')`) ma in produzione l'RPC ritorna verosimilmente la stringa `'default'` (o NULL coperto da fallback client `DEMO_ORG_ID`).

4. **L'UUID `1235103f-45e5-4fa5-a256-3ca5f39dcf1e`** citato nelle note storiche ADR-007 e nelle 5 query diagnostiche di ADR-008 (`/* contro l'org 1235103f-... */`) **non esiste in produzione**. Era un valore pianificato — probabilmente preso dalla testa o da un ambiente di staging dismesso — ma mai applicato. Le note storiche su ManuTech multi-tenant scritte fino al 20/5 sono in larga parte **wishful thinking documentato come fatto**.

### Riclassificazione dello stato del DB

Lo schema attuale **non è "sporco da bonificare"**. È **pre-multi-tenant by design**:

- `org_id TEXT NOT NULL DEFAULT 'default'` su 27 tabelle = una colonna che è formalmente cross-tenant ma di fatto serve solo a tenere il posto per il giorno in cui multi-tenant arriverà davvero.
- `get_my_org_id()` ritorna `'default'` (o NULL → fallback) — in pratica le RLS `org_id = get_my_org_id()` confrontano sempre `'default' = 'default'` → match, ogni utente vede tutto. Non c'è isolamento tenant, perché non c'è multi-tenant da isolare.
- Il sistema funziona correttamente per **un singolo tenant fittizio**, che è esattamente lo scenario d'uso reale (Andrea + il suo manutentore, single-org).

Conseguenze:

- **Migration 056 (opzione C) non applicabile come progettata**. Il CHECK `org_id <> 'default' AND org_id ~* '<uuid-regex>'` rifiuterebbe 2424 record esistenti + ogni nuovo INSERT futuro. Aborto al pre-check Step 1 è la risposta corretta — bloccare l'utente prima di rompere il DB.
- **Mig 032 va trattata come dichiarata-ma-non-applicata** finché non si verifica caso per caso. L'audit dello schema reale è prerequisito per qualunque sprint di hardening org_id.
- **L'intent di questo ADR resta valido per il futuro**, ma il percorso cambia: serve prima costruire la fondamenta multi-tenant (tabella `organizations` reale, backfill dei record esistenti verso un UUID seed reale, get_my_org_id() che risolve via JOIN), poi il CHECK hardening diventa banale.

### Decisione di rotta (20/5 sera)

Andrea ha scelto di **mettere da parte il tema multi-tenant/commercializzazione** e concentrarsi sull'evoluzione del prodotto come single-tenant tool per il proprio caso d'uso reale. La fondazione multi-tenant resta valida come strategia futura ma esce dalla short-term roadmap.

**Questo ADR transita a `superseded by future Sprint Multi-Tenant Foundations`**. La proposta di hardening org_id (opzione C, opzione B) e l'audit client del 20/5 restano nel repository come riferimento per quando lo Sprint Multi-Tenant Foundations sarà aperto. Non si applica nulla nel frattempo.

**File correlati impattati**:
- `supabase/migrations/056_org_id_hardening.sql` — marcato `DO NOT APPLY` in cima
- `supabase/migrations/056_org_id_hardening_down.sql` — marcato `DO NOT APPLY` in cima
- `docs/audits/2026-05-20-org-id-client-audit.md` — resta valido come fotografia client al 20/5
- `docs/decisions/ADR-008-interventions-v2-data-model.md` — prereq #2 riformulato (vedi ADR-008)

### Cosa servirà davvero in Sprint Multi-Tenant Foundations

Quando il momento arriverà (decisione futura), lo sprint dovrà:

1. **Audit live** con query diagnostiche su DB reale **prima** di scrivere proposta (lezione operativa, vedi journal 20/5 sera).
2. **CREATE TABLE organizations** vera, con seed UUID per la "default org" attuale.
3. **Backfill atomico**: `UPDATE <tabella> SET org_id = '<seed-uuid>' WHERE org_id = 'default'` su tutte le 27 tabelle.
4. **Update `get_my_org_id()`** per risolvere via JOIN con organizations (la versione 032-dichiarata, mai applicata davvero).
5. **CHECK constraint** (l'opzione C di questo ADR) come step finale di hardening.
6. **Smoke test multi-tenant**: creare seconda org, verificare isolamento RLS.

Tutto questo ha valore SE/QUANDO ManuTech serve un secondo cliente. Non prima.

---

## Problema

Tutte le tabelle ManuTech (27 confermate, lista 4.1) usano `org_id TEXT NOT NULL DEFAULT 'default'`.

Conseguenze concrete già osservate:

- **Record invisibili da RLS mismatch**: se un INSERT dimentica di passare `org_id` (bug nel client DB layer), Postgres applica il default `'default'`. La RLS poi confronta con `get_my_org_id()` che ritorna l'UUID dell'org reale (es. `1235103f-45e5-4fa5-a256-3ca5f39dcf1e`). Mismatch → l'utente non vede il record che ha appena creato. Debug molto difficile (nessun errore, solo "il record sparisce").
- **Validazione di tipo mancante**: TEXT accetta qualsiasi stringa. UUID malformati o stringhe arbitrarie passano silenziosamente. Errori scoperti solo in produzione.
- **Performance**: indici TEXT sono leggermente meno efficienti di UUID (16 byte fisso vs lunghezza variabile). Non critico oggi (~poche centinaia di record per org), critico in FASE 5 multi-tenant (molte org × milioni di record).

## Impatto su FASE 5 (multi-tenant)

**Catastrofico** se non sanato prima:

- L'arrivo di una seconda org (diciamo `acme-corp-uuid`) con codice client che dimentica un INSERT senza `org_id` → record salvato con `org_id='default'` → invisibile alla acme-corp ma anche alla org originale (che ha l'UUID giusto). Record fantasma in DB.
- Cross-tenant data leakage potenziale se la RLS si "rilassa" per debugging e il default `'default'` matcha più tenant.

## Stato pre-056 (rilevato 20/5)

**Mig 032 (Organizations multi-tenant) ha già fatto in parte il lavoro**:

- Tabella `organizations` creata, seed UUID `00000000-0000-0000-0000-000000000001` populato.
- Backfill **completato** su 17 tabelle: tutti i record con `org_id='default'` riassegnati a seed UUID (come stringa).
- `DROP DEFAULT` **eseguito solo su 6 tabelle**: `users`, `machines`, `reports`, `comments`, `activities`, `notifications`. Le altre 21 hanno ancora `DEFAULT 'default'` "dormiente".
- `get_my_org_id()` aggiornato per risolvere via JOIN `organizations` (return TEXT, body `o.id::text`).

**Cosa manca per chiudere il giro**:

1. **DROP DEFAULT** sulle 21 tabelle residue.
2. **Validation che `org_id` sia UUID-valido** (oggi nulla impedisce un INSERT con `org_id='pippo'`).
3. **Validation che `org_id != 'default'`** (oggi nulla impedisce un retry post-backfill di un INSERT con default).
4. **(Opzionale, performance)** Conversione TEXT → UUID.

## Decision drivers

- **Realizzare l'intento di ADR-007** (no record fantasma, UUID validation, multi-tenant safety) — **obbligatorio**.
- **Minimizzare il blast radius su RLS** — 92 occorrenze di `get_my_org_id()` in policy, cambiare il return type richiede DROP+CREATE di ogni policy → rischio elevato.
- **Mantenere il client invariato**: il client passa già `org_id` come stringa UUID via `getMyOrgId()`. Una soluzione UUID-stringa (TEXT con CHECK regex) richiede zero client change. Una soluzione UUID-type richiede zero client change ma rompe le RLS.
- **Idempotency della migration** — applicabile due volte senza fail.
- **Rollback safety** — la down migration non deve reintrodurre l'anti-pattern.

## Opzioni considerate

### Opzione A — Solo DROP DEFAULT residui

Si limita a estendere mig 032 alle 21 tabelle non coperte.

- **Pro**: minima, una manciata di ALTER TABLE.
- **Contro**: NON protegge da `org_id='pippo'` o `org_id='default'` futuro. Non realizza l'intento di ADR-007.
- **Scartata**.

### Opzione B — Full TEXT → UUID type change

Cambia il tipo della colonna su tutte le 27 tabelle e aggiorna `get_my_org_id()` per ritornare UUID.

- **Pro**: tipologia stretta, performance, "pulita" architettonicamente.
- **Contro (gravi)**:
  - 92 RLS policy usano `get_my_org_id()`. Cambiare il return type richiede DROP POLICY × 92 + DROP FUNCTION + CREATE FUNCTION + CREATE POLICY × 92.
  - Durante DROP POLICY le tabelle sono temporaneamente esposte (no RLS attiva). In una migration atomica questo è OK ma se la migration fallisce a metà serve down robusta.
  - Function dipendency chain (`get_my_role()` etc.) potrebbe richiedere coordinamento.
- **Stimata in 1-2 giorni di lavoro + review approfondita**.
- **Differita a Sprint architetturale dedicato post-FASE 5 trigger** (non ora).

### Opzione C — TEXT + CHECK constraint anti-default + UUID-regex *(raccomandata)*

Mantiene il tipo TEXT, aggiunge due CHECK constraint per tabella:

```sql
CHECK (org_id <> 'default' AND org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
```

Combina:
- **DROP DEFAULT** su tutte le 21 tabelle residue (chiude buco mig 032).
- **DROP DEFAULT** idempotent anche sulle 6 già coperte da 032 (no-op safe).
- **CHECK constraint** su tutte le 27 tabelle: rifiuta INSERT con `org_id='default'` o con stringa non-UUID.

- **Pro**:
  - Zero modifiche a RLS, zero modifiche a `get_my_org_id()`, zero modifiche al client.
  - Idempotent via `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`.
  - Realizza tutti gli obiettivi di ADR-007 (no record fantasma, UUID validation, no `'default'` futuro).
  - Performance: UUID-as-TEXT vs UUID-type è marginale fino a milioni di record per tabella.
  - Down migration semplice (`DROP CONSTRAINT`).
- **Contro**:
  - Storage 36 byte/record vs 16 byte (UUID type). A 1M record/tabella = 20 MB in più. Trascurabile vs il costo di review B.
  - "Non realizza letteralmente TEXT → UUID" come scritto nell'ADR-007 originale. Però realizza l'**intento** (multi-tenant safety + validation).
- **Raccomandata** come pragmatic-default.

### Opzione D — TEXT → UUID via RLS preserve trick

Variante di B: invece di DROP+CREATE function, mantenere `get_my_org_id()` con return TEXT ma aggiungere overload `get_my_org_id_uuid()` che ritorna UUID. Le nuove RLS usano la versione UUID, le vecchie restano TEXT con cast.

- **Pro**: nessuna RLS toccata immediatamente.
- **Contro**: schema confuso (due funzioni con stesso scopo), debito tecnico permanente, migrazione graduale RLS senza chiusura chiara.
- **Scartata**.

## Decision

**Adottare Opzione C (CHECK constraint UUID-regex)** per mig 056. Opzione B resta documentata per uno sprint futuro dedicato se/quando la performance UUID-type diventerà critica.

## Soluzione — Migration 056 (Opzione C)

### 4.1 Tabelle interessate (27)

Verifica via grep su `supabase/migrations/*.sql` + `supabase/schema.sql` (20/5):

```
activities, areas, assistant_conversations, comments, conversations,
direct_messages, document_chunks, guest_tokens, interventions,
intervention_reports, machine_components, machines, maintenance_logs,
maintenance_plans, notifications, notification_preferences,
push_subscriptions, reports, reward_catalog, reward_redemptions,
spare_part_compatibility, spare_part_orders, spare_parts,
supplier_profiles, token_config, token_transactions, users
```

**Non incluse** (verificato):
- `organizations` — è la sorgente FK, ha `id UUID PRIMARY KEY`, non `org_id`.
- `dm_reads` — non ha colonna `org_id`, eredita via `conversation_id`.
- `report_stars` — non ha colonna `org_id`, eredita via `report_id`.

**Differenza vs lista preliminare ADR-007 v1**:
- `dm_reads`, `report_stars` **rimosse** (non hanno org_id).
- `areas`, `assistant_conversations`, `document_chunks`, `machine_components` **aggiunte** (hanno org_id, mancavano).

### 4.2 Sequenza migration 056

```sql
-- Step 1: Pre-check no record con org_id='default'
DO $$ ... FOREACH _table IN ARRAY _tables LOOP
  IF count > 0 THEN RAISE EXCEPTION ...;
  END IF;
END LOOP; $$;

-- Step 2: Pre-check tutti gli org_id sono UUID-validi
DO $$ ... FOREACH _table IN ARRAY _tables LOOP
  IF count(non_uuid) > 0 THEN RAISE EXCEPTION ...;
  END IF;
END LOOP; $$;

-- Step 3: DROP DEFAULT idempotent
DO $$ ... FOREACH _table IN ARRAY _tables LOOP
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id DROP DEFAULT', _table);
END LOOP; $$;

-- Step 4: Add CHECK constraint idempotent
DO $$ ... FOREACH _table IN ARRAY _tables LOOP
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                 _table, _table || '_org_id_uuid_check');
  EXECUTE format($q$ALTER TABLE public.%I ADD CONSTRAINT %I
                     CHECK (org_id <> 'default' AND
                            org_id ~* '^[0-9a-f]{8}-...{12}$')$q$,
                 _table, _table || '_org_id_uuid_check');
END LOOP; $$;
```

SQL completo nel file `supabase/migrations/056_org_id_hardening.sql`.

## Acceptance criteria

- Tutte le 27 tabelle hanno `ALTER COLUMN org_id DROP DEFAULT` (idempotent — no fail anche se già fatto).
- Tutte le 27 tabelle hanno `CONSTRAINT *_org_id_uuid_check` che rifiuta `'default'` e qualunque stringa non-UUID-shape.
- `get_my_org_id()`, RLS policy, client DB layer **invariati**.
- Migration applicabile in produzione su Supabase Studio in <30 secondi (no DDL su volumi grandi, sono solo metadata changes).
- Smoke test post-migration: `INSERT INTO reports (org_id, ...) VALUES ('default', ...)` deve fallire con CHECK violation.

## Rollback (056_org_id_hardening_down.sql)

```sql
-- DROP CHECK constraints (idempotent)
DO $$ ... FOREACH _table IN ARRAY _tables LOOP
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                 _table, _table || '_org_id_uuid_check');
END LOOP; $$;
```

**NON ripristina i `DEFAULT 'default'`**. Quel default era un anti-pattern noto e mig 032 lo aveva già parzialmente rimosso. Reintrodurlo nella down è regressivo. Se serve davvero rollback completo, va fatto manualmente con conoscenza del business.

## Scope

- **In scope mig 056**: DROP DEFAULT + CHECK constraint su 27 tabelle. Idempotent, atomic.
- **Fuori scope mig 056** (per sprint futuri):
  - Conversione TEXT → UUID type (Opzione B). Solo se performance lo richiede.
  - FK `org_id REFERENCES organizations(id)` per ogni tabella. Solo se enforcement referenziale serve oltre la CHECK regex.
  - Refactor client DB layer (oggi passa già stringhe UUID corrette).
  - Audit cross-tabella di record orfani (record con `org_id` valido come UUID ma che non esiste in `organizations`).

## Riferimenti

- `supabase/migrations/032_organizations.sql` — backfill iniziale + DROP DEFAULT parziale (6 tabelle).
- `supabase/migrations/055_intervention_reports.sql` (commenti riga 33-41) — TECH DEBT esplicito su `org_id TEXT`.
- `docs/decisions/ADR-008-interventions-v2-data-model.md` — `accepted` bloccato da questo ADR.
- Ricerca pre-FASE 5 multi-tenant.

## Note

Status pivota a **`accepted`** quando:
1. Migration 056 applicata in produzione Supabase Studio.
2. Smoke test passato (INSERT con `org_id='default'` rifiutato).
3. Verifica visiva su Studio che le 27 tabelle hanno il CHECK constraint.

Questo ADR è ora **proposal expanded**. La migration `056_org_id_hardening.sql` e relativo down sono pronti per review. Non vengono applicati automaticamente — serve human-in-the-loop su Supabase Studio.
