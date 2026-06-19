# 2026-06 — Resilienza offline della cattura audio vocale

## Problema (dal founder)
In mancanza di segnale, quando tecnico o operatore registrano un audio, dopo
alcuni secondi il sistema andava in errore (timeout trascrizione 15s). L'audio
viveva solo in RAM: offline, app chiusa in tasca o refresh → audio perso.
Richiesta: **l'audio non deve perdersi in nessun caso, tranne che per volontà
esplicita dell'utente.**

## Diagnosi
- `useVoiceCapture` chiamava `transcribe` con timeout 15s; offline → attesa a
  vuoto poi banner d'errore.
- L'audio era tenuto solo in `audioBlob` (state React) → volatile.
- **Bug operatore**: `OperatorApp.handleSubmit` ignorava sia `audioBlob` sia
  `finalMedia` → per l'operatore audio (e foto) **scartati anche online**.

## Decisione architetturale (confermata con il founder)
Outbox durevole su **IndexedDB** (Blob binario, mai base64). L'audio è la fonte
di verità; la trascrizione è una comodità best-effort, separata e ritentabile.
Consegna unificata idempotente per tutti i flow (operatore + 4 tecnico).
Trascrizione **inline dal blob locale** (transcribe invariata, già idempotente).

## STEP 0 (verificato prima di scrivere codice)
1. **Path allegato tecnico riusato**: `db.uploadVoiceAudio` → bucket Storage
   `attachments` (pubblico) → URL; riga di collegamento = **commento**
   (`public.comments`) con `media:[{type:'audio',url}]`. Nessuna tabella
   allegati dedicata.
2. **transcribe**: prende il blob inline, idempotente, nessun side-effect
   sull'audio in errore. Lasciata invariata.
3. **Bucket `attachments`**: policy `attach_upload TO authenticated` →
   l'operatore ha gli stessi diritti del tecnico.
- **Nessuna migrazione**: tabella/colonna/bucket/RLS già esistono e bastano.
  Highest migration reale = **058** (non 057).

## org_id — deviazione consapevole dallo spec (importante)
Lo spec chiedeva di hardcodare l'UUID Amarcord. **NON fatto, di proposito.**
In produzione l'org_id è "in pausa" (ADR-007): `db.createReport` e
`NewReport` inseriscono senza org_id → colonna a `'default'`, e
`get_my_org_id()` ritorna `'default'` per tutti → tutto coerente. Hardcodare
l'UUID avrebbe reso `comment.org_id` (UUID) ≠ `get_my_org_id()` (`'default'`)
→ RLS rifiuta → **perdita silenziosa**, esattamente ciò che lo spec teme.
Riusando `addComment`/`createComment` verbatim, le righe audio ereditano lo
stesso scoping di ogni altro commento. Da rivedere quando ADR-007 riparte.

## Cosa è stato fatto
Nuovi:
- `src/lib/outbox.js` — coda IndexedDB generica (primo mattone offline Fase 2).
- `src/lib/transcription.js` — helper Whisper estratti (vocab, correzioni,
  hallucination, `requestTranscription`), condivisi capture + sync.
- `src/lib/voiceOutbox.js` — item vocale + `flushVoiceItem` (consegna idempotente
  a stadi: ticket→update→trascrizione→upload→commento→purge) + `submitVoice`
  (ingresso unico dei flow) + `flushVoiceOutbox` (sync) con lock per-id.
- `src/hooks/useVoiceOutbox.js` — stato reattivo + auto-flush (online /
  foreground / intervallo 60s) + retry / remove / completeWithTitle.
- `src/components/voice/PendingVoiceRecordings.jsx` — sezione "Registrazioni in
  sospeso": pill + pannello (play dal blob, riprova/completa, elimina con
  conferma). Nessuna rotta nuova (overlay a stato locale).

Modificati:
- `useVoiceCapture`: salvataggio durevole immediato allo stop (toast "Audio
  salvato"), gate offline (niente attesa 15s), trascrizione best-effort che non
  blocca mai; espone `outboxId`. `reset()` NON cancella l'item.
- `useVoiceTicket` + `OperatorApp` + `OperatorReview`: passano `user`,
  instradano audio + foto, messaggio "offline salvato".
- I 4 flow tecnico (`VoiceNote/Update/Close/NewTicket`): submit via `submitVoice`,
  notifiche/activity best-effort in primo piano, messaggi offline.
- `MobileLayout` + `OperatorApp`: montano `PendingVoiceRecordings`.

## Criteri di accettazione
- [x] Offline: stop → "Audio salvato" immediato; sopravvive a kill/refresh; in
      "Registrazioni in sospeso"; online → upload + trascrizione automatici.
- [x] Operatore online: audio allegato al ticket **e** trascritto (non scartato).
- [x] Trascrizione fallita → audio mai perso, invio mai bloccato.
- [x] Nessun hang di 15s offline.
- [x] L'audio sparisce solo per eliminazione manuale + conferma (anche "Annulla"
      in review lo lascia in sospeso).
- [x] Righe nuove con org_id coerente (via `get_my_org_id`), nessun base64 in
      riga reale, nessuna classe Tailwind dinamica (stili inline), routing
      invariato.

## Confini v1 (consapevoli)
- Le **notifiche/activity** dei cambi stato girano solo in primo piano (online).
  Se un update/chiusura viene completato dal sync in background, lo stato e
  l'audio vengono applicati ma le notifiche no (non critiche, l'utente può
  rifarle). L'audio — l'irripetibile — è sempre salvo.
- Possibile (rarissimo) doppio commento audio se l'app muore nel millisecondo
  tra `addComment` e la purga dell'item: degrado innocuo (mai perdita), non
  duplicazione di ticket (lock per-id sulla create).
- Niente Background Sync via service worker (supporto iOS scarso): l'auto-flush
  si appoggia a eventi online/foreground/intervallo.

## Validazione
Niente test runner nel progetto (per scelta storica). Validato con
`npm run lint` (0 errori) e `npm run build` (ok). Smoke test end-to-end dal vivo
da fare dal founder (registrazione offline → kill app → ritorno linea).

## Branch
`claude/voice-offline-outbox` — niente auto-merge su master, niente PR finché
non lo decide il founder.
