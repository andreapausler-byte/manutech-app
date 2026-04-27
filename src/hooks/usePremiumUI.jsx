/**
 * useCountUp — Animazione count-up per numeri KPI
 *
 * Uso:
 *   const displayValue = useCountUp(targetValue, { duration: 800 })
 *   <span className="count-up">{displayValue}</span>
 */

/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useRef } from 'react'

export function useCountUp(target, { duration = 800, enabled = true } = {}) {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)
  const rafId = useRef(null)

  useEffect(() => {
    if (!enabled || typeof target !== 'number') {
      setValue(target || 0)
      return
    }

    const start = prevTarget.current
    const diff = target - start
    if (diff === 0) return

    const startTime = performance.now()

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out expo
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(start + diff * eased))

      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate)
      } else {
        prevTarget.current = target
      }
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [target, duration, enabled])

  return value
}

/**
 * CountUp — Componente wrapper per animazione count-up
 */
export function CountUp({ value, duration = 800, className = '' }) {
  const display = useCountUp(value, { duration })
  return <span className={`count-up ${className}`}>{display}</span>
}

/**
 * avatarGradient — Genera un gradient unico e deterministico dal nome utente
 *
 * Uso:
 *   const gradient = avatarGradient('Mario Rossi')
 *   style={{ background: gradient }}
 */
const AVATAR_COLORS = [
  ['#7c6aff', '#00d4ff'],
  ['#f59e0b', '#ef4444'],
  ['#22c55e', '#06b6d4'],
  ['#a855f7', '#ec4899'],
  ['#3b82f6', '#8b5cf6'],
  ['#f97316', '#fbbf24'],
  ['#14b8a6', '#3b82f6'],
  ['#e11d48', '#f59e0b'],
  ['#6366f1', '#06b6d4'],
  ['#84cc16', '#22d3ee'],
]

export function avatarGradient(name) {
  if (!name) return 'linear-gradient(135deg, #7c6aff, #00d4ff)'
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const pair = AVATAR_COLORS[hash % AVATAR_COLORS.length]
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`
}

/**
 * getAmbientColors — Restituisce i colori ambient per il tab corrente
 */
export function getAmbientColors(tab) {
  switch (tab) {
    case 'dashboard': case 'home':
      return { color: 'rgba(124, 106, 255, 0.05)', color2: 'rgba(0, 212, 255, 0.03)' }
    case 'reports':
      return { color: 'rgba(255, 92, 92, 0.04)', color2: 'rgba(255, 170, 44, 0.03)' }
    case 'machines':
      return { color: 'rgba(34, 197, 94, 0.04)', color2: 'rgba(6, 182, 212, 0.03)' }
    case 'messages':
      return { color: 'rgba(0, 212, 255, 0.05)', color2: 'rgba(124, 106, 255, 0.03)' }
    case 'leaderboard':
      return { color: 'rgba(255, 215, 0, 0.04)', color2: 'rgba(245, 158, 11, 0.03)' }
    case 'maintenance':
      return { color: 'rgba(139, 92, 246, 0.04)', color2: 'rgba(168, 85, 247, 0.03)' }
    case 'wallet':
      return { color: 'rgba(124, 106, 255, 0.04)', color2: 'rgba(0, 212, 255, 0.04)' }
    default:
      return { color: 'rgba(124, 106, 255, 0.03)', color2: 'rgba(0, 212, 255, 0.02)' }
  }
}
