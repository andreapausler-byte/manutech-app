/**
 * MaintenanceLogModal — un intervento registrato: cosa è stato fatto.
 *
 * Il corrispettivo di "Come è stato risolto" delle segnalazioni concluse,
 * per le manutenzioni (programmate e non): piano, macchina e pezzo, chi e
 * quando, cosa è stato fatto, durata, ricambi, ditta, foto e PDF, le note
 * aggiunte dopo e la cronologia di chi ha cambiato cosa.
 *
 * Tecnici e admin lo aggiornano senza riscriverlo da capo:
 *   - Correggi: testo, durata, ricambi, data (una registrazione fatta il
 *     giorno dopo sposta anche la scadenza del piano), dati della ditta;
 *   - Aggiungi nota, foto o PDF: il foglio della ditta arrivato dopo, "il
 *     filtro nuovo era della misura sbagliata";
 *   - la X su un allegato messo per sbaglio.
 * Ogni gesto lascia una riga in cronologia (migration 068).
 *
 * Si apre con `key={log.id}`: lo stato interno riparte a ogni intervento.
 * All'apertura rilegge la riga, così note e allegati aggiunti da altri nel
 * frattempo si vedono. `onChanged(log)` riceve la versione salvata.
 *
 * Su telefono il Modal di ui è un foglio dal basso e qui i bersagli sono da
 * guanti (`mobile`); su desktop è il dialog trascinabile. Solo CSS vars.
 */
import { useEffect, useState } from 'react'
import {
  Shield, Wrench, Building, Cog, Pencil, Plus, ChevronDown, ChevronUp,
  Clock, Package, User, CalendarClock, ClipboardList,
} from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatDate, timeAgo, formatTicketId } from '../../lib/constants'
import {
  logTypeMeta, getLogRecord, canEditLog, canRemoveLogMedia, formatMinutes, toLocalDatetimeInput,
} from '../../lib/maintenanceLog'
import { logMediaList } from '../../lib/logMedia'
import { Modal } from '../ui'
import ComponentPill from './ComponentPill'
import LogAttachmentsList from './LogAttachmentsList'
import LogAttachmentsPicker from './LogAttachmentsPicker'
import { useAuth } from '../../contexts/AuthContext'
import { useMaintenanceLogEdit } from '../../hooks/useMaintenanceLogEdit'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

const mono = '"JetBrains Mono", monospace'

function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
      color: 'var(--color-text-faint)', marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  )
}

function Fact({ icon: Icon, label, value, mobile }) {
  return (
    <div style={{ minWidth: 0, padding: '9px 10px', borderRadius: 10, background: 'var(--color-surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--color-text-faint)' }}>
        <Icon size={11} /> {label}
      </div>
      <div style={{
        marginTop: 4, fontSize: mobile ? 15 : 13, fontWeight: 600, lineHeight: 1.3,
        color: value ? 'var(--color-text)' : 'var(--color-text-faint)',
        overflowWrap: 'anywhere',
      }}>
        {value || '—'}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--color-text-faint)', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, primary, disabled, mobile }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press-scale"
      style={{
        flex: 1, minHeight: mobile ? 56 : 42, padding: '8px 14px', borderRadius: mobile ? 14 : 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        fontSize: mobile ? 15 : 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: primary ? 'none' : '1px solid var(--color-border)',
        background: primary ? 'var(--color-primary)' : 'transparent',
        color: primary ? '#fff' : 'var(--color-text-secondary)',
      }}
    >
      {Icon && <Icon size={mobile ? 18 : 15} />} {label}
    </button>
  )
}

