// Mappa impianto — quello che serve fuori dalla mappa (menu, liste),
// senza tirarsi dietro il disegno. La planimetria vera è in `plants.js`.

import { isReportOpen } from '../constants'

// Quale organizzazione ha una planimetria. Per ora una sola: la mappa
// è il disegno di uno stabilimento preciso, non va mostrata ad altre org.
// `default` è l'org storica di Birra Amarcord; `demo-org` è il demo mode.
const PLANT_BY_ORG = {
  default: 'amarcord',
  'demo-org': 'amarcord',
}

export function plantKeyForOrg(orgId) {
  return PLANT_BY_ORG[orgId || 'default'] || null
}

export const hasPlantMap = (orgId) => Boolean(plantKeyForOrg(orgId))

// Da dove viene la posizione di un punto. `estimated` = punto tratteggiato,
// da verificare davanti alla macchina.
export const MAP_CONF = {
  dwg: { label: 'Dal disegno', estimated: false },
  layout: { label: 'Dal layout Beertec', estimated: false },
  media: { label: 'Probabile', estimated: true },
  stimata: { label: 'Stimata', estimated: true },
  area: { label: "Riferimento d'area", estimated: true },
  confermata: { label: 'Confermata', estimated: false },
}

const num = (v) => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}

// machines.map_position (migration 069) letto in un posto solo. Senza la
// colonna, o senza punto, la macchina è "da posizionare".
export function machineMapPosition(machine) {
  const p = machine?.map_position
  if (!p || typeof p !== 'object') return null
  const x = num(p.x), y = num(p.y)
  if (x == null || y == null) return null
  const conf = MAP_CONF[p.conf] ? p.conf : 'stimata'
  return {
    x, y, conf,
    estimated: MAP_CONF[conf].estimated,
    basis: typeof p.basis === 'string' ? p.basis : '',
    updatedAt: p.updated_at || null,
    updatedByName: p.updated_by_name || null,
  }
}

// Ticket che contano sulla mappa: aperti e non uniti a un altro.
export const isMapOpenReport = (r) => isReportOpen(r) && !r.duplicate_of_id

// ok = nessun ticket aperto · warn = ticket aperti · bad = almeno uno
// con gravità alta o critica.
export function mapStatus(openReports) {
  if (!openReports?.length) return 'ok'
  return openReports.some(r => r.severity === 'alta' || r.severity === 'critica') ? 'bad' : 'warn'
}
