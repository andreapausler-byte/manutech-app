/**
 * SuccessAnimation — Overlay fullscreen con checkmark animato
 * 
 * Si mostra dopo un'azione importante (es. report inviato) per 1.8 secondi,
 * poi chiama onComplete per procedere alla schermata successiva.
 */

import { useEffect } from 'react'

export default function SuccessAnimation({ message = 'Fatto!', subtitle, onComplete, duration = 1800 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onComplete])

  return (
    <div className="fixed inset-0 z-[100] bg-base/95 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
      {/* Checkmark circle */}
      <div className="success-ring relative w-24 h-24 mb-6">
        {/* Outer ring animation */}
        <svg className="w-full h-full success-circle" viewBox="0 0 96 96">
          <circle
            cx="48" cy="48" r="44"
            fill="none"
            stroke="#22c55e"
            strokeWidth="3"
            strokeLinecap="round"
            className="success-circle-path"
          />
        </svg>

        {/* Inner filled circle */}
        <div className="absolute inset-2 bg-emerald-500/15 rounded-full success-fill" />

        {/* Checkmark SVG */}
        <svg className="absolute inset-0 w-full h-full p-6" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12.5L9.5 18L20 6"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="success-check-path"
          />
        </svg>
      </div>

      {/* Text */}
      <p className="text-2xl font-bold text-themed success-text-enter">{message}</p>
      {subtitle && (
        <p className="text-base text-muted mt-2 success-text-enter" style={{ animationDelay: '150ms' }}>
          {subtitle}
        </p>
      )}

      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="success-particle absolute w-1.5 h-1.5 rounded-full"
            style={{
              left: '50%',
              top: '45%',
              background: i % 2 === 0 ? '#22c55e' : '#7c6aff',
              '--angle': `${i * 45}deg`,
              '--distance': `${60 + Math.random() * 40}px`,
              animationDelay: `${200 + i * 50}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
