# ADR-005 — Vocabolario interventi allineato a reports

**Status**: accepted · **Date**: 2026-05-13 · **Sprint**: 1a · **Replaces**: ADR-005 (handoff doc §3)

## Context

Il briefing dello Sprint 1 (handoff v1.1) proponeva per `interventions` un vocabolario nuovo, parzialmente disallineato da quello di `reports`:

| Campo | Briefing | reports (attuale) |
|---|---|---|
| `type` | `reattivo \| preventivo \| ispezione` | `correttiva \| preventiva \| migliorativa \| ispezione` |
| `severity` | `bassa \| media \| alta` | `bassa \| media \| alta \| critica` |

Durante la fase di review, l'utente ha richiesto allineamento totale per evitare un secondo vocabolario parallelo (e per riusare le costanti `REPORT_TYPES` e `SEVERITY` già definite in `src/lib/constants.js`).

## Decision

`interventions.type` e `interventions.severity` usano **gli stessi valori CHECK di `reports`**:

```sql
type     CHECK IN ('correttiva','preventiva','migliorativa','ispezione')
severity CHECK IN ('bassa','media','alta','critica')
```

`interventions.status` resta specifico al workflow di esecuzione interventi:

```sql
status   CHECK IN ('bozza','pianificato','confermato','in_corso','completato','annullato')
```

### Ereditarietà type/severity da origine

Quando un intervento ha `origin='report'`:
- `type` ereditato dal `reports.type` di origine
- `severity` ereditato dal `reports.severity` di origine
- Pre-popolati nel form di creazione. Override esplicito possibile in un futuro toggle UI (Sprint 3+).

Quando un intervento ha `origin='maintenance_plan'`:
- `type = 'preventiva'` (default fisso, unico valore sensato)
- `severity` derivato da `machines.criticality`: `alta`→`alta`, `critica`→`critica`, altri→`media`

Quando un intervento ha `origin='manuale'`:
- type e severity scelti liberamente dall'admin nel form

Implementazione: funzione `defaultsForOrigin({origin, report, machine, overrides})` in `src/lib/interventions.js`.

### Mapping legacy

`InterventionRequestModal` raccoglie `urgency` (chip 4 livelli: bassa/media/alta/urgente) ereditato dal flow ricambi. Mappiamo a severity:

```js
URGENCY_TO_SEVERITY = {
  bassa: 'bassa',
  media: 'media',
  alta:  'alta',
  urgente: 'critica',
}
```

### Sorgente di verità unica

Le costanti UI (label, color, bg, icon) per `INTERVENTION_TYPES` e `INTERVENTION_SEVERITIES` sono **re-export** delle stesse mappe in `constants.js` (`REPORT_TYPES`, `SEVERITY`). Una sola sorgente: se reports aggiunge un nuovo type/severity in futuro, anche gli interventi lo vedono automaticamente.

`INTERVENTION_STATUSES` invece è un nuovo dizionario in `src/lib/interventions.js` perché lo workflow `bozza→pianificato→…→annullato` non ha equivalente in reports.

## Consequences

**Pro**:
- Coerenza concettuale: lo stesso "tipo" del report passa al suo intervento.
- Niente conversione di vocabolario nei dashboard di report+intervento aggregato.
- Validazione client-side semplificata: stesso array per entrambi.
- DRY: una sola sorgente di label, color, icon.

**Contro**:
- Termini come "correttiva" sono meno descrittivi di "reattivo" (proposto nel briefing) per il contesto interventi-su-segnalazione. Mitigato dal fatto che la maggior parte degli interventi nasce da `origin='report'` dove il type è ereditato e non scelto.
- Il dizionario `INTERVENTION_STATUSES` introduce nuove label specifiche (`bozza`, `pianificato`, `confermato`, `in_corso`, `completato`, `annullato`) che non hanno equivalenti in `reports.status`. Coesistenza accettata.

## Riferimenti

- `src/lib/constants.js` linee 16-28 (`REPORT_TYPES`, `SEVERITY`)
- `src/lib/interventions.js` (re-export + `INTERVENTION_STATUSES` + `defaultsForOrigin`)
- `supabase/migrations/053_create_interventions.sql` (CHECK constraints)
