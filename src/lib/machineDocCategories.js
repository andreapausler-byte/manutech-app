/**
 * Le cartelle documentali di un macchinario.
 *
 * `id` è il valore che finisce in `attachment.category`, ed è la stessa
 * whitelist che la RPC `add_machine_attachment` (migration 061) applica
 * lato server: aggiungere una voce qui senza aggiungerla anche là
 * produce upload rifiutati con "Categoria non ammessa".
 *
 * Icone e colori restano nella scheda admin, che è l'unica a mostrarle
 * come cartelle: qui vive solo quello che serve da entrambe le parti.
 */

export const MACHINE_DOC_CATEGORIES = [
  { id: 'foto', label: 'Galleria Foto', desc: 'Foto, targhette, dettagli installazione', uploadType: 'image' },
  { id: 'scheda_tecnica', label: 'Schede Tecniche', desc: 'Datasheet, schemi elettrici, P&ID', uploadType: 'pdf' },
  { id: 'manuale_uso', label: "Istruzioni d'Uso", desc: 'Avvio, arresto, funzionamento', uploadType: 'pdf' },
  { id: 'manuale_manutenzione', label: 'Manutenzione', desc: 'Procedure preventive e CIP', uploadType: 'pdf' },
  { id: 'intervento_esterno', label: 'Ditta Esterna', desc: 'Rapporti tecnici esterni e fornitori', uploadType: 'pdf' },
  { id: 'contratto_manutenzione', label: 'Contratti Manut.', desc: 'Contratti attivi e scadenze SLA', uploadType: 'pdf' },
  { id: 'certificato', label: 'Certificati', desc: 'Dichiarazioni CE, ispezioni, tarature', uploadType: 'pdf' },
]

export const MACHINE_DOC_CATEGORY_BY_ID = Object.fromEntries(
  MACHINE_DOC_CATEGORIES.map(c => [c.id, c])
)

// Le cartelle in cui si carica dal campo: tutte tranne le foto, che
// hanno il loro tasto nel tab Foto.
export const FIELD_DOC_CATEGORIES = MACHINE_DOC_CATEGORIES.filter(c => c.id !== 'foto')

export const categoryLabel = (id) => MACHINE_DOC_CATEGORY_BY_ID[id]?.label || id
