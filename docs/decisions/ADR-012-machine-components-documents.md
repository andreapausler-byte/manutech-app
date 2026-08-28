# ADR-012 — Componenti con documentazione propria

**Status**: Accepted · **Date**: 2026-08-26 · **Sprint target**: v5.19 · **Schema delta**: nessuna tabella nuova, nessuna colonna nuova — un'etichetta dentro `machines.attachments` + due RPC e due trigger (migration 062)

## Context

L'anagrafica macchinari sta prendendo peso, e con lei una pressione a spezzarla. Un tino filtro non è un blocco unico: è la pompa dosatrice, il motoriduttore, il quadro, la valvola di fondo. Ognuno di questi ha un costruttore diverso dal costruttore della linea, una matricola propria, un manuale proprio, un contratto di assistenza proprio.

Finché l'unico contenitore di documenti è il macchinario, chi deve archiviare il manuale della pompa ha due strade, entrambe sbagliate:

1. **Registrare la pompa come macchinario a sé.** L'anagrafica si riempie di voci che nessuno considera macchinari: si rompe il conteggio impianti, si sporca la lista da cui l'operatore sceglie quando segnala, i KPI per macchina perdono senso, e la manutenzione preventiva della linea si spezza in cinque piani che nessuno tiene allineati.
2. **Buttare il manuale della pompa fra i documenti della linea.** Il file c'è, ma il legame col pezzo vive solo nel nome file, cioè da nessuna parte.

I componenti esistono già da migration 021 (`machine_components`, con nome, tipo, costruttore, modello, matricola, anno, note) e sono già collegabili a una segnalazione (`reports.component_id`) e a un log di manutenzione (`maintenance_logs.component_id`). Quello che mancava è che un componente potesse **portare con sé dei file**: il tab Componenti era una griglia di schede anagrafiche in sola lettura, e la scheda del pezzo non aveva un posto dove mettere il PDF.

Vincolo esplicito del founder, che è anche il criterio di accettazione: *tutti i file devono comunque comparire nella galleria del macchinario*. Il componente serve a **non moltiplicare i macchinari**, non a creare un secondo archivio parallelo.

## Decision drivers

- **Il beneficiario è chi ha le mani sulla macchina.** Test vincolante della AI Strategy. Qui vale in due casi concreti: riconoscere il pezzo da ordinare (matricola e costruttore del componente, non della linea) e aprire il manuale giusto quando la pompa perde, senza sfogliare il manuale della linea intera.
- **Un file, un posto.** Se un documento può stare in due archivi, prima o poi ne ha due versioni diverse.
- **L'anagrafica macchinari deve restare l'elenco degli impianti.** È l'asse su cui girano KPI, piani, semaforo manutenzioni e scelta in fase di segnalazione.
- **Reversibilità.** Il pattern d'uso non è noto: quanti componenti per macchina, quanti file per componente. La v1 deve poter essere buttata via senza migrazione dati.

## Decision

### 1. Il componente è un'etichetta sui file, non un archivio

I file di un componente restano dentro `machines.attachments`, esattamente come tutti gli altri file della macchina. In più portano due campi: `component_id` (verificato dal server) e `component_name` (snapshot per le viste che non caricano i componenti).

Conseguenza voluta, ed è il requisito del founder preso alla lettera: una foto caricata sulla pompa **è** una foto della macchina. Compare nella Galleria Foto senza codice nuovo, un PDF entra nella biblioteca AI della macchina senza codice nuovo, le cartelle documentali continuano a contarlo. Il tab Componenti è una **lente** su quei file, non un contenitore separato.

L'alternativa — tabella `component_attachments`, o colonna `attachments` su `machine_components` — è stata scartata proprio qui: avrebbe richiesto di modificare `get_machine_media`, il tab Documentazione, l'ingest AI e la galleria mobile per riunire due archivi che non c'era motivo di separare, e avrebbe reso possibile lo stato "file del componente che non compare fra i file della macchina" — cioè esattamente il modo in cui questa feature può fallire.

### 2. Le etichette le tiene allineate il database (migration 062)

- `add_machine_attachment` (dalla 061) accetta ora `component_id` e **verifica** che il componente esista, sia di *questa* macchina e della mia org. Un id fuori posto sarebbe un file archiviato sotto il pezzo di un'altra linea, cioè un file perso.
- `set_machine_attachment_component(_machine_id, _url, _component_id)` archivia sotto un componente un file **già caricato**, o lo riporta alla macchina. È il caso normale in officina: il manuale della pompa sta nelle Schede Tecniche da mesi, e solo oggi la pompa diventa un componente. Sposta un'etichetta, non un file: l'URL non cambia, quindi galleria e indice AI non se ne accorgono.
- Due trigger su `machine_components`: la rinomina propaga lo snapshot `component_name`, la cancellazione **toglie l'etichetta e lascia i file alla macchina**. Un manuale resta utile anche quando la pompa è stata smontata; e uno snapshot che nessuno aggiorna è peggio di nessuno snapshot.

Tutte `SECURITY DEFINER` per lo stesso motivo della 060 e della 061: `machines_update` è admin-only, ma chi sa a quale pompa appartiene quel PDF è il tecnico davanti alla macchina.

### 3. I componenti entrano nella biblioteca AI

