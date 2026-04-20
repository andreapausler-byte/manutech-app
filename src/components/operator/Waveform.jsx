import { useEffect, useState } from 'react'

// 28 barre verticali che oscillano ogni 80ms. Pseudo-casuale, non legato
// all'audio reale — serve solo a dare feedback che stiamo registrando.
const BARS = 28
const TICK_MS = 80

export default function Waveform({ active = true }) {
  const [heights, setHeights] = useState(() => Array.from({ length: BARS }, () => 30))

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setHeights(prev => prev.map((_, i) => {
        // Più centrale = più ampio (tipo onda)
        const centerBoost = 1 - Math.abs(i - BARS / 2) / (BARS / 2)
        const base = 15 + centerBoost * 35
        const jitter = Math.random() * 45
        return Math.min(100, base + jitter)
      }))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [active])

  return (
    <div className="op-wave" role="presentation" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className="op-wave__bar"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}
