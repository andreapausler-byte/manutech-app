/**
 * AIPowerSelector — segmented control per la "Potenza AI".
 *
 * Tre livelli con etichette UMANE (mai nomi di modello in UI — ADR-010
 * anti-pattern #8): Veloce / Equilibrato / Approfondito. Il resolver
 * server-side li traduce in Haiku / Sonnet 4.6 / Opus 4.8.
 *
 * Props:
 *   value     — 'veloce' | 'equilibrato' | 'approfondito'
 *   onChange  — (level) => void
 *   compact   — solo icone, senza etichette (header stretti)
 */

import { Zap, Gauge, Brain } from 'lucide-react'

const LEVELS = [
  { value: 'veloce', label: 'Veloce', hint: 'Più rapida ed economica', Icon: Zap },
  { value: 'equilibrato', label: 'Equilibrato', hint: 'Consigliata — equilibrio qualità/costo', Icon: Gauge },
  { value: 'approfondito', label: 'Approfondito', hint: 'Ragiona di più: più lenta e costosa', Icon: Brain },
]

export default function AIPowerSelector({ value = 'equilibrato', onChange, compact = false }) {
  return (
    <div
      role="group"
      aria-label="Potenza AI"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        borderRadius: 12,
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {LEVELS.map(({ value: v, label, hint, Icon }) => {
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange?.(v)}
            title={hint}
            aria-pressed={active}
            aria-label={`Potenza AI: ${label}`}
            className="press-scale"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: compact ? '7px 9px' : '7px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 9,
              cursor: 'pointer',
              border: 'none',
              whiteSpace: 'nowrap',
              background: active ? 'var(--color-primary)' : 'transparent',
              color: active ? '#fff' : 'var(--color-text-secondary)',
              boxShadow: active ? 'var(--shadow-glow-primary)' : 'none',
            }}
          >
            <Icon size={14} strokeWidth={2.2} />
            {!compact && <span>{label}</span>}
          </button>
        )
      })}
    </div>
  )
}
