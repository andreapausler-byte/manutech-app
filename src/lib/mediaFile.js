// Nome file leggibile per le foto scaricate dalla galleria macchina.
//
// Quello che esce dallo storage si chiama `1712345678-IMG_0042.jpg`: dentro
// una mail a un fornitore non dice niente e in una cartella Download non si
// ritrova più. Qui diventa `Riempitrice_2026-03-12_TK-26100-01_2.jpg`.

const slug = (value) => (value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // via gli accenti
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)

const extension = (url, type) => {
  const last = String(url || '').split('?')[0].split('/').pop() || ''
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(last)
  if (match) return match[1].toLowerCase()
  return type === 'video' ? 'mp4' : 'jpg'
}

// item: riga del feed (taken_at, source_label) o attachment (uploaded_at,
// promoted_from.label). index: posizione in galleria, per non ritrovarsi due
// file identici quando la stessa segnalazione ha più foto nello stesso giorno.
export function galleryFileName(item, machineName, index = null) {
  const parts = []
  if (machineName) parts.push(slug(machineName))

  const when = item?.taken_at || item?.uploaded_at
  if (when) {
    const date = new Date(when)
    if (!Number.isNaN(date.getTime())) parts.push(date.toISOString().slice(0, 10))
  }

  const label = item?.source_label || item?.promoted_from?.label
  if (label) parts.push(slug(label))

  if (parts.length === 0) parts.push('foto')
  if (typeof index === 'number') parts.push(String(index + 1))

  return `${parts.join('_')}.${extension(item?.url, item?.type)}`
}
