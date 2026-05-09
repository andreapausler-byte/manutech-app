import { useEffect } from 'react'
import { Mic, X } from 'lucide-react'
import VoiceWaveform from './VoiceWaveform'

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * VoiceRecorder — schermata fullscreen per registrazione vocale.
 *
 * Da PR 3 Fase 0: la trascrizione gira in background dentro la review,
 * questa schermata è mostrata solo durante 'recording'.
 *
 * Props:
 *   elapsedMs   — durata registrazione corrente
 *   onStop      — callback per terminare la registrazione
 *   onCancel    — callback per annullare e tornare indietro
 *   title       — titolo opzionale visualizzato in alto
 *   hint        — testo descrittivo opzionale (es. "Descrivi il problema...")
 */
// eslint-disable-next-line no-unused-vars
export default function VoiceRecorder({ state, elapsedMs, onStop, onCancel, title, hint }) {
  useEffect(() => {
    document.body.style.userSelect = 'none'
    return () => { document.body.style.userSelect = '' }
  }, [])

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        padding: '20px 5vw',
      }}
    >
      {/* Header con close + titolo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annulla"
          className="press-scale"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--color-surface-2)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
          }}
        >
          <X size={18} />
        </button>
        {title && (
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
            letterSpacing: -0.2, margin: 0,
          }}>
            {title}
          </h2>
        )}
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
      }}>
        {/* REC indicator + timer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
          color: '#ef4444',
        }}>
          <span
            aria-hidden="true"
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#ef4444',
              animation: 'pulse 1s ease-in-out infinite',
            }}
          />
          REC
        </div>
        <div style={{
          fontSize: 48, fontWeight: 700,
          fontFamily: '"JetBrains Mono", monospace',
          color: 'var(--color-text)', letterSpacing: 1,
        }}>
          {formatMs(elapsedMs)}
        </div>
        <VoiceWaveform active />
        {hint && (
          <div style={{
            fontSize: 13, color: 'var(--color-text-muted)',
            textAlign: 'center', maxWidth: 280, marginTop: 8,
          }}>
            {hint}
          </div>
        )}

        {/* Stop button (centralized big circle) */}
        <button
          type="button"
          onPointerUp={() => onStop?.()}
          onClick={() => onStop?.()}
          aria-label="Termina registrazione"
          className="press-scale"
          style={{
            width: 88, height: 88, borderRadius: '50%',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            boxShadow: '0 12px 30px rgba(239, 68, 68, 0.5)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 8,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: '#fff',
            }}
          />
        </button>
        <div style={{
          fontSize: 12, color: 'var(--color-text-muted)',
          letterSpacing: 0.5, textTransform: 'uppercase',
        }}>
          Tocca per terminare
        </div>
      </div>
    </div>
  )
}

VoiceRecorder.defaultIcon = Mic
