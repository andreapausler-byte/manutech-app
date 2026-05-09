/**
 * SimilarCasesLivePanel — pannello live nel composer di nuova segnalazione.
 *
 * Mentre l'operatore digita titolo + descrizione + sceglie macchina, fa
 * una ricerca semantica (debounced) tra i report storici chiusi della
 * stessa macchina e mostra fino a 3 casi simili.
 *
 * Differenza con SimilarReportsPanel (che vive in ReportDetail):
 *   - Live: re-query ad ogni cambio testo dopo debounce
 *   - Niente sintesi LLM: solo embedding + RPC raw, costo minimo
 *   - Click su un caso apre una preview modale, il composer resta intatto
 *
 * Nascosto in demo mode (Supabase non configurato).
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react'
import { isAssistantAvailable, searchSimilarCases, getMachineKnowledgeStats } from '../../lib/assistant'
import { formatDate } from '../../lib/constants'
import { Modal } from '../ui'

const DEBOUNCE_MS = 700
const MIN_LENGTH = 30

export default function SimilarCasesLivePanel({ text, machineId, excludeReportId, onOpenFull }) {
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [cases, setCases] = useState([])
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [previewCase, setPreviewCase] = useState(null)
  const [diagStats, setDiagStats] = useState(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const timerRef = useRef(null)
  const lastQueryRef = useRef('')
  const lastDiagMachineRef = useRef(null)

  const available = isAssistantAvailable()

  useEffect(() => {
    if (!available) return undefined
    if (timerRef.current) clearTimeout(timerRef.current)

    const q = (text || '').trim()
    if (q.length < MIN_LENGTH) {
      if (lastQueryRef.current) {
        setCases([])
        setError(null)
        setHasSearched(false)
        lastQueryRef.current = ''
      }
      return undefined
    }
    const cacheKey = `${q}|${machineId || ''}|${excludeReportId || ''}`
    if (cacheKey === lastQueryRef.current) return undefined

    timerRef.current = setTimeout(async () => {
      lastQueryRef.current = cacheKey
      setLoading(true)
      setError(null)
      try {
        const results = await searchSimilarCases({ text: q, machineId, excludeReportId, limit: 3 })
        setCases(results)
        setHasSearched(true)
      } catch (err) {
        console.warn('[SimilarCasesLive] error:', err?.message)
        setError('Ricerca casi simili non disponibile.')
        setCases([])
        setHasSearched(true)
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [text, machineId, excludeReportId, available])

  const showEmpty = hasSearched && cases.length === 0 && !loading && !error

  // Diagnostica: quando empty + machineId, fetcha una volta per macchina i count
  // di chunks indicizzati. Aiuta l'utente a capire se il vuoto è perché la
  // pipeline non ha mai indicizzato i report di questa macchina.
  useEffect(() => {
    if (!showEmpty || !machineId) return
    if (lastDiagMachineRef.current === machineId) return
    lastDiagMachineRef.current = machineId
    setDiagLoading(true)
    getMachineKnowledgeStats(machineId)
      .then(s => setDiagStats(s))
      .finally(() => setDiagLoading(false))
  }, [showEmpty, machineId])

  if (!available) return null
  if (!hasSearched && !loading) return null

  return (
    <>
      <div style={{
        borderRadius: 14,
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
      }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="press-scale"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text)',
          }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-glow-primary)',
          }}>
            <Sparkles size={14} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>
              Casi simili dallo storico
              {cases.length > 0 && (
                <span style={{ fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                  · {cases.length}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
              {loading ? 'Cerco interventi affini…' : showEmpty ? 'Nessun caso simile trovato' : 'Click per aprire il dettaglio'}
            </div>
          </div>
          {open ? <ChevronUp size={16} color="var(--color-text-muted)" /> : <ChevronDown size={16} color="var(--color-text-muted)" />}
        </button>

        {open && (loading || cases.length > 0 || error || showEmpty) && (
          <div style={{ padding: '0 14px 12px 14px', borderTop: '1px solid var(--color-border-subtle)' }}>
            {loading && (
              <div style={{ padding: '12px 0', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                <span className="animate-pulse">Ricerca in corso…</span>
              </div>
            )}

            {error && !loading && (
              <div style={{
                marginTop: 10,
                padding: '8px 10px',
                fontSize: 12.5,
                color: 'var(--color-danger)',
                background: 'var(--color-danger-glow)',
                borderRadius: 10,
              }}>
                {error}
              </div>
            )}

            {showEmpty && (
              <div style={{
                marginTop: 10,
                padding: '8px 10px',
                fontSize: 12.5,
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}>
                <div>Nessuna segnalazione storica simile sulla stessa macchina.</div>
                {diagLoading && (
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                    Verifico indicizzazione…
                  </div>
                )}
                {diagStats && !diagLoading && (
                  <div style={{
                    marginTop: 8,
                    padding: '6px 8px',
                    background: 'var(--color-surface-2)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: 'var(--color-text-muted)',
                    border: '1px dashed var(--color-border-subtle)',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--color-text-secondary)' }}>
                      Diagnostica indicizzazione
                    </div>
                    <div>
                      Macchina: <b>{diagStats.chunks || 0}</b> chunks totali ·{' '}
                      <b>{diagStats.by_kind?.report_chat || 0}</b> da report storici{' '}
                      ({diagStats.by_kind?.attachment || 0} manuali ·{' '}
                      {diagStats.by_kind?.maintenance_log || 0} interventi)
                    </div>
                    {(!diagStats.by_kind?.report_chat || diagStats.by_kind.report_chat === 0) && (
                      <div style={{ marginTop: 4, color: 'var(--color-warning, #f59e0b)' }}>
                        ⚠ Nessun report storico indicizzato per questa macchina.
                        Vai in <b>Macchine → Documentazione</b> e clicca <b>Re-indicizza biblioteca AI</b>.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!loading && cases.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {cases.map(c => (
                  <button
                    key={c.source_ref}
                    type="button"
                    onClick={() => setPreviewCase(c)}
                    className="press-scale"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.report?.title || 'Segnalazione'}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'var(--color-primary-glow)',
                        color: 'var(--color-primary)',
                        flexShrink: 0,
                      }}>
                        {Math.round((c.similarity || 0) * 100)}% simile
                      </span>
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {(c.content || '').slice(0, 220)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {c.report?.machine && <span>{c.report.machine}</span>}
                      {c.report?.updated_at && <span>· {formatDate(c.report.updated_at)}</span>}
                      {c.report?.assigned_to_name && <span>· risolta da {c.report.assigned_to_name}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={!!previewCase} onClose={() => setPreviewCase(null)} title="Caso storico" size="md">
        {previewCase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                {previewCase.report?.title || 'Segnalazione'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {previewCase.report?.machine && <span>{previewCase.report.machine}</span>}
                {previewCase.report?.updated_at && <span>· {formatDate(previewCase.report.updated_at)}</span>}
                {previewCase.report?.assigned_to_name && <span>· risolta da {previewCase.report.assigned_to_name}</span>}
                <span>· {Math.round((previewCase.similarity || 0) * 100)}% simile</span>
              </div>
            </div>

            {previewCase.report?.closure_root_cause && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Causa
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                  {previewCase.report.closure_root_cause}
                </div>
              </div>
            )}

            {previewCase.report?.closure_action && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Azione risolutiva
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                  {previewCase.report.closure_action}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Estratto rilevante
              </div>
              <div style={{
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                background: 'var(--color-surface-2)',
                padding: 12,
                borderRadius: 10,
                whiteSpace: 'pre-wrap',
                border: '1px solid var(--color-border-subtle)',
                maxHeight: 240,
                overflowY: 'auto',
              }}>
                {previewCase.content}
              </div>
            </div>

            {onOpenFull && previewCase.report?.id && (
              <button
                type="button"
                onClick={() => { onOpenFull(previewCase.report.id); setPreviewCase(null) }}
                className="press-scale"
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 10,
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}>
                Apri segnalazione completa
              </button>
            )}

            <button
              type="button"
              onClick={() => setPreviewCase(null)}
              className="press-scale"
              style={{
                alignSelf: 'flex-end',
                padding: '6px 12px',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
              <X size={14} /> Chiudi
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
