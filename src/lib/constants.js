export const ROLES = {
  operatore: { label: 'Operatore', color: '#7c6aff', icon: '👷' },
  tecnico: { label: 'Tecnico', color: '#22c55e', icon: '🔧' },
  admin: { label: 'Admin', color: '#f59e0b', icon: '🛡️' },
}

export const STATUS = {
  aperta: { label: 'Aperta', color: '#ff5c5c', bg: 'rgba(255,92,92,0.10)', icon: '⚠' },
  assegnata: { label: 'Assegnata', color: '#ffaa2c', bg: 'rgba(255,170,44,0.10)', icon: '→' },
  in_lavorazione: { label: 'In Corso', color: '#00d4ff', bg: 'rgba(0,212,255,0.10)', icon: '⚡' },
  in_attesa_ricambi: { label: 'Attesa Ricambi', color: '#ffe066', bg: 'rgba(255,224,102,0.10)', icon: '⏳' },
  risolta: { label: 'Completato', color: '#3ddc84', bg: 'rgba(61,220,132,0.10)', icon: '✓' },
  chiuso: { label: 'Chiuso', color: '#5a5a72', bg: 'rgba(90,90,114,0.10)', icon: '✗' },
}

export const REPORT_TYPES = {
  correttiva: { label: 'Correttiva', color: '#ef4444', bg: '#ef444422', icon: '🔧' },
  preventiva: { label: 'Preventiva', color: '#7c6aff', bg: '#7c6aff22', icon: '📅' },
  migliorativa: { label: 'Migliorativa', color: '#22c55e', bg: '#22c55e22', icon: '💡' },
  ispezione: { label: 'Ispezione', color: '#a855f7', bg: '#a855f722', icon: '🔍' },
}

export const SEVERITY = {
  bassa: { label: 'Bassa', color: '#3ddc84', bg: 'rgba(61,220,132,0.10)' },
  media: { label: 'Media', color: '#ffe066', bg: 'rgba(255,224,102,0.10)' },
  alta: { label: 'Alta', color: '#ffaa2c', bg: 'rgba(255,170,44,0.10)' },
  critica: { label: 'Critica', color: '#ff5c5c', bg: 'rgba(255,92,92,0.10)' },
}

