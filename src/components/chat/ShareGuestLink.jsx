import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { Share2, Copy, X, Trash2, Link2 } from 'lucide-react'

// Simple WhatsApp SVG icon
function WhatsAppIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

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
