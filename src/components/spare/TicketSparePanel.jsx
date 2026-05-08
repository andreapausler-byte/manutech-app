import { useEffect, useState } from 'react'
import { Package, UserCog, ChevronRight } from 'lucide-react'
import { db } from '../../lib/supabase'
import {
  ORDER_STAGES, ORDER_STATUS, SPARE_URGENCY, REQUEST_KIND,
  orderStageIndex, statusLabel, formatDate, timeAgo,
} from '../../lib/constants'
import RequestDetailPanel from './RequestDetailPanel'

/**
 * TicketSparePanel — overview delle "richieste esterne" del ticket.
 *
 * Mostra tutti gli spare_part_orders (ricambi e interventi) collegati al
 * report con icona kind, mini progress bar 4-stadi e riga sintesi.
 * Tap su una card apre RequestDetailPanel (timeline + chat + composer).
 *
 * Se il ticket non ha richieste, il pannello non viene renderizzato.
 */
export default function TicketSparePanel({ reportId, user, refreshKey = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [openOrderId, setOpenOrderId] = useState(null)

  useEffect(() => {
    let alive = true
    db.getSparePartOrders({ report_id: reportId })
      .then(items => { if (alive) setOrders(items || []) })
      .catch(e => console.warn('[ticket-spare] load failed:', e?.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reportId, refreshKey, openOrderId])

  if (loading || orders.length === 0) return null

  return (
    <>
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
          In attesa di · {orders.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map(order => (
            <RequestCard
              key={order.id}
              order={order}
              onOpen={() => setOpenOrderId(order.id)}
            />
          ))}
        </div>
      </div>

      {openOrderId && user && (
        <RequestDetailPanel
          orderId={openOrderId}
          user={user}
          onClose={() => setOpenOrderId(null)}
        />
      )}
    </>
  )
}

function RequestCard({ order, onOpen }) {
  const kind = order.kind || 'ricambio'
  const kindMeta = REQUEST_KIND[kind] || REQUEST_KIND.ricambio
  const KindIcon = kind === 'intervento' ? UserCog : Package
  const status = order.status
  const st = ORDER_STATUS[status] || ORDER_STATUS.richiesto
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  const stage = orderStageIndex(status)
  const images = Array.isArray(order.images) ? order.images : []
  const quotes = Array.isArray(order.quotes) ? order.quotes : []

  return (
    <button
      onClick={onOpen}
      className="press-scale"
      style={{
        width: '100%', padding: 12,
        background: 'var(--color-surface-2, #161b2c)',
        border: '1px solid var(--color-border, #1f2433)',
        borderRadius: 12, cursor: 'pointer',
        textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Thumb foto o icona kind */}
        {images.length > 0 ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={images[0].url}
              alt=""
              style={{
                width: 44, height: 44, borderRadius: 10, objectFit: 'cover',
                border: '1px solid var(--color-border)',
              }}
            />
            <div style={{
              position: 'absolute', bottom: -3, right: -3,
              width: 18, height: 18, borderRadius: 9,
              background: kindMeta.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--color-bg)',
            }}>
              <KindIcon size={10} />
            </div>
          </div>
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: kindMeta.color + '22', color: kindMeta.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <KindIcon size={20} />
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{
              fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
              margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{order.spare_part_name}</p>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
              background: st.bg, color: st.color,
            }}>{statusLabel(status, kind)}</span>
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
            {kind === 'ricambio' ? `x${order.quantity} · ` : ''}
            {timeAgo(order.created_at || order.ordered_at)}
          </p>
        </div>

        <ChevronRight size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
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
  )
}

function statusHint(order, quotes) {
  const status = order.status
  const isInt = order.kind === 'intervento'
  if (status === 'richiesto') return "In attesa che l'admin elabori la richiesta"
  if (status === 'preventivo') {
    const received = quotes.filter(q => q.status === 'received').length
    const total = quotes.length
    if (received > 0) return `Preventivo a ${total} fornitori — ${received} risposta${received === 1 ? '' : 'e'} ricevut${received === 1 ? 'a' : 'e'}`
    return `Preventivo a ${total} ${total === 1 ? 'fornitore' : 'fornitori'} — in attesa risposte`
  }
  if (status === 'ordinato') {
    const eta = order.expected_at ? formatDate(order.expected_at) : null
    if (isInt) {
      const sched = order.scheduled_at ? formatDate(order.scheduled_at) : eta
      return order.supplier
        ? `Programmato con ${order.supplier}${sched ? ` · ${sched}` : ''}`
        : 'Intervento programmato'
    }
    return order.supplier
      ? `Ordinato da ${order.supplier}${eta ? ` · arrivo ${eta}` : ''}`
      : 'Ordine confermato'
  }
  if (status === 'spedito') return isInt ? 'Tecnico in arrivo' : 'Spedito dal fornitore'
  if (status === 'ricevuto') return isInt ? 'Intervento completato' : 'Pronto per il ritiro / installazione'
  if (status === 'installato') return order.installed_at ? `Concluso il ${formatDate(order.installed_at)}` : 'Concluso'
  return ''
}
