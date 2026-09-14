// MyDayPanel — la resa di useMyDay: una schermata sola con il lavoro di oggi.
//
// Stessa lista per mobile e console admin, due vestiti (`variant`): il tecnico
// la legge col telefono in mano e i guanti, l'admin dentro la console. Quello
// che cambia è la densità, non il contenuto — se una riga serve al tecnico e
// non all'admin, allora è la sezione a essere sbagliata, non il vestito.
//
// Il pannello non sa da dove arrivano le righe (segnalazione, intervento,
// manutenzione): le apre chiamando la callback giusta e lascia decidere al
// contenitore dove portare l'utente.

import { useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarClock, ShieldCheck, ChevronRight,
  RefreshCw, MessageCircle, CheckCircle2,
} from 'lucide-react'
import { SEVERITY, STATUS } from '../../lib/constants'
import { INTERVENTION_STATUSES } from '../../lib/interventions'
import { useMyDay, MY_DAY_SECTIONS } from '../../hooks/useMyDay'

const DAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

const KIND_ICON = { report: AlertTriangle, intervention: CalendarClock, plan: ShieldCheck }
const KIND_LABEL = { report: 'Segnalazione', intervention: 'Intervento', plan: 'Manutenzione' }

const pad2 = (n) => String(n).padStart(2, '0')

const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
const dayAndTime = (d) => `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · ${hhmm(d)}`

function statusMeta(item) {
  if (item.kind === 'intervention') {
    const s = INTERVENTION_STATUSES[item.status]
    return s ? { label: s.label, color: s.color, bg: s.bg } : null
  }
  if (item.kind === 'report') {
    const s = STATUS[item.status]
    return s ? { label: s.label, color: s.color, bg: s.bg } : null
  }
  return null
}

