# Sprint 1 — Handoff corrections (Merge duplicati segnalazioni)

Registro delle divergenze tra il **briefing "Merge duplicati segnalazioni"** e il
codebase reale, rilevate nel **Passo 0 — Ispezione schema**. Come da vincolo del
briefing, ogni divergenza è **risolta a favore del codebase**. Nessuna divergenza
ha invalidato una decisione di design (solo nomi/slug/convenzioni), quindi si è
proceduto senza fermarsi.

Branch di sviluppo: `claude/eager-dirac-s97brv` (imposto dall'ambiente di
esecuzione). Il briefing indicava `claude/merge-duplicati-segnalazioni`: vedi §8.

---

## 1. Tabella e PK

- **Briefing**: tabella `segnalazioni`.
- **Reale**: `public.reports`, PK `id UUID` (`supabase/schema.sql:58`). Le migrazioni
  storiche confermano il nome (`013_add_type_to_reports.sql`,
  `015_fix_reports_status_check.sql`, `019_add_closed_at_to_reports.sql`).
- **Risoluzione**: tutto il codice usa `reports`. Funzioni RPC `merge_reports` /
  `unmerge_report` (vedi §7 per il naming).

## 2. Colonna stato + slug

- **Briefing**: colonna `stato`, terminali `('completato','chiuso')`, chiusura
  `'chiuso'`, ripristino `'assegnata'`/`'aperta'`.
- **Reale**: colonna `status` **TEXT + CHECK** (non enum Postgres) con slug
  `('aperta','assegnata','in_lavorazione','in_attesa_ricambi','risolta','chiuso')`
  (`schema.sql:64-65`, `015_fix_reports_status_check.sql`). Le **etichette UI**
  (`src/lib/constants.js` `STATUS`) mappano: `risolta` → "Completato",
  `in_lavorazione` → "In Corso", `in_attesa_ricambi` → "Attesa Ricambi",
  `chiuso` → "Chiuso".
- **Risoluzione**: terminali = `('risolta','chiuso')`; la duplicata viene chiusa
  con `status='chiuso'`; unmerge ripristina `'assegnata'` se `assigned_to` è
  valorizzato, altrimenti `'aperta'`. Lo slug `'completato'` del briefing **non
  esiste**: corrisponde a `risolta`.

## 3. Tabella utenti, ruolo, org_id, helper RLS

- **Briefing**: `profiles` + `auth.uid()`; ruolo letto da `profiles`; org_id
  "oggi TEXT, post-hardening UUID".
- **Reale**: tabella utenti `public.users` (`schema.sql:19`). Helper SECURITY
  DEFINER già esistenti e usati da tutte le policy/RPC:
  `public.get_my_org_id() → TEXT`, `public.get_my_role() → TEXT`,
  `public.get_my_user_id() → UUID` (`schema.sql:297-312`). `org_id` è **TEXT**
  `NOT NULL DEFAULT 'default'`; le policy confrontano `org_id = get_my_org_id()`.
  Ruoli validi: `('operatore','tecnico','admin','super_admin')`
  (`036_super_admin_role.sql`).
- **Risoluzione**: le RPC usano `get_my_role()` per il gate ruolo
  (`IN ('tecnico','admin','super_admin')`) e `get_my_org_id()` per lo scope org —
  **identico al meccanismo delle policy esistenti**, nessun `'default'`
  hardcoded. Il tipo di `v_org` è `TEXT`.

## 4. Colonna `merged_by` (attore)

- **Briefing**: `merged_by UUID REFERENCES auth.users(id)`, valorizzato con
  `auth.uid()` (con nota "o profiles: da Passo 0").
- **Reale**: sulla tabella `reports`, gli attori `created_by` e `assigned_to`
  referenziano **`public.users(id)`** (`schema.sql:71,73`) e il frontend ne fa
  il join per nome (`reports_assigned_to_fkey`, `reports_created_by_fkey` —
  `src/lib/db/reports.js:26`).
