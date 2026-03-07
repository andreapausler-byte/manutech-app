/**
 * ActivityTimeline — Timeline cronologica verticale degli eventi di un report
 * 
 * Mostra: creazione, cambi stato, commenti, aggiunta media
 * Ogni evento ha icona, colore, autore, timestamp e dettagli.
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, timeAgo } from '../../lib/constants'
import {
  Clock, AlertTriangle, CheckCircle, Wrench, UserCheck,
  MessageCircle, Camera, Mic, Video, FileText, Zap, ArrowRight,
} from 'lucide-react'

const EVENT_CONFIG = {
  created:        { icon: FileText,      color: '#3b82f6', label: 'Segnalazione creata' },
  quick_created:  { icon: Zap,           color: '#f59e0b', label: 'Report rapido creato' },
  status_change:  { icon: ArrowRight,    color: '#a855f7', label: 'Stato aggiornato' },
  comment:        { icon: MessageCircle, color: '#6366f1', label: 'Commento' },
  media_photo:    { icon: Camera,        color: '#06b6d4', label: 'Foto aggiunta' },
  media_video:    { icon: Video,         color: '#22c55e', label: 'Video aggiunto' },
  media_audio:    { icon: Mic,           color: '#f97316', label: 'Audio aggiunto' },
  assigned:       { icon: UserCheck,     color: '#8b5cf6', label: 'Assegnato' },
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

  // Se non ci sono activity salvate, costruisci una timeline minima dal report stesso
  const timeline = activities.length > 0 ? activities : buildFallbackTimeline(report)

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-surface-2 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-800 rounded w-2/3" />
              <div className="h-2 bg-surface-2 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-surface-2" />

      <div className="space-y-[1px]">
        {timeline.map((event, i) => {
          const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.created
          const Icon = config.icon
          const isLast = i === timeline.length - 1

          // Per status_change, mostra il colore dello stato target
          let dotColor = config.color
          if (event.type === 'status_change' && event.to_status) {
            dotColor = STATUS[event.to_status]?.color || config.color
          }

          return (
            <div key={event.id || i} className="flex gap-[3vw] relative py-[2.5vw] animate-fade-in">
              {/* Dot/Icon */}
              <div
                className="w-[8vw] h-[8vw] max-w-8 max-h-8 rounded-full flex items-center justify-center shrink-0 z-10"
                style={{ background: dotColor + '20' }}
              >
                <Icon size={14} style={{ color: dotColor }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-secondary leading-snug">
                      {getEventTitle(event, config)}
                    </p>
                    {event.detail && (
                      <p className="text-sm text-muted mt-0.5 leading-snug">{event.detail}</p>
                    )}
                    {event.user_name && (
                      <p className="text-sm text-faint mt-0.5">
                        {event.user_name}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-faint shrink-0 mt-0.5">
                    {timeAgo(event.created_at)}
                  </span>
                </div>

                {/* Status change badge */}
                {event.type === 'status_change' && event.from_status && event.to_status && (
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: (STATUS[event.from_status]?.color || '#666') + '20', color: STATUS[event.from_status]?.color || '#666' }}
                    >
                      {STATUS[event.from_status]?.label || event.from_status}
                    </span>
                    <ArrowRight size={12} className="text-gray-600" />
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: (STATUS[event.to_status]?.color || '#666') + '20', color: STATUS[event.to_status]?.color || '#666' }}
                    >
                      {STATUS[event.to_status]?.label || event.to_status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getEventTitle(event, config) {
  switch (event.type) {
    case 'status_change':
      return `Stato aggiornato`
    case 'comment':
      return event.detail ? `"${event.detail.slice(0, 60)}${event.detail.length > 60 ? '…' : ''}"` : 'Commento aggiunto'
    default:
      return config.label
  }
}

// Fallback: costruisci timeline minima quando non ci sono activity salvate
function buildFallbackTimeline(report) {
  if (!report) return []
  const timeline = []

  // Evento creazione
  timeline.push({
    id: 'created',
    type: report.is_quick ? 'quick_created' : 'created',
    user_name: report.created_by_name,
    created_at: report.created_at,
    detail: report.machine ? `Macchinario: ${report.machine}` : null,
  })

  // Media al momento della creazione
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

  // Stato attuale (se diverso da aperta)
  if (report.status !== 'aperta') {
    timeline.push({
      id: 'status-current',
      type: 'status_change',
      from_status: 'aperta',
      to_status: report.status,
      created_at: report.updated_at || report.created_at,
    })
  }

  return timeline
}
