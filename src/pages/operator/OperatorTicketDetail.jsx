import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { formatDate, SEVERITY } from '../../lib/constants'
import StatusPill from '../../components/operator/StatusPill'
import PriorityDot from '../../components/operator/PriorityDot'

function shortId(id) {
  if (!id) return '—'
  return `#${id.toString().slice(0, 8).toUpperCase()}`
}

export default function OperatorTicketDetail({ reportId, onBack }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    db.getReport(reportId).then(r => {
      if (cancelled) return
      setReport(r)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reportId])

  if (loading) {
    return (
      <div className="op-screen">
        <button className="op-back" onClick={onBack}>← INDIETRO</button>
        <div className="op-mono" style={{ color: 'var(--op-text-muted)', marginTop: 40 }}>Caricamento…</div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="op-screen">
        <button className="op-back" onClick={onBack}>← INDIETRO</button>
        <div className="op-info" style={{ marginTop: 20 }}>Ticket non trovato</div>
      </div>
    )
  }

  const severity = SEVERITY[report.severity] || {}
  const assignee = report.assigned_to_user?.name || report.assigned_to_name

  return (
    <div className="op-screen">
      <button className="op-back" onClick={onBack} aria-label="Torna alla lista">← INDIETRO</button>

      <div className="op-statusbar" style={{ marginTop: 4 }}>
        <span className="op-mono">{shortId(report.id)}</span>
        <span className="op-mono">{formatDate(report.created_at)}</span>
      </div>

      <h1 className="op-header-name" style={{ fontSize: 28 }}>{report.title}</h1>

      {report.machine && (
        <div className="op-mono" style={{ color: 'var(--op-text-soft)', marginTop: 8, fontSize: 13, letterSpacing: '0.08em' }}>
          {report.machine.toUpperCase()}
        </div>
      )}

      <div className="op-section-title">Descrizione</div>
      <div className="op-detail-box">
        {report.description || '(nessuna descrizione)'}
      </div>

      <div className="op-detail-grid">
        <div className="op-detail-field">
          <div className="op-field__label">Stato</div>
          <div style={{ marginTop: 6 }}><StatusPill status={report.status} /></div>
        </div>
        <div className="op-detail-field">
          <div className="op-field__label">Priorità</div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PriorityDot priority={report.severity} />
            <span style={{ color: severity.color || 'var(--op-text)', fontFamily: 'Barlow Condensed', fontWeight: 600 }}>
              {severity.label || report.severity || '—'}
            </span>
          </div>
        </div>
      </div>

      {assignee && (
        <div className="op-detail-field" style={{ marginTop: 10 }}>
          <div className="op-field__label">Tecnico assegnato</div>
          <div style={{ marginTop: 6, fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 600 }}>
            {assignee}
          </div>
        </div>
      )}
    </div>
  )
}