- **Risoluzione**: `merged_by UUID REFERENCES public.users(id) ON DELETE SET NULL`,
  valorizzato con `public.get_my_user_id()`. Coerente con il resto della riga e
  con l'audit log.

## 5. Trigger `updated_at`

- Esiste `public.handle_updated_at()` con trigger `trg_reports_updated`
  BEFORE UPDATE su `reports` (`schema.sql:252-268`). Gli UPDATE di merge/unmerge
  lo attivano già: **non** si tocca `updated_at` a mano (come da nota del
  briefing). Niente da segnalare: il trigger è presente.

## 6. Numero di migrazione / "DO NOT APPLY"

- **Briefing**: "l'ultima nota è 056, marcata DO NOT APPLY".
- **Reale**: `056_intervention_participants.sql` è una **migrazione normale**
  (Sprint 1c MVP), senza alcun marcatore "DO NOT APPLY". L'ultimo numero usato è
  **056**.
- **Risoluzione**: prossimo numero libero = **057** (stessa conclusione del
  briefing). File: `057_merge_duplicate_reports.sql` (+ `_down.sql`).

## 7. Naming RPC, hook, componenti (lingua codice = inglese)

- **Briefing (bozza)**: `merge_segnalazioni`, `unmerge_segnalazione`,
  `MergeSegnalazioneModal.jsx`, percorso `src/pages/admin/components/`.
- **Reale**: convenzione di progetto "Lingua codice: inglese"; tutte le RPC
  esistenti sono in inglese (`create_maintenance_plan`, `credit_tokens`,
  `update_comment`, `approve_org`, …). `src/pages/admin/components/` **non
  esiste**; il dettaglio segnalazione admin vive in `src/pages/admin/reports/`.
- **Risoluzione**:
  - RPC: `merge_reports(p_duplicate_id, p_master_id)`,
    `unmerge_report(p_duplicate_id)`.
  - Metodi DB facade: `db.mergeReports(duplicateId, masterId)`,
    `db.unmergeReport(duplicateId)` in `src/lib/db/reports.js` (con doppio path
    supabase/demo, come da regola del progetto — vedi §9).
  - Modal: `src/pages/admin/reports/MergeReportModal.jsx` (accanto a
    `ReportDetailModal.jsx`).
  - **Hook**: mantenuto il nome del briefing `src/hooks/useMergeSegnalazione.js`
    (termine di dominio UI-facing; il briefing è esplicito su questo file).

## 8. Branch

