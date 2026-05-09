*Dettaglio tattico della Fase 0 di ROADMAP.md. Si svuota e riscrive a inizio Fase 1.*

# Fase 0 · Pulizia di casa — 4 PR

L'obiettivo della fase è togliere attrito quotidiano. Niente fondamenta nuove, niente architettura. Quattro interventi piccoli e cattivi, in ordine di blast radius crescente.

**Ordine consigliato**: PR 1 → PR 2 → PR 3 → PR 4. PR 1 è UI pura e dà subito soddisfazione; PR 4 sfiora la Fase 3 e va valutata.

---

## PR 1 · Timeline collapse

**File**: `src/components/reports/ActivityTimeline.jsx`
**Usato da**: `src/components/reports/ReportDetail.jsx:1003`, `src/pages/admin/reports/ReportDetailModal.jsx:354`

### Problema
La timeline del ticket mostra ogni evento in linea, anche cambi di stato automatici e commenti di sistema. Sui ticket maturi diventa rumore — chi apre il dettaglio scrolla per trovare il fatto saliente.

### Soluzione
Raggruppare eventi consecutivi dello stesso tipo (o gli automatici) in un unico nodo collassabile. Espansione on-tap.

### Scope
- Logica di grouping nel render di `timeline.map`
- Nuovo nodo "gruppo" con contatore (`3 cambi di stato automatici`)
- Stato di apertura locale (no persistenza)
- Nessuna modifica DB, nessun cambio API

### Out of scope
- Filtri per tipo evento (rimandato)
- Persistenza dello stato collassato per utente

### Definition of done
- Build e lint puliti
- Nessuna regressione su `ReportDetail` mobile e `ReportDetailModal` admin
- Timeline con 10+ eventi automatici si comprime visivamente

---

## PR 2 · Urgent skip quote

**File**: `src/pages/admin/AdminSpareParts.jsx`, `src/components/spare/SpareRequestModal.jsx`, `src/components/spare/TicketSparePanel.jsx`
**Modulo correlato**: stato `preventivo` introdotto nelle PR #193-195 (appena mergeate)

### Problema
Quando una richiesta di ricambio è `urgenza: 'urgente'`, il flusso attuale passa comunque per `preventivo` (richiesta a N fornitori, attesa risposta). Per un ricambio urgente l'attesa preventivi è rumore: si vuole ordinare subito al fornitore di fiducia.

### Soluzione
Branch nel flusso: se `urgenza === 'urgente'`, salta `preventivo` e proponi direttamente l'ordine al fornitore con miglior score storico (o chiedi scelta esplicita).

### Scope
- Decisione policy: salto automatico vs prompt all'admin (default: prompt + suggerimento)
- Modifica state machine spare in `AdminSpareParts.jsx`
- UI hint visibile in `SpareRequestModal` quando si seleziona `urgente`
- Nessuna nuova migration (lo stato `urgenza` esiste già)

### Out of scope
- Auto-ordine senza conferma
- Notifica WhatsApp al fornitore (Fase 5)

### Definition of done
- Una richiesta `urgente` non resta mai a `preventivo` se l'admin sceglie skip
- Flusso non-urgente invariato (regression test manuale)

---

## PR 3 · Voice transcripts in background

**File**: `src/components/voice/VoiceRecorder.jsx`, `VoiceNewTicketFlow.jsx`, `VoiceUpdateFlow.jsx`, `VoiceReviewShell.jsx`
**Edge function**: `supabase/functions/transcribe` (esistente)

### Problema
La trascrizione Whisper gira sincrona prima del submit del ticket. `VoiceRecorder.jsx:84` mostra "Trascrizione in corso…" e blocca il flusso. Su rete lenta o audio lungo l'utente aspetta — su un guasto urgente non è accettabile.

### Soluzione
Submit del ticket immediato con audio allegato. Trascrizione gira in background dopo l'insert e arriva come commento (o aggiornamento campo `description`) quando pronta.

