import { useEffect, useState } from 'react'
import { Package, Clock, FileText, Truck, Check, Inbox, ChevronDown, Euro } from 'lucide-react'
import { db } from '../../lib/supabase'
import { ORDER_STAGES, ORDER_STATUS, SPARE_URGENCY, orderStageIndex, formatDate, timeAgo } from '../../lib/constants'

/**
 * TicketSparePanel — read-only per il tecnico/operatore.
 *
 * Mostra tutti gli spare_part_orders collegati al report, ognuno con
 * mini progress bar 4-stadi e riga di dettaglio stato. Tap su una card
 * espande il dettaglio (preventivi ricevuti, fornitore scelto, ecc.).
 *
 * Se non ci sono ricambi per il ticket, il pannello non viene renderizzato.
 */
export default function TicketSparePanel({ reportId, refreshKey = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let alive = true
    db.getSparePartOrders({ report_id: reportId })
      .then(items => { if (alive) setOrders(items || []) })
      .catch(e => console.warn('[ticket-spare] load failed:', e?.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reportId, refreshKey])

  if (loading || orders.length === 0) return null

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'var(--color-surface-1, #0f1320)',
      border: '1px solid var(--color-border, #1f2433)',
      marginBottom: 12,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1,
        textTransform: 'uppercase', color: 'var(--color-text-secondary)',
        fontFamily: '"JetBrains Mono", monospace',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginBottom: 8,
      }}>
        <Package size={11} /> Ricambi · {orders.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map(order => (
          <SparePanelCard
            key={order.id}
            order={order}
            expanded={expandedId === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SparePanelCard({ order, expanded, onToggle }) {
  const status = order.status
  const st = ORDER_STATUS[status] || ORDER_STATUS.richiesto
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  const stage = orderStageIndex(status)
  const images = Array.isArray(order.images) ? order.images : []
  const quotes = Array.isArray(order.quotes) ? order.quotes : []

  return (
    <div style={{
      background: 'var(--color-surface-2, #161b2c)',
      borderRadius: 12,
      border: '1px solid var(--color-border, #1f2433)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        className="press-scale"
        style={{
          width: '100%', padding: 12,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {/* Riga superiore: thumb + titolo + stato + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {images.length > 0 ? (
            <img
              src={images[0].url}
              alt=""
              style={{
                width: 44, height: 44, borderRadius: 10,
                objectFit: 'cover', flexShrink: 0,
                border: '1px solid var(--color-border)',
              }}
            />
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'var(--color-surface-3, #1c2236)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <StatusIcon status={status} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <p style={{
                fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
                margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{order.spare_part_name}</p>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                background: st.bg, color: st.color,
              }}>{st.label}</span>
              {urg && stage <= 1 && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  background: urg.bg, color: urg.color,
                }}>{urg.label}</span>
              )}
            </div>
            <p style={{
              fontSize: 11, color: 'var(--color-text-secondary)', margin: '2px 0 0',
            }}>
              x{order.quantity} · {timeAgo(order.created_at || order.ordered_at)}
            </p>
          </div>
          <ChevronDown
            size={16}
            style={{
              color: 'var(--color-text-secondary)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform .2s',
              flexShrink: 0,
            }}
          />
        </div>

        {/* Mini progress bar 4 stadi */}
        <div style={{ display: 'flex', gap: 4 }}>
          {ORDER_STAGES.map((s, i) => {
            const done = i < stage
            const active = i === stage
            return (
              <div key={s.key} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: done || active
                  ? (i === 3 ? '#3ddc84' : i === 2 ? '#06b6d4' : i === 1 ? '#fbbf24' : '#f59e0b')
                  : 'rgba(255,255,255,0.08)',
                opacity: active ? 1 : done ? 0.7 : 1,
              }} />
            )
          })}
        </div>

        {/* Riga sintesi stato */}
        <p style={{
          fontSize: 11, color: 'var(--color-text-secondary)', margin: 0,
          fontStyle: 'italic',
        }}>
          {statusHint(order, quotes)}
        </p>
      </button>

      {/* Pannello espanso: dettagli */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px',
          borderTop: '1px solid var(--color-border, #1f2433)',
          paddingTop: 10,
        }}>
          {/* Note del tecnico (se ci sono) */}
          {order.notes && (
            <div style={{ marginBottom: 10 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                color: 'var(--color-text-secondary)', margin: '0 0 4px',
              }}>Note tecnico</p>
              <p style={{
                fontSize: 12, color: 'var(--color-text)', margin: 0,
                lineHeight: 1.4, whiteSpace: 'pre-wrap',
              }}>{order.notes}</p>
            </div>
          )}

          {/* Preventivi */}
          {quotes.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                color: 'var(--color-text-secondary)', margin: '0 0 6px',
              }}>Preventivi · {quotes.length}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {quotes.map(q => (
                  <QuoteRow key={q.id} quote={q} />
                ))}
              </div>
            </div>
          )}

          {/* Dati ordine */}
          {(order.supplier || order.expected_at) && stage >= 2 && (
            <div style={{
              fontSize: 11, color: 'var(--color-text-secondary)',
              padding: 8, background: 'var(--color-surface-3, #1c2236)',
              borderRadius: 8,
            }}>
              {order.supplier && <p style={{ margin: 0 }}>Fornitore: <strong style={{ color: 'var(--color-text)' }}>{order.supplier}</strong></p>}
              {order.expected_at && <p style={{ margin: '2px 0 0' }}>Arrivo previsto: <strong style={{ color: 'var(--color-text)' }}>{formatDate(order.expected_at)}</strong></p>}
              {order.received_at && <p style={{ margin: '2px 0 0', color: '#3ddc84' }}>Ricevuto: <strong>{formatDate(order.received_at)}</strong></p>}
            </div>
          )}
        </div>
      )}
    </div>
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
      background: quote.status === 'accepted' ? 'rgba(34,197,94,0.10)' : 'var(--color-surface-3, #1c2236)',
      borderRadius: 8, opacity: quote.status === 'rejected' ? 0.5 : 1,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3, background: m.dot, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: 'var(--color-text)', margin: 0,
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
    </div>
  )
}

