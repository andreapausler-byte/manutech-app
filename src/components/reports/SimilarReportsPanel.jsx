/**
 * SimilarReportsPanel — pannello collapsible dentro ReportDetail
 *
 * Al mount (se aperto), lancia una query all'assistente AI usando come
 * input title+description del report corrente + machine_id come filtro.
 * Mostra la risposta sintetizzata e le source chip cliccabili.
 *
 * Visibile solo ai tecnici, nascosto in demo mode.
 */

import { useEffect, useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { isAssistantAvailable, sendMessage } from '../../lib/assistant'

export default function SimilarReportsPanel({ report, onOpenReport }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [sources, setSources] = useState([])
  const [error, setError] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const available = isAssistantAvailable()

  const runQuery = async () => {
    if (loading || hasLoaded) return
    if (!report) return
    setLoading(true)
    setError(null)
    try {
      const query = [report.title, report.description].filter(Boolean).join('. ').slice(0, 800)
      const resp = await sendMessage({
        query: `Dammi soluzioni storiche per questo caso: ${query}`,
        machine_id: report.machine_id || undefined,
        report_id: report.id,
      })
      setContent(resp?.content || '')
      setSources(resp?.sources || [])
      setHasLoaded(true)
    } catch (err) {
      setError(err?.message || 'Errore assistente')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && available && !hasLoaded && !loading) {
      runQuery()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!available) return null

  return (
    <div
      style={{
        borderRadius: 14,
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="press-scale"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text)',
        }}
      >
        <div
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-glow-primary)',
          }}
        >
          <Sparkles size={16} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Soluzioni dal passato</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Cerca nello storico dei report risolti
          </div>
        </div>
        {open ? <ChevronUp size={18} color="var(--color-text-muted)" /> : <ChevronDown size={18} color="var(--color-text-muted)" />}
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
          {loading && (
            <div style={{ padding: '16px 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              <span className="animate-pulse">L&apos;assistente sta cercando interventi simili…</span>
            </div>
          )}
          {error && !loading && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                fontSize: 13,
                color: 'var(--color-danger)',
                background: 'var(--color-danger-glow)',
                borderRadius: 10,
              }}
            >
              {error}
            </div>
          )}
          {content && !loading && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--color-text)',
                  whiteSpace: 'pre-wrap',
                  background: 'var(--color-surface-2)',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                {content}
              </div>
              {sources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {sources.map(src => (
                    <button
                      key={src.report_id}
                      type="button"
                      onClick={() => onOpenReport?.(src.report_id)}
                      className="press-scale"
                      style={{
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        borderRadius: 999,
                        background: 'var(--color-primary-glow)',
                        color: 'var(--color-primary)',
                        border: '1px solid var(--color-border-active)',
                        cursor: 'pointer',
                      }}
                      title={src.title}
                    >
                      {src.title || 'Report'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!loading && !content && !error && (
            <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
              Apri per generare suggerimenti.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