Un componente è una scheda corta e densa: costruttore, modello, matricola, note. `ingest-knowledge` la indicizza come sorgente propria (`source_kind = 'component'`), e prefissa con il nome del pezzo l'etichetta dei PDF che gli appartengono. Così "che pompa monta il tino filtro?" ha una risposta senza aprire un PDF, e la citazione dell'assistente dice *Pompa dosatrice · manuale* invece di *manuale (scheda tecnica)*.

Non viola l'anti-pattern "mai AI prima che il Layer 0 sia stabile": non è una feature AI nuova, è una sorgente in più per la biblioteca che esiste già.

### 4. La UI: master-detail dentro il tab che c'è già

Il tab Componenti diventa elenco a sinistra (con conteggio file e segnalazioni aperte per pezzo) e scheda a destra: anagrafica, note, segnalazioni collegate, file, e tre azioni — **Foto**, **Documento** (con scelta della cartella), **Archivia esistente** (per i file che la macchina ha già). Nel tab Documentazione ogni file mostra la pastiglia del componente, e il pannello Anteprima ha il menu per riarchiviarlo altrove.

## Alternatives considered

- **Componente = macchinario figlio (`machines.parent_id`)**: dà gratis piani, KPI e segnalazioni sul pezzo, ma rimette i componenti nell'anagrafica impianti — che è il problema da cui si parte. Da rivalutare solo se emergesse la necessità di piani di manutenzione **sul singolo componente**: è l'unica cosa che questa scelta non dà.
- **Tabella `component_attachments` dedicata**: separa i due archivi e obbliga a riunirli in quattro punti. Scartata (vedi Decision 1).
- **Colonna `attachments` JSONB su `machine_components`**: stesso difetto, in più duplica il tetto dei 200 e la logica di scrittura.
- **Nessun componente, solo convenzione sul nome file** ("POMPA - manuale.pdf"): zero schema, zero garanzie. È lo stato attuale, ed è il motivo della richiesta.

## Consequences

**Positive**
- L'anagrafica macchinari resta l'elenco degli impianti: un componente in più non sposta un KPI né allunga la lista da cui l'operatore sceglie.
- Il requisito "i file compaiono comunque nella galleria del macchinario" è vero **per costruzione**, non per una sincronizzazione da mantenere.
- Cancellare un componente non cancella documentazione: il rischio più caro di questa feature è chiuso dal trigger.
- L'assistente AI guadagna le schede dei pezzi e citazioni più precise, senza pipeline nuove.

**Negative / da tenere d'occhio**
- **Il tetto dei 200 allegati per macchina ora si avvicina più in fretta**: con dieci componenti da dieci file l'una si arriva a 100 senza accorgersene. `machines.attachments` è JSONB su riga singola, e ogni upload riscrive tutta la colonna. È il primo limite che questa feature incontrerà; quando succede, la mossa è `machine_files` come tabella vera (l'etichetta `component_id` si porta dietro identica).
- **`component_name` è denormalizzato.** Vive di due trigger. Se un domani si scrive su `machines.attachments` per una strada che li aggira, gli snapshot divergono.
- ~~**Nessun piano di manutenzione sul componente**~~ — risolto in v5.21: `maintenance_plans.component_id` opzionale (migration 063). Il piano resta della macchina; nomina il pezzo e il log confermato lo eredita.
- **Mobile in sola lettura sui componenti**: dal campo si vede da che pezzo viene un file (pastiglia nel tab Doc, badge in galleria), ma non si può creare un componente né caricarci sopra. L'hook `useMachineUpload` accetta già il componente: manca solo la schermata.

## Scope

**v1 (questo ADR)**
- migration 062: `add_machine_attachment` con `component_id` verificato, `set_machine_attachment_component`, trigger di rinomina e cancellazione, `source_kind = 'component'` ammesso in `document_chunks`
- `db.setMachineAttachmentComponent` + `db.getMachine` (rilettura della riga dopo i trigger), con fallback demo mode allineato ai trigger
- `MachineComponentsTab` master-detail; pastiglia componente e menu di riarchiviazione nel tab Documentazione
- mobile: nome del componente sulle righe documento e origine "Componente" in galleria
- `ingest-knowledge`: schede componente indicizzate, etichette PDF prefissate col pezzo

**Fuori scope, dichiarato**
- creazione e upload componenti dal mobile
- piani di manutenzione per componente
- gerarchia a più di due livelli (componente di componente)
- collegamento automatico dei ricambi (`spare_parts.component_id` esiste dalla 022, ma la UI resta quella della macchina)

## Open questions

1. **Quando `machines.attachments` diventa `machine_files`?** La soglia tecnica è nota (200), quella pratica no: va guardata dopo qualche mese di uso reale.
2. ~~**Un componente può segnalare?** Non c'è modo di scegliere il pezzo mentre si crea la segnalazione dal mobile.~~ **Sbagliata**: `NewReport` — che è anche il flusso mobile — ha il selettore "Componente specifico" dalla 021, e scrive `component_id` e `component_name`. Il problema vero è a valle: nessuna vista del ticket mostra il pezzo, la chiusura non lo chiede e i `maintenance_log` non lo ereditano. Studio completo in `docs/proposals/2026-08-26-segnalazioni-per-componente.md`.
3. ~~**Chi può creare un componente?** Oggi admin (policy della 021), mentre i file li può caricare anche il tecnico.~~ **Deciso il 28/8: resta admin-only.** Il tecnico attribuisce il guasto a un pezzo esistente (v5.21) e ci carica sopra i file, ma non ne registra di nuovi dal campo. Da tenere d'occhio: un'anagrafica componenti incompleta si manifesta come ticket lasciati "generici", non come errore.
