/**
 * ClosurePanel — come è stata risolta la segnalazione (dettaglio admin).
 *
 * Gemello del riquadro "Come è stato risolto" del dettaglio mobile: stessi
 * dati (lib/closure.js), stessi due gesti — correggere la chiusura o
 * aggiungere un'informazione arrivata dopo, con o senza documenti (foglio
 * d'intervento, fattura: useClosureEdit). Qui il form è in linea dentro il
 * pannello: sul desktop c'è spazio e l'admin non perde di vista il resto
 * del ticket mentre scrive. La fattura arriva per email in ufficio: il PDF
 * si trascina sul riquadro.
 *
 * Spaziature inline: le utility p-* e m-* di Tailwind sono azzerate dal
 * reset globale di index.css (debito tecnico noto).
 */

import { useState } from 'react'
import { Wrench, XCircle, Pencil, Plus, AlertTriangle, Check } from 'lucide-react'
import { formatDate, timeAgo, isTerminalStatus } from '../../../lib/constants'
import { getClosure, hasClosureData, isClosureIncomplete, closedAtOf } from '../../../lib/closure'
import { useClosureEdit } from '../../../hooks/useClosureEdit'
import ClosureHelpful from '../../../components/reports/ClosureHelpful'
import ClosureDocsPicker from '../../../components/reports/ClosureDocsPicker'
import ClosureDocsList from '../../../components/reports/ClosureDocsList'

const fieldLabel = 'block text-[11px] text-faint uppercase tracking-wider'
const inputCls = 'w-full input-field rounded-xl text-sm'
const inputPad = { padding: '9px 12px' }

function Field({ label, value, mono }) {
  return (
    <div className="bg-surface-1 rounded-lg" style={{ padding: '8px 10px' }}>
      <p className="text-[10px] text-faint uppercase tracking-wider font-semibold">{label}</p>
      <p
        className={mono ? 'text-sm text-themed font-bold' : 'text-xs text-secondary'}
        style={{ marginTop: 2, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: mono ? '"JetBrains Mono", monospace' : undefined }}
      >
        {value}
      </p>
    </div>
  )
}