// ── Correggi ────────────────────────────────────────────────
function EditForm({ log, mobile, saving, onCancel, onSave }) {
  const toast = useToast()
  const [f, setF] = useState({
    title: log.title || '',
    description: log.description || '',
    duration: log.duration_minutes != null ? String(log.duration_minutes) : '',
    parts: log.parts_replaced || '',
    performedAt: toLocalDatetimeInput(log.performed_at),
    contractorName: log.contractor_name || '',
    contractorRef: log.contractor_reference || '',
  })
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))
  const input = { width: '100%', fontSize: mobile ? 16 : 13, padding: mobile ? '12px 14px' : '9px 12px', borderRadius: 10 }

  const save = () => {
    if (!f.title.trim()) { toast.error('Il titolo non può restare vuoto'); return }
    const when = new Date(f.performedAt)
    if (Number.isNaN(when.getTime())) { toast.error('Data non valida'); return }
    if (when.getTime() > Date.now() + 5 * 60 * 1000) { toast.error('La data è nel futuro'); return }
    const minutes = parseInt(f.duration, 10)
    const fields = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      duration_minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      parts_replaced: f.parts.trim() || null,
      performed_at: when.toISOString(),
    }
    if (log.is_external) {
      fields.contractor_name = f.contractorName.trim() || null
      fields.contractor_reference = f.contractorRef.trim() || null
    }
    onSave(fields)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Titolo">
        <input value={f.title} onChange={set('title')} className="input-field" style={input} />
      </Field>
      <Field label="Cosa è stato fatto">
        <textarea value={f.description} onChange={set('description')} rows={mobile ? 4 : 3}
          placeholder="Es. Sostituito filtro aria, pulito il carter"
          className="input-field" style={{ ...input, resize: 'vertical' }} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Durata (min)">
          <input type="number" inputMode="numeric" min="0" value={f.duration} onChange={set('duration')}
            placeholder="30" className="input-field" style={input} />
        </Field>
        <Field label="Ricambi">
          <input value={f.parts} onChange={set('parts')} placeholder="Filtro XF-420"
            className="input-field" style={input} />
        </Field>
      </div>
      <Field label="Data e ora">
        <input type="datetime-local" value={f.performedAt} onChange={set('performedAt')}
          className="input-field" style={input} />
      </Field>
      {log.is_external && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Ditta">
            <input value={f.contractorName} onChange={set('contractorName')} className="input-field" style={input} />
          </Field>
          <Field label="Rif. bolla / ordine">
            <input value={f.contractorRef} onChange={set('contractorRef')} className="input-field" style={input} />
          </Field>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4, margin: 0 }}>
        In cronologia resta com'era prima. Cambiare la data sposta anche la prossima scadenza del piano.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton label={saving ? 'Salvo…' : 'Salva correzione'} primary onClick={save} disabled={saving} mobile={mobile} />
        <ActionButton label="Annulla" onClick={onCancel} disabled={saving} mobile={mobile} />
      </div>
    </div>
  )
}

// ── Aggiungi nota, foto o PDF ───────────────────────────────
function NoteForm({ log, mobile, saving, onCancel, onSave }) {
  const [text, setText] = useState('')
  const [media, setMedia] = useState([])
  const [attaching, setAttaching] = useState(false)
  const canSubmit = (text.trim() || media.length > 0) && !attaching && !saving

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Nota (facoltativa se alleghi)">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={mobile ? 4 : 3} autoFocus={!mobile}
          placeholder="Es. Il filtro montato era provvisorio: sostituito con l'originale il 12/10"
          className="input-field"
          style={{ width: '100%', fontSize: mobile ? 16 : 13, padding: mobile ? '12px 14px' : '9px 12px', borderRadius: 10, resize: 'vertical' }} />
      </Field>
      <Field label="Foto e documenti">
        <LogAttachmentsPicker mobile={mobile} machineId={log.machine_id} media={media}
          onChange={setMedia} onBusyChange={setAttaching} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton icon={Plus} label={saving ? 'Salvo…' : 'Aggiungi'} primary
          onClick={() => onSave(text, media)} disabled={!canSubmit} mobile={mobile} />
        <ActionButton label="Annulla" onClick={onCancel} disabled={saving} mobile={mobile} />
      </div>
    </div>
  )
}

