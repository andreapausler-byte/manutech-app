/**
 * AISummaryCard — riassunto AI on-demand riutilizzabile (admin desktop).
 *
 * Bottone "Riassunto AI" che, al click, chiama l'Edge Function `summarize`
 * (Sonnet 4.6 default, Opus 4.8 su "Approfondito") sugli `items` forniti e
 * mostra il risultato in una card. Incarna l'ADR-010 anti-pattern #4: output
 * sempre marcato "generato da AI", potenza scegliibile, rigenerabile e
 * richiudibile in 1 tap. L'utente ha l'ultima parola.
 *
 * Props:
 *   kind        — 'agenda' | 'machine_history' | 'intervention'
 *   items       — array di oggetti (già RLS-scoped lato client) o funzione che
 *                 li ritorna al momento del click
 *   meta        — oggetto opzionale di contesto (es. { machine, periodo })
 *   buttonLabel — etichetta del bottone collassato
 *   emptyHint   — messaggio se non c'è nulla da riassumere
 *   compact     — padding ridotto
 *   autoRun     — parte già aperto e genera al mount (per uso embedded in sidebar)
 *   hideClose   — nasconde la X interna (il contenitore fornisce la chiusura)
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, RefreshCw, X, AlertCircle } from 'lucide-react'
import { generateSummary } from '../../lib/assistant'
import { renderMarkdown } from '../../lib/markdown'
import { useAIPower } from '../../hooks/useAIPower'
import AIPowerSelector from '../ui/AIPowerSelector'

const POWER_LABEL = { veloce: 'Veloce', equilibrato: 'Equilibrato', approfondito: 'Approfondito' }

export default function AISummaryCard({
  kind,
  items,
  meta,
  buttonLabel = 'Riassunto AI',
  emptyHint = 'Niente da riassumere al momento.',
  compact = false,
  autoRun = false,
  hideClose = false,
}) {
  const { power, setPower } = useAIPower()
  const [open, setOpen] = useState(autoRun)
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [content, setContent] = useState('')
  const [usedPower, setUsedPower] = useState(null)
  const [error, setError] = useState(null)
  const autoRanRef = useRef(false)

  const run = async (chosenPower) => {
    const list = typeof items === 'function' ? items() : items
    if (!Array.isArray(list) || list.length === 0) {
      setError(emptyHint)
      setStatus('error')
      setOpen(true)
      return
    }
    setOpen(true)
    setStatus('loading')
    setError(null)
    try {
      const resp = await generateSummary({ kind, items: list, meta, power: chosenPower || power })
      setContent(resp?.content || '')
      setUsedPower(resp?.power || chosenPower || power)
      setStatus('done')
    } catch (e) {
      const msg = e?.message === 'DEMO_MODE'
        ? 'Riassunto AI non disponibile in modalità demo.'
        : (e?.message || 'Errore nella generazione del riassunto.')
      setError(msg)
      setStatus('error')
    }
  }

  const close = () => {
    setOpen(false)
    setStatus('idle')
    setContent('')
    setError(null)
  }

  // Uso embedded (sidebar): apri e genera al mount, una sola volta.
  useEffect(() => {
    if (autoRun && !autoRanRef.current) {
      autoRanRef.current = true
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => run()}
        className="press-scale"
        style={ctaStyle(compact)}
      >
        <Sparkles size={15} />
        {buttonLabel}
      </button>
    )
  }

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border-active)',
        background: 'var(--color-surface-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header: badge AI + selettore potenza + chiudi */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-primary-glow)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--color-primary)' }}>
          <Sparkles size={14} />
          Generato da AI
          {usedPower && <span style={{ opacity: 0.7, fontWeight: 600 }}>· {POWER_LABEL[usedPower] || usedPower}</span>}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AIPowerSelector value={power} onChange={setPower} compact />
          {!hideClose && (
            <button
              type="button"
              onClick={close}
              aria-label="Chiudi riassunto"
              title="Chiudi"
              style={iconBtn}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: compact ? 12 : 14 }}>
        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" />
            Sto leggendo i dati e preparo il riassunto…
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-danger)', fontSize: 13 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {status === 'done' && (
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text)' }}>
            {renderMarkdown(content)}
          </div>
        )}
      </div>

      {/* Footer: rigenera */}
      {(status === 'done' || status === 'error') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 12px' }}>
          <button
            type="button"
            onClick={() => run()}
            className="press-scale"
            style={{ ...ctaStyle(true), background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
          >
            <RefreshCw size={14} />
            Rigenera
          </button>
        </div>
      )}
    </div>
  )
}

const ctaStyle = (compact) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: compact ? '8px 12px' : '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 11,
  border: '1px solid var(--color-border-active)',
  background: 'var(--color-primary-glow)',
  color: 'var(--color-primary)',
  cursor: 'pointer',
})

const iconBtn = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
