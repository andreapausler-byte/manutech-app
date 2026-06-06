# Log divergenze briefing ↔ realtà — Chat AI modalità `ticket` (6/6/2026)

Riferimento: briefing "Chat AI modalità `ticket` (+ fondazione `_shared/models.ts`)".
Regola §9bis: ogni punto in cui lo schema/codice reale ha imposto scelte diverse dal briefing.

## Passo 0 — esiti ispezione schema

- **`reports`** confermata. FK macchinario = **`reports.machine_id` diretta** (no passaggio per `interventions`). ✓
- **Stati** (italiano) confermati: chiusi = `risolta` / `chiuso`; aperti = tutti gli altri
  (`aperta`, `assegnata`, `in_lavorazione`, `in_attesa_ricambi`). Timestamp: `created_at`, `closed_at`. ✓
- **`org_id`**: `TEXT NOT NULL DEFAULT 'default'` su tutte le tabelle (schema.sql:26,52,…).
  Il default legacy `'default'` esiste davvero → la regola "mai 'default' per record reali" è corretta. ✓
- **`get_my_org_id()`** presente (schema.sql:297); tutte le RLS usano `org_id = get_my_org_id()`. ✓
- **Scheda tecnica macchinario**: NON è una tabella/colonna dedicata. Sono i campi del record
  `machines` (serial_number, manufacturer, model, year, department, location, criticality) +
  eventuali allegati nella knowledge base. Implementato come fetch del record `machines`.

## Divergenze rispetto al briefing

1. **§6 — rationale "service role" non applicabile (IMPORTANTE).**
   Il briefing motiva l'assemblaggio del contesto lato frontend con: "più sicuro del fetch
   server-side con service role (rischio over-fetch oltre RLS)". In realtà `assistant-chat`
   **NON usa il service role**: crea il client con `SUPABASE_ANON_KEY` + header Authorization
   dell'utente (index.ts:911-915), quindi il retrieval server-side è **già org-scoped da RLS**.
   → Decisione: implementato comunque l'assemblaggio frontend come da briefing (struttura utile
   anche per il futuro `summarize` e per tenere i token sotto controllo), ma la motivazione di
   sicurezza è ridondante: anche il path server-side esistente è sicuro. Nessun rischio aggiunto;
   solo lievi token in più perché lo scope `ticket` aggiunge il contesto fornito **oltre** al
   retrieval server-side già presente (similar/knowledge). Ottimizzazione futura possibile:
   per scope `ticket` disattivare i blocchi server-side ridondanti.

2. **Taglio "altre segnalazioni stessa macchina".**
   Interpretazione adottata: **aperte (qualunque età) + chiuse negli ultimi 12 mesi**, esclusa
   la corrente, ordinate per `created_at` desc, cap **20**. Implementato con
   `.or('status.not.in.(risolta,chiuso),closed_at.gte.<since>')`. (L'altra lettura possibile —
   "tutte quelle create negli ultimi 12 mesi" — è stata scartata perché il briefing contrappone
   esplicitamente "aperte" e "chiuse".)

3. **`machine_id` può essere NULL.**
   Alcuni report storici hanno solo il campo testo `machine` (nome), senza `machine_id`. In quel
   caso la lista "stessa macchina" non è derivabile in modo deterministico → l'hook restituisce
   `same_machine_reports: []` e l'edge function dichiara esplicitamente "nessuna altra segnalazione
   / macchinario non collegato". Nessun fallback fuzzy sul nome macchina (eviterebbe il join sicuro).

4. **`display_id` (TK-id, migration 049) opzionale.**
   Le select lo includono con fallback automatico senza `display_id` se la colonna non esiste,
   per non rompere su DB non ancora migrati.

5. **Costante `ANTHROPIC_MODEL` rimossa** da `assistant-chat/index.ts`: il modello è ora risolto
   da `resolveModel(power, 'assistant_chat')` (`_shared/models.ts`). `callClaude` accetta
   `model` + `extraBody`.

## Note implementative

- Default potenza per scope (finché manca il selettore UI, Fase C): `ticket`→`equilibrato`
  (Sonnet 4.6), `global`→`veloce` (Haiku) per **non** cambiare il comportamento/costo della chat globale.
- Gotcha async/stale (§7): risolta con `key={selected.id}` su `<AssistantChat>` (remount per ticket)
  + `cancelled` flag nell'effect di `useTicketAIContext`.

## Fix collaterale (fuori scope ma necessario per "lint verde")

- `src/hooks/useVoiceCapture.js:60` aveva un **error ESLint pre-esistente** (`no-useless-escape`:
  `\-` dentro la character class `[\s,.\-]+`). Non toccato da questo briefing ma bloccava
  `npm run lint`. Corretto in `[\s,.-]+` (equivalente, hyphen a fine classe non va escapato).
  I 5 file del briefing sono lint-clean (0 error / 0 warning). Restano 36 warning pre-esistenti
  in altri file (pattern `react-hooks/set-state-in-effect`), non in scope.
