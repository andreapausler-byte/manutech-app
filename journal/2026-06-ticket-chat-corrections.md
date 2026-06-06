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

1. **§6 — rationale "service role" non applicabile → scelto approccio SERVER-SIDE (IMPORTANTE).**
   Il briefing motiva l'assemblaggio del contesto lato frontend con: "più sicuro del fetch
   server-side con service role (rischio over-fetch oltre RLS)". In realtà `assistant-chat`
   **NON usa il service role**: crea il client con `SUPABASE_ANON_KEY` + header Authorization
   dell'utente (index.ts), quindi il retrieval server-side è **già org-scoped da RLS**.
   → **Decisione del founder (6/6, dopo segnalazione): implementare lo scope `ticket`
   interamente server-side.** Niente hook `useTicketAIContext`, niente `context` blob nel body.
   La query deterministica "stessa macchina, aperte + chiuse 12 mesi, esclusa la corrente, cap 20"
   gira DENTRO l'edge function con il client JWT-utente (RLS attiva). La scheda tecnica del
   macchinario arriva già dal blocco "Storia macchina" (`get_machine_history`). Vantaggi: zero
   retrieval duplicato, un solo percorso da mantenere, sicurezza garantita da RLS.
   → Catena frontend semplificata: `sendMessage`/`useAssistantChat`/`AssistantChat` propagano solo
   `scope` (+ `power`); `ReportDetailModal` rende `<AssistantChat scope="ticket" key={id}>` senza
   skeleton/context. (La prima implementazione frontend-assembly è stata sostituita prima del merge.)

2. **Taglio "altre segnalazioni stessa macchina".**
   Interpretazione adottata: **aperte (qualunque età) + chiuse negli ultimi 12 mesi**, esclusa
   la corrente, ordinate per `created_at` desc, cap **20**. Implementato con
   `.or('status.not.in.(risolta,chiuso),closed_at.gte.<since>')`. (L'altra lettura possibile —
   "tutte quelle create negli ultimi 12 mesi" — è stata scartata perché il briefing contrappone
   esplicitamente "aperte" e "chiuse".)

3. **`machine_id` può essere NULL.**
   Alcuni report storici hanno solo il campo testo `machine` (nome), senza `machine_id`. In quel
   caso la lista "stessa macchina" non è derivabile in modo deterministico → la query server-side
   non viene eseguita e il blocco dichiara esplicitamente "macchinario non collegato a questo
   ticket". Nessun fallback fuzzy sul nome macchina (eviterebbe il join sicuro su `machine_id`).

4. **`display_id` (TK-id, migration 049) opzionale.**
   Le select lo includono con fallback automatico senza `display_id` se la colonna non esiste,
   per non rompere su DB non ancora migrati.

5. **Costante `ANTHROPIC_MODEL` rimossa** da `assistant-chat/index.ts`: il modello è ora risolto
   da `resolveModel(power, 'assistant_chat')` (`_shared/models.ts`). `callClaude` accetta
   `model` + `extraBody`.

## Note implementative

- Default potenza per scope (finché manca il selettore UI, Fase C): `ticket`→`equilibrato`
  (Sonnet 4.6), `global`→`veloce` (Haiku) per **non** cambiare il comportamento/costo della chat globale.
- Gotcha async/stale (§7): con l'approccio server-side non c'è più contesto asincrono lato client;
  resta `key={selected.id}` su `<AssistantChat>` per remount pulito (messaggi freschi) al cambio ticket.

## Fix collaterale (fuori scope ma necessario per "lint verde")

- `src/hooks/useVoiceCapture.js:60` aveva un **error ESLint pre-esistente** (`no-useless-escape`:
  `\-` dentro la character class `[\s,.\-]+`). Non toccato da questo briefing ma bloccava
  `npm run lint`. Corretto in `[\s,.-]+` (equivalente, hyphen a fine classe non va escapato).
  I 5 file del briefing sono lint-clean (0 error / 0 warning). Restano 36 warning pre-esistenti
  in altri file (pattern `react-hooks/set-state-in-effect`), non in scope.