export default function ClosurePanel({ report, user, components = [], canEdit, onUpdate }) {
  const closure = getClosure(report)
  const hasData = hasClosureData(closure)
  const terminal = isTerminalStatus(report.status)
  const incomplete = isClosureIncomplete(report)
  const archivedWithoutWork = report.status === 'chiuso' && !hasData
  const reopened = !terminal && hasData
  const { saving, saveEdit, addNote, removeDoc } = useClosureEdit(user)
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'note'
  const [form, setForm] = useState(null)
  const [note, setNote] = useState('')
  const [docs, setDocs] = useState([])

  if (!hasData && !terminal) return null

  const startEdit = () => {
    setForm({
      hours: closure.hours != null ? String(closure.hours) : '',
      parts: closure.parts || '',
      rootCause: closure.rootCause || '',
      action: closure.action || '',
      componentId: report.component_id || '',
    })
    setMode('edit')
  }

  const submitEdit = async () => {
    if (!form.rootCause.trim()) return
    const hours = parseFloat(form.hours)
    const data = {
      closure_hours: Number.isFinite(hours) ? hours : null,
      closure_parts: form.parts.trim() || null,
      closure_root_cause: form.rootCause.trim(),
      closure_action: form.action.trim() || null,
    }
    // Senza l'elenco dei pezzi il pezzo non si tocca (vedi useClosureEdit).
    if (components.length > 0) {
      const comp = components.find(c => c.id === form.componentId) || null
      data.component_id = comp?.id || null
      data.component_name = comp?.name || null
    }
    const updated = await saveEdit(report, data)
    if (!updated) return
    if (updated !== report) onUpdate(updated)
    setMode('view')
  }

  const submitNote = async () => {
    const updated = await addNote(report, note, docs)
    if (!updated) return
    onUpdate(updated)
    setNote('')
    setDocs([])
    setMode('view')
  }

  const cancelNote = () => {
    setNote('')
    setDocs([])
    setMode('view')
  }

  const submitRemoveDoc = async (doc) => {
    const updated = await removeDoc(report, doc)
    if (updated) onUpdate(updated)
  }

  const missing = [
    !closure.rootCause && 'la causa radice',
    !closure.action && "l'azione correttiva",
  ].filter(Boolean)
  const tone = archivedWithoutWork
    ? { border: 'var(--color-border)', bg: 'var(--color-surface-2)', text: 'var(--color-text-muted)' }
    : incomplete
      ? { border: 'rgba(245,158,11,0.35)', bg: 'rgba(245,158,11,0.07)', text: '#f59e0b' }
      : { border: 'rgba(16,185,129,0.30)', bg: 'rgba(16,185,129,0.07)', text: '#10b981' }
  const title = reopened ? 'Chiusura precedente'
    : archivedWithoutWork ? 'Archiviata senza intervento'
    : 'Come è stato risolto'
  const when = closedAtOf(report)
  const subtitle = reopened
    ? 'La segnalazione è stata riaperta'
    : [when && formatDate(when), !archivedWithoutWork && report.assigned_to_name].filter(Boolean).join(' · ')
  const allowEdit = canEdit && terminal && !archivedWithoutWork

  return (
    <div className="rounded-xl" style={{ border: `1px solid ${tone.border}`, background: tone.bg, padding: 14 }}>
      <div className="flex items-start gap-2" style={{ marginBottom: 10 }}>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1.5" style={{ color: tone.text }}>
            {archivedWithoutWork ? <XCircle size={12} /> : <Wrench size={12} />} {title}
          </p>
          {subtitle && <p className="text-[11px] text-faint" style={{ marginTop: 2 }}>{subtitle}</p>}
        </div>
        {allowEdit && mode === 'view' && (
          <button onClick={startEdit}
            className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 shrink-0">
            <Pencil size={12} /> Correggi
          </button>
        )}
      </div>

      {mode === 'edit' && form ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel} style={{ marginBottom: 4 }}>Ore lavoro</label>
              <input type="number" step="0.5" min="0" value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="es. 2.5" className={inputCls} style={inputPad} />
            </div>
            <div>
              <label className={fieldLabel} style={{ marginBottom: 4 }}>Ricambi utilizzati</label>
              <input type="text" value={form.parts}
                onChange={e => setForm(f => ({ ...f, parts: e.target.value }))}
                placeholder="es. Cuscinetto SKF 6205" className={inputCls} style={inputPad} />
            </div>
          </div>
          {components.length > 0 && (
            <div>
              <label className={fieldLabel} style={{ marginBottom: 4 }}>Pezzo interessato</label>
              <select value={form.componentId}
                onChange={e => setForm(f => ({ ...f, componentId: e.target.value }))}
                className={inputCls} style={inputPad}>
                <option value="">Generico — intera macchina</option>
                {components.map(c => (
                  <option key={c.id} value={c.id}>{c.type ? `${c.name} (${c.type})` : c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={fieldLabel} style={{ marginBottom: 4 }}>Causa radice *</label>
            <textarea value={form.rootCause} rows={2}
              onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))}
              placeholder="Cosa ha causato il problema?"
              className={`${inputCls} resize-none`} style={inputPad} />
          </div>
          <div>
            <label className={fieldLabel} style={{ marginBottom: 4 }}>Azione correttiva</label>
            <textarea value={form.action} rows={2}
              onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
              placeholder="Cosa è stato fatto per risolvere?"
              className={`${inputCls} resize-none`} style={inputPad} />
          </div>
          <p className="text-[11px] text-faint">Lo stato non cambia. In cronologia resta cosa c'era prima.</p>
          <div className="flex gap-2">
            <button onClick={submitEdit} disabled={saving || !form.rootCause.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
              style={{ padding: '9px 0' }}>
              <Check size={14} /> Salva modifiche
            </button>
            <button onClick={() => setMode('view')}
              className="flex-1 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-themed transition-all"
              style={{ padding: '9px 0' }}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <>
          {archivedWithoutWork && (
            <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
              Chiusa senza registrare un intervento: niente ore, causa o ricambi.
            </p>
          )}
          {hasData && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ore" value={closure.hours != null ? `${closure.hours}h` : '—'} mono />
                <Field label="Ricambi" value={closure.parts || 'Nessuno indicato'} />
              </div>
              {closure.rootCause && <Field label="Causa radice" value={closure.rootCause} />}
              {closure.action && <Field label="Azione correttiva" value={closure.action} />}
            </div>
          )}
          {incomplete && (
            <div className="rounded-lg flex items-center gap-2"
              style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)' }}>
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <span className="flex-1 text-xs text-secondary">
                Manca {missing.join(' e ')}: chi troverà lo stesso guasto partirà da qui.
              </span>
              {allowEdit && (
                <button onClick={startEdit}
                  className="text-xs font-bold rounded-md bg-amber-500 text-black hover:bg-amber-400 shrink-0"
                  style={{ padding: '5px 10px' }}>
                  Completa
                </button>
              )}
            </div>
          )}
        </>
      )}

      {closure.photos.length > 0 && mode !== 'edit' && (
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>
          {closure.photos.map((p, i) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer"
              title={`Foto del pezzo ${i + 1}`}
              className="rounded-lg overflow-hidden hover:ring-2 hover:ring-emerald-500/40"
              style={{ width: 64, height: 64, border: '1px solid var(--color-border)' }}>
              <img src={p.thumb_url || p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
          ))}
        </div>
      )}

      {mode !== 'edit' && (
        <ClosureDocsList report={report} user={user} busy={saving}
          onRemove={canEdit ? submitRemoveDoc : undefined}
          style={{ marginTop: 12 }} />
      )}

      {hasData && terminal && mode !== 'edit' && (
        <ClosureHelpful report={report} user={user} style={{ marginTop: 12 }} />
      )}

      {closure.notes.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border-subtle)' }}>
          <p className="text-[10px] text-faint uppercase tracking-wider font-semibold" style={{ marginBottom: 6 }}>
            Aggiunto dopo · {closure.notes.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {closure.notes.map((n, i) => (
              <div key={`${n.created_at}-${i}`} className="bg-surface-1 rounded-lg" style={{ padding: '8px 10px' }}>
                <p className="text-[10px] text-faint" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {n.user_name || 'Utente'} · {timeAgo(n.created_at)}
                </p>
                <p className="text-xs text-themed" style={{ marginTop: 2, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {n.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {canEdit && terminal && mode !== 'edit' && (
        mode === 'note' ? (
          <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
            <textarea value={note} rows={3} autoFocus
              onChange={e => setNote(e.target.value)}
              placeholder="Quello che si è saputo dopo: se il guasto è tornato, il codice esatto del ricambio, cosa controllare la prossima volta (facoltativo se alleghi un documento)"
              className={`${inputCls} resize-none`} style={inputPad} />
            <ClosureDocsPicker reportId={report.id} docs={docs} onChange={setDocs} />
            <div className="flex gap-2">
              <button onClick={submitNote} disabled={saving || (!note.trim() && docs.length === 0)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-all disabled:opacity-50"
                style={{ padding: '9px 0' }}>
                <Plus size={14} /> {docs.length && !note.trim() ? 'Allega alla chiusura' : 'Aggiungi alla chiusura'}
              </button>
              <button onClick={cancelNote}
                className="flex-1 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-themed transition-all"
                style={{ padding: '9px 0' }}>
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setMode('note')}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-secondary hover:text-themed transition-all"
            style={{ marginTop: 12, padding: '8px 0', border: '1px dashed var(--color-border)' }}>
            <Plus size={13} /> Aggiungi nota o documento
          </button>
        )
      )}
    </div>
  )
}
