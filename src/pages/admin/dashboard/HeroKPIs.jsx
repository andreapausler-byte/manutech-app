export default function HeroKPIs({ stats, resolveRate, urgenti, nonAssegnate }) {
  const cards = [
    {
      label: 'APERTI',
      value: stats.aperte,
      color: 'var(--color-red)',
    },
    {
      label: 'IN CORSO',
      value: stats.assegnate + stats.inCorso,
      color: 'var(--color-cyan)',
    },
    {
      label: 'COMPLETATI',
      value: stats.risolte,
      color: 'var(--color-green)',
    },
    {
      label: 'MACCHINE FERME',
      value: urgenti,
      color: 'var(--color-orange)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {cards.map(({ label, value, color }) => (
        <div key={label} style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '14px 12px',
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: 28, fontWeight: 700, color,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.1,
          }}>
            {value}
          </p>
          <p style={{
            fontSize: 10, color: 'var(--color-text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            marginTop: 6,
          }}>
            {label}
          </p>
        </div>
      ))}
    </div>
  )
}
