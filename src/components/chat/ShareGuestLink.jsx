import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { Share2, Copy, X, Trash2, Link2 } from 'lucide-react'
import { WhatsAppIcon } from '../ui'

export default function ShareGuestLink({ reportId, reportTitle }) {
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

  // Load existing tokens when sheet opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    db.getGuestTokens(reportId)
      .then(t => { if (!cancelled) setTokens(t.filter(tk => tk.enabled)) })
      .catch(() => { if (!cancelled) setTokens([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, reportId])

  const buildUrl = (token) => `${window.location.origin}/guest/${reportId}/${token}`

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const newToken = await db.createGuestToken(reportId)
      setTokens(prev => [newToken, ...prev])
      haptic.success()
    } catch {
      toast.error('Errore generazione link')
    }
    setGenerating(false)
  }

  const handleCopy = async (token) => {
    const url = buildUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiato!')
      haptic.light()
    } catch {
      toast.error('Impossibile copiare')
    }
  }

  const handleShareWhatsApp = (token) => {
    const url = buildUrl(token)
    const text = `Ciao! Ti condivido la chat della segnalazione "${reportTitle}" su ManuTech.\n\nApri il link per partecipare:\n${url}`

    haptic.medium()

    // Try Web Share API first (native share on mobile)
    if (navigator.share) {
      navigator.share({ title: `Chat: ${reportTitle}`, text, url }).catch(() => {})
    } else {
      // Fallback: direct WhatsApp link
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  const handleRevoke = async (tokenId) => {
    try {
      await db.revokeGuestToken(tokenId)
      setTokens(prev => prev.filter(t => t.id !== tokenId))
      toast.success('Link revocato')
      haptic.light()
    } catch {
      toast.error('Errore revoca link')
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); haptic.light() }}
        className="w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
        style={{ background: 'var(--color-surface-2, #2a2a3e)' }}
        title="Condividi chat"
      >
        <Share2 size={18} style={{ color: 'var(--color-text-muted, #888)' }} />
      </button>

      {/* Bottom sheet overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-t-2xl pb-safe animate-slide-up"
            style={{ background: 'var(--color-surface, #1a1a2e)', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border, #2a2a3e)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--color-text, #fff)' }}>Condividi chat</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted, #888)' }}>Genera un link per invitare ospiti</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface-2, #2a2a3e)' }}>
                <X size={16} style={{ color: 'var(--color-text-muted, #888)' }} />
              </button>
            </div>

            {/* Generate new link */}
            <div className="px-5 pb-4">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: 'var(--color-primary, #7c6aff)', color: '#fff' }}
              >
                {generating
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Link2 size={16} />
                }
                Genera nuovo link
              </button>
            </div>

            {/* Existing tokens */}
            {loading ? (
              <div className="px-5 pb-6 text-center">
                <div className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mx-auto" />
              </div>
            ) : tokens.length > 0 ? (
              <div className="px-5 pb-6 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-faint, #555)' }}>
                  Link attivi ({tokens.length})
                </p>
                {tokens.map(t => (
                  <div key={t.id} className="rounded-xl p-3" style={{ background: 'var(--color-bg, #0f0f1a)', border: '1px solid var(--color-border, #2a2a3e)' }}>
                    <div className="text-xs font-mono truncate mb-2" style={{ color: 'var(--color-text-muted, #888)' }}>
                      {buildUrl(t.token)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleShareWhatsApp(t.token)}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        style={{ background: '#25D366', color: '#fff' }}
                      >
                        <WhatsAppIcon size={14} /> WhatsApp
                      </button>
                      <button
                        onClick={() => handleCopy(t.token)}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        style={{ background: 'var(--color-surface-2, #2a2a3e)', color: 'var(--color-text, #fff)' }}
                      >
                        <Copy size={14} /> Copia
                      </button>
                      <button
                        onClick={() => handleRevoke(t.id)}
                        className="rounded-lg px-3 py-2 flex items-center justify-center active:scale-95 transition-transform"
                        style={{ background: 'rgba(255,92,92,0.1)' }}
                        title="Revoca link"
                      >
                        <Trash2 size={14} style={{ color: '#ff5c5c' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 pb-6 text-center">
                <p className="text-sm" style={{ color: 'var(--color-text-faint, #555)' }}>
                  Nessun link attivo. Genera il primo!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
