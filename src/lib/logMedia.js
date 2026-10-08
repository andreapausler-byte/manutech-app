/**
 * Allegati di un intervento registrato (`maintenance_logs.media`).
 *
 * Nel tempo ci sono finiti tre formati: { type: 'photo' | 'document' }
 * dalla Home del tecnico, { type: 'image' | 'pdf' | 'document', category }
 * dal modulo della scheda macchina, { type: 'photo' | 'pdf' } dal picker
 * della v5.31. Chi li legge passa da qui e non guarda `type` da solo.
 *
 * Le foto entrano da sole nella galleria della macchina (get_machine_media,
 * migration 060, accetta 'photo' e 'image'); i PDF nella biblioteca
 * dell'assistente al prossimo reindex (ingest-knowledge riconosce
 * type 'pdf' o il nome che finisce in .pdf).
 */

export const isPdfMedia = (m) =>
  m?.type === 'pdf' || /\.pdf$/i.test(m?.name || '')

export const isPhotoMedia = (m) =>
  !isPdfMedia(m) && (m?.type === 'photo' || m?.type === 'image')

export function logMediaList(log) {
  return Array.isArray(log?.media) ? log.media.filter(m => m?.url) : []
}

// Con un PDF allegato conviene rilanciare l'indicizzazione della macchina:
// il foglio della ditta diventa consultabile dall'assistente.
export const hasPdfMedia = (media) => (media || []).some(isPdfMedia)

// Con una foto conviene ricaricare la galleria della macchina.
export const hasPhotoMedia = (media) => (media || []).some(isPhotoMedia)
