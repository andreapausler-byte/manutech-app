import { Sparkles, PenLine, ArrowLeft } from 'lucide-react'
import VoiceMediaPicker from './VoiceMediaPicker'

/**
 * VoiceReviewShell — guscio review condiviso per i flow vocali.
 *
 * Layout:
 *   - Header: back button + titolo + badge AI/manuale
 *   - Banner errore (se presente)
 *   - Trascrizione (textarea editabile, opzionale)
 *   - Slot {children}: campi specifici per context (passati dal parent)
 *   - Action row: Annulla / Submit
 *
 * Props:
 *   title           — string, intestazione
 *   transcription   — string, testo trascritto
 *   setTranscription— setter per editare la trascrizione (può essere null per nascondere)
 *   error           — string opzionale, mostrato in banner
 *   loading         — bool, disabilita i bottoni durante submit
 *   onCancel        — callback annulla
 *   onSubmit        — callback submit
 *   submitLabel     — label bottone submit (default "Invia")
 *   submitDisabled  — bool, disabilita submit
 *   confidence      — number 0-100 opzionale, mostrato come chip
 *   children        — campi specifici per context
 */
export default function VoiceReviewShell({
  title,
  transcription,
  setTranscription,
  error,
  loading = false,
  onCancel,
  onSubmit,
  submitLabel = 'Invia',
  submitDisabled = false,
  confidence,
  children,
  media,
  setMedia,
  mediaUploadPath = 'voice-attachments',
}) {
  const showMedia = !!setMedia
  const isManual = !transcription
  const showConfidence = typeof confidence === 'number' && transcription

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      {/* Header */}
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: 'var(--color-surface-1)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 1,
      }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Indietro"
          disabled={loading}
          className="press-scale"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--color-surface-2)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.4 : 1,
            color: 'var(--color-text-muted)',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
            letterSpacing: -0.2, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </h2>
        </div>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 5vw 100px' }}>
        {/* Badge AI/manuale + confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 8,
            background: isManual ? 'var(--color-surface-2)' : 'rgba(124, 106, 255, 0.12)',
            color: isManual ? 'var(--color-text-secondary)' : 'var(--color-primary)',
            fontSize: 12, fontWeight: 600,
            border: isManual ? '1px solid var(--color-border)' : '1px solid rgba(124, 106, 255, 0.3)',
          }}>
            {isManual ? <PenLine size={13} /> : <Sparkles size={13} />}
            {isManual ? 'Compilazione manuale' : 'AI Whisper · Trascritto'}
          </span>
          {showConfidence && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '6px 10px', borderRadius: 8,
              background: confidence >= 80
                ? 'rgba(34, 197, 94, 0.12)'
                : confidence >= 60
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
              color: confidence >= 80
                ? '#22c55e'
                : confidence >= 60
                  ? '#f59e0b'
                  : '#ef4444',
              fontSize: 11, fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              {confidence}% confidence
            </span>
          )}
        </div>

        {/* Errore */}
        {error && (
          <div role="status" style={{
            padding: 12, borderRadius: 10, marginBottom: 16,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#f59e0b',
            fontSize: 13, lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        {/* Trascrizione editabile (opzionale) */}
        {setTranscription && (
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="voice-transcript"
              style={{
                display: 'block', fontSize: 13, fontWeight: 700,
                color: 'var(--color-text)', marginBottom: 8,
              }}
            >
              Trascrizione
            </label>
            <textarea
              id="voice-transcript"
              value={transcription || ''}
              onChange={(e) => setTranscription(e.target.value)}
              placeholder="Descrivi il problema o aggiungi dettagli…"
              rows={4}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                color: 'var(--color-text)',
                fontSize: 14, fontFamily: 'inherit',
                resize: 'vertical', minHeight: 80,
              }}
            />
          </div>
        )}

        {/* Slot per i campi specifici per context */}
        {children}

        {/* Media picker (foto/allegati) — opzionale */}
        {showMedia && (
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <VoiceMediaPicker
              media={media || []}
              setMedia={setMedia}
              uploadPath={mediaUploadPath}
              disabled={loading}
            />
          </div>
        )}
      </div>

      {/* Sticky action row */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 10,
        padding: '12px 5vw',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: 'var(--color-surface-1)',
        borderTop: '1px solid var(--color-border)',
      }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="press-scale"
          style={{
            padding: '14px 20px', borderRadius: 12,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || submitDisabled}
          className="press-scale"
          style={{
            flex: 1,
            padding: '14px 20px', borderRadius: 12,
            background: (loading || submitDisabled)
              ? 'var(--color-surface-3)'
              : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            border: 'none',
            color: '#fff',
            fontSize: 15, fontWeight: 700,
            cursor: (loading || submitDisabled) ? 'not-allowed' : 'pointer',
            boxShadow: (loading || submitDisabled)
              ? 'none'
              : '0 6px 18px rgba(124, 58, 237, 0.35)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Invio…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
