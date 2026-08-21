# ADR-011 — Galleria foto e video per macchinario

**Status**: Accepted · **Date**: 2026-08-21 · **Sprint target**: v5.17 (Sprint A+B rilasciati, Sprint C aperto) · **Schema delta**: nessuna tabella nuova — due RPC + un indice (migration 060)

## Context

Le foto scattate in fabbrica finiscono quasi tutte in chat. Una segnalazione nasce con due foto allegate, poi in chat ne arrivano altre cinque durante la diagnosi, poi il tecnico ne aggiunge una al log di manutenzione. Ogni foto è collegata a una macchina — le chat di segnalazione fanno riferimento a uno specifico macchinario — ma resta sepolta nel punto in cui è nata. Dopo due anni di esercizio, nessuno le ritrova più.

Discovery sullo stato attuale del codice:

| Sorgente | Colonna | Collegamento macchina |
|---|---|---|
| Segnalazione | `reports.media` | `machine_id` (FK) |
| Chat segnalazione | `comments.media` | via `report_id → reports.machine_id` |
| Log manutenzione | `maintenance_logs.media` | `machine_id` (FK) |
| Intervento v2 | `interventions.media` | `machine_id` (FK) |
| Scheda macchina | `machines.attachments` | è la macchina |
| Chat 1:1 (DM) | `direct_messages.media` | **nessuno** |

Cinque sorgenti su sei sono già collegabili alla macchina senza toccare lo schema. Non manca il dato: manca la vista aggregata. Esiste già una categoria `foto` ("Galleria Foto") nel tab Documentazione admin, ma è alimentata solo a mano dall'admin — le foto degli operatori non ci arrivano mai.

Due difetti trovati durante la discovery, entrambi prerequisiti:

- `MobileMachineDetail` filtrava le segnalazioni della macchina con `rep.machine === machine.name` (match su stringa): una macchina rinominata perde lo storico.
- Non esisteva un indice su `reports(machine_id)` (c'era per `maintenance_logs` e `interventions`).

## Decision drivers

- **Il beneficiario è chi ha le mani sulla macchina.** Test vincolante della AI Strategy: rende più facile o sicura la giornata di operatore o tecnico? Sì, in tre casi concreti — rimontaggio ("com'era prima di smontare"), riconoscimento pezzo (targhetta da mostrare al fornitore), confronto nel tempo (usura a sei mesi di distanza). Da qui la scelta di partire dal mobile, non dall'admin.
- **Completezza e usabilità tirano in direzioni opposte.** Il valore di lungo periodo richiede il feed completo; l'uso quotidiano richiede poche foto giuste.
- **Reversibilità prima di ottimizzazione.** Il pattern d'uso reale non è ancora noto: la v1 deve poter essere buttata via in mezza giornata.
- **Criterio di successo**: un tecnico trova in meno di 30 secondi la foto che gli serve. Non "quante foto abbiamo raccolto".

## Decision

### 1. Modello ibrido: feed automatico + curatela a un tap

Il default è il **feed automatico** di tutto ciò che è passato per la macchina, cronologico, con l'origine visibile (chat TK-…, autore, quando). Sopra ci sta una **galleria curata**: l'azione ★ promuove la foto in `machines.attachments` categoria `foto`, la stessa cartella che il tab Documentazione mostra già.

Le due alternative pure sono state scartate: il solo feed diventa un cimitero navigabile dopo due anni; la sola curatela resta vuota, perché nessuno cataloga foto a fine turno con i guanti. La curatela avviene nel momento in cui il valore è evidente — quando guardi la foto e pensi "questa serviva".

### 2. Una RPC, non una tabella nuova (migration 060)

`get_machine_media(_machine_id, _limit, _offset)` `SECURITY DEFINER` unisce le quattro sorgenti dinamiche in una query, filtra per `get_my_org_id()`, esclude l'audio, normalizza `image`→`photo`, deduplica per URL (tenendo l'occorrenza più vecchia, che è l'originale) e pagina. Quattro fetch dal client sarebbero il pattern N+1 già in debito tecnico altrove.

Match macchina: FK `machine_id`, con fallback sullo snapshot testuale `machine` per le segnalazioni create prima della FK.

`toggle_machine_media_feature(_machine_id, _media)` gestisce la promozione. È una RPC perché `machines_update` è admin-only, ma chi riconosce la foto che vale è il tecnico. La rimozione tocca solo le voci con `promoted_from`: un documento caricato a mano dall'admin non si cancella da qui.

### 3. `thumb_url` sui nuovi upload

Una foto compressa pesa 300-600 KB (`useImageCompressor`: 1920px, q0.82). Una griglia da 60 foto sono decine di MB sulla rete di uno stabilimento. `makeThumbnail()` genera una miniatura da 400px (~15 KB) in fase di upload, in chat e in `MediaCapture`; l'URL finisce in `thumb_url` dentro l'oggetto media.

La decisione è stata presa **prima** di scrivere la galleria e non dopo, perché retrofittare il campo su migliaia di record già caricati è doloroso. Le foto storiche restano senza miniatura e la griglia ricade sull'originale con `loading="lazy"`.

## Alternative considerate

- **Tabella `media_assets` popolata da trigger** (una riga per file, con `machine_id`, `source_table`, tag, `is_featured`). È la strada giusta quando i media superano qualche migliaio o quando arriva l'indicizzazione visiva. Rinviata: coincide concettualmente con la Fase 1 della roadmap ("eventi prima dello stato" — una foto caricata *è* un evento), e conviene progettarla conoscendo i pattern d'uso reali.
- **Denormalizzare `machine_id` su `comments`**: il join c'è già ed è indicizzato. Un campo in più da tenere allineato per sempre, in cambio di niente. Da rivalutare solo se la RPC risulta lenta con dati veri.
- **Copiare i file in un bucket per macchina**: duplicazione storage e un problema di sincronizzazione, nessun beneficio.
- **Galleria solo admin**: sbaglia il beneficiario.

## Consequences

**Positive**
- Le foto di due anni di chat diventano cercabili dalla scheda macchina, senza che nessuno abbia dovuto catalogarle.
- L'admin ottiene la galleria curata gratis: le foto promosse compaiono nel tab Documentazione sotto "Galleria Foto", che già esiste.
- È il prerequisito della componente visiva della Fase 4 (RAG con CLIP embeddings): senza un indice media→macchina non c'è nulla da embeddare. Rispetta l'anti-pattern "mai AI prima che il Layer 0 sia stabile" invece di violarlo.
- Promuovere una foto la mette al riparo dalla cascata: `comments` ha `ON DELETE CASCADE` da `reports`, quindi cancellare una segnalazione oggi significa perdere pezzi di storia della macchina.

**Negative / da tenere d'occhio**
- **I video non sono compressi** (`MediaCapture` comprime solo le foto): un video da smartphone entra nel bucket a 50-150 MB. Il problema esiste già, la galleria lo rende quotidiano. Serve almeno un limite con avviso.
- **Il bucket `attachments` è pubblico** (schema.sql, policy aperte). Finché sono URL sparsi in chat è un rischio teorico; un archivio storico organizzato per macchina, presentato come tale a un cliente industriale, è un tema contrattuale. Da valutare bucket privato + signed URL prima di posizionarlo come "archivio di lungo periodo".
- **GDPR**: le foto in reparto ritraggono persone. Un archivio persistente e navigabile cambia la natura del dato rispetto a una foto sepolta in chat: serve una policy di retention dichiarata.
- I file orfani nello storage (foto di segnalazioni cancellate) restano: nessuno li ripulisce, oggi come prima.

## Scope

**v1 (Sprint A + B, questo ADR)**
- migration 060: indice `reports(machine_id)`, `get_machine_media`, `toggle_machine_media_feature`
- `src/lib/db/media.js` con fallback demo mode (i log di manutenzione non hanno store localStorage: in demo la galleria copre segnalazioni, chat e interventi)
- `useMachineMedia`, `MachineGallery`, sezione in `MobileMachineDetail`
- `thumb_url` sui nuovi upload (chat + MediaCapture)
- fix del match macchina per stringa

**Fuori scope, dichiarato**
- Sprint C: cartella "Dalla chat" nel tab Documentazione admin, con ricerca per periodo/autore/segnalazione
- miniature retroattive sulle foto già caricate
- media dei DM (`direct_messages` non ha collegamento alla macchina)
- tag semantici, CLIP embeddings, ricerca visiva

## Open questions

1. **Bucket privato + signed URL**: quando, e con quale impatto sugli URL già condivisi via WhatsApp (`lib/share.js` manda link pubblici alle foto)?
2. **Retention**: per quanto tempo si tiene una foto? La risposta è anche la risposta GDPR.
3. **Limite dimensione video**: soglia e comportamento (rifiuto, avviso, compressione lato client)?
4. Quando i media superano ~5-10k per org, vale la pena passare a `media_assets`? La RPC è già scritta per essere sostituita senza toccare la UI.
