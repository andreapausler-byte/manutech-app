import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft, Send, Camera, Mic, Square, X, Package, UserCog, Calendar,
  MapPin, Clock, AlertTriangle, FileText, Truck, Inbox, Check, Image as ImageIcon
} from 'lucide-react'
import { db, supabase } from '../../lib/supabase'
import {
  ORDER_STAGES, ORDER_STATUS, SPARE_URGENCY, SUPPLIER_SPECIALTIES,
  REQUEST_KIND, orderStageIndex, statusLabel, stageLabel, formatDate, timeAgo,
} from '../../lib/constants'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

/**
 * RequestDetailPanel — schermata fullscreen del dettaglio richiesta esterna.
 *
 * Mostra:
 *   - Header con titolo, kind icon, stato, back
 *   - Sezione info specifica per kind (foto, specialty, location, schedule…)
 *   - Mini progress bar 4 stadi
 *   - Timeline cronologica (activities + comments uniti)
 *   - Composer con testo + foto + voice note (mobile-first)
 *
 * Realtime: si sottoscrive al channel `req-${orderId}` per ricaricare la
 * timeline quando arrivano nuovi commenti o activities.
 */
export default function RequestDetailPanel({ orderId, user, onClose }) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress } = useImageCompressor({ maxWidth: 1600, quality: 0.82 })

  const [order, setOrder] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [composerText, setComposerText] = useState('')
  const [composerMedia, setComposerMedia] = useState([])
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordMs, setRecordMs] = useState(0)
  const [uploading, setUploading] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const tickRef = useRef(null)
  const fileInputRef = useRef(null)
  const scrollerRef = useRef(null)

  const reload = async () => {
    try {
      const orders = await db.getSparePartOrders({})
      const o = orders.find(x => x.id === orderId)
      setOrder(o || null)
      const tl = await db.getSparePartOrderTimeline(orderId)
      setTimeline(tl)
    } catch (e) {
      console.warn('[req-detail] reload failed:', e?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  // ── Realtime: ricarica la timeline al ricevere comment/activity nuovi ──
  useEffect(() => {
    if (!supabase || !orderId) return
    const channel = supabase
      .channel(`req-${orderId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `spare_order_id=eq.${orderId}` },
        () => reload()
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities', filter: `spare_order_id=eq.${orderId}` },
        () => reload()
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'spare_part_orders', filter: `id=eq.${orderId}` },
        () => reload()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  // Auto-scroll a fondo timeline quando si aggiungono eventi
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [timeline.length])

  const handlePickPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const newMedia = []
      for (const f of files) {
        const { file: compressed } = await compress(f)
        const path = `request-chat/${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const url = await db.uploadFile('attachments', path, compressed)
        newMedia.push({ url, name: f.name, type: 'photo' })
      }
      setComposerMedia(prev => [...prev, ...newMedia])
      haptic.light?.()
    } catch (err) {
      toast.error('Errore upload: ' + (err?.message || ''))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        try {
          const url = await db.uploadVoiceAudio(blob, orderId, user.id)
          setComposerMedia(prev => [...prev, { url, name: 'voice.webm', type: 'audio' }])
          haptic.light?.()
        } catch {
          toast.error('Errore upload audio')
        }
      }
      recorder.start(1000)
      recorderRef.current = recorder
      const startedAt = Date.now()
      tickRef.current = setInterval(() => setRecordMs(Date.now() - startedAt), 200)
      setRecording(true)
      haptic.medium?.()
    } catch {
      toast.error('Microfono non disponibile')
    }
  }

  const stopRecording = () => {
    try { recorderRef.current?.stop() } catch { /* noop */ }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    setRecording(false)
    setRecordMs(0)
    haptic.light?.()
  }

  const send = async () => {
    if ((!composerText.trim() && composerMedia.length === 0) || sending) return
    setSending(true)
    haptic.medium?.()
    try {
      await db.addSparePartOrderComment(orderId, {
        text: composerText.trim() || '📎',
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        media: composerMedia.length > 0 ? composerMedia : null,
      })
      setComposerText('')
      setComposerMedia([])
      // reload triggerato dal realtime, ma fallback diretto se realtime non risponde
      reload()
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
    } finally {
      setSending(false)
    }
  }

  if (loading) return <FullscreenWrap title="Caricamento…" onClose={onClose} />
  if (!order) return <FullscreenWrap title="Richiesta non trovata" onClose={onClose} />

  const kindMeta = REQUEST_KIND[order.kind] || REQUEST_KIND.ricambio
  const KindIcon = order.kind === 'intervento' ? UserCog : Package
  const stage = orderStageIndex(order.status)
  const status = ORDER_STATUS[order.status] || ORDER_STATUS.richiesto
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  const images = Array.isArray(order.images) ? order.images : []
  const quotes = Array.isArray(order.quotes) ? order.quotes : []

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={onClose} aria-label="Chiudi" className="press-scale"
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: kindMeta.color + '22', color: kindMeta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <KindIcon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {order.spare_part_name}
          </p>
          <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
            {kindMeta.short} · {statusLabel(order.status, order.kind)}
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 6,
          background: status.bg, color: status.color, textTransform: 'uppercase',
          letterSpacing: 0.5, flexShrink: 0,
        }}>
          {statusLabel(order.status, order.kind)}
        </span>
      </div>

      {/* Body scrollabile */}
      <div ref={scrollerRef} style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '14px 14px 8px',
      }}>
        {/* Progress 4 stadi */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {ORDER_STAGES.map((s, i) => {
              const done = i < stage
              const active = i === stage
              return (
                <div key={s.key} style={{
                  flex: 1, height: 5, borderRadius: 3,
                  background: done || active
                    ? (i === 3 ? '#3ddc84' : i === 2 ? '#06b6d4' : i === 1 ? '#fbbf24' : '#f59e0b')
                    : 'rgba(255,255,255,0.08)',
                  opacity: active ? 1 : done ? 0.7 : 1,
                }} />
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 }}>
            {[0,1,2,3].map(i => (
              <span key={i} style={{
                color: i === stage ? 'var(--color-text)' : 'var(--color-text-secondary)',
                opacity: i <= stage ? 1 : 0.6,
                fontSize: 9,
                flex: 1, textAlign: i === 0 ? 'left' : i === 3 ? 'right' : 'center',
              }}>
                {stageLabel(i, order.kind).split(' ').slice(-2).join(' ')}
              </span>
            ))}
          </div>
        </div>

        {/* Sommario richiesta */}
        <div style={{
          background: 'var(--color-surface-2)',
          borderRadius: 12, padding: 12, marginBottom: 12,
        }}>
          {/* Riga meta: urgenza, qty, specialty, schedule */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: order.notes ? 8 : 0 }}>
            {urg && (
              <Pill bg={urg.bg} color={urg.color}>
                <AlertTriangle size={10} /> {urg.label}
              </Pill>
            )}
            {order.kind === 'ricambio' && (
              <Pill bg="rgba(124,106,255,0.10)" color="#7c6aff">x{order.quantity}</Pill>
            )}
            {order.specialty && SUPPLIER_SPECIALTIES[order.specialty] && (
              <Pill bg={SUPPLIER_SPECIALTIES[order.specialty].color + '1a'} color={SUPPLIER_SPECIALTIES[order.specialty].color}>
                {SUPPLIER_SPECIALTIES[order.specialty].icon} {SUPPLIER_SPECIALTIES[order.specialty].label}
              </Pill>
            )}
            {order.location && (
              <Pill bg="rgba(255,255,255,0.04)" color="var(--color-text-secondary)">
                <MapPin size={10} /> {order.location}
              </Pill>
            )}
            {order.scheduled_at && (
              <Pill bg="rgba(6,182,212,0.10)" color="#06b6d4">
                <Calendar size={10} /> {formatDate(order.scheduled_at)}
              </Pill>
            )}
            {order.duration_h && (
              <Pill bg="rgba(255,255,255,0.04)" color="var(--color-text-secondary)">
                <Clock size={10} /> {order.duration_h}h
              </Pill>
            )}
          </div>

          {/* Note del tecnico */}
          {order.notes && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
                Note tecnico
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {order.notes}
              </p>
            </div>
          )}

          {/* Foto strip */}
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
              {images.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noopener noreferrer"
                  className="press-scale"
                  style={{
                    width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                    border: '1px solid var(--color-border)', flexShrink: 0, position: 'relative',
                  }}>
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {i === 0 && order.kind === 'ricambio' && (
                    <span style={{
                      position: 'absolute', bottom: 1, left: 1, right: 1,
                      fontSize: 7, fontWeight: 800, letterSpacing: 0.4,
                      background: 'rgba(0,0,0,0.75)', color: '#f59e0b',
                      padding: '1px 2px', borderRadius: 3, textAlign: 'center',
                    }}>TARGHETTA</span>
                  )}
                </a>
              ))}
            </div>
          )}

          {/* Fornitore + ETA se ordinato */}
          {(order.supplier || order.expected_at) && stage >= 2 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              {order.supplier && (
                <p style={{ fontSize: 12, color: 'var(--color-text)', margin: 0 }}>
                  Fornitore: <strong>{order.supplier}</strong>
                </p>
              )}
              {order.expected_at && (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                  Arrivo previsto: <strong style={{ color: 'var(--color-text)' }}>{formatDate(order.expected_at)}</strong>
                </p>
              )}
              {order.received_at && (
                <p style={{ fontSize: 12, color: '#3ddc84', margin: '2px 0 0' }}>
                  ✓ Ricevuto: {formatDate(order.received_at)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Quotes summary se in preventivo */}
        {quotes.length > 0 && order.status === 'preventivo' && (
          <div style={{ marginBottom: 12 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              color: 'var(--color-text-secondary)', margin: '0 0 6px', paddingLeft: 4,
            }}>
              Preventivi · {quotes.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {quotes.map(q => <QuoteRow key={q.id} quote={q} />)}
            </div>
          </div>
        )}

        {/* Timeline */}
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
          color: 'var(--color-text-secondary)', margin: '8px 0 8px', paddingLeft: 4,
        }}>
          Timeline · {timeline.length}
        </p>
        {timeline.length === 0 ? (
          <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--color-text-secondary)', textAlign: 'center', padding: 16 }}>
            Nessun evento ancora.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.map(ev => <TimelineEvent key={ev.id} event={ev} myUserId={user.id} />)}
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{
        flexShrink: 0,
        padding: '10px 12px env(safe-area-inset-bottom, 10px)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}>
        {composerMedia.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
            {composerMedia.map((m, i) => (
              <div key={i} style={{
                position: 'relative', width: 56, height: 56, borderRadius: 8,
                overflow: 'hidden', border: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {m.type === 'photo' || m.type === 'image' ? (
                  <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Mic size={20} style={{ color: 'var(--color-text-secondary)' }} />
                )}
                <button onClick={() => setComposerMedia(prev => prev.filter((_, idx) => idx !== i))}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 18, height: 18, borderRadius: 9,
                    background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {recording ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4, background: '#ef4444',
              animation: 'pulse 1s infinite',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', flex: 1 }}>
              Registrazione · {Math.floor(recordMs / 1000)}s
            </span>
            <button onClick={stopRecording} className="press-scale"
              style={{
                padding: '6px 12px', borderRadius: 8,
                background: '#ef4444', color: '#fff', border: 'none',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              <Square size={12} /> Stop
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="press-scale" aria-label="Aggiungi foto"
              style={{
                width: 38, height: 38, borderRadius: 19,
                background: 'var(--color-surface-2)', border: 'none',
                color: 'var(--color-text-secondary)', cursor: uploading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
              <Camera size={17} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple
              onChange={handlePickPhotos} style={{ display: 'none' }} />
            <button onClick={startRecording} className="press-scale" aria-label="Registra audio"
              style={{
                width: 38, height: 38, borderRadius: 19,
                background: 'var(--color-surface-2)', border: 'none',
                color: 'var(--color-text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
              <Mic size={17} />
            </button>
            <input
              type="text"
              value={composerText}
              onChange={e => setComposerText(e.target.value)}
              placeholder="Scrivi un messaggio…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 19, color: 'var(--color-text)',
                fontSize: 14, outline: 'none',
              }}
            />
            <button onClick={send} disabled={sending || (!composerText.trim() && composerMedia.length === 0)}
              className="press-scale" aria-label="Invia"
              style={{
                width: 38, height: 38, borderRadius: 19,
                background: composerText.trim() || composerMedia.length > 0
                  ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: composerText.trim() || composerMedia.length > 0
                  ? '#fff' : 'var(--color-text-secondary)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function FullscreenWrap({ title, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <p style={{ color: 'var(--color-text)', marginBottom: 16 }}>{title}</p>
      <button onClick={onClose} className="press-scale"
        style={{
          padding: '10px 18px', borderRadius: 10,
          background: 'var(--color-surface-2)', color: 'var(--color-text)',
          border: '1px solid var(--color-border)', cursor: 'pointer',
        }}>Chiudi</button>
    </div>
  )
}

function Pill({ bg, color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 999,
      background: bg, color,
      fontSize: 11, fontWeight: 700,
    }}>
      {children}
    </span>
  )
}

function QuoteRow({ quote }) {
  const map = {
    pending:  { dot: '#fbbf24', label: 'In attesa' },
    received: { dot: '#3ddc84', label: 'Ricevuto' },
    accepted: { dot: '#22c55e', label: 'Accettato' },
    rejected: { dot: '#9ca3af', label: 'Rifiutato' },
  }
  const m = map[quote.status] || map.pending
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: 8,
      background: quote.status === 'accepted' ? 'rgba(34,197,94,0.10)' : 'var(--color-surface-2)',
      borderRadius: 8, opacity: quote.status === 'rejected' ? 0.5 : 1,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: m.dot, flexShrink: 0 }} />
      <p style={{
        fontSize: 12, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{quote.supplier_name}</p>
      <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', margin: 0 }}>
        {m.label}
        {quote.quoted_price && (
          <> · <span style={{ fontFamily: '"JetBrains Mono", monospace', color: '#3ddc84' }}>€ {parseFloat(quote.quoted_price).toFixed(2)}</span></>
        )}
        {quote.quoted_lead_time_days && (
          <> · <span style={{ fontFamily: '"JetBrains Mono", monospace', color: '#06b6d4' }}>{quote.quoted_lead_time_days}gg</span></>
        )}
      </p>
    </div>
  )
}

function TimelineEvent({ event, myUserId }) {
  const isComment = event.kind === 'comment'
  const isMine = event.user_id === myUserId

  if (isComment) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isMine ? 'flex-end' : 'flex-start',
      }}>
        <div style={{
          maxWidth: '78%',
          padding: '8px 12px',
          borderRadius: 12,
          background: isMine ? 'rgba(124,106,255,0.18)' : 'var(--color-surface-2)',
          border: `1px solid ${isMine ? 'rgba(124,106,255,0.35)' : 'var(--color-border)'}`,
        }}>
          {!isMine && (
            <p style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--color-text-secondary)', margin: '0 0 3px',
            }}>{event.user_name}</p>
          )}
          {event.text && event.text !== '📎' && (
            <p style={{
              fontSize: 13, color: 'var(--color-text)', margin: 0,
              lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{event.text}</p>
          )}
          {Array.isArray(event.media) && event.media.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: event.text && event.text !== '📎' ? 6 : 0, flexWrap: 'wrap' }}>
              {event.media.map((m, i) => (
                m.type === 'audio' ? (
                  <audio key={i} src={m.url} controls style={{ height: 32, maxWidth: 240 }} />
                ) : (
                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block' }}>
                    <img src={m.url} alt="" style={{
                      width: 100, height: 100, objectFit: 'cover',
                      borderRadius: 6, border: '1px solid var(--color-border)',
                    }} />
                  </a>
                )
              ))}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 9, color: 'var(--color-text-secondary)',
          marginTop: 2, padding: '0 4px',
        }}>{timeAgo(event.at)}</span>
      </div>
    )
  }

  // activity
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 10px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 8,
      borderLeft: `2px solid ${activityColor(event.type)}`,
    }}>
      <ActivityIcon type={event.type} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12, color: 'var(--color-text)', margin: 0,
          fontWeight: 600,
        }}>
          {event.detail || activityLabel(event.type)}
        </p>
        <p style={{
          fontSize: 10, color: 'var(--color-text-secondary)', margin: '2px 0 0',
        }}>
          {event.user_name || 'Sistema'} · {timeAgo(event.at)}
        </p>
      </div>
    </div>
  )
}

function ActivityIcon({ type }) {
  const Icon = {
    quotes_requested: FileText,
    quote_accepted: Check,
    order_confirmed: Check,
    order_received: Truck,
    spare_requested: Inbox,
    intervention_requested: UserCog,
    status_change: ImageIcon,
  }[type] || ImageIcon
  return <Icon size={14} style={{ color: activityColor(type), flexShrink: 0, marginTop: 1 }} />
}

function activityColor(type) {
  if (type === 'quote_accepted' || type === 'order_received') return '#3ddc84'
  if (type === 'order_confirmed') return '#06b6d4'
  if (type === 'quotes_requested') return '#fbbf24'
  if (type === 'spare_requested' || type === 'intervention_requested') return '#f59e0b'
  return 'var(--color-text-secondary)'
}

function activityLabel(type) {
  return ({
    quotes_requested: 'Preventivi richiesti',
    quote_accepted: 'Preventivo accettato',
    order_confirmed: 'Ordine confermato',
    order_received: 'Ricevuto',
    spare_requested: 'Richiesta ricambio',
    intervention_requested: 'Richiesta intervento',
    status_change: 'Cambio stato',
  }[type]) || type
}
