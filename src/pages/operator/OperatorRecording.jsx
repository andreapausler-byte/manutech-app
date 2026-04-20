import { useEffect } from 'react'
import Waveform from '../../components/operator/Waveform'

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function OperatorRecording({ state, elapsedMs, onStop }) {
  // Sicurezza: se torniamo idle (es. audio troppo breve), il parent gestisce il routing.

  useEffect(() => {
    // Impedisce zoom/selezione mentre si tiene premuto
    document.body.style.userSelect = 'none'
    return () => { document.body.style.userSelect = '' }
  }, [])

  if (state === 'transcribing') {
    return (
      <div className="op-rec-screen" aria-live="polite">
        <div className="op-spin" aria-label="Trascrizione in corso" role="status" />
        <div className="op-rec-release" style={{ marginTop: 22 }}>Trascrizione in corso…</div>
      </div>
    )
  }

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
