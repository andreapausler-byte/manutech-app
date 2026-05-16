# AI Use Cases — Log dal campo

Questo file traccia gli use case AI emersi da conversazioni con utenti reali (operatori, tecnici, manutentori, admin). Ogni entry deve avere: data, fonte, beneficiario operativo, layer ADR-010 di riferimento.

L'obiettivo è arrivare a 15-25 use case validati dal campo prima dell'inizio di Layer 1 (autunno 2026). La qualità di questa lista è proporzionale alla qualità delle feature AI che costruiremo.

**Riferimenti:** ADR-010 (AI Strategy Vision), principio fondante (AI per tutelare e aiutare operatore/tecnico).

---

## 15/5/2026 — Confronto col manutentore

Sorgente: conversazione 30 min in azienda.

| Use case | Beneficiario | Layer | Note |
|---|---|---|---|
| Voice creation intervento durante telefonata col fornitore | Manutentore con mani occupate | L1.C | Originale del confronto |
| Riassunto storico interventi su singola macchina | Tecnico che arriva su macchina non familiare | L2.A | Risparmia 20 min di scroll |
| Pattern recognition segnalazioni ricorrenti | Manutentore che vuole evitare emergenze ricorrenti | L2.B | Trasforma reattivo in predittivo |
| Classificazione automatica `type`/`severity` segnalazione | Operatore che vuole solo segnalare senza compilare campi | L1.B | Riduce attrito Quick Report |
| Estrazione info da chat realtime (chi ha detto cosa, decisioni prese) | Tecnico che riprende intervento dopo giorni | L1.A esteso | Memoria operativa delle conversazioni |

---

## 16/5/2026 — Insight founder (post-confronto)

Sorgente: riflessione founder dopo conversazione del 15/5.

**Insight #1 — Voice UX deve essere progettato per parlato caotico**

Manutentori, tecnici e operatori in fabbrica sono spesso stanchi, agitati, di fretta. Parlano in modo non lineare: partono dalla fine, si correggono a metà, omettono contesto. Una voice AI progettata per parlato chiaro fallisce in fabbrica e umilia l'utente.

**Conseguenze per la roadmap:**
- Promozione di Layer 1.C "Voice creation" → Layer 1.C "Voice-first interface" (4 modalità d'uso: create/append/query/command)
- Estensione del principio fondante ADR-010 con assunto "stanco/agitato/di fretta"
- Nuovo anti-pattern #9: test 17/20 su dataset reale prima del lancio
- Pre-requisito Layer 1.C: raccolta dataset 50-100 registrazioni vocali reali

**Implicazioni tecniche:**
- STT: probabilmente Whisper API (non Web Speech) per robustezza su parlato disordinato
- Parsing: Claude Haiku con prompt progettato per disambiguare linguaggio caotico
- Architettura: contesto sessione persistente passato a ogni request Claude
- UX: echo interpretazione + correzione vocale ammessa come secondo turno

**Vantaggio competitivo identificato:** nessun competitor SaaS ha voice progettata per parlato di fabbrica reale. Demo "in ufficio in cuffia" funziona ovunque; demo "in fabbrica con guanti e stanchezza" funziona solo se progettata per quello. Moat silenzioso che si capisce solo parlando col manutentore.

---

## Da raccogliere nelle prossime settimane

- Use cases dal **secondo confronto manutentore** (programmato settimana prossima per chiudere open Q residue ADR-008)
- Use cases dal **primo confronto con un operatore di linea** (mai parlato direttamente, è gap di discovery)
- Use cases dal **primo confronto con un admin/responsabile produzione** (per validare Layer 3 commerciale)

Target intermedio: 10 use cases entro fine giugno 2026.
Target lancio Layer 1: 15-25 use cases entro estate 2026.
