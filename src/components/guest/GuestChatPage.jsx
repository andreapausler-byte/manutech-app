import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS } from '../../lib/constants'
import { Spinner } from '../ui'
import ChatPanel from '../chat/ChatPanel'
import { Wrench, AlertTriangle, LogIn } from 'lucide-react'

export default function GuestChatPage({ reportId, token }) {
  const [state, setState] = useState('loading') // loading | name | chat | error
  const [report, setReport] = useState(null)
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('manutech_guest_name') || '')
  const [errorMsg, setErrorMsg] = useState('')

  // Validate token on mount
  useEffect(() => {
    db.guestValidateToken(reportId, token)
      .then(res => {
        if (res.valid && res.report) {
          setReport(res.report)
          // If name already in session, skip name entry
          const savedName = sessionStorage.getItem('manutech_guest_name')
          setState(savedName ? 'chat' : 'name')
        } else {
          setErrorMsg('Link non valido o scaduto')
          setState('error')
        }
      })
      .catch(() => {
        setErrorMsg('Link non valido o scaduto')
        setState('error')
      })
  }, [reportId, token])

  const handleEnterChat = (e) => {
    e.preventDefault()
    const name = guestName.trim()
    if (!name) return
    sessionStorage.setItem('manutech_guest_name', name)
    setState('chat')
  }

  const guestUser = { id: null, name: guestName || 'Ospite', role: 'guest' }

  const getComments = useCallback(() => db.guestGetComments(reportId, token), [reportId, token])
  const addComment = useCallback((text) => db.guestAddComment(reportId, token, text, guestName), [reportId, token, guestName])

  const guestMode = { token, getComments, addComment }

  const status = report ? (STATUS[report.status] || STATUS.aperta) : STATUS.aperta

  // ── Loading state ──
  if (state === 'loading') {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center" style={{ background: 'var(--color-bg, #0f0f1a)' }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--color-primary-glow, rgba(124,106,255,0.15))' }}>
            <Wrench size={28} style={{ color: 'var(--color-primary, #7c6aff)' }} />
          </div>
          <Spinner />
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted, #888)' }}>Verifica accesso...</p>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (state === 'error') {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-6" style={{ background: 'var(--color-bg, #0f0f1a)' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,92,92,0.15)' }}>
            <AlertTriangle size={28} style={{ color: '#ff5c5c' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text, #fff)' }}>{errorMsg}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted, #888)' }}>
            Contatta chi ti ha condiviso il link per ottenerne uno nuovo.
          </p>
        </div>
      </div>
    )
  }

  // ── Name entry state ──
  if (state === 'name') {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-6" style={{ background: 'var(--color-bg, #0f0f1a)' }}>
        <form onSubmit={handleEnterChat} className="w-full max-w-sm">
          <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface, #1a1a2e)', border: '1px solid var(--color-border, #2a2a3e)' }}>
            <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--color-primary-glow, rgba(124,106,255,0.15))' }}>
              <LogIn size={24} style={{ color: 'var(--color-primary, #7c6aff)' }} />
            </div>
            <h1 className="text-lg font-bold text-center mb-1" style={{ color: 'var(--color-text, #fff)' }}>Come ti chiami?</h1>
            <p className="text-sm text-center mb-5" style={{ color: 'var(--color-text-muted, #888)' }}>
              Inserisci il tuo nome per partecipare alla chat
            </p>
            {report && (
              <div className="rounded-xl px-3 py-2 mb-4 flex items-center gap-2" style={{ background: 'var(--color-bg, #0f0f1a)', border: '1px solid var(--color-border, #2a2a3e)' }}>
                <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--color-text, #fff)' }}>
                  {report.title}
                </span>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, fontWeight: 700, color: status.color, background: status.bg, whiteSpace: 'nowrap' }}>
                  {status.icon} {status.label}
                </span>
              </div>
            )}
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="Il tuo nome..."
              maxLength={50}
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 mb-4"
              style={{
                background: 'var(--color-bg, #0f0f1a)',
                border: '1px solid var(--color-border, #2a2a3e)',
                color: 'var(--color-text, #fff)',
                focusRingColor: 'var(--color-primary, #7c6aff)',
              }}
            />
            <button
              type="submit"
              disabled={!guestName.trim()}
              className="w-full rounded-xl py-3 text-sm font-semibold transition-all active:scale-95"
              style={{
                background: guestName.trim() ? 'var(--color-primary, #7c6aff)' : 'var(--color-surface-2, #2a2a3e)',
                color: guestName.trim() ? '#fff' : 'var(--color-text-faint, #555)',
                cursor: guestName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Entra nella chat
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ── Chat state ──
  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col" style={{ background: 'var(--color-bg, #0f0f1a)' }}>
      {/* Minimal header */}
      <header className="shrink-0 px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--color-border, #2a2a3e)', background: 'var(--color-surface, #1a1a2e)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-glow, rgba(124,106,255,0.15))' }}>
          <Wrench size={18} style={{ color: 'var(--color-primary, #7c6aff)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate" style={{ color: 'var(--color-text, #fff)' }}>{report?.title}</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted, #888)' }}>
            ManuTech — Accesso ospite
          </p>
        </div>
        <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 700, color: status.color, background: status.bg, whiteSpace: 'nowrap' }}>
          {status.icon} {status.label}
        </span>
      </header>

      {/* Chat */}
      <ChatPanel
        reportId={reportId}
        user={guestUser}
        variant="mobile"
        guestMode={guestMode}
        className="flex-1 min-h-0"
      />
    </div>
  )
}
