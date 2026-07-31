import { useState, useEffect, useRef } from 'react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { WhatsAppIcon } from '../ui'
import {
  buildReportSummary, buildChatTranscript, reportAppLink, guestChatLink,
  openWhatsApp, nativeShare, canNativeShare, copyText,
} from '../../lib/share'
import { formatTicketId } from '../../lib/constants'
import { X, Copy, Share2, FileText, MessageCircle, Link2 } from 'lucide-react'

const GUEST_ROLES = ['admin', 'tecnico', 'super_admin']

function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
}

// Bottom sheet "Condividi": riepilogo segnalazione o trascrizione chat,
// via WhatsApp, share sheet di sistema o clipboard. Per admin/tecnico può
// includere un link ospite (chat senza login, stessi token di ShareGuestLink)
// così chi riceve su WhatsApp partecipa anche senza account.
export default function ShareReportSheet({ open, onClose, report, user }) {
  const toast = useToast()
  const haptic = useHaptic()
  const canGuest = GUEST_ROLES.includes(user?.role)
  const [guestOn, setGuestOn] = useState(canGuest)
  const [guestUrl, setGuestUrl] = useState(null)
  const [comments, setComments] = useState(null)
  const [busy, setBusy] = useState(null)
  const guestFetchRef = useRef(null)

  // Il sheet può restare montato mentre si passa a un'altra segnalazione
  // (ReportDetailModal cambia `selected` senza smontare): senza reset il
  // link ospite e la chat resterebbero quelli del report precedente.
  useEffect(() => {
    setGuestUrl(null)
    setComments(null)
    guestFetchRef.current = null
  }, [report.id])

  // Deduplica la creazione del token tra prefetch e tap ravvicinati.
  // In caso di errore il ref si resetta: il prossimo tap ritenta.
  const fetchGuestUrl = () => {
    if (!guestFetchRef.current) {
      guestFetchRef.current = (async () => {
        const tokens = await db.getGuestTokens(report.id)
        const active = (tokens || []).find(t =>
          t.enabled && (!t.expires_at || new Date(t.expires_at) > new Date()))
        const token = active || await db.createGuestToken(report.id)
        return guestChatLink(report.id, token.token)
      })().catch(() => { guestFetchRef.current = null; return null })
    }
    return guestFetchRef.current
  }

  // Prefetch all'apertura: navigator.share e window.open richiedono la
  // transient activation del tap, che non sopravvive ad await di rete.
  // Con i dati già in cache il tap sui bottoni resta sincrono.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    db.getComments(report.id)
      .then(c => { if (!cancelled) setComments((c || []).filter(x => !x.deleted_at)) })
      .catch(() => { if (!cancelled) setComments([]) })
    if (canGuest && guestOn && !guestUrl) {
      fetchGuestUrl().then(url => { if (!cancelled && url) setGuestUrl(url) })
    }
    return () => { cancelled = true }
  }, [open, report.id, guestOn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const tk = formatTicketId(report)

  // Link di coda del messaggio: link ospite (riusa il token attivo più
  // recente o ne genera uno) oppure deep link /reports/:id. Col prefetch
  // sopra, nel caso normale risolve dalla cache senza await di rete.
  const ensureLink = async () => {
    if (!(canGuest && guestOn)) return { url: reportAppLink(report), guest: false }
    const url = guestUrl || await fetchGuestUrl()
    if (url) return { url, guest: true }
    toast.warning('Link ospite non disponibile: uso il link app')
    return { url: reportAppLink(report), guest: false }
  }

  const getSummaryText = async () => {
    const link = await ensureLink()
    return buildReportSummary(report, link)
  }

  const getChatText = async () => {
    const visible = comments ?? (await db.getComments(report.id) || []).filter(c => !c.deleted_at)
    if (!visible.length) {
      toast.info('La chat è ancora vuota')
      return null
    }
    const link = await ensureLink()
    return buildChatTranscript(report, visible, link)
  }

  // kind: '<sezione>-<canale>' es. 'summary-wa', 'chat-copy'
  const run = async (kind, getText, send) => {
    if (busy) return
    setBusy(kind)
    haptic.light()
    try {
      const text = await getText()
      if (text != null) await send(text)
    } catch {
      toast.error('Operazione non riuscita')
    } finally {
      setBusy(null)
    }
  }

  const sendWhatsApp = async (text) => {
    const outcome = await openWhatsApp(text)
    if (outcome === 'copied') toast.info('Testo copiato: incollalo su WhatsApp')
  }

  // Se lo share di sistema fallisce (es. transient activation scaduta su
  // iOS), il testo finisce comunque in clipboard: l'utente non perde nulla.
  const sendNative = (title) => async (text) => {
    const outcome = await nativeShare({ title, text })
    if (outcome === 'failed' || outcome === 'unsupported') {
      await copyText(text)
      toast.info('Condivisione non disponibile: testo copiato')
    }
  }

  const sendCopy = async (text) => {
    await copyText(text)
    toast.success('Copiato negli appunti')
  }

  const ActionRow = ({ section, getText, shareTitle }) => (
    <div className="flex gap-2">
      <button
        onClick={() => run(`${section}-wa`, getText, sendWhatsApp)}
        disabled={!!busy}
        className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        style={{ background: '#25D366', color: '#fff', opacity: busy && busy !== `${section}-wa` ? 0.6 : 1 }}
      >
        {busy === `${section}-wa` ? <Spinner /> : <WhatsAppIcon size={14} />} WhatsApp
      </button>
      {canNativeShare() && (
        <button
          onClick={() => run(`${section}-share`, getText, sendNative(shareTitle))}
          disabled={!!busy}
          className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          style={{ background: 'var(--color-surface-2, #2a2a3e)', color: 'var(--color-text, #fff)' }}
        >
          {busy === `${section}-share` ? <Spinner /> : <Share2 size={14} />} Condividi
        </button>
      )}
      <button
        onClick={() => run(`${section}-copy`, getText, sendCopy)}
        disabled={!!busy}
        className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        style={{ background: 'var(--color-surface-2, #2a2a3e)', color: 'var(--color-text, #fff)' }}
      >
        {busy === `${section}-copy` ? <Spinner /> : <Copy size={14} />} Copia
      </button>
    </div>
  )

  return (
    // stopPropagation sul root: il sheet vive anche dentro ReportDetailModal
    // (overlay cliccabile) — senza, un tap sul backdrop chiuderebbe entrambi.
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
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
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text, #fff)' }}>Condividi</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted, #888)' }}>
              {tk ? `Segnalazione ${tk}` : 'Segnalazione'} — testo pronto da incollare
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface-2, #2a2a3e)' }}>
            <X size={16} style={{ color: 'var(--color-text-muted, #888)' }} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-3">
          {/* Toggle link ospite (solo admin/tecnico) */}
          {canGuest && (
            <button
              onClick={() => { setGuestOn(v => !v); haptic.light() }}
              className="w-full flex items-center justify-between gap-3 rounded-xl p-3 text-left"
              style={{ background: 'var(--color-bg, #0f0f1a)', border: '1px solid var(--color-border, #2a2a3e)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Link2 size={16} style={{ color: 'var(--color-primary, #7c6aff)', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text, #fff)' }}>Includi link ospite</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted, #888)' }}>
                    Chi riceve apre la chat anche senza account
                  </p>
                </div>
              </div>
              <div
                className="rounded-full p-0.5 transition-colors"
                style={{ width: 40, flexShrink: 0, background: guestOn ? 'var(--color-primary, #7c6aff)' : 'var(--color-surface-2, #2a2a3e)' }}
                role="switch"
                aria-checked={guestOn}
              >
                <div
                  className="rounded-full bg-white transition-transform"
                  style={{ width: 18, height: 18, transform: guestOn ? 'translateX(17px)' : 'translateX(0)' }}
                />
              </div>
            </button>
          )}

          {/* Riepilogo segnalazione */}
          <div className="rounded-xl p-3" style={{ background: 'var(--color-bg, #0f0f1a)', border: '1px solid var(--color-border, #2a2a3e)' }}>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: 'var(--color-primary, #7c6aff)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text, #fff)' }}>Riepilogo segnalazione</p>
            </div>
            <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: 'var(--color-text-muted, #888)' }}>
              Stato, gravità, descrizione e link alle foto
            </p>
            <ActionRow section="summary" getText={getSummaryText} shareTitle={tk ? `Segnalazione ${tk}` : 'Segnalazione'} />
          </div>

          {/* Trascrizione chat */}
          <div className="rounded-xl p-3" style={{ background: 'var(--color-bg, #0f0f1a)', border: '1px solid var(--color-border, #2a2a3e)' }}>
            <div className="flex items-center gap-2">
              <MessageCircle size={14} style={{ color: 'var(--color-primary, #7c6aff)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text, #fff)' }}>Trascrizione chat</p>
            </div>
            <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: 'var(--color-text-muted, #888)' }}>
              Tutti i messaggi della segnalazione, in ordine cronologico
            </p>
            <ActionRow section="chat" getText={getChatText} shareTitle={tk ? `Chat ${tk}` : 'Chat segnalazione'} />
          </div>
        </div>
      </div>
    </div>
  )
}