function StatusIcon({ status }) {
  const Icon = status === 'richiesto' ? Inbox
    : status === 'preventivo' ? FileText
    : status === 'ordinato' ? Clock
    : status === 'spedito' ? Truck
    : Check
  const color = status === 'richiesto' ? '#f59e0b'
    : status === 'preventivo' ? '#fbbf24'
    : status === 'ordinato' ? '#06b6d4'
    : status === 'spedito' ? '#7c6aff'
    : '#3ddc84'
  return <Icon size={20} style={{ color }} />
}

function statusHint(order, quotes) {
  const status = order.status
  if (status === 'richiesto') return 'In attesa che l\'admin elabori la richiesta'
  if (status === 'preventivo') {
    const pending = quotes.filter(q => q.status === 'pending').length
    const received = quotes.filter(q => q.status === 'received').length
    const total = quotes.length
    if (received > 0) return `Preventivo chiesto a ${total} fornitori — ${received} risposta${received === 1 ? '' : 'e'} ricevut${received === 1 ? 'a' : 'e'}`
    return `Preventivo chiesto a ${total} fornitori — in attesa risposta${pending > 1 ? '' : ''}`
  }
  if (status === 'ordinato') {
    const eta = order.expected_at ? formatDate(order.expected_at) : null
    return order.supplier
      ? `Ordinato da ${order.supplier}${eta ? ` · arrivo ${eta}` : ''}`
      : 'Ordine confermato'
  }
  if (status === 'spedito') return 'Spedito dal fornitore'
  if (status === 'ricevuto') return 'Pronto per il ritiro / installazione'
  if (status === 'installato') return order.installed_at ? `Installato il ${formatDate(order.installed_at)}` : 'Installato'
  return ''
}