export default function MaintenanceLogModal({ log: initial, onClose, onChanged, onOpenReport, mobile = false }) {
  const { user } = useAuth()
  const haptic = useHaptic()
  const edit = useMaintenanceLogEdit(user)
  const [log, setLog] = useState(initial)
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'note'
  const [showHistory, setShowHistory] = useState(false)

  // Rilettura all'apertura: la lista può avere una versione vecchia, o
  // non avere i join (piano, segnalazione) che qui servono.
  useEffect(() => {
    let cancelled = false
    db.getMaintenanceLog(initial.id)
      .then(fresh => { if (!cancelled && fresh) setLog(prev => ({ ...prev, ...fresh })) })
      .catch(e => console.warn('[MaintenanceLogModal] reload failed:', e?.message))
    return () => { cancelled = true }
  }, [initial.id])

  const apply = (updated) => {
    if (!updated) return false
    const next = { ...log, ...updated }
    setLog(next)
    onChanged?.(next)
    haptic.success()
    return true
  }

  const canEdit = canEditLog(user)
  const type = logTypeMeta(log)
  const TypeIcon = log.type === 'programmata' ? Shield : Wrench
  const { notes, history } = getLogRecord(log)
  const media = logMediaList(log)
  const duration = formatMinutes(log.duration_minutes)
  const registeredAt = log.created_at || log.performed_at

  const badge = (color, children) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 8,
      background: `${color}1F`, border: `1px solid ${color}55`, color,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0,
    }}>
      {children}
    </span>
  )

  return (
    <Modal open onClose={onClose} title="Intervento registrato" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Intestazione ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {badge(type.color, <><TypeIcon size={12} /> {type.label}</>)}
            {log.is_external && badge('#f59e0b', <><Building size={12} /> Ditta esterna</>)}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: mono }}>
              {formatDate(log.performed_at)}
            </span>
          </div>
          <h3 style={{ margin: '10px 0 0', fontSize: mobile ? 20 : 17, fontWeight: 700, lineHeight: 1.25, color: 'var(--color-text)', overflowWrap: 'anywhere' }}>
            {log.title}
          </h3>
          {(log.machine?.name || log.component?.name) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
              {log.machine?.name && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <Cog size={14} /> {log.machine.name}
                </span>
              )}
              {log.component?.name && <ComponentPill name={log.component.name} size="sm" />}
            </div>
          )}
          {log.plan?.name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              <CalendarClock size={13} /> Piano «{log.plan.name}» · ogni {log.plan.frequency_days} giorni
            </div>
          )}
          {log.report && (
            <button
              type="button"
              onClick={onOpenReport ? () => onOpenReport(log.report) : undefined}
              disabled={!onOpenReport}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, padding: 0,
                background: 'transparent', border: 'none', textAlign: 'left',
                fontSize: 12.5, color: onOpenReport ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: onOpenReport ? 'pointer' : 'default', minHeight: mobile ? 32 : undefined,
              }}
            >
              <ClipboardList size={13} /> Dalla segnalazione {formatTicketId(log.report)} · {log.report.title}
            </button>
          )}
        </div>

        {mode === 'edit' && (
          <EditForm log={log} mobile={mobile} saving={edit.saving}
            onCancel={() => setMode('view')}
            onSave={async (fields) => { if (apply(await edit.saveEdit(log, fields))) setMode('view') }} />
        )}

        {mode === 'note' && (
          <NoteForm log={log} mobile={mobile} saving={edit.saving}
            onCancel={() => setMode('view')}
            onSave={async (text, files) => { if (apply(await edit.addNote(log, text, files))) setMode('view') }} />
        )}

        {mode === 'view' && (
          <>
            {/* ── Cosa è stato fatto ── */}
            <div>
              <SectionLabel>Cosa è stato fatto</SectionLabel>
              <div style={{
                padding: '10px 12px', borderRadius: 10, background: 'var(--color-surface-2)',
                fontSize: mobile ? 15 : 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                color: log.description ? 'var(--color-text)' : 'var(--color-text-faint)',
                fontStyle: log.description ? 'normal' : 'italic',
              }}>
                {log.description || 'Nessuna descrizione: registrato solo come fatto.'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Fact icon={User} label="Eseguito da" value={log.performed_by_name} mobile={mobile} />
              <Fact icon={Clock} label="Durata" value={duration} mobile={mobile} />
              <Fact icon={Package} label="Ricambi" value={log.parts_replaced} mobile={mobile} />
              {log.is_external
                ? <Fact icon={Building} label="Ditta" value={[log.contractor_name, log.contractor_reference && `rif. ${log.contractor_reference}`].filter(Boolean).join(' · ')} mobile={mobile} />
                : <Fact icon={Building} label="Ditta" value="Interno" mobile={mobile} />}
            </div>

            {/* ── Foto e documenti ── */}
            {media.length > 0 && (
              <div>
                <SectionLabel>Foto e documenti · {media.length}</SectionLabel>
                <LogAttachmentsList log={log} mobile={mobile} large
                  onRemove={canEdit ? async (item) => apply(await edit.removeMedia(log, item)) : undefined}
                  canRemove={(item) => canRemoveLogMedia(item, log, user)} />
              </div>
            )}

            {/* ── Aggiunto dopo ── */}
            {notes.length > 0 && (
              <div>
                <SectionLabel>Aggiunto dopo · {notes.length}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {notes.map((n, i) => (
                    <div key={`${n.created_at}-${i}`} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--color-surface-2)' }}>
                      <div style={{ fontSize: 10.5, color: 'var(--color-text-faint)', fontFamily: mono, marginBottom: 3 }}>
                        {n.user_name || 'Utente'} · {timeAgo(n.created_at)}
                      </div>
                      <div style={{ fontSize: mobile ? 14.5 : 13, color: 'var(--color-text)', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {n.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Azioni ── */}
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, flexDirection: mobile ? 'column' : 'row' }}>
                <ActionButton icon={Plus} label="Aggiungi nota, foto o PDF" primary mobile={mobile}
                  onClick={() => { haptic.light(); setMode('note') }} />
                <ActionButton icon={Pencil} label="Correggi" mobile={mobile}
                  onClick={() => { haptic.light(); setMode('edit') }} />
              </div>
            )}

            {/* ── Cronologia ── */}
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowHistory(v => !v)}
                aria-expanded={showHistory}
                style={{
                  width: '100%', minHeight: mobile ? 44 : 30, padding: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                }}
              >
                Cronologia · {history.length + 1}
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showHistory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {[
                    { detail: 'Registrato', user_name: log.performed_by_name, created_at: registeredAt },
                    ...history,
                  ].map((h, i) => (
                    <div key={`${h.created_at}-${i}`} style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0, background: i === 0 ? type.color : 'var(--color-text-faint)' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                          {h.detail}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--color-text-faint)', fontFamily: mono, marginTop: 2 }}>
                          {h.user_name || 'Utente'} · {formatDate(h.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {mobile && (
              <ActionButton label="Chiudi" onClick={onClose} mobile />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
