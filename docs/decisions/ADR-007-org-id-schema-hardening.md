# ADR-007 — org_id schema hardening (TEXT → UUID)

**Status**: planned · **Date**: 2026-05-14 · **Sprint target**: 1d (subito dopo 1c) · **Priorità**: alta (pre-FASE 5 multi-tenant)

## Problema

Tutte le tabelle ManuTech (`interventions`, `reports`, `notifications`, `activities`, `comments`, `machines`, `maintenance_plans`, `spare_part_orders`, `intervention_reports` introdotta in 1c, ecc.) usano `org_id TEXT NOT NULL DEFAULT 'default'`.

Conseguenze concrete già osservate:
- **Record invisibili da RLS mismatch**: se un INSERT dimentica di passare `org_id` (bug nel client DB layer), Postgres applica il default `'default'`. La RLS poi confronta con `get_my_org_id()` che ritorna l'UUID dell'org reale (es. `1235103f-45e5-4fa5-a256-3ca5f39dcf1e`). Mismatch → l'utente non vede il record che ha appena creato. Debug molto difficile (nessun errore, solo "il record sparisce").
- **Validazione di tipo mancante**: TEXT accetta qualsiasi stringa. UUID malformati o stringhe arbitrarie passano silenziosamente. Errori scoperti solo in produzione.
- **Performance**: indici TEXT sono leggermente meno efficienti di UUID (16 byte fisso vs lunghezza variabile). Non critico oggi (~poche centinaia di record per org), critico in FASE 5 multi-tenant (molte org × milioni di record).

## Impatto su FASE 5 (multi-tenant)

**Catastrofico** se non sanato prima:
- L'arrivo di una seconda org (diciamo `acme-corp-uuid`) con codice client che dimentica un INSERT senza `org_id` → record salvato con `org_id='default'` → invisibile alla acme-corp ma anche alla org originale (che ha l'UUID giusto). Record fantasma in DB.
- Cross-tenant data leakage potenziale se la RLS si "rilassa" per debugging e il default `'default'` matcha più tenant.

## Soluzione proposta

Migration `056_org_id_hardening.sql` cross-table:

1. **Verifica pre-migration**: `SELECT COUNT(*) WHERE org_id = 'default'` su tutte le tabelle. Se > 0, abort + segnalazione manuale (record da rinominare prima).
2. **`ALTER TYPE`**: `org_id TEXT → UUID` con cast esplicito (`USING org_id::uuid`) — possibile solo se tutti i record hanno valori UUID-validi.
3. **`DROP DEFAULT`**: `ALTER COLUMN org_id DROP DEFAULT` su tutte le tabelle.
4. **Update helper**: `get_my_org_id()` ritorna già UUID, non serve cambio.
5. **RLS check**: tutte le policy `org_id = get_my_org_id()` continuano a funzionare (UUID = UUID).

Tabelle interessate (lista preliminare, da raffinare in 1d): `users`, `reports`, `interventions`, `intervention_reports`, `machines`, `maintenance_plans`, `maintenance_logs`, `notifications`, `activities`, `comments`, `direct_messages`, `dm_reads`, `push_subscriptions`, `notification_preferences`, `spare_part_orders`, `spare_parts`, `spare_part_compatibility`, `token_config`, `token_transactions`, `reward_catalog`, `reward_redemptions`, `report_stars`, `supplier_profiles`, `conversations`, `guest_tokens`.

## Scope

- **In scope 1d**: solo schema hardening + migration 056 + verifica visiva su Studio.
- **Fuori scope 1d**: ottimizzazione indici UUID, refactor del client DB layer (oggi passa già stringhe UUID corrette via `getMyOrgId()`, quindi nulla da cambiare).

## Acceptance criteria

- Tutte le tabelle ManuTech hanno `org_id UUID NOT NULL` (no default).
- Migration 056 atomica con verifica pre-cast (abort se mismatch).
- Down disponibile (UUID → TEXT, ma destructive: i record con UUID rimangono validi come stringhe).
- Smoke test: creare un record da admin, verificarlo immediatamente visibile.

## Riferimenti

- Sprint 1c (mig 055) — primo punto in cui l'anti-pattern è stato rinviato consapevolmente.
- Ricerca pre-FASE 5 multi-tenant.

## Note

ADR placeholder. Da espandere all'inizio di Sprint 1d con:
- Lista esatta tabelle (verifica via `information_schema.columns`)
- SQL dettagliato della migration 056
- Plan di rollback testato su staging
