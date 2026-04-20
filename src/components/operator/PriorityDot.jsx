// Dot colorato per la severità/priorità di un report.
// Accetta sia i valori AI (alta/media/bassa) che i valori DB (critica).
const COLORS = {
  critica: '#e03c31',
  alta: '#e03c31',
  media: '#f59e0b',
  bassa: '#2a9d6e',
}

export default function PriorityDot({ priority, size = 10 }) {
  const color = COLORS[priority] || '#3d6b50'
  return (
    <span
      className="op-dot"
      aria-label={`Priorità ${priority || 'non definita'}`}
      style={{ background: color, width: size, height: size }}
    />
  )
}
