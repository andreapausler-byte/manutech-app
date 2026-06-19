import { useEffect, useRef, useState } from 'react'
import { Mic, X, RefreshCw, Trash2, Send, CloudOff, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useHaptic } from '../../hooks/useHaptic'
import { useVoiceOutbox } from '../../hooks/useVoiceOutbox'
import { VOICE_CONTEXT_LABEL } from '../../lib/voiceOutbox'
import { timeAgo } from '../../lib/constants'

/**
 * PendingVoiceRecordings — sezione "Registrazioni in sospeso".
 *
 * Mostra gli audio vocali ancora da consegnare (salvati su IndexedDB). È il
 * paracadute del contratto "l'audio non si perde": finché un audio non è
 * stato consegnato resta qui, riascoltabile e ritentabile, e sparisce SOLO
 * con eliminazione manuale confermata.
 *
 * Renderizza:
 *  - un launcher compatto (pill) sopra la bottom-nav, visibile solo se c'è
 *    almeno un audio in sospeso;
 *  - un pannello fullscreen con la lista (play, riprova/completa, elimina).
 *
 * Nessuna rotta nuova: il pannello è un overlay controllato da stato locale.
 */
export default function PendingVoiceRecordings() {
  const { user } = useAuth()
  const { isOnline } = useOnlineStatus()
  const haptic = useHaptic()
  const { items, count, busy, flushAll, retry, remove, completeWithTitle } = useVoiceOutbox(user?.id)
  const [open, setOpen] = useState(false)

  if (count === 0) return null

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => { haptic.light(); setOpen(true) }}
          className="press-scale"
          aria-label={`${count} registrazioni vocali in sospeso`}
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(72px + env(safe-area-inset-bottom))',
            zIndex: 55,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 999,
            background: isOnline ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'var(--color-surface-3, #2a2a35)',
            color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 700,
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.4)',
          }}
        >
          {isOnline ? <Mic size={15} /> : <CloudOff size={15} />}
          {count} audio in sospeso
        </button>
      )}

      {open && (
        <PendingPanel
          items={items}
          isOnline={isOnline}
          busy={busy}
          onClose={() => setOpen(false)}
          onFlushAll={() => { haptic.medium(); flushAll() }}
          onRetry={(id) => { haptic.medium(); retry(id) }}
          onRemove={(id) => { haptic.warning?.(); remove(id) }}
          onComplete={completeWithTitle}
        />
      )}
    </>
  )
}

function PendingPanel({ items, isOnline, busy, onClose, onFlushAll, onRetry, onRemove, onComplete }) {
  // Object URL per il playback locale del Blob, creati/ripuliti col cambio lista.
  const [urls, setUrls] = useState({})
  const prevUrls = useRef({})

  useEffect(() => {
    const next = {}
    for (const it of items) {
      if (it.blob) next[it.id] = prevUrls.current[it.id] || URL.createObjectURL(it.blob)
    }
    // revoca quelli non più presenti
    for (const [id, url] of Object.entries(prevUrls.current)) {
      if (!next[id]) URL.revokeObjectURL(url)
    }
    prevUrls.current = next
    setUrls(next)
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url)
      prevUrls.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(',')])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg)', color: 'var(--color-text)',
      }}
    >
      <header style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: 'var(--color-surface-1)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button
          type="button" onClick={onClose} aria-label="Chiudi" className="press-scale"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--color-surface-2)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--color-text-muted)',
          }}
        >
          <X size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Registrazioni in sospeso
          </h2>
          <p style={{ fontSize: 12, margin: '2px 0 0', color: 'var(--color-text-muted)' }}>
            {items.length} audio salvati sul dispositivo
          </p>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 5vw 24px' }}>
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: 12, borderRadius: 10, marginBottom: 14,
            background: isOnline ? 'rgba(34, 197, 94, 0.10)' : 'rgba(245, 158, 11, 0.10)',
            border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            color: isOnline ? '#22c55e' : '#f59e0b',
            fontSize: 13, lineHeight: 1.4,
          }}
        >
          {isOnline ? <CheckCircle2 size={16} /> : <CloudOff size={16} />}
          {isOnline
            ? 'Sei online: gli audio vengono inviati e trascritti automaticamente.'
            : 'Sei offline: gli audio sono al sicuro e verranno inviati appena torna la linea.'}
        </div>

        {items.map((it) => (
          <PendingCard
            key={it.id}
            item={it}
            url={urls[it.id]}
            isOnline={isOnline}
            busy={busy}
            onRetry={onRetry}
            onRemove={onRemove}
            onComplete={onComplete}
          />
        ))}
      </div>

      {isOnline && items.some((i) => i.status !== 'needs_input') && (
        <div style={{
          flexShrink: 0, padding: '12px 5vw',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: 'var(--color-surface-1)', borderTop: '1px solid var(--color-border)',
        }}>
          <button
            type="button" onClick={onFlushAll} disabled={busy} className="press-scale"
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 12,
              background: busy ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {busy ? 'Invio…' : 'Invia tutti ora'}
          </button>
        </div>
      )}
    </div>
  )
}