// ── Riga ──
function MyDayRow({ item, sectionKey, sectionColor, dense, onOpen }) {
  const Icon = KIND_ICON[item.kind] || AlertTriangle
  const sev = SEVERITY[item.severity]
  const accent = item.kind === 'report' ? (sev?.color || sectionColor) : sectionColor
  const status = statusMeta(item)

  // Dove finisce il "quando" dipende dalla sezione, che è già la risposta:
  //   oggi      → orario a destra, "15:00" si legge in un colpo d'occhio
  //   in arrivo → giorno + ora nella riga del perché (l'orario da solo non
  //               dice niente se non sai che giorno è)
  //   in ritardo→ da nessuna parte: conta "da quanto", che è già nella nota,
  //               e la colonna libera vuol dire titolo più lungo
  const rightTime = sectionKey === 'today' && item.when ? hhmm(item.when) : null
  const whenLabel = sectionKey === 'soon' && item.when ? dayAndTime(item.when) : null
  const why = [whenLabel, item.note].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="press-scale"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: dense ? 56 : 68,
        padding: dense ? '10px 14px' : '12px 14px',
        borderRadius: 14,
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${accent}`,
        color: 'var(--color-text)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: `${accent}1f`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} style={{ color: accent }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Sul telefono il titolo può andare a capo una volta: tagliarlo a
            metà ("Revisione tappatore con…") costringe ad aprire la riga per
            sapere cos'è, che è esattamente il lavoro che questa schermata
            deve togliere. In console lo spazio c'è già. */}
        <div style={{
          fontSize: dense ? 13 : 14, fontWeight: 700, lineHeight: 1.25,
          overflow: 'hidden',
          ...(dense
            ? { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }),
        }}>
          {item.title}
        </div>
        <div style={{
          marginTop: 3, fontSize: 12, color: 'var(--color-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: 'var(--color-text-muted)' }}>{KIND_LABEL[item.kind]}</span>
          {item.machine && <> · {item.machine}</>}
        </div>
        {why && (
          <div style={{
            marginTop: 3, fontSize: 11.5, fontWeight: 600, color: accent,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {why}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {item.unread > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 999,
            background: 'var(--color-primary)', color: '#fff',
            fontSize: 11, fontWeight: 800,
          }}>
            <MessageCircle size={11} /> {item.unread}
          </span>
        )}
        {rightTime && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: 'var(--color-text)',
            fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap',
          }}>
            {rightTime}
          </span>
        )}
        {!rightTime && status && (
          <span style={{
            padding: '2px 8px', borderRadius: 999,
            background: status.bg, color: status.color,
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {status.label}
          </span>
        )}
        <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
      </div>
    </button>
  )
}

// ── Pannello ──
export default function MyDayPanel({
  user,
  variant = 'mobile',
  includeUnassigned = false,
  horizonDays = 7,
  onOpenReport,
  onOpenIntervention,
  onOpenPlan,
}) {
  const dense = variant === 'admin'
  const { sections, counts, loading, refreshing, refresh, updatedAt } = useMyDay({
    user, horizonDays, includeUnassigned,
  })
  // Un tap su un contatore isola quella sezione; un altro tap la riapre tutta.
  const [only, setOnly] = useState(null)

  const visibleSections = useMemo(
    () => sections.filter(s => s.items.length > 0 && (!only || s.key === only)),
    [sections, only]
  )
  const isEmpty = !loading && sections.every(s => s.items.length === 0)

  const openItem = (item) => {
    if (item.kind === 'report') onOpenReport?.(item)
    else if (item.kind === 'intervention') onOpenIntervention?.(item)
    else onOpenPlan?.(item)
  }

  const chips = MY_DAY_SECTIONS
    .filter(s => ['late', 'today', 'update'].includes(s.key))
    .map(s => ({ ...s, count: counts[s.key] || 0 }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: dense ? 14 : 16 }}>
      {/* Intestazione */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ fontSize: dense ? 18 : 20, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.15 }}>
            Oggi per me
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {loading
              ? 'Raccolgo segnalazioni, agenda e manutenzioni…'
              : counts.total > 0
                ? `${counts.total} ${counts.total === 1 ? 'cosa' : 'cose'} che ti riguardano`
                : 'Niente che ti riguardi in questo momento'}
            {updatedAt && !loading && (
              <> · agg. {pad2(updatedAt.getHours())}:{pad2(updatedAt.getMinutes())}</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || loading}
          aria-label="Aggiorna"
          className="press-scale"
          style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: refreshing || loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} />
        </button>
      </div>

      {/* Contatori: tap per isolare una sezione */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chips.map(c => {
          const active = only === c.key
          const muted = c.count === 0
          return (
            <button
              key={c.key}
              type="button"
              disabled={muted}
              onClick={() => setOnly(active ? null : c.key)}
              aria-pressed={active}
              className="press-scale"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 999,
                border: `1px solid ${active ? c.color : 'var(--color-border)'}`,
                background: active ? `${c.color}1f` : 'var(--color-surface-2)',
                color: muted ? 'var(--color-text-muted)' : (active ? c.color : 'var(--color-text-secondary)'),
                fontSize: 12, fontWeight: 700,
                cursor: muted ? 'default' : 'pointer',
                opacity: muted ? 0.55 : 1,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c.color, opacity: muted ? 0.4 : 1 }} />
              {c.label}
              <span className="tabular-nums" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{c.count}</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton-shimmer" style={{
              height: dense ? 56 : 68, borderRadius: 14,
              border: '1px solid var(--color-border)',
            }} />
          ))}
        </div>
      )}

      {isEmpty && (
        <div style={{
          padding: '28px 20px', borderRadius: 16, textAlign: 'center',
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        }}>
          <CheckCircle2 size={30} style={{ color: '#22c55e' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginTop: 10 }}>
            Niente in ritardo, niente per oggi
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.45 }}>
            Nessun intervento in agenda, nessuna segnalazione assegnata a te che aspetti una risposta.
          </div>
        </div>
      )}

      {visibleSections.map(section => (
        <div key={section.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: section.color }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>{section.label}</span>
            <span className="tabular-nums" style={{
              fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999,
              background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              {section.items.length}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{section.hint}</span>
          </div>
          {section.items.map(item => (
            <MyDayRow
              key={item.key}
              item={item}
              sectionKey={section.key}
              sectionColor={section.color}
              dense={dense}
              onOpen={openItem}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
