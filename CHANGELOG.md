# Changelog — ManuTech

Tutti i cambiamenti notabili a questo progetto sono documentati qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

---

## [Unreleased] — v5.34 — La pagina Manutenzione della console nel disegno desktop

Nessuna migration. Disegno: prototipo Claude Design "ManuTech Desktop", vista Manutenzione.

### Changed
- **Pagina Manutenzione (desktop) ridisegnata** come nel prototipo, sugli stessi dati:
  - i quattro contatori (**Tutti i piani, Scadute, In scadenza, In regola**) sono anche i filtri; sparisce la riga di pulsanti colorati;
  - i piani si leggono come **lista divisa per scadenza** (Scadute / In scadenza · 7 giorni / In regola), con una barra di quanto del ciclo è passato, il reparto sotto la macchina, **"+ Assegna"** dove manca il responsabile e la data dell'ultima esecuzione (un clic la apre, come prima);
  - **Nuovo piano, Registra intervento e Importa CSV** stanno nella barra in alto della console; Esporta CSV resta nella vista Interventi;
  - la vista **Interventi** ha le stesse colonne di prima più data e ora, ditta esterna e pezzo; filtro **Tutti / Programmate / Straordinarie**.
- "Scade oggi" al posto di "Scaduta da 0g" ovunque si usa il semaforo condiviso (`lib/maintenanceStatus.js`, anche scheda macchina).

### Added
- **Calendario**: accanto a Lista, le prossime 4 settimane, una riga per macchina e un quadratino per piano nel giorno in cui scade; la colonna Scadute raccoglie quelli già passati.
- **Pannello del piano** a destra (un clic sulla riga, "✓ Registra" o "Dettagli"):
  - se il piano è scaduto o scade entro la settimana si apre sul modulo **Registra intervento**: cosa è stato fatto, durata (con la durata media delle volte precedenti come suggerimento), ricambi, foto e PDF; **Conferma esecuzione** e la scadenza si aggiorna senza lasciare la pagina; per i piani in regola c'è "Registra in anticipo";
  - area, responsabile, pezzo, durata media, stato "in corso" se un tecnico l'ha preso dal telefono, istruzioni per intero, ultimi 3 interventi sulla macchina (un clic li apre);
  - **Modifica piano**, **Duplica** (stesso piano come nuovo, di solito per un'altra macchina) ed **Elimina**.

### Note
- Le pagine della console possono mettere azioni nella barra in alto con `<V6TopBarActions>` (`contexts/V6TopBarContext.jsx`).
- `AdminMaintenance` usa ora `getTrafficLight` da `lib/maintenanceStatus.js` (che ha anche `status`: overdue / warning / ok); la copia locale è tolta. Lista, calendario, pannello e tabella interventi stanno in `pages/admin/maintenance/`.
- Solo variabili CSS: dentro la console `.mt-scope` le porta sulla palette Amarcord del disegno. Font della console invariato (Barlow, non Barlow Condensed come nel prototipo).
- I moduli Nuovo piano, Registra intervento (completo) e Importa CSV sono quelli di prima.

---

## [Unreleased] — v5.33 — Nel ticket da telefono header e barra per scrivere restano sempre a vista

Nessuna migration.

### Fixed
- **Ticket da telefono**: la pagina era alta quanto il contenuto e scorreva tutta, così la barra per scrivere stava in fondo alla chat e spariva appena si risaliva a leggere. Ora la pagina è alta quanto lo schermo: **header** (codice, titolo) in alto e **barra per scrivere** in basso restano fermi, in mezzo scorrono schede, tab e contenuto. Le tab Dettagli / Chat / Cronologia restano in alto quando le schede sono scorse via. Vale anche per Dettagli e Cronologia (azioni vocali e "Aggiorna o rispondi…").
- **Chat che non arrivava in fondo**: aprendo la Chat lo scroll partiva prima che i messaggi fossero a schermo e a volte restava in cima; le foto caricate dopo spingevano giù gli ultimi messaggi. Ora si arriva in fondo e ci si resta mentre le foto si caricano; chi risale a leggere non viene riportato giù, neanche da una modifica, da una reazione o dal controllo ogni 10 secondi della chat ospite.
- **Chat ospite** (link condiviso col tecnico esterno): stessa correzione, header e barra per scrivere sempre a vista.
- Spaziature della chat (barra per scrivere, "Ringrazia", messaggi): le classi Tailwind di padding/margin non avevano effetto per il reset in `index.css`, ora sono inline. Si vede anche nella chat del dettaglio admin su desktop.

---

## [Unreleased] — v5.32 — Una manutenzione registrata si legge e si aggiorna come una segnalazione conclusa

Runbook: `docs/MIGRATION-068.md`. La migration **068** (una colonna) va eseguita a mano, prima del merge o subito dopo: senza, le correzioni funzionano ma non lasciano traccia in cronologia, e le note scritte dopo non si salvano. Note: `journal/2026-10-archivio-interventi.md` (quinta parte).

### Added
- **Scheda "Intervento registrato"**, il corrispettivo di "Come è stato risolto" delle segnalazioni concluse: tipo (programmata, straordinaria, ditta esterna), macchina e pezzo, piano e frequenza, segnalazione d'origine, cosa è stato fatto, chi, durata, ricambi, ditta e riferimento, foto e PDF, note aggiunte dopo, **cronologia** (registrazione e ogni correzione, con prima → dopo).
  - Telefono: un tocco su una riga dello **Storico** della scheda macchina, oppure su **"Ultima volta"** sotto ogni piano del tab **Manut.**
  - Desktop: un clic su una riga della vista **Interventi** della pagina Manutenzione, sulla data **"Ultimo"** di un piano, o su una riga del **Registro Interventi** della scheda macchina.
- **Aggiornare un intervento già registrato** (tecnici e admin):
  - **Correggi**: titolo, cosa è stato fatto, durata, ricambi, **data e ora** (sposta anche la prossima scadenza del piano), ditta e riferimento;
  - **Aggiungi nota, foto o PDF**: la nota da sola, gli allegati da soli o insieme;
  - la **X** su un allegato messo per sbaglio (chi l'ha aggiunto, chi ha registrato l'intervento, o un admin).
- **Pagina Manutenzione → Interventi** come archivio: la ricerca trova anche testo, ricambi, ditta, note aggiunte dopo e nomi degli allegati; filtro **Programmate / Straordinarie**; **Esporta** in CSV (con note e link degli allegati); "Mostra altri" oltre i primi 50.
- L'assistente legge anche le **note aggiunte dopo** a un intervento (come già per le chiusure dei ticket).

### Changed
- La matita del Registro Interventi (scheda macchina desktop) salva come "Correggi": la modifica resta in cronologia.
- Nello Storico mobile, durata in ore e minuti e "N note aggiunte dopo".

### Note
- Note e cronologia in `maintenance_logs.extra_data` (`notes`, `history`), scrittura con rilettura della riga come per `reports.extra_data`; gli allegati aggiunti dopo restano in `media` (galleria e biblioteca li trovano come gli altri) con autore e data.
- Policy invariate (020): aggiornano tecnici e admin, elimina solo l'admin. L'operatore legge la scheda senza i tasti.
- `ingest-knowledge` legge `maintenance_logs` con `select('*')`: indicizza le note se la 068 c'è e non fallisce se manca. Si ridistribuisce da sola al merge (workflow sulle functions).

---

## [Unreleased] — v5.31 — Foto e PDF anche registrando una manutenzione

Nessuna migration. Note: `journal/2026-10-archivio-interventi.md` (quarta parte).

### Added
- **Foto e PDF quando si conclude una manutenzione programmata o si registra un intervento**, dove prima non si poteva:
  - telefono, scheda macchina → **Manut. → "Fatto — Registra"**: tasti **Scatta** (apre subito la fotocamera) e **Foto o PDF**;
  - telefono, scheda macchina → **Pezzi → "Registra intervento"** sul componente: gli stessi due tasti;
  - desktop, pagina **Manutenzione → Registra** (dalla riga del piano o dal tasto in alto): riquadro **"Allega foto o PDF"**, anche trascinando il PDF arrivato per email.
- **Gli allegati si vedono nello storico**: tab **Storico** della scheda macchina sul telefono, vista **Interventi** della pagina Manutenzione e tab **Interventi** della scheda macchina sul desktop. Le foto come miniature, i PDF con il nome del file; un tocco li apre. Valgono anche per gli interventi già registrati con allegati (Home del tecnico, modulo della scheda macchina desktop): finora le foto si trovavano solo in galleria e i PDF solo aprendo l'intervento in modifica.
- Le foto allegate compaiono subito nel tab **Foto** della macchina; con un PDF allegato parte l'indicizzazione della macchina, così l'assistente può citare il foglio della ditta.

### Changed
- Il foglio "Conferma Manutenzione" del telefono ora ha i margini e il modulo "Registra Intervento" della pagina Manutenzione lo spazio tra i campi: il reset globale li annullava (vedi Debito tecnico), ora sono inline / `gap`.

### Note
- Gli allegati stanno in `maintenance_logs.media`, la colonna che esiste dalla 028 e che la RPC `create_maintenance_log` già accettava: nessuna migration. Stesso bucket pubblico `attachments`, limite 20 MB a file, foto compresse a 1920 px.
- Nessun tipo "fattura" qui, a differenza della chiusura dei ticket: lo storico interventi lo vedono anche gli operatori.

---

## [Unreleased] — v5.30 — Foglio d'intervento e fattura dentro la chiusura

Nessuna migration. Note: `journal/2026-10-archivio-interventi.md` (terza parte).

### Added
- **Documenti dell'intervento sulla chiusura**: foglio d'intervento, fattura o altro documento (DDT, certificato), in **PDF o foto**. Si allegano chiudendo (foglio mobile e modulo "Chiusura Intervento" del desktop) e **dopo**, da "Aggiungi nota o documento", insieme alla nota o da soli. Sul desktop il PDF arrivato per email si **trascina** sul riquadro.
- Nel riquadro "Come è stato risolto" (telefono e desktop) la sezione **Documenti**: tipo, nome del file, chi e quando; un tocco lo apre. Chi l'ha allegato, o un admin, lo **toglie** (in cronologia resta).
- **Il foglio d'intervento finisce anche nella cartella "Ditta Esterna" della macchina**, sotto il pezzo se il ticket ne ha uno: stesso file, un solo URL, come le foto del pezzo. Se è un PDF entra nella biblioteca dell'assistente al reindex. **La fattura no**: resta sul ticket.
- **Archivio**: chip con i documenti nelle righe (desktop) e nelle card (telefono); la ricerca trova "fattura", "foglio" e i nomi dei file; nell'**export CSV** la colonna **Documenti** con tipo, nome e link, per la contabilità del mese.
- Cronologia: "Documento allegato" / "Documento tolto".

### Note
- I dati stanno in `extra_data.closure_docs` (`kind`: `foglio` | `fattura` | `altro`), accanto a `closure_notes`; scrittura con rilettura di `extra_data` (`db.addToClosure`, che sostituisce `addClosureNote`).
- **Le fatture le vedono solo tecnici e admin**: è un filtro d'interfaccia (`canSeeInvoices` in `lib/closure.js`), non un controllo d'accesso. I file stanno nel bucket pubblico `attachments`, come contratti e rapporti già caricati sulle macchine: chi ha il link li apre. Se servisse riservatezza vera: bucket privato e link firmati (migration).
- Limite 20 MB a file; le foto si comprimono come le altre (1920 px), i PDF partono come sono.

---

## [Unreleased] — v5.29 — I premi tornano agli operatori e si riscattano davvero

Diagnosi: `journal/2026-10-premi.md`. Runbook: `docs/MIGRATION-067.md`. La migration **067** va eseguita a mano, prima del merge o subito dopo: senza, l'admin non può approvare né rifiutare i riscatti.

### Fixed
- **Gli operatori non potevano comprare niente: non avevano più il wallet.** L'app operatore (spec: "Gamification, badge, ManuCoin: non in questa fase") non aveva né saldo né catalogo, e i ManuCoin di badge e livelli si accreditavano solo dalla vecchia home mobile, che gli operatori non aprono più: da allora non guadagnavano nulla. Ora **Profilo → Wallet e premi** apre il wallet (con i colori dell'app operatore) e la Home accredita i traguardi del mese.
- **I badge pagavano una volta nella vita.** La chiave dell'accredito era `badge_<id>` senza mese, mentre badge e livelli si calcolano sugli ultimi 30 giorni: dopo il primo mese il saldo smetteva di crescere. Ora ogni badge (5) e ogni livello da Argento in su (20) paga **una volta per mese di calendario** (`badge_<id>:YYYY-MM`). Chi passa da Bronzo a Oro prende anche Argento.
- **Il rifiuto di un riscatto non restituiva i ManuCoin.** Ora sì, e il pezzo torna allo stock (`review_redemption`, 067).
- **Eliminare un premio cancellava i suoi riscatti**, anche quelli pagati e in attesa (FK in cascata). Ora lo storico resta (`ON DELETE SET NULL`) e un premio si può **nascondere** senza eliminarlo.
- Gli errori della pagina admin (creare un premio, salvare la configurazione, gestire un riscatto) finivano solo in console: ora compaiono come avviso.
- Gli stessi badge si pagavano di nuovo su ogni telefono nuovo (la deduplica stava nel localStorage). Ora la fa il server.
- "Token automatici per evento" in Impostazioni elencava streak 7/30 giorni e primo report, mai accreditati: ora mostra le regole vere.