const STATUS_META = {
  pending: { label: 'In attesa di invio', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  uploading: { label: 'Invio in corso…', color: 'var(--color-primary, #7c6aff)', bg: 'rgba(124, 106, 255, 0.12)' },
  failed: { label: 'Invio non riuscito', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  needs_input: { label: 'Manca il titolo', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
}

function PendingCard({ item, url, isOnline, busy, onRetry, onRemove, onComplete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState('')
  const meta = STATUS_META[item.status] || STATUS_META.pending
  const ctxLabel = VOICE_CONTEXT_LABEL[item.context] || 'Vocale'
  const needsInput = item.status === 'needs_input'

  return (
    <div style={{
      padding: 14, borderRadius: 14, marginBottom: 12,
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{ctxLabel}</span>
        {item.reportId && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>· ticket collegato</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
          {timeAgo(new Date(item.createdAt).toISOString())}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: meta.bg, color: meta.color,
          fontSize: 11, fontWeight: 700,
        }}>
          {item.status === 'uploading' && <Loader2 size={11} className="animate-spin" />}
          {item.status === 'failed' && <AlertTriangle size={11} />}
          {meta.label}
        </span>
        {item.transcription ? (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            “{item.transcription.slice(0, 60)}{item.transcription.length > 60 ? '…' : ''}”
          </span>
        ) : null}
      </div>

      {url && (
        <audio controls preload="none" src={url} style={{ width: '100%', marginBottom: 12, height: 38 }} />
      )}

      {needsInput && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Dai un titolo per inviare il ticket…"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              color: 'var(--color-text)', fontSize: 14, fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {needsInput ? (
          <button
            type="button"
            onClick={() => onComplete(item.id, title)}
            disabled={busy || !isOnline || !title.trim()}
            className="press-scale"
            style={actionBtn(busy || !isOnline || !title.trim(), 'primary')}
          >
            <Send size={14} /> Completa e invia
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            disabled={busy || !isOnline}
            className="press-scale"
            style={actionBtn(busy || !isOnline, 'primary')}
          >
            <RefreshCw size={14} /> Riprova invio
          </button>
        )}

        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={() => { setConfirmDelete(false); onRemove(item.id) }}
              className="press-scale"
              style={actionBtn(false, 'danger')}
            >
              Elimina davvero
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="press-scale"
              style={actionBtn(false, 'ghost')}
            >
              Annulla
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Elimina registrazione"
            className="press-scale"
            style={actionBtn(false, 'ghost')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function actionBtn(disabled, variant) {
  const base = {
    flex: variant === 'ghost' ? '0 0 auto' : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 14px', borderRadius: 10,
    fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    border: '1px solid transparent',
  }
  if (variant === 'primary') {
    return { ...base, background: 'rgba(124, 106, 255, 0.14)', color: 'var(--color-primary, #7c6aff)', borderColor: 'rgba(124, 106, 255, 0.35)' }
  }
  if (variant === 'danger') {
    return { ...base, background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }
  }
  return { ...base, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }
}
