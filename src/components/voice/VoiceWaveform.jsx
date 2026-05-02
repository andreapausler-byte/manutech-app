import { useEffect, useState } from 'react'

const BARS = 28
const TICK_MS = 80

/**
 * VoiceWaveform — visualizzazione waveform pseudo-casuale durante registrazione.
 * Usa il design system mobile (var(--color-primary)) anziché le classi .op-*.
 */
export default function VoiceWaveform({ active = true, color = 'var(--color-primary)' }) {
  const [heights, setHeights] = useState(() => Array.from({ length: BARS }, () => 30))

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setHeights(prev => prev.map((_, i) => {
        const centerBoost = 1 - Math.abs(i - BARS / 2) / (BARS / 2)
        const base = 15 + centerBoost * 35
        const jitter = Math.random() * 45
        return Math.min(100, base + jitter)
      }))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [active])

  return (
    <div
      role="presentation"
      aria-hidden="true"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 3, height: 80, width: '100%', maxWidth: 320,
      }}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 4,
            height: `${h}%`,
            background: color,
            borderRadius: 2,
            transition: 'height 0.08s linear',
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  )
}
