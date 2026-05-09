import { useEffect } from 'react'
import Waveform from '../../components/operator/Waveform'

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function OperatorRecording({ elapsedMs, onStop }) {
  // Da PR 3 Fase 0: la trascrizione gira in background dentro la review,
  // quindi questo schermo è mostrato solo durante la registrazione.

  useEffect(() => {
    // Impedisce zoom/selezione mentre si tiene premuto
    document.body.style.userSelect = 'none'
    return () => { document.body.style.userSelect = '' }
  }, [])

  return (
    <div className="op-rec-screen" aria-live="polite">
      <div className="op-rec-indicator">
        <span className="op-rec-dot" aria-hidden="true" />
        REC
      </div>
      <div className="op-timer op-mono" aria-label="Durata registrazione">
        {formatMs(elapsedMs)}
      </div>
      <Waveform active />
      <button
        type="button"
        className="op-stop-btn"
        onPointerUp={() => onStop?.()}
        onClick={() => onStop?.()}
        aria-label="Termina registrazione"
      >
        <span className="op-stop-btn__square" />
      </button>
      <div className="op-rec-release">Rilascia per terminare</div>
    </div>
  )
}