### Scope
- Refactor `useVoiceTicket` / `useVoiceCapture` per disaccoppiare upload audio e transcribe
- Edge function chiamata in fire-and-forget dopo il submit
- Stato `pending_transcription` visibile sul ticket finché non arriva
- Idempotenza: se la transcribe fallisce o l'utente chiude l'app, riprovare a riapertura ticket

### Out of scope
- Streaming in tempo reale della trascrizione
- Cambio modello Whisper

### Definition of done
- Submit di un ticket vocale ritorna in <1s anche con audio di 30s
- Trascrizione appare entro 10-15s come commento
- Demo mode (no Supabase) continua a funzionare con flusso sync

### Rischi
- Race condition se l'utente ricarica il ticket prima che la trascrizione torni — gestire con polling soft o realtime channel

---

## PR 4 · Supplier specialty inference

**File**: `src/components/SupplierFormModal.jsx`, `SupplierDetailModal.jsx`, eventuale nuova RPC

### Problema
La specialità di un fornitore (`SupplierFormModal.jsx:46`) è gestita a checkbox manuali. L'admin la imposta una volta e poi non la rivede — diventa stantia mentre il fornitore di fatto si specializza in altro.

### Soluzione
Inferire la specialità "implicita" dallo storico ricambi forniti. Mostrarla *accanto* alla manuale, non sostituirla. Se diverge, segnalarla all'admin.

### Scope
- RPC `infer_supplier_specialty(supplier_id)` che aggrega `spare_orders` / `quotes` per categoria
- Visualizzazione in `SupplierDetailModal` come sezione "Inferita dallo storico"
- Trigger: on-demand all'apertura del modal (no cron, no batch)
- Nessuna scrittura automatica sulla colonna manuale

### Out of scope
- Categorizzazione LLM dei testi ricambio (per ora basta keyword/category match)
- Auto-routing delle richieste in base alla specialità inferita (è materiale Fase 3)

### Definition of done
- Aprire un fornitore con 10+ ricambi storici mostra una specialità inferita
- Se inferita ≠ manuale, badge visibile "diverge"
- Performance: query sotto 200ms anche con 1000 ordini

### Nota
Questa PR è la più vicina alla Fase 3 ("Intelligenza per le scelte"). Se in corso d'opera scopriamo che richiede troppa infrastruttura, è candidata a slittare lì.

### Scope evoluto in corso d'opera (PR #199)
Lo scope iniziale assumeva un'anagrafica fornitori popolata e maintained, in modo che il "diverge" tra specialità manuale e inferita fosse il valore principale. Ground truth scoperta durante il lavoro: i fornitori non avevano una sezione dedicata in admin — erano mischiati nei tab Operatori/Tecnici/Admin con un piccolo badge "🚚 Fornitore". L'inferenza, mountata sul `SupplierDetailModal`, era praticamente irraggiungibile.

Il valore reale era a monte: **dare ai fornitori una sezione dedicata** in `AdminUsers.jsx`. PR #199 quindi include:
1. Modulo `lib/supplierInference.js` con classificazione keyword (no LLM, no RPC)
2. Sezione "Dallo storico ricambi" nel `SupplierDetailModal`, sempre visibile quando ci sono ordini matched (anche con empty state esplicito se nessuna keyword matcha)
3. **Quarto gruppo "🚚 Fornitori" in AdminUsers**, supplier esclusi dagli altri tab — l'inferenza diventa raggiungibile in 1 click

L'RPC `infer_supplier_specialty` non è stata implementata: classificazione lato JS è sufficiente per i volumi attuali e non richiede migration. Se in Fase 3 i volumi crescono, il modulo è isolato e sostituibile con RPC senza toccare il modal.

---

## Vincoli comuni a tutte e 4

- Build e lint devono passare prima di ogni push
- Demo mode (fallback localStorage) sempre rispettato per le funzioni DB nuove
- UI in italiano, codice in inglese
- Nessuna nuova dipendenza npm
- Nessun file CSS nuovo — Tailwind inline + CSS vars esistenti
- Una PR alla volta, mergeata prima di iniziare la successiva