### Security
- **`credit_tokens` accettava 'earn' da chiunque, per chiunque e di qualunque importo**: dalla console del browser ci si poteva accreditare quello che si voleva. Ora chi non è admin si accredita solo i traguardi del mese, con importi fissi, la chiave del mese corrente e gli id dei badge esistenti; dentro un trigger (il "Mi è servita" della 064) resta consentito. L'admin accredita solo persone della propria org.
- **Chiunque poteva creare un riscatto senza pagarlo** (policy `rr_insert`) e l'admin poteva cambiarne lo stato senza rimborso (`rr_update`): tolte, si passa dalle funzioni.
- `redeem_reward` accettava premi di altre org e due tocchi veloci potevano spendere due volte lo stesso saldo: ora controlla l'org e blocca premio e saldo fino alla fine. `get_token_balance` mostrava il saldo di chiunque: ora il proprio, o quello dei colleghi per l'admin.

### Added
- **Conferma prima del riscatto** (saldo dopo, cosa succede dopo) e, nel wallet, scorte ("Ultimi 3", "Esaurito"), barra di avanzamento verso i premi non ancora raggiungibili, "+N questo mese", nota dell'admin e rimborso sui riscatti, "Come si guadagnano" per ruolo.
- **Console admin → Premi**: tab **Saldi** con saldo e guadagno del mese di operatori e tecnici (fornitori esclusi), quanti possono permettersi il premio più economico e **bonus manuale** con causale; **Approva / Rifiuta** con nota per chi riceve (dove ritirarlo, o il motivo del rifiuto); premi visibili/nascosti; costo in euro e guadagno medio del team accanto al prezzo; spesa del mese accanto al budget; **5 premi di esempio** (nascosti) quando il catalogo è vuoto.
- **Avvisi**: agli admin a ogni riscatto (`reward_redeemed`), a chi ha riscattato quando è approvato o rifiutato (`reward_status`), a chi riceve un bonus (`token_bonus`). Solo push e campanella, niente email (la quota Resend resta com'è).
- Migration **067**: funzioni `review_redemption` e `get_org_token_balances`, `credit_tokens` / `redeem_reward` / `get_token_balance` riscritte.

### Note
- **L'economia**: un operatore occasionale (3 segnalazioni al mese) prende circa 5 ManuCoin al mese, uno costante (10) circa 40, uno molto attivo 80 o più; il tetto è 155. I tecnici guadagnano solo con "Mi è servita" (5 per collega) e con i bonus dell'admin. Il "valore in euro" del token è solo indicativo: quello che decide è il prezzo dei premi.
- Un badge nuovo in `useOperatorScore` va aggiunto anche all'elenco in `credit_tokens` (067), altrimenti non paga.
- Gli avvisi dei premi non hanno ancora un interruttore nelle preferenze notifiche: partono per tutti (sono rari).
- La demo (localStorage) fa lo stesso giro: riscatto con addebito, rifiuto con rimborso, scorte, bonus.

---

## [Unreleased] — v5.28 — Il vocale riconosce macchine e termini dello stabilimento

Nessuna migration. Le funzioni si pubblicano da sole al merge; per Scribe serve la chiave `ELEVENLABS_API_KEY` nei secrets di Supabase (senza, tutto resta su Groq come prima).

### Changed
- **Trascrizione con ElevenLabs Scribe v2** (`transcribe`), al posto di Groq Whisper large-v3-turbo. Il vocale sbagliava soprattutto nomi di macchine e termini tecnici (lo dicevano le correzioni scritte a mano, "cosme" → "Kosme"): Whisper accetta circa 244 token di suggerimenti, cioè 30 macchine e un elenco fisso. Scribe accetta fino a **1000 termini**: ora riceve tutte le macchine con marca e modello, i nomi, le marche e i modelli dei componenti dell'anagrafica, gli hint del contesto e il vocabolario tecnico. Niente etichette di rumore nel testo (`tag_audio_events: false`).
- **Ripiego automatico su Groq Whisper large-v3** (non più turbo: sbaglia meno) se la chiave ElevenLabs manca, se Scribe dà errore o se non risponde entro 10 secondi. La risposta dice quale motore ha trascritto (`engine`).
- **La lettura del testo passa da Haiku 4.5 a Sonnet 5.5** (`extract-ticket-fields`, superficie `voice_extract` in `_shared/models.ts`, `effort: 'low'`): capisce meglio quale macchina e quale componente intende il tecnico. Un rifiuto dei filtri di sicurezza porta alla compilazione manuale, come un JSON non valido.
- Tempo massimo della trascrizione e dell'estrazione lato app: da 15 a 25 secondi, per lasciare spazio al ripiego.

### Fixed
- **Le note registrate offline si trascrivevano senza aiuti**: al ritorno della rete la coda partiva con il vocabolario vuoto, senza nemmeno i nomi delle macchine. Ora riceve gli stessi termini della trascrizione dal vivo.

### Note
- **Attivazione**: creare una chiave su elevenlabs.io e metterla in Supabase → Edge Functions → Secrets come `ELEVENLABS_API_KEY`. La funzione la legge alla chiamata successiva, senza nuovo deploy.
- **Costi**: Scribe v2 circa $0,22 per ora di audio, più $0,05 per i termini; Whisper large-v3 su Groq $0,11. Con note vocali di 30 secondi sono pochi euro al mese. Sonnet 5.5 costa più di Haiku per token, su testi brevi.
- **Privacy**: l'audio passa a ElevenLabs. Verificare l'accordo sul trattamento dei dati prima di attivare la chiave.
- **Verifica**: nei log di `transcribe` deve comparire `scribe ok, keyterms=N`; se compare `scribe failed`, il motivo è scritto accanto e il vocale ha usato Whisper.

---

## [Unreleased] — v5.27 — L'assistente AI passa a Sonnet 5.5 e Opus 5.5

Nessuna migration: le funzioni si pubblicano da sole al merge su `master`.

### Changed
- **Potenza "Equilibrato" → Claude Sonnet 5.5** (prima Sonnet 4.6): assistente AI della console admin, assistente dentro il ticket e riassunti (`_shared/models.ts`). Costa meno per token ($2/$10 per milione contro $3/$15), ma il suo tokenizer conta circa il 30% di token in più a parità di testo: il costo reale va riguardato dopo qualche giorno d'uso.
- **Potenza "Approfondito" → Claude Opus 5.5** (prima Opus 4.8), stesse superfici. Costa meno per token ($4/$20 contro $5/$25). Ragionava già (`effort: 'medium'`, che ora resta esplicito: su Opus 5.5 il default dell'API scende a `medium`, sugli Opus precedenti era `high`). A parità di livello ragiona più a fondo, quindi le risposte possono arrivare un po' più tardi. I prompt hanno già un limite di parole, utile perché gli Opus 5.x tendono a scrivere risposte più lunghe.
- "Veloce" (Haiku 4.5) resta com'era.
- Sonnet 5.5 **ragiona sempre** (Sonnet 4.6, senza parametri, non ragionava). Parte da `effort: 'low'`, il livello consigliato per chat e riassunti: ragiona poco e salta il ragionamento sulle domande semplici. Se le risposte risultano superficiali si alza a `medium` in `SONNET_EFFORT_DEFAULT`, non con istruzioni nel prompt.
- **Margine per il ragionamento**: il ragionamento conta dentro `max_tokens`, quindi il tetto sale di 6000 token per Sonnet 5.5 (assistente 2048 → 8048, riassunti 1400 → 7400) e di 10000 per Opus 5.5 (12048 e 11400), che ragiona di più e in "approfondito" riceve tutto lo storico. È un limite massimo, non un consumo: serve a non troncare la risposta. Con Opus 4.8 il rischio di troncamento esisteva già.
- **Fallback sui rifiuti**: con `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`), se i filtri di sicurezza di Sonnet 5.5 o Opus 5.5 rifiutano una richiesta, Anthropic la riesegue da sola su un altro modello (Sonnet 5; Opus 5 o 4.8). Se il rifiuto resta, l'assistente risponde "Non posso rispondere a questa domanda" invece di mostrare un testo a metà.

### Note
- Dopo il deploy: una domanda all'assistente di un ticket e un "Riassunto AI", una volta con "Equilibrato" e una con "Approfondito", per controllare che rispondano. Se compare "Errore assistente AI" con un 400 di Anthropic, il problema è nella richiesta: si torna indietro con un revert.
- Sonnet 5.5 e Opus 5.5 hanno limiti di frequenza propri, separati da quelli dei modelli 4.x: verificarli nella console Anthropic se l'uso cresce.

---

## [Unreleased] — v5.26 — Le email che non arrivavano

Diagnosi: `journal/2026-10-notifiche-push.md` (terza parte). Runbook: `docs/MIGRATION-066.md`. La funzione si pubblica da sola al merge su `master`; la migration **066** va eseguita a mano (prima o dopo, non importa).

### Changed
- **I tecnici non ricevono più per email ogni nuovo ticket**, solo i **critici** (più assegnazioni, interventi e scadenze come prima). Il ticket non critico va per email agli admin: da 15 email a 5-6. Il push per i tecnici era già così. Default cambiato in `send-email-notification` e in `notifPreferences.js`; la migration **066** spegne lo stesso valore nelle preferenze già salvate, dove era finito copiato dai default (le Impostazioni salvano tutto al primo interruttore toccato). Chi lo vuole lo riaccende da Impostazioni → Notifiche email.

### Fixed
- **I fornitori ricevevano le email interne.** Un fornitore è un utente con ruolo `tecnico` (così compare nei selettori di assegnazione) più un `supplier_profiles`; i più vecchi hanno un'email finta `@esterno.local`. Col ruolo tecnico ricevevano ogni email dei tecnici, a partire da **ogni nuovo ticket** — 17 fornitori su 27 "tecnici", più della metà dei destinatari (un ticket: da 32 email a 15): notizie interne a ditte esterne, indirizzi finti che rimbalzano, quota Resend consumata. Ora `send-email-notification` scrive **solo alle persone dell'azienda**: esclude chi ha un `supplier_profiles` o un'email `@esterno.local` (stessa regola di `isSupplier` in AdminUsers). Se non riesce a verificarlo non manda nulla. Il contatto con i fornitori resta quello dai link email delle schede admin.
- **Email perse quando partono più notifiche insieme.** Ogni notifica è una chiamata a Resend, e le notifiche nascono a gruppi (cambio stato → autore e assegnatario; intervento → tutti i coinvolti; scadenze delle 06:45 → tutti i piani). Oltre il limite al secondo Resend risponde 429 e quelle email andavano perse. Ora `send-email-notification` **riprova** (fino a 3 tentativi, con l'attesa che indica Resend). Sulle quote giornaliera/mensile non riprova: registra il motivo.
- **Un indirizzo sbagliato bloccava tutti.** Il batch di Resend in modalità predefinita (strict) scarta l'intero invio se un solo destinatario non è valido. Ora gli indirizzi malformati vengono saltati prima e il batch va in modalità **permissive**: partono le email buone, quelle rifiutate finiscono nel log.
- **Email a inviti mai accettati e a utenti disattivati**: i broadcast arrivavano anche a loro, consumando quota. Ora solo account `active`.
- **Un fallimento totale risultava "ok".** La funzione rispondeva 200 anche con zero email partite, quindi `net._http_response` sembrava in ordine. Ora risponde **502** con il motivo (`daily_quota_exceeded`, `rate_limit_exceeded`, `validation_error`…) e ogni risposta porta `"channel":"email"` per distinguerla da quella del push, più quanti fornitori e indirizzi malformati sono stati esclusi.

---

## [Unreleased] — v5.25 — Le scadenze le controlla il server

Runbook: `docs/MIGRATION-065.md`. Racconto: `journal/2026-10-notifiche-push.md` (seconda parte).

### Added
- **Scadenze di manutenzione dal server** (migration **065**): un job `pg_cron` ogni mattina alle 06:45 (`check_maintenance_deadlines`). "In scadenza" una volta per ciclo a 5 giorni o meno; "scaduta" il giorno stesso e poi **un richiamo ogni 3 giorni** finché non si registra l'intervento, ma non mentre qualcuno l'ha presa in carico. Il registro `maintenance_alerts` è unico per l'org: un avviso parte una volta sola. Alla prima applicazione le scadenze già in corso vengono registrate come avvisate, così non arriva una raffica il mattino dopo.
- **Card "Notifiche" nel Profilo mobile** (`ui/PushStatusCard`), sempre visibile: stato del telefono, **Attiva notifiche**, istruzioni per chi le ha bloccate (Android e Chrome) e per iPhone (aggiungi alla Home), **Prova** e **Ripara**. Prima, chi aveva chiuso o rifiutato il banner una volta non aveva più modo di riattivarle: a inizio ottobre solo 5 tecnici su 10 ricevevano i push (i 27 "tecnici" contati allora comprendevano 17 fornitori).

### Changed
- `useAutoNotifications` (controllo scadenze dal telefono) gira **solo in modalità demo**. In produzione taceva quando nessuno apriva l'app e generava doppioni quando la aprivano in tanti.

### Note
- **Applicare la 065 prima del deploy del frontend**: senza, non partono avvisi di scadenza.

---

## [Unreleased] — v5.24 — I push arrivano davvero

Diagnosi e decisioni: `journal/2026-10-notifiche-push.md`.

### Fixed
- **Nessun push arrivava ai telefoni.** Dai log di `send-push-notification`: Google 403, Mozilla 401, Apple 400 su ogni invio, `sent: 0` sempre. L'app si iscriveva con la chiave VAPID pubblica scritta nella build (`VITE_VAPID_PUBLIC_KEY`), il server firmava con quella nei secrets di Supabase: non coincidevano. Ora l'app **chiede la chiave al server** (GET sulla funzione) e, se l'iscrizione del telefono è stata fatta con un'altra chiave, **la rifà da sola** all'apertura (`lib/push.js`). Nessuna chiave da copiare a mano.
- **Le iscrizioni rifiutate (401/403) vengono cancellate** dal server come quelle scadute, e l'esito di ogni invio fallito (servizio, codice, motivo) finisce nella risposta, quindi in `net._http_response`: si diagnostica da SQL.
- **Gli operatori non si iscrivevano mai ai push**: `OperatorApp` (dal 28/5) non registrava il telefono. Ora sì, con una card in home finché non si decide e lo stato in Profilo — con le istruzioni per iPhone (aggiungi alla Home) e per le notifiche bloccate, più "Invia una notifica di prova".
- **La console admin non si iscriveva ai push**: ora sì, con un banner "Attiva le notifiche del browser"; il tocco sulla notifica apre la segnalazione.
- **Le notifiche si sovrascrivevano**: il service worker usava un solo posto per tipo, quindi tre messaggi su tre ticket lasciavano visibile solo l'ultimo. Ora una notifica per segnalazione.
- **Il campo "Aggiorna o rispondi…" del dettaglio mobile non avvisava nessuno**: ora manda la stessa notifica della chat.
- **Telefono condiviso**: al logout il telefono smette di ricevere i push di chi è uscito. Con un login diverso l'iscrizione si rifà per il nuovo utente.

### Changed
- `send-push-notification` è pubblicata con `verify_jwt = false` (`supabase/config.toml`): l'app la chiama per leggere la chiave pubblica. L'invio è protetto dentro la funzione, che accetta solo la chiave del trigger (`push_config.service_role_key`) o la service role.
- Diagnostica push nelle impostazioni: mostra se la chiave del telefono è allineata al server e ha il tasto **Ripara iscrizione**.

### Note
- **Dopo il merge**: eliminare il vecchio Database Webhook su `notifications` (Supabase → Database → Webhooks), che chiama senza intestazione e produce i 401. Poi aprire l'app su ogni telefono una volta: l'iscrizione si ripara da sola.
- Restano da fare: scadenze calcolate dal server (oggi le genera il telefono di chi apre l'app) e destinatari più ampi per i messaggi (chi ha partecipato alla chat, partecipanti dell'intervento).

---

## [Unreleased] — v5.23 — Le chiusure che servono, dette a voce e con la foto

Tre aiuti per chi scrive e chi legge le chiusure. Racconto: `journal/2026-10-archivio-interventi.md` (seconda parte). Runbook: `docs/MIGRATION-064.md`.

### Added
- **"Mi è servita"** sotto ogni chiusura (dettaglio mobile e modal admin): un collega che ha risolto grazie a quel racconto lo dice con un tocco. Chi ha chiuso vede a quanti colleghi è servita, con i nomi, e riceve **5 ManuCoin** la prima volta che ciascun collega vota. L'accredito lo fa un trigger, non il client: togliere e rimettere il voto non riaccredita, e la propria chiusura non si vota. In archivio il conteggio compare sulle card, l'admin ha il KPI e l'ordinamento **"più utili ai colleghi"**, e il CSV ha la colonna.
- **Dettatura** (`voice/DictateButton`): un tocco per parlare, uno per fermare, e il testo trascritto si accoda al campo. C'è su **causa radice** e **azione correttiva** nel foglio di chiusura e su **Aggiungi un'informazione**. Il vocabolario per la trascrizione include i nomi dei pezzi della macchina. Senza rete il tasto lo dice prima di registrare.
- **"Integra" nella barra vocale**: su un ticket già risolto il tasto **Completa** diventa **Integra** e apre la nota successiva con il microfono già acceso.
- **Foto del pezzo in chiusura** (`ClosurePhotoPicker`): facoltativa, compressa e con miniatura. Finisce nel ticket (flag `closure` in `media`), nella card "Come è stato risolto" (apribile a tutto schermo) e nella **galleria della macchina sotto il pezzo**. Si può aggiungere anche dopo, con Correggi.
- Migration **064**: tipo di reazione `servito` + trigger `reward_helpful_closure`.

### Fixed
- **La chiusura vocale su un ticket già risolto riscriveva causa, azione e `closed_at`** invece di integrarli. Ora quel tasto porta a "Integra".

### Note
- **Applicare la 064 prima del deploy del frontend** (vedi runbook): senza, il tasto *Mi è servita* risponde "Non riuscito".
- Nessuna notifica per il voto: arriva come movimento nel wallet. Aggiungere una notifica vuol dire toccare le preferenze anche nelle edge function push/email.

---

## [Unreleased] — v5.22 — L'archivio racconta come è stato risolto

Racconto e decisioni: `journal/2026-10-archivio-interventi.md`.

### Added
- **Archivio interventi** (admin, nuova voce di menu dopo Segnalazioni): ogni segnalazione conclusa con causa radice, azione correttiva, ore, ricambi, tecnico e note aggiunte dopo, raggruppata per mese di chiusura. Filtri per macchina, pezzo, tecnico, periodo ed esito (**Risolta / Da completare / Senza intervento**), ricerca dentro le chiusure, KPI in testa ed **export CSV** pronto per Excel (`;` + BOM).
- **"Come è stato risolto"** in cima ai Dettagli del ticket concluso (mobile) e nel modal admin: per un ticket in archivio la domanda è cosa era e cosa è stato fatto, quindi sta sopra la descrizione.
- **Correggi la chiusura** dopo averla fatta: stesso foglio di chiusura, precompilato, senza cambiare stato né `closed_at`. In cronologia resta il prima → dopo di ogni campo (`closure_edit`).
- **Aggiungi un'informazione** a un ticket concluso: note successive in `extra_data.closure_notes` (attività `closure_note`) — "si è ripresentato dopo tre settimane", il codice esatto del ricambio. Nessuna notifica; la macchina viene reindicizzata.
- **Chiusure da completare**: un ticket risolto senza causa o senza azione lo dice, con il tasto Completa per tecnico e admin, e ha il suo filtro in archivio.
- Tab **Archivio** mobile con card orientate alla risoluzione (`ResolvedReportCard`), gruppi per mese e filtri per esito; la stessa card nelle **Concluse** della scheda macchina.
- `lib/closure.js` (lettura unica della chiusura), hook `useClosureEdit`, `db.addClosureNote` (con fallback demo), `formatMonthYear` in `constants.js`.

### Fixed
- **Il riquadro dei dati di chiusura non compariva mai.** Tutti i flussi scrivono nelle colonne `closure_*`, ma dettaglio mobile, modal admin e cronologia leggevano `extra_data.closure_*`. Ora si legge dalle colonne, con fallback su `extra_data` per i record demo vecchi.
- **Un commento riportava tra i "Recenti" un ticket archiviato da settimane**: l'archivio si basava su `updated_at`, che il trigger 050 tocca a ogni messaggio. Ora conta la chiusura (`closed_at`; per `chiuso` l'ultimo aggiornamento).
- **"Risolvi e registra" dalla scheda macchina** chiudeva il ticket senza `closed_at` né dati di chiusura: in archivio era muto e restava fuori dal MTTR. Ora scrive `closed_at`, ore, ricambi e azione (la causa resta da completare) e reindicizza la macchina.

### Changed
- Lista Segnalazioni admin: sui ticket conclusi il pannello destro mostra causa e azione al posto dell'ultimo messaggio di chat; la sezione Archivio ha il link all'archivio interventi.
- Scheda macchina admin: nel tab Segnalazioni le concluse mostrano causa → azione, e un link apre l'archivio filtrato sulla macchina. La scheda del pezzo (mobile) mostra causa → azione sulle concluse.
- La ricerca di liste e archivio guarda anche pezzo, causa, azione, ricambi e note successive.
- `ingest-knowledge` include le note successive nel testo del ticket indicizzato.

### Note
- **Da ri-deployare**: l'edge function `ingest-knowledge`. Finché non è aggiornata, le note successive restano fuori dall'assistente AI (tutto il resto funziona).
- **Nessuna migration.**

---

## [Unreleased] — v5.21 — La data si sceglie sul calendario

### Added
- **Calendario data+ora con il numero di settimana** (`ui/DateTimePicker`, nuovo): il chip **«Altra data…»** nella pianificazione intervento non apre più il `datetime-local` del sistema, ma un calendario a tutta larghezza — mese navigabile, scorciatoia «Oggi», celle da 44px — con la **colonna «S» delle settimane ISO** accanto a ogni riga, perché in officina si pianifica per settimane ("lo facciamo in S36"). L'ora si sceglie con i chip dei turni tipici (08:00 → 18:00) o con l'input orario per il minuto esatto.
- Il campo Inizio/Fine mostra ora un riepilogo leggibile — `gio 3 set 2026 · S36 · 16:00` — e si ritocca ritoccando il calendario.
- `isoWeekNumber()` in `lib/interventions.js`: settimana ISO 8601 calcolata su date local. Verificata su 12 anni di date (2019-2030) contro il calendario ISO di riferimento.

### Fixed
- **Nel modale «Coinvolgi utenti» non si riusciva a selezionare nessuno.** `InterventionForm` sincronizzava i partecipanti con il prop `initialParticipantUserIds` usando l'array come dipendenza dell'effect: in creazione il prop non viene passato, quindi il default `= []` cambiava reference a ogni render e l'effect riazzerava la selezione subito dopo ogni tap. Ora la dipendenza è una chiave stabile derivata dagli id — il sync scatta solo quando i partecipanti iniziali cambiano davvero (edit/reschedule).

### Changed
- L'etichetta del titolo intervento passa da «Cosa serve» a «Titolo Intervento».

---

## [Unreleased] — v5.20 — I pezzi anche dal campo

### Added
- **Tab «Pezzi» nella scheda macchina mobile** (`MachineComponentsTab`, nuovo): elenco dei componenti con quante segnalazioni aperte e quanti file ha ciascuno, e a un tap la scheda del pezzo — anagrafica, note, foto, documenti, segnalazioni e interventi che lo riguardano. Le schede della scheda macchina passano da cinque a sei: **Segnal. · Pezzi · Foto · Doc · Storico · Manut.**, e `Pezzi` sta subito dopo le segnalazioni perché davanti alla macchina la seconda domanda è quasi sempre "quale pezzo".
- **Quattro azioni dalla scheda del pezzo**, righe da 68px come il resto del mobile: **Scatta foto**, **Carica documento** (con la scelta della cartella), **Registra intervento** e **Segnala guasto sul pezzo**. Le foto e i documenti caricati da qui non escono dalla macchina — restano in `machines.attachments` con l'etichetta del componente (ADR-012), quindi compaiono in galleria e nelle cartelle documentali come prima.
- **Registra intervento sul pezzo**: crea un `maintenance_log` della macchina con `component_id`, così lo storico del singolo componente si popola da solo. Visibile solo a tecnico e admin — la RPC `create_maintenance_log` rifiuta gli altri ruoli, e un tasto che porta a "permesso negato" è peggio di un tasto che non c'è.
- **Segnala guasto sul pezzo**: apre la segnalazione con macchina **e componente** già scelti, ma cambiabili — chi scrive può accorgersi che il guasto è altrove. `NewReport` accetta `preselectedComponentId`, e `MobileLayout` lo porta fino al form.
- La galleria del pezzo apre il visore a schermo intero con nomi file parlanti (macchina, pezzo, data), come la galleria della macchina.

### Changed
- `MachineTabBar` prende le colonne da `MACHINE_TABS` invece che da una classe fissa a cinque: con sei schede su uno schermo da 360px restano 60px l'una.
- `CategorySheet` ("in che cartella?") si sposta da `MachineDocsTab` a `MachineTabParts`: ora la stessa domanda la fa anche il tab Pezzi, e due copie della lista cartelle sarebbero due liste che divergono.

### Note
- **Il tab Pezzi serve tecnico e admin.** L'operatore non ha il tab «Macchine» nel menu in basso (`TABS_BY_ROLE`), quindi non arriva alla scheda macchina né ai pezzi. Il codice è pronto anche per lui — manca solo la voce di menu — ma **per ora è una scelta deliberata**: l'accesso dell'operatore ai pezzi non è in agenda.
- Le spaziature del nuovo foglio "Registra intervento" sono inline: il reset globale in `styles/index.css` annulla `p-*` e `mb-*` (debito tecnico noto). I due fogli preesistenti sulla stessa schermata — Conferma manutenzione e Risolvi e registra — hanno lo stesso problema e non sono stati toccati qui.

---

## [Unreleased] — v5.19 — Componenti con documentazione propria

Decisione e alternative scartate: `docs/decisions/ADR-012-machine-components-documents.md`.

### Added
- **Il tab Componenti diventa una scheda vera** (`MachineComponentsTab.jsx`, nuovo): elenco dei pezzi a sinistra — con quanti file e quante segnalazioni ha ciascuno — e a destra la scheda del pezzo selezionato: anagrafica, note, segnalazioni collegate e i suoi file. Prima era una griglia di riquadri in sola lettura, e la pompa non aveva un posto dove tenere il proprio manuale.
- **Tre modi di dare un file a un componente**: **Foto**, **Documento** (con scelta della cartella documentale) e **Archivia esistente**, che prende un file che la macchina ha già e lo mette sotto il pezzo — il caso normale in officina, dove il manuale della pompa sta nelle Schede Tecniche da mesi e solo oggi la pompa diventa un componente.
- **I file del componente restano file della macchina.** Non c'è un secondo archivio: vivono in `machines.attachments` come prima, con in più l'etichetta `component_id`. Quindi una foto caricata sulla pompa compare nella Galleria Foto, un PDF entra nella biblioteca AI, le cartelle documentali continuano a contarlo. Il tab Componenti è una lente su quei file, non un contenitore.
- Migration **062**: `add_machine_attachment` accetta `component_id` e **verifica** che il componente sia di questa macchina e della mia org (un id fuori posto sarebbe un file archiviato sotto il pezzo di un'altra linea, cioè un file perso); `set_machine_attachment_component` archivia o riporta indietro un file già caricato — sposta l'etichetta, non il file, quindi l'URL non cambia e galleria e indice AI non se ne accorgono. Due trigger tengono allineate le etichette: rinominare un componente propaga il nome sui suoi file, **cancellarlo toglie l'etichetta e lascia i file alla macchina** (un manuale resta utile anche quando la pompa è stata smontata).
- **I componenti entrano nella biblioteca AI**: `ingest-knowledge` indicizza la scheda di ogni pezzo (`source_kind = 'component'`) e prefissa col nome del pezzo l'etichetta dei suoi PDF. "Che pompa monta il tino filtro?" ha una risposta senza aprire un documento, e la citazione dice *Pompa dosatrice · manuale* invece di *manuale (scheda tecnica)*.
- Nel tab **Documentazione**: pastiglia col nome del componente su ogni file che ne ha uno, e menu nel pannello Anteprima per riarchiviarlo su un altro pezzo (o riportarlo al macchinario).
- Lato mobile il pezzo si vede ma non si tocca: nome del componente sulle righe del tab **Doc**, badge **Componente** in galleria. `useMachineUpload` accetta già un componente — manca solo la schermata per crearne uno dal campo.
- `db.getMachine(id)`: la scheda admin rilegge la macchina insieme a piani e componenti, perché dopo un rename o una cancellazione è il server (i trigger) ad aver riscritto `attachments`.

### Note
- **Il tetto dei 200 allegati per macchina ora si avvicina più in fretta**: dieci componenti da dieci file fanno 100 senza accorgersene, e `machines.attachments` è JSONB su riga singola — ogni upload riscrive tutta la colonna. Quando stringe, la mossa è `machine_files` come tabella vera: l'etichetta `component_id` si porta dietro identica.
- **Nessun piano di manutenzione sul componente**: si registra il pezzo e i suoi documenti, la preventiva resta della linea. Scelta consapevole (ADR-012), non dimenticanza.

---

## [Unreleased] — v5.18 — Scheda macchina a schede, dimensionata per i guanti

Design di riferimento: canvas "Macchinario · Risorse", direzione 1A rivisitata (artboard 2A).

### Changed
- **`MobileMachineDetail` v4.0 — le risorse al primo livello.** Foto, documenti e interventi erano tre accordion in fondo alla pagina, sotto tutte le segnalazioni: davanti alla macchina, per aprire il manuale, si doveva scorrere otto guasti. Ora sono cinque schede fisse sotto l'intestazione — **Segnal. · Foto · Doc · Storico · Manut.** — con contatore su ciascuna e nessuna risorsa a più di un tap. Il contatore delle segnalazioni diventa ambra quando ce ne sono di aperte, quello delle manutenzioni rosso quando una è scaduta.
- **Misure per l'uso con i guanti**: nessun bersaglio sotto 56px, schede da 80px, righe lista da 76px, righe documento e intervento da 88px, piani da 96px, testo lista 18px, barra azioni da 68px. Nessun link testuale: ogni azione è una riga o un riquadro. Ogni bersaglio ha uno stato premuto pieno, non solo hover — con i guanti il feedback tattile non arriva, deve arrivare quello visivo.
- **Intestazione compatta**: nome macchina + riga identità (reparto · matricola · anno) + salute. Costruttore, modello e descrizione si sono spostati nella scheda tecnica in fondo al tab **Doc**, dove hanno spazio per stare per esteso.
- Il tab **Doc** esclude gli allegati categoria `foto`: le foto promosse in galleria vivono in `machines.attachments` come tutto il resto, ma il loro posto è il tab Foto — prima comparivano in entrambi.
- `MachineGallery` non è più una fisarmonica: vive dentro il tab Foto, sempre aperta, e riceve il feed dalla scheda (`media`) perché il contatore sulla barra deve esserci anche a tab chiuso. Filtri ingranditi a 56px, stato vuoto spiegato invece che nascosto.

### Added
- **MTBF nello storico**: distanza media fra due guasti, calcolata sui soli interventi straordinari e mostrata solo da tre guasti in su, dove la media inizia a dire qualcosa.
- `lib/maintenanceStatus.js` — il semaforo delle manutenzioni in un posto solo (era copiato in quattro file; i tre lato admin restano da ricondurre qui).
- `lib/constants.js` → `formatDateParts()` per le colonne data delle liste.
- Ruoli ARIA sulla barra a schede (`tablist` / `tab` / `tabpanel`).

### Fixed
- `useMachineMedia`: senza macchina, `override?.machineId === machineId` era vero perché entrambi `undefined`, e l'hook leggeva `.list` su `null`. Ora il confronto richiede un `override` reale.

### Note
- **Il reset globale in `styles/index.css` (`* { margin: 0; padding: 0 }`) è fuori da `@layer`**: in Tailwind v4 il CSS senza layer batte le utility, quindi in tutta l'app `p-*`, `m-*`, `px-[4vw]` e `space-y-*` non producono nulla (solo `gap-*` sopravvive). Le spaziature di questa schermata sono quindi inline. Non è stato toccato qui perché sistemarlo cambia la spaziatura di ogni schermata dell'app — va fatto come intervento a sé.

### Added — scrittura dal campo (completa il design 2A)
- **Scatta** nel tab Foto: primo riquadro della griglia, apre la fotocamera, comprime, genera la miniatura e aggiunge la foto alla macchina. Compare solo nella vista "Tutte" — dentro "In evidenza" o "Ultimi 30g" una foto nuova sparirebbe dal filtro appena scattata.
- **Carica documento** nel tab Doc: apre un foglio con le cartelle documentali (righe da 68px), poi il picker. PDF e immagini. I PDF fanno partire `queueMachineReindex` in sottofondo, così entrano nella biblioteca AI senza far aspettare chi è davanti alla macchina.
- Le foto scattate dal campo si distinguono da quelle caricate dall'ufficio: badge **Dal campo** invece di **Scheda**, dal campo `uploaded_from`.
- Migration **061**: RPC `add_machine_attachment(_machine_id, _attachment)`, `SECURITY DEFINER` come la 060 e per lo stesso motivo — `machines_update` è admin-only ma chi ha in mano la macchina è l'operatore. Autore, data e org li mette il server; `type` e `category` sono su whitelist; idempotente sull'URL (due tap non fanno due voci); tetto a 200 allegati per non far crescere senza limite una colonna JSONB su riga singola.
- Nuovo hook `useMachineUpload(machine, applyAttachments)` — un solo percorso per entrambi i gesti. `useMachineMedia` espone `attachments` e `applyAttachments`, così contatori e griglia si aggiornano senza rileggere la macchina.
- `lib/machineDocCategories.js`: la lista delle cartelle era solo dentro la scheda admin, ora è condivisa fra mobile, admin e whitelist della RPC. La scheda admin ci aggiunge icone e colori.

### Out of scope (rinviato)
- Non si cancella un allegato dal mobile: chi sbaglia foto la fa togliere dall'ufficio. Un `remove_machine_attachment` limitato a quello che hai caricato tu è la mossa successiva, ma va deciso chi può cosa.
- "Storico completo" e "Altre N segnalazioni" espandono in pagina invece di aprire una schermata dedicata, che non esiste.

---

## [Unreleased] — v5.17 — Galleria foto e video per macchinario

### Added
- **Galleria nella scheda macchina** (`MachineGallery.jsx` in `MobileMachineDetail`): le foto e i video depositati nel tempo su segnalazioni, chat, log di manutenzione e interventi della stessa macchina, in un unico feed cronologico. Ogni riquadro mostra l'origine (Chat / Segnalazione / Manutenzione / Intervento), chi l'ha scattata e quando; tap per aprire a schermo intero (`MediaLightbox` per le foto, `VideoPlayer` per i video), freccia per saltare alla segnalazione di origine. Filtri Tutte / In evidenza / Ultimi 30g e paginazione a 60 per volta.
- **Galleria curata a un tap**: ★ promuove la foto in `machines.attachments` categoria `foto` — la stessa cartella che il tab Documentazione admin mostra già, quindi l'admin la vede senza modifiche lato suo. Toggle: un secondo tap la rimuove. I documenti caricati a mano dall'admin non sono rimovibili da qui (protetti dal campo `promoted_from`).
- Migration **060**: indice mancante su `reports(machine_id)`, RPC `get_machine_media(machine, limit, offset)` (UNION delle quattro sorgenti, org-scoped via `get_my_org_id()`, audio escluso, dedup per URL tenendo l'occorrenza originale, fallback sullo snapshot testuale `machine` per le segnalazioni senza FK) e RPC `toggle_machine_media_feature` (`SECURITY DEFINER` perché `machines_update` è admin-only, ma chi riconosce la foto che vale è il tecnico).
- Nuovo modulo DB `src/lib/db/media.js` registrato nel facade, con fallback demo mode (in demo i log di manutenzione non hanno store localStorage: la galleria copre segnalazioni, chat e interventi).
- Nuovo hook `useMachineMedia(machine)`: feed + incrocio con la galleria curata + `toggleFeature`.
- **Stesso feed nella scheda admin** (`MachineDocumentationTab`): tab **Documentazione** → cartella **Galleria Foto**, sotto la banda "Dal campo · N file". Ogni riquadro porta il badge dell'origine (Chat / Segnalazione / Manutenzione / Intervento), la segnalazione, l'autore e quando; hover per aprire o per promuovere con ★. Le foto promosse restano nella griglia curata con il badge "★ TK-…" e mostrano l'origine nel pannello Anteprima. I conteggi della cartella (tree del left-rail, card cartella, status bar) includono le foto dal campo, così si vede che ci sono senza doverci entrare.
- **Visore anche nella scheda admin**: click su una foto della Galleria Foto (curata o dal campo) apre `MediaLightbox` a tutta pagina — frecce, tastiera ←/→, zoom, contatore "2 / 3" e bottone Scarica. Prima l'admin poteva solo selezionare o aprire in una scheda nuova, senza modo di sfogliare. I video restano fuori dal visore e si aprono in una scheda.
- **Nomi file parlanti al download** (`lib/mediaFile.js`): quello che esce dallo storage si chiama `1712345678-IMG_0042.jpg`, in una cartella Download non si ritrova. Ora diventa `Riempitrice_2026-03-12_TK-26100-01_2.jpg` — macchina, data, segnalazione di origine. Vale sia sul visore mobile sia su quello admin.
- **Miniature sui nuovi upload**: `makeThumbnail()` in `useImageCompressor` genera un'anteprima da 400px (~15 KB) caricata insieme alla foto in chat e in `MediaCapture`; l'URL finisce in `thumb_url` dentro l'oggetto media. Serve alla griglia: una foto compressa pesa 300-600 KB, sessanta insieme sono decine di MB sulla rete di stabilimento.

### Fixed
- `MobileMachineDetail` filtrava le segnalazioni della macchina con un match su stringa (`rep.machine === machine.name`): una macchina rinominata perdeva lo storico. Ora usa `machine_id` con fallback sullo snapshot testuale per i record vecchi.

### Note
- Decisioni, alternative scartate e rischi aperti in `docs/decisions/ADR-011-machine-media-gallery.md`.
- Se la migration 060 non è applicata, la galleria resta vuota e la scheda macchina funziona come prima (degrado silenzioso).

### Out of scope (rinviato)
- Miniature retroattive sulle foto già caricate; media delle chat 1:1 (`direct_messages` non ha collegamento alla macchina); tag semantici e CLIP.
- Aperte e non affrontate qui: bucket `attachments` pubblico, video non compressi in upload, retention GDPR delle foto.

---

## [Unreleased] — v5.12 — Attività chat nella lista segnalazioni admin

### Added
- **Chip attività chat nella lista admin** (`AdminReports.jsx`): sotto al titolo di ogni segnalazione compaiono 💬 numero messaggi (evidenziato con "· N nuovi" in accent quando ci sono non letti per l'admin loggato) e il feedback sui messaggi — ✅ Confermo, 👍 Utile, 🔧 Risolto — contato per **utenti distinti** (chi reagisce a 3 messaggi vale 1 persona). Le conferme multiple segnalano a colpo d'occhio l'importanza reale del ticket. Il 👏 'grazie' a livello segnalazione resta escluso dai chip.
- **Non letti anche su desktop**: aprire il dettaglio (che contiene la chat) fa upsert su `chat_reads` (mig 003, finora scritta solo dal mobile) e azzera il chip senza refetch. Nuovo `db.markChatRead(reportId, userId)` nel facade.
- **`db.getReportsActivity(reportIds, userId)`** in `src/lib/db/reports.js`: aggregato bulk (3 query: comments senza soft-deleted, reactions, chat_reads) con merge client-side — niente N+1 sulla lista. Fallback demo su store embedded + nuova chiave `KEYS.chatReads`.
- La subscription realtime sui commenti già presente in AdminReports ora aggiorna anche i chip (contatore +1, non letti +1 se scrive qualcun altro) oltre a fare il bump di `updated_at`.
- **Chip feedback anche nella card mobile** (`ReportsList.jsx`): accanto all'anteprima dell'ultimo messaggio compare il numero totale di messaggi, e sotto i chip ✅/👍/🔧 per utenti distinti (stesso `getReportsActivity`, caricato in second pass senza bloccare il paint). I non letti restano gestiti da `useChatRealtime` come prima.

### Note
- Nessuna migration: riusa `chat_reads` (003) e `reactions` (059). Se una delle due manca, degrado silenzioso (niente non letti / niente chip feedback).

---

## [Unreleased] — v5.11 — Reazioni chat e ringraziamenti

### Added
- **Reazioni sui messaggi chat** (`ChatPanel.jsx`): 👍 Utile, ✅ Confermo il problema, 🔧 Risolto per me — toggle per utente/tipo, attive su tutte le superfici (admin desktop, mobile; escluse in guest mode). I chip con emoji e contatore compaiono solo quando qualcuno ha effettivamente reagito; per reagire c'è un "+" discreto (hover su desktop, sempre visibile ma leggero su mobile) che apre le 3 opzioni. L'autore del messaggio vede i nomi di chi ha reagito; sul proprio messaggio niente auto-like (chip in sola lettura).
- **Ringraziamento 👏 a livello segnalazione**: banner "🎉 Intervento completato" nella chat quando `status ∈ {risolta, chiuso}` con CTA "Ringrazia {tecnico}" (toggle). Il tecnico assegnato vede il messaggio personale con i nomi di chi lo ringrazia (e nessun pulsante per auto-ringraziarsi).
- **Contatore "Grazie ricevuti"** nel profilo tecnico (`ProfilePage.jsx`), calcolato sulle segnalazioni assegnate (`db.getThanksReceived`).
- Migration **059** `reactions`: tabella unica per reazioni messaggio (comment_id NOT NULL) e ringraziamenti segnalazione (comment_id NULL), unique index partial per il toggle, RLS org-scoped in lettura e user-scoped in insert/delete (pattern 052). La migration droppa una versione preliminare della tabella creata fuori migration sul primo rollout.
- Nuovo modulo DB `src/lib/db/reactions.js` (`getReactions`, `addReaction`, `removeReaction`, `getThanksReceived`) registrato nel facade, con fallback demo embedded nel report come i commenti.
- Costante `REACTIONS` in `constants.js`.

### Out of scope (rinviato)
- Realtime sulle reazioni (publication + subscribe in ChatPanel) — oggi si caricano al mount come i messaggi.
- Integrazione ManuCoin (`credit_tokens` su 👏 ricevuto) e badge gamification "thanks" in `useOperatorScore`.

---

## [Unreleased — Hotfix Sprint 1a-bis] — v5.3.1

Hotfix sul branch `claude/hotfix-search-segnalazioni-SvhFt`. Solo cambi UI, nessuna migration DB.

### Fixed
- Search segnalazioni mobile (`src/components/reports/ReportsList.jsx`) ora cerca su tutti i campi visibili al manutentore: titolo, descrizione, nome macchinario (snapshot `r.machine` + fallback via lookup `machine_id` contro lo state `machines`), tecnico assegnato (`assigned_to_name`), creatore (`created_by_name`) e ID UUID raw. La ricerca per "etichettatrice" ora restituisce tutte le segnalazioni correlate anche quando il titolo è diverso (es. "Guasto improvviso").
- Search segnalazioni admin (`src/pages/admin/AdminReports.jsx`): estesa con gli stessi campi del mobile per coerenza UX su entrambe le interfacce. Prima cercava solo titolo, macchina e creatore — senza ID né descrizione.
- Debounce 200ms su entrambe le searchbar: evita re-render eccessivi durante digitazione rapida, invisibile all'utente.

### Documented
- Commento header in `ReportsList.jsx` documenta la convenzione schema asimmetrica: il nome macchinario è in `reports.machine` (TEXT snapshot), non `machine_name` come suggerirebbe la simmetria con `assigned_to_name`. Debito tecnico noto, da valutare normalizzazione in Sprint 1d insieme all'hardening `org_id` (ADR-007).

### Out of scope (rinviato)
- Full-text Postgres con `tsvector` (stemming italiano, ricerca server-side su tutto il dataset, ranking) → Sprint 1d post ADR-007.
- Fuzzy matching / typo tolerance (`pg_trgm`) → Sprint 3.3.

---

## [Unreleased — Sprint 1c]

Pronto per merge sul branch `claude/intervention-reports-many-to-many-Vh3Mt`. Migration 055 NON ancora applicata su Supabase (apply in finestra coordinata col push).

### Added
- Relazione N→M tra `interventions` e `reports` tramite nuova tabella `intervention_reports` (migration 055)
- Campo `is_origin BOOLEAN` (max 1 per intervento, unique partial index) per identificare il report di creazione
- Campo `resolves_report BOOLEAN DEFAULT true` per distinguere link "risolutivi" da link "di contesto"
- Trigger PG `on_intervention_completed` per auto-close dei report risolutivi quando l'intervento passa a `status='completato'`
- Activity log type `auto_closed_by_intervention` (`user_id=NULL`, `user_name='Sistema'`)
- Activity log type `report_linked_to_intervention` e `report_unlinked_from_intervention` per tracciare modifiche manuali ai link
- View `reports_with_planning` estesa con colonna informativa `linked_interventions_count` (include link di contesto)
- DB layer `db.createInterventionWithReports(intervention, links)` come API principale per la creazione di interventi con N link
- DB layer helpers: `db.linkReportToIntervention`, `db.unlinkReportFromIntervention`, `db.setResolvesReport`, `db.getReportsForIntervention`, `db.getActiveLinksByReports`
- Custom hook `useInterventionReports(interventionId)` con realtime subscription
- Componente `ReportMultiPicker.jsx`: selezione multi-segnalazioni con search debounced 300ms, skeleton loading, tap target ≥44px (regola guanti), feedback aptico mobile (vibrate 10ms), warning visivo "⚠ Già linkato a INT-XXX"
- Componente `LinkedReportsSection.jsx`: sezione UI uniforme N=0/1/N>1 per gestione link
- Integrazione in form intervento (`InterventionForm`): nuova sezione "Segnalazioni coperte" tra Specialty e Foto
- Integrazione in `InterventionDetailPanel`: sezione "Segnalazioni associate" con add/remove inline
- ADR-006 documenta scelta schema γ + alternative scartate
- ADR-007 placeholder per hardening `org_id` (Sprint 1d)
- CHANGELOG.md (questo file, primo cambio formale)

### Changed
- View `reports_with_planning` aggrega `planning_state` solo sui link con `resolves_report=true` (i link "di contesto" non contano per il calcolo dello stato)
- `interventions.report_id` rimosso (single source of truth: `intervention_reports`)
- `db.createIntervention(data)` ora è **shim deprecato**: se `data.report_id` valorizzato logga `console.warn` (con stack trace del caller) e delega a `createInterventionWithReports`. Audit dei callsite residui post-deploy via grep dei warning.
- `InterventionDetailPanel`: rimosso bottone "Apri segnalazione di origine" (vecchio basato su `intervention.report_id`). Sostituito con sezione "Segnalazioni associate".
- `InterventionRequestSidePanel` mode `reschedule`: i link sono mostrati read-only (modifiche strutturali via DetailPanel post-salvataggio)

### Migration steps
- **Backup di sicurezza**: `CREATE TABLE backup_055_interventions AS SELECT * FROM interventions`
- **Pre-migration count**: `SELECT COUNT(*) FROM interventions WHERE report_id IS NOT NULL` (catturalo per la verifica)
- **Apply** in transaction: `055_intervention_reports.sql`
- **Consistency check** automatico nella mig (DO block §5): RAISE EXCEPTION se mismatch pre/post, RAISE NOTICE con count migrato se OK
- **Verifica post**: `SELECT COUNT(*) FROM intervention_reports WHERE is_origin=true` deve essere uguale al pre-migration count

### Known limitations
- **`org_id` rimane `TEXT` con `DEFAULT 'default'` ovunque** (anti-pattern noto: causa "record invisibili da RLS mismatch"). Hardening tracked in **ADR-007**, da risolvere in Sprint 1d (subito dopo 1c, **pre-FASE 5 multi-tenant**)
- `intervention_reports.org_id` è `TEXT NOT NULL` (NO default) — pattern safer ma TEXT, allineamento con resto schema
- Down migration di 055 è destructive sui link `is_origin=false` (vengono persi col `DROP TABLE intervention_reports`)
- Activity log `auto_closed_by_intervention` ha `user_id=NULL` (azione di sistema). L'audit trail risale al vero umano via activity precedente `intervention_status_changed`
- **Auto-close è ONE-WAY**: se un intervento `completato` torna a stato precedente (via update DB diretto), i report chiusi dall'auto-close restano `risolta`. Decisione consapevole (cfr Correction #10). Nota UX runtime + eventuale "Riapri anche i report associati" pianificati quando aggiungeremo bottone "Riapri" nel DetailPanel
- Lo shim `db.createIntervention` con `data.report_id` ora scrive activity row `type='deprecated_api_call'` per audit SQL post-deploy. Console.warn rimane in produzione. Grep `db.createIntervention(` nel codebase corrente ritorna 0 risultati: nessun caller residuo identificato
- `InterventionDetailPanel` `onOpenReport` prop deprecato (non più consumato): lieve regression UX rispetto a Sprint 1a (no shortcut "Apri →" sulle mini-card). Da ripristinare in Sprint 1d (~10 LOC)
- 3 nuovi `activities.type` (`auto_closed_by_intervention`, `report_linked_to_intervention`, `report_unlinked_from_intervention`) non hanno mapping label/icon nell'UI Activity Timeline. Default a stringa raw. Aggiunta mapping pianificata Sprint 1d

---

<!--
Versioni precedenti (Sprint 1a, 1a-bis) non sono ancora state portate in
questo CHANGELOG. Da fare in fase di chiusura Sprint 1c oppure spostare a
Sprint 1d con bump di versione.
-->
