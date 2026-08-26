# Changelog — ManuTech

Tutti i cambiamenti notabili a questo progetto sono documentati qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

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
