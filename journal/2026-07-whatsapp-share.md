# 2026-07 — Condivisione WhatsApp: riepilogo segnalazione e trascrizione chat

## Richiesta (dal founder)
Integrare WhatsApp in ManuTech "facilitando la copia di segnalazioni e delle
chat per poter coinvolgere anche chi la app la apre saltuariamente".

## Discovery (31/7)
- WhatsApp era già in app in 3 punti: `ShareGuestLink` (link guest chat via
  `navigator.share`/`wa.me`), inviti utente in AdminUsers, contatti fornitori
  in AdminSpareParts. Mancava del tutto la copia del **contenuto**: nessun
  riepilogo testuale della segnalazione, nessun export chat.
- L'infrastruttura per i "saltuari" esisteva già: guest token +
  `/guest/:reportId/:token` + edge function `guest-chat` (accesso senza login).
- ROADMAP: WhatsApp Business come canale (notifiche/inbound) resta **Fase 5**
  — confermato, non anticipato. Questa feature è il completamento del pattern
  guest-link esistente (stessa logica della lezione del 20/5 sull'agenda:
  completamento UX, non feature di fase futura anticipata).
- Ricerca opzioni 2026: click-to-chat `wa.me/?text=` raggiunge anche i gruppi
  WhatsApp di stabilimento (il picker); Cloud API rimandata (verifica business
  Meta, opt-in GDPR sui numeri personali dei dipendenti — sanzioni AEPD/Garante
  2025); Groups API aperta giugno 2026 ma solo OBA + max 8 partecipanti.

## Cosa è stato fatto
- **`src/lib/share.js`** (nuovo): `buildReportSummary` e `buildChatTranscript`
  compongono testi italiani dai label di `constants.js` (TK-id, stato, gravità,
  descrizione troncata a 600 char, foto come link pubblici — esclusi i
  data-URL base64 del demo mode); canali di uscita `openWhatsApp` (wa.me, con
  scheme `whatsapp://` da PWA installata su iOS e ripiego clipboard oltre
  ~1800 char encoded), `nativeShare`, `copyText`.
- **`ShareReportSheet`** (nuovo, stile ShareGuestLink): due sezioni
  (riepilogo / trascrizione chat) × tre canali (WhatsApp / Condividi / Copia),
  più toggle "Includi link ospite" per admin/tecnico — riusa il token guest
  attivo o ne genera uno, così chi riceve su WhatsApp risponde senza account.
- **Wiring**: il bottone "Altre opzioni" (MoreVertical) nell'header di
  `ReportDetail` mobile — prima morto, senza onClick — ora apre il sheet;
  bottone "Condividi" nell'header di `ReportDetailModal` admin; sezione
  "Condividi" (WhatsApp/Copia, link app senza guest) in `OperatorTicketDetail`.
- **`WhatsAppIcon`** estratta da ShareGuestLink in `ui/` (barrel export).
- Zero schema, zero nuove funzioni db (riusa `getGuestTokens`,
  `createGuestToken`, `getComments` — demo fallback già incluso).

## Prossimo step
- Decisione Fase 5 (WhatsApp come canale notifiche via Cloud API, ~€3-10/mese
  ai volumi attuali ma burocrazia Meta + opt-in numeri) alla review
  trimestrale ROADMAP del 2/8.
- Eventuale condivisione foto native (`navigator.share({files})`) se il
  founder la chiede dopo l'uso reale — i link pubblici alle foto coprono già
  il caso base.