- **Briefing**: `claude/merge-duplicati-segnalazioni`.
- **Ambiente**: impone `claude/eager-dirac-s97brv` ("NEVER push to a different
  branch without explicit permission").
- **Risoluzione**: sviluppo e push su `claude/eager-dirac-s97brv`. Nessuna PR
  creata (non richiesta esplicitamente). La "Sequenza di rilascio" del briefing
  (migrazione applicata da Andrea **prima** del deploy) resta valida — vedi §10.

## 9. Hook che chiama `supabase.rpc` direttamente vs layer `db/`

- **Briefing**: l'hook chiama internamente `supabase.rpc(...)`.
- **Reale**: convenzione vincolante del progetto — ogni accesso DB passa dai
  moduli `db/` e **deve** avere il fallback demo (localStorage). Le RPC sono già
  wrappate così (`db.updateComment` → `rpc('update_comment')`,
  `db.deleteComment` → `rpc('delete_comment')` in `reports.js`).
- **Risoluzione**: la chiamata `supabase.rpc` vive in `db.mergeReports` /
  `db.unmergeReport` (con fallback demo che replica gli stessi vincoli della
  RPC); l'hook `useMergeSegnalazione` wrappa `db.*` con toast + feedback aptico
  (stesso pattern di `useInterventionMutations`).

## 10. Badge "×N" in lista: count client-side invece di embedded PostgREST

- **Briefing**: badge "×N" via embedded count PostgREST sulla self-FK
  (`select('*, duplicati:reports!duplicate_of_id(count)')`), con fallback "niente
  badge" se la self-relationship dà problemi di disambiguazione.
- **Risoluzione adottata**: il conteggio è calcolato **client-side** in
  `AdminReports` dal set di report già caricato da `db.getReports()` (che
  include `duplicate_of_id` via `select('*')`). Nessuna modifica alla query
  esistente, nessun rischio di ambiguità self-join PostgREST, nessun N+1. Il
  badge "×N" è quindi presente (non si è dovuto ricorrere al fallback "niente
  badge").

## 11. Entry point in lista: affordance singola invece di menu contestuale

- **Briefing**: "Unisci a…" in un **menu contestuale di riga**.
- **Reale**: in `AdminReports` non esiste alcun pattern di menu contestuale/popover
  di riga (il click sulla riga apre il dettaglio). Introdurne uno (portal,
  posizionamento dentro `overflow-x-auto`, dismiss esterno) è la parte a più alto
  rischio dello sprint, con una **sola** azione contestuale disponibile.
- **Risoluzione adottata**: l'entry point ricco ("Unisci a…", banner, blocco
  master, annulla unione) vive nel **dettaglio** (`ReportDetailModal`, aperto dal
  click sulla riga — coerente con "l'azione vive nel dettaglio/lista esistenti
  come modal"). In lista si aggiunge un'**affordance compatta** (icona `GitMerge`
  rivelata su hover/focus della riga) che apre direttamente il `MergeReportModal`
  per quella segnalazione — gating identico (ruolo + attiva + non-duplicata +
  senza figli). Stessa funzione di un menu a voce singola, senza la fragilità del
  popup.

## 12bis. Documento di riferimento mancante

- **Briefing**: "Riferimento: `docs/proposals/merge-duplicati-segnalazioni.md`
  (destino ADR-012)".
- **Reale**: in `docs/proposals/` è presente solo
  `2026-05-20-ical-feed-proposal.md`. Il documento citato **non esiste** nel
  repo, e `docs/decisions/` non contiene un ADR-011/012.
- **Risoluzione**: non bloccante — la spec completa è nel briefing. La
  migrazione cita "(destino ADR-012)" nel commento di testa. L'autoria del
  proposal/ADR resta a Andrea (decisione di prodotto/architettura, fuori dallo
  scope di questo sprint implementativo).

## 12. Routing ruoli (contesto, non una divergenza bloccante)

- In `src/App.jsx`, la console admin (`V6App` → `AdminReports`) è renderizzata
  **solo** per `role === 'admin'` (tecnico → mobile, operatore → OperatorApp,
  super_admin → console moderazione). Quindi in pratica oggi solo `admin`
  raggiunge la lista/dettaglio admin. Il gating UI è comunque scritto su
  `('tecnico','admin','super_admin')` per fedeltà al briefing e a prova di
  futuro; la barriera vera resta nella RPC. L'`operatore` non vede l'azione (non
  vede affatto la console) **e** la RPC lo rifiuterebbe (criterio di accettazione
  #5).

---

### Sequenza di rilascio (invariata rispetto al briefing)

1. Migrazione consegnata nel repo: `057_merge_duplicate_reports.sql`.
2. **Andrea applica la migrazione** via Supabase Dashboard SQL Editor (progetto
   `jjrgrkxcnqltlkcnqyoi`) — **prima** del deploy.
3. Solo dopo: deploy del frontend.

Il frontend degrada in sicurezza se la migrazione non è ancora applicata: la
colonna `duplicate_of_id` semplicemente non esiste, quindi nessun badge/banner e
`r.duplicate_of_id` è `undefined`; l'unica cosa che fallisce è l'effettiva
chiamata "Unisci a…" (toast d'errore con il messaggio PostgREST), come previsto
dal briefing. Nessun feature-flag aggiunto.
