# ManuTech Roadmap · 12 mesi

Bussola di lungo periodo. Si aggiorna a fine fase o quando cambia la direzione, non più spesso. Il battito mensile sta in `journal/`. Il focus della sessione corrente sta in `CLAUDE.md`.

**Ultima review**: 9 maggio 2026
**Fase corrente**: Fase 4 anticipata — RAG sui commenti (use case "casi simili")
**Prossima review trimestrale**: 2 agosto 2026

---

## Documenti correlati

- `PLAN.md` — dettaglio tattico della fase corrente. Si riscrive a inizio di ogni fase nuova; il vecchio si archivia in `docs/archive/PLAN-fase-N.md`.
- `MANUTECH_OPERATOR_APP_SPEC.md` — spec funzionale del modulo Operatore, vive indipendente da questa roadmap.

---

## Fase 0 · Pulizia di casa

**Stato**: chiusa
**Obiettivo**: chiudere le 4 PR del piano v1.X — timeline collapse, urgent skip quote, voice transcripts in background, supplier specialty inference.
**Why**: tolgono attrito quotidiano e liberano la testa per le fondamenta della Fase 1. Architetturalmente non aggiungono fondamenta — sono pulizia di casa prima del trasloco.
**Apertura**: maggio 2026
**Chiusura**: 9 maggio 2026 (PR #199, #200)
**Plan archiviato**: `docs/archive/PLAN-fase-0.md`

## Fase 1 · Eventi prima dello stato

**Stato**: rinviata (vedi *Decisioni di rotta*)
**Obiettivo**: introdurre `request_events` come tabella primaria. Lo stato del ticket diventa una projection degli eventi atomici (foto caricata, audio inviato, email ricevuta, fornitore confermato, bolla allegata, status cambiato), non una colonna che si aggiorna a tap.
**Why**: è la fondazione invisibile di tutto. Senza questa fase, ogni intelligenza che metti sopra è fragile e da rifare.

## Fase 2 · Voce che dialoga

**Stato**: later
**Obiettivo**: voice agent conversazionale (Whisper + Haiku con tool calling) come field extractor + disambiguator. Tre scambi e ticket completo: macchina, parte, fornitore, urgenza, riferimento storico.
**Why**: hands-free reale per chi maneggia, compatibile con guanti e rumore. Sblocca gli smart glasses futuri.

## Fase 3 · Intelligenza per le scelte

**Stato**: later
**Obiettivo**: MTBF per macchina × tipo intervento, stock minimi dinamici, score multifattoriale fornitori (specialty match, tempo medio risposta, accuratezza preventivo, tasso re-intervento). Tutto SQL, niente AI esotica.
**Why**: l'admin smette di registrare e inizia a decidere con i fatti. È la fase più admin-first di tutta la roadmap.

## Fase 4 · Knowledge che sopravvive

**Stato**: anticipata parzialmente — in corso
**Obiettivo**: RAG unificato — manuali GEA/CIMA/Comac/AEB + storico ticket + voice transcript + foto (CLIP embeddings) + email fornitori. Una sola domanda alla chiusura ticket: "in una frase, cosa hai imparato?".
**Why**: il tribal knowledge non cammina più fuori dalla porta con le persone. Quando Luigi non c'è, il nuovo tecnico fa l'intervento giusto al primo colpo.
**Stato concreto**: stiamo anticipando il pezzo "RAG sui commenti dei report" come use case "casi simili" all'apertura segnalazione. Plan dettagliato in `PLAN.md`. Le altre componenti (foto/CLIP, email, voice, chiusura "in una frase") restano `later`.

## Fase 5 · Una conversazione, molti canali

**Stato**: later
**Obiettivo**: email e WhatsApp Business come eventi nel ticket. Smart glasses opzionali se i numeri di adozione lo giustificano.
**Why**: il ticket diventa lo spazio condiviso del lavoro reale, non un record nel DB.

---

## Lezioni imparate

Quando chiudi una fase, scrivi qui una riga su cosa hai imparato. Cresce nel tempo — è il pezzo più prezioso di questo file fra 12 mesi.

— *(in attesa della prima fase chiusa)*

---

## Decisioni di rotta

Quando cambi piano, scrivi qui perché. Niente di lungo, una frase basta.

- **9 maggio 2026** — Fase 1 (events prima dello stato) rinviata. Anticipiamo un pezzo di Fase 4: RAG sui commenti dei report come "casi simili" all'apertura segnalazione. Razionale: il valore di Fase 1 è invisibile finché non si costruisce sopra; il valore della Fase 4 anticipata è visibile dal primo merge ed è ciò che mi motiva di più adesso. Costo accettato: quando torneremo su Fase 1 events, dovremo retrofittare il modello con feature AI già sopra. Non catastrofico ma reale.

---

## Cosa NON è in roadmap, dichiaratamente

- Portale fornitori con magic link (basta parsing email della Fase 5)
- App mobile nativa (la PWA è sufficiente fino a 50+ utenti)
- Settings page per soglie (filosofia "niente nuovi setting")
- Offline queue al composer
- Ricerca globale full-text (l'indice GIN della Fase 0 prepara il terreno)
- ManuTech come prodotto vendibile a terzi (decisione a fine Fase 3)
