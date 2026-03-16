export const ROLES = {
  operatore: { label: 'Operatore', color: '#3b82f6', icon: '👷' },
  tecnico: { label: 'Tecnico', color: '#22c55e', icon: '🔧' },
  admin: { label: 'Admin', color: '#f59e0b', icon: '🛡️' },
}

export const STATUS = {
  aperta: { label: 'Aperta', color: '#ff4757', bg: '#ff475722' },
  assegnata: { label: 'Assegnata', color: '#ffa502', bg: '#ffa50222' },
  in_lavorazione: { label: 'In Lavorazione', color: '#00d4ff', bg: '#00d4ff22' },
  in_attesa_ricambi: { label: 'Attesa Ricambi', color: '#ffd43b', bg: '#ffd43b22' },
  risolta: { label: 'Risolta', color: '#2ed573', bg: '#2ed57322' },
  chiuso: { label: 'Chiuso', color: '#8a8a9a', bg: '#8a8a9a22' },
}

export const REPORT_TYPES = {
  correttiva: { label: 'Correttiva', color: '#ef4444', bg: '#ef444422', icon: '🔧' },
  preventiva: { label: 'Preventiva', color: '#3b82f6', bg: '#3b82f622', icon: '📅' },
  migliorativa: { label: 'Migliorativa', color: '#22c55e', bg: '#22c55e22', icon: '💡' },
  ispezione: { label: 'Ispezione', color: '#a855f7', bg: '#a855f722', icon: '🔍' },
}

export const SEVERITY = {
  bassa: { label: 'Bassa', color: '#22c55e', bg: '#22c55e22' },
  media: { label: 'Media', color: '#f59e0b', bg: '#f59e0b22' },
  alta: { label: 'Alta', color: '#f97316', bg: '#f9731622' },
  critica: { label: 'Critica', color: '#ef4444', bg: '#ef444422' },
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
    color: '#3b82f6',
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