export const ORDER_STATUS = {
  richiesto:  { label: 'Da elaborare',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  preventivo: { label: 'Preventivo',         color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  ordinato:   { label: 'Ordinato',           color: '#06b6d4', bg: 'rgba(6,182,212,0.10)' },
  spedito:    { label: 'Spedito',            color: '#7c6aff', bg: 'rgba(124,106,255,0.10)' },
  ricevuto:   { label: 'Ricevuto',           color: '#3ddc84', bg: 'rgba(61,220,132,0.10)' },
  installato: { label: 'Installato',         color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
}

// I 4 stadi principali visualizzati nella progress bar (lato tecnico).
// Mappa lo status interno sull'indice (0-3) dello stage attivo.
export const ORDER_STAGES = [
  { key: 'richiesto',  label: 'Nuova richiesta' },
  { key: 'preventivo', label: 'Preventivo richiesto' },
  { key: 'ordinato',   label: 'Preventivo accettato' },
  { key: 'ricevuto',   label: 'Ricambio ricevuto' },
]

// Restituisce 0..3 a seconda dello stato dell'ordine.
// 'spedito' rientra nello stage 2 (ordinato), 'installato' nello stage 3.
export function orderStageIndex(status) {
  if (status === 'richiesto') return 0
  if (status === 'preventivo') return 1
  if (status === 'ordinato' || status === 'spedito') return 2
  if (status === 'ricevuto' || status === 'installato') return 3
  return 0
}

// ── Tipi di "richiesta esterna" ──
// Una richiesta esterna è qualunque cosa il team aspetti dall'esterno per
// chiudere un ticket: un ricambio fisico oppure un intervento di un
// fornitore/tecnico esterno. Stesso lifecycle, UI ed entità a livello DB
// (spare_part_orders.kind), cambia solo il significato e qualche campo.
export const REQUEST_KIND = {
  ricambio:   { label: 'Ricambio',           short: 'Ricambio',  icon: '📦', color: '#7c6aff' },
  intervento: { label: 'Intervento esterno', short: 'Intervento', icon: '👤', color: '#06b6d4' },
}

// Label specifiche per stadio in base al tipo di richiesta.
// Per intervento: stage 2 è "Intervento programmato", stage 3 è "Intervento completato".
const STAGE_LABELS_BY_KIND = {
  ricambio: ['Nuova richiesta', 'Preventivo richiesto', 'Preventivo accettato', 'Ricambio ricevuto'],
  intervento: ['Nuova richiesta', 'Preventivo richiesto', 'Intervento programmato', 'Intervento completato'],
}
export function stageLabel(stage, kind = 'ricambio') {
  const arr = STAGE_LABELS_BY_KIND[kind] || STAGE_LABELS_BY_KIND.ricambio
  return arr[stage] || ''
}

// Label dello status interno specifica per kind.
// Es. per intervento, 'ordinato' diventa 'Programmato', 'ricevuto' diventa 'Completato'.
export function statusLabel(status, kind = 'ricambio') {
  if (kind === 'intervento') {
    if (status === 'ordinato') return 'Programmato'
    if (status === 'spedito') return 'In arrivo'
    if (status === 'ricevuto') return 'Completato'
    if (status === 'installato') return 'Chiuso'
  }
  return ORDER_STATUS[status]?.label || status
}

export const SPARE_URGENCY = {
  bassa:   { label: 'Bassa',   color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' },
  media:   { label: 'Media',   color: '#06b6d4', bg: 'rgba(6,182,212,0.10)' },
  alta:    { label: 'Alta',    color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  urgente: { label: 'Urgente', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

// ── Anagrafica fornitori esterni ──
export const SUPPLIER_SPECIALTIES = {
  elettrico: { label: 'Elettrico', icon: '⚡', color: '#f59e0b' },
  meccanico: { label: 'Meccanico', icon: '⚙️', color: '#7c6aff' },
  pneumatico: { label: 'Pneumatico', icon: '💨', color: '#06b6d4' },
  idraulico: { label: 'Idraulico', icon: '💧', color: '#3b82f6' },
  refrigerazione: { label: 'Refrigerazione', icon: '❄️', color: '#22d3ee' },
  elettronico: { label: 'Elettronico', icon: '🔌', color: '#a855f7' },
  antincendio: { label: 'Antincendio', icon: '🧯', color: '#ef4444' },
  saldatura: { label: 'Saldatura', icon: '🔥', color: '#f97316' },
  automazione: { label: 'Automazione', icon: '🤖', color: '#10b981' },
  altro: { label: 'Altro', icon: '🛠️', color: '#6b7280' },
}

export const SUPPLIER_AVAILABILITY = {
  feriali: { label: 'Feriali (lun-ven)', icon: '📅' },
  h24: { label: 'H24 / 7gg', icon: '🌙' },
  weekend: { label: 'Weekend inclusi', icon: '📆' },
  su_chiamata: { label: 'Su chiamata', icon: '📞' },
}

// ── Quick Report Templates ────────────────────────────────
// Problemi comuni precompilati per report in 3 tap
// extraFields: campi dinamici mostrati nel form rapido
export const QUICK_TEMPLATES = [
  {
    id: 'perdita',
    icon: '💧',
    label: 'Perdita',
    title: 'Perdita rilevata',
    description: 'Perdita di fluido rilevata sul macchinario. Richiede intervento.',
    severity: 'alta',
    color: '#7c6aff',
    extraFields: [
      { key: 'fluid_type', label: 'Tipo fluido', type: 'select', options: ['Acqua', 'Olio', 'Refrigerante', 'Aria compressa', 'Altro'] },
      { key: 'leak_size', label: 'Entità', type: 'select', options: ['Gocciolamento', 'Flusso costante', 'Getto'] },
    ],
  },
  {
    id: 'rumore',
    icon: '🔊',
    label: 'Rumore anomalo',
    title: 'Rumore anomalo',
    description: 'Rumore insolito rilevato durante il funzionamento.',
    severity: 'media',
    color: '#f59e0b',
    extraFields: [
      { key: 'noise_type', label: 'Tipo rumore', type: 'select', options: ['Cigolio', 'Battito', 'Ronzio', 'Sibilo', 'Scoppio'] },
      { key: 'noise_frequency', label: 'Frequenza', type: 'select', options: ['Costante', 'Intermittente', 'Solo a carico'] },
    ],
  },
  {
    id: 'blocco',
    icon: '🛑',
    label: 'Blocco',
    title: 'Macchinario bloccato',
    description: 'Il macchinario si è arrestato e non riparte. Linea ferma.',
    severity: 'critica',
    color: '#ef4444',
    extraFields: [
      { key: 'line_stopped', label: 'Linea ferma?', type: 'select', options: ['Sì, produzione ferma', 'No, bypass attivo', 'Parziale'] },
      { key: 'error_code', label: 'Codice errore (se visibile)', type: 'text', placeholder: 'Es. E-401' },
    ],
  },
  {
    id: 'surriscaldamento',
    icon: '🌡️',
    label: 'Surriscaldamento',
    title: 'Surriscaldamento rilevato',
    description: 'Temperatura anomala rilevata. Possibile surriscaldamento.',
    severity: 'alta',
    color: '#f97316',
    extraFields: [
      { key: 'temp_zone', label: 'Zona calda', type: 'select', options: ['Motore', 'Cuscinetti', 'Quadro elettrico', 'Superficie generale'] },
      { key: 'temp_estimate', label: 'Temperatura stimata', type: 'select', options: ['Tiepido (40-60°C)', 'Caldo (60-80°C)', 'Molto caldo (80-100°C)', 'Estremo (>100°C)'] },
    ],
  },
  {
    id: 'vibrazione',
    icon: '📳',
    label: 'Vibrazione',
    title: 'Vibrazione anomala',
    description: 'Vibrazioni eccessive rilevate durante il funzionamento.',
    severity: 'media',
    color: '#a855f7',
    extraFields: [
      { key: 'vibration_intensity', label: 'Intensità', type: 'select', options: ['Leggera', 'Moderata', 'Forte', 'Molto forte'] },
      { key: 'vibration_when', label: 'Quando', type: 'select', options: ['Sempre', 'Solo a regime', 'Solo in avvio', 'A velocità specifiche'] },
    ],
  },
  {
    id: 'usura',
    icon: '⚙️',
    label: 'Usura',
    title: 'Componente usurato',
    description: 'Componente visibilmente usurato. Pianificare sostituzione.',
    severity: 'bassa',
    color: '#22c55e',
    extraFields: [
      { key: 'wear_component', label: 'Componente', type: 'text', placeholder: 'Es. cinghia, guarnizione...' },
      { key: 'wear_urgency', label: 'Urgenza sostituzione', type: 'select', options: ['Prossima manutenzione', 'Entro 1 settimana', 'Entro 48h', 'Immediata'] },
    ],
  },
]

// ── localStorage keys per chat diretta (demo mode) ──
export const DM_KEYS = {
  conversations: 'manutech_conversations',
  directMessages: 'manutech_direct_messages',
  dmReads: 'manutech_dm_reads',
}

export const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'adesso'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min fa`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h fa`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}g fa`
  return formatDate(dateStr)
}
