/**
 * ActivityTimeline — Timeline cronologica verticale compatta
 *
 * Stile: pallini colorati 12px su linea verticale, senza icone.
 * workData (ore/ricambi chiusura) in box verde.
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, timeAgo } from '../../lib/constants'
import { ArrowRight } from 'lucide-react'

const EVENT_COLORS = {
  created:        '#7c6aff',
  quick_created:  '#ffa502',
  status_change:  '#00d4ff',
  comment:        '#6366f1',
  media_photo:    '#06b6d4',
  media_video:    '#2ed573',
  media_audio:    '#f97316',
  assigned:       '#8b5cf6',
}

const EVENT_LABELS = {
  created:        'Segnalazione creata',
  quick_created:  'Report rapido creato',
  status_change:  'Stato aggiornato',
  comment:        'Commento',
  media_photo:    'Foto aggiunta',
  media_video:    'Video aggiunto',
  media_audio:    'Audio aggiunto',
  assigned:       'Assegnato',
}

export default function ActivityTimeline({ reportId, report }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActivities()
  }, [reportId])

  const loadActivities = async () => {
    setLoading(true)
    try {
      const data = await db.getActivities(reportId)
      setActivities(data)
    } catch {}
    setLoading(false)
  }

  const timeline = activities.length > 0 ? activities : buildFallbackTimeline(report)

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-3 animate-pulse" style={{ paddingLeft: 28 }}>
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded w-2/3" style={{ background: '#16161f' }} />
              <div className="h-2 rounded w-1/3" style={{ background: '#12121a' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute',
        left: 6,
        top: 8,
        bottom: 8,
        width: 2,
        background: '#2a2a3a',
        borderRadius: 1,
      }} />

      {timeline.map((event, i) => {
        let dotColor = EVENT_COLORS[event.type] || EVENT_COLORS.created
        if (event.type === 'status_change' && event.to_status) {
          dotColor = STATUS[event.to_status]?.color || dotColor
        }

        const label = getEventTitle(event)

        return (
          <div
            key={event.id || i}
            className="animate-fade-in"
            style={{
              position: 'relative',
              paddingLeft: 8,
              paddingBottom: i < timeline.length - 1 ? 16 : 0,
              paddingTop: i === 0 ? 0 : 4,
            }}
          >
            {/* Dot */}
            <div style={{
              position: 'absolute',
              left: -17,
              top: i === 0 ? 2 : 6,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: dotColor,
              zIndex: 2,
            }} />

            {/* Content */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="text-secondary" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                  {label}
                </p>
                {event.detail && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.3 }}>{event.detail}</p>
                )}
                {event.user_name && (
                  <p className="text-faint" style={{ fontSize: 12, marginTop: 2 }}>{event.user_name}</p>
                )}
              </div>
              <span className="text-faint" style={{ fontSize: 11, flexShrink: 0, marginTop: 2 }}>
                {timeAgo(event.created_at)}
              </span>
            </div>

            {/* Status change badges */}
            {event.type === 'status_change' && event.from_status && event.to_status && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                    background: (STATUS[event.from_status]?.color || '#666') + '20',
                    color: STATUS[event.from_status]?.color || '#666',
                  }}
                >
                  {STATUS[event.from_status]?.label || event.from_status}
                </span>
                <ArrowRight size={12} className="text-faint" />
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                    background: (STATUS[event.to_status]?.color || '#666') + '20',
                    color: STATUS[event.to_status]?.color || '#666',
                  }}
                >
                  {STATUS[event.to_status]?.label || event.to_status}
                </span>
              </div>
            )}

            {/* Work data box (closure info) */}
            {event.workData && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(46, 213, 115, 0.08)',
                  border: '1px solid rgba(46, 213, 115, 0.2)',
                  fontSize: 12,
                  color: '#2ed573',
                  lineHeight: 1.5,
                }}
              >
                {event.workData}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function getEventTitle(event) {
  switch (event.type) {
    case 'status_change':
      return 'Stato aggiornato'
    case 'comment':
      return event.detail ? `"${event.detail.slice(0, 60)}${event.detail.length > 60 ? '…' : ''}"` : 'Commento aggiunto'
    default:
      return EVENT_LABELS[event.type] || 'Evento'
  }
}

function buildFallbackTimeline(report) {
  if (!report) return []
  const timeline = []

  timeline.push({
    id: 'created',
    type: report.is_quick ? 'quick_created' : 'created',
    user_name: report.created_by_name,
    created_at: report.created_at,
    detail: report.machine ? `Macchinario: ${report.machine}` : null,
  })

  if (report.media?.length > 0) {
    report.media.forEach((m, i) => {
      timeline.push({
        id: `media-${i}`,
        type: m.type === 'video' ? 'media_video' : m.type === 'audio' ? 'media_audio' : 'media_photo',
        user_name: report.created_by_name,
        created_at: report.created_at,
      })
    })
  }

  if (report.status !== 'aperta') {
    const workParts = []
    if (report.closure_hours) workParts.push(`${report.closure_hours}h lavoro`)
    if (report.closure_parts) workParts.push(`Ricambi: ${report.closure_parts}`)
    if (report.closure_root_cause) workParts.push(`Causa: ${report.closure_root_cause}`)

    timeline.push({
      id: 'status-current',
      type: 'status_change',
      from_status: 'aperta',
      to_status: report.status,
      created_at: report.updated_at || report.created_at,
      workData: workParts.length > 0 ? workParts.join(' · ') : null,
    })
  }

  return timeline
}
