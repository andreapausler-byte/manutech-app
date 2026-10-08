/**
 * PlanDrawer — un piano di manutenzione, dal lato destro della pagina.
 *
 * Se il piano è scaduto o scade entro la settimana si apre già sul modulo
 * "Registra intervento": cosa è stato fatto, durata, ricambi, foto e PDF.
 * Il log nasce programmato, sul pezzo del piano, col nome del piano come
 * titolo; per cambiare uno di questi c'è il modulo completo. Aprirlo con
 * `key={plan.id}`: cambiando piano il modulo riparte vuoto.
 */

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { BtnGhost } from '../../../components/manutech'
import ComponentPill from '../../../components/machines/ComponentPill'
import LogAttachmentsPicker from '../../../components/machines/LogAttachmentsPicker'
import { formatDay } from '../../../lib/constants'
import { formatMinutes } from '../../../lib/maintenanceLog'
import { CycleBar } from './MaintenanceBits'
import { MONO, TONES, cyclePercent, monoLabel } from './planUi'

const section = { padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }
const field = {
  width: '100%', padding: '9px 10px', outline: 'none', fontSize: 14,
  background: 'var(--color-app-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
}

export default function PlanDrawer({
  task, recentLogs, durationStats, blocked,
  onClose, onRegister, onOpenLog, onFullForm, onEdit, onDuplicate, onDelete,
}) {
  const { plan, machine, lastLog, light } = task
  const tone = TONES[light.status]
  const urgent = light.status !== 'ok'
  const percent = cyclePercent(task)

  const [formOpen, setFormOpen] = useState(urgent)
  const [done, setDone] = useState(false)
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('')
  const [parts, setParts] = useState('')
  const [media, setMedia] = useState([])
  const [attaching, setAttaching] = useState(false)
  const [saving, setSaving] = useState(false)

  // Esc chiude il pannello, ma non quando sopra c'è un modulo aperto.
  useEffect(() => {
    if (blocked) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocked, onClose])

  const register = async () => {
    setSaving(true)
    const ok = await onRegister(task, { description, duration, parts, media })
    setSaving(false)
    if (!ok) return
    setDone(true)
    setFormOpen(false)
    setDescription(''); setDuration(''); setParts(''); setMedia([])
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.45)' }} />
      <aside role="dialog" aria-label={`Piano: ${plan.name}`} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 41, width: 440, maxWidth: '100%',
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-surface-1)', borderLeft: '1px solid var(--color-border-hover)',
        boxShadow: '-20px 0 40px rgba(0,0,0,0.4)', color: 'var(--color-text)',
      }}>
        <div style={{ ...section, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--color-primary)' }}>
              {machine.name}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15, marginTop: 4 }}>{plan.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi" style={{
            width: 30, height: 30, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', cursor: 'pointer',
          }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ ...section, background: tone.dim }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: tone.color }}>{light.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                OGNI {plan.frequency_days} GIORNI
              </span>
            </div>
            <CycleBar percent={percent} color={tone.color} height={4} style={{ marginTop: 10 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: MONO, fontSize: 11, color: 'var(--color-text-faint)' }}>
              <span>ULTIMO · {lastLog ? formatDay(lastLog.performed_at).toUpperCase() : 'MAI'}</span>
              <span>{Math.round(percent)}% CICLO</span>
            </div>
          </div>

          {done && (
            <div role="status" style={{
              margin: '14px 18px 0', padding: '10px 12px', fontSize: 13,
              background: 'var(--color-green-bg)', border: '1px solid var(--color-primary-dark)', color: 'var(--color-primary)',
            }}>
              ✓ Intervento registrato. Prossima scadenza tra {plan.frequency_days} giorni.
            </div>
          )}

          {formOpen ? (
            <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={monoLabel}>Registra intervento</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} autoFocus
                aria-label="Cosa è stato fatto"
                placeholder="Cosa è stato fatto (facoltativo) — es. tutto regolare"
                style={{ ...field, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input value={duration} onChange={e => setDuration(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" aria-label="Durata in minuti"
                  placeholder={durationStats ? String(durationStats.avg) : 'min'}
                  style={{ ...field, width: 90, fontFamily: MONO }} />
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-faint)' }}>
                  MIN{durationStats ? ` · DI SOLITO ${durationStats.avg}` : ''}
                </span>
              </div>
              <input value={parts} onChange={e => setParts(e.target.value)} aria-label="Ricambi"
                placeholder="Ricambi usati (facoltativo)" style={field} />
              <LogAttachmentsPicker
                machineId={machine.id}
                media={media}
                onChange={setMedia}
                onBusyChange={setAttaching}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={register} disabled={saving || attaching} style={{
                  flex: 1, padding: 11, cursor: saving || attaching ? 'wait' : 'pointer',
                  background: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)', color: '#fff',
                  fontSize: 15, fontWeight: 600, letterSpacing: 0.8, opacity: saving || attaching ? 0.6 : 1,
                }}>{saving ? 'REGISTRAZIONE…' : '✓ CONFERMA ESECUZIONE'}</button>
                <button type="button" onClick={() => setFormOpen(false)} style={{
                  padding: '11px 14px', cursor: 'pointer', background: 'transparent',
                  border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontFamily: MONO, fontSize: 11,
                }}>ANNULLA</button>
              </div>
              <button type="button" onClick={() => onFullForm(task)} style={{
                alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 12, color: 'var(--color-text-muted)', textDecoration: 'underline', textUnderlineOffset: 3,
              }}>Altro titolo o altro pezzo? Apri il modulo completo</button>
            </div>
          ) : !done && (
            <div style={section}>
              <BtnGhost size="sm" onClick={() => setFormOpen(true)}>Registra in anticipo</BtnGhost>
            </div>
          )}

          <div style={{ ...section, display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px 12px', alignItems: 'center', fontSize: 13 }}>
            <span style={monoLabel}>Area</span>
            <span>{machine.department || '—'}</span>
            <span style={monoLabel}>Responsabile</span>
            <span>
              {plan.assigned_to_name || (
                <span style={{ color: 'var(--color-warning)' }}>
                  Non assegnato ·{' '}
                  <button type="button" onClick={() => onEdit(plan)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                  }}>assegna</button>
                </span>
              )}
            </span>
            <span style={monoLabel}>Pezzo</span>
            <span>{plan.component?.name ? <ComponentPill name={plan.component.name} size="sm" /> : 'Intero macchinario'}</span>
            {durationStats && (
              <>
                <span style={monoLabel}>Durata media</span>
                <span style={{ fontFamily: MONO }}>
                  {formatMinutes(durationStats.avg)}
                  <span style={{ color: 'var(--color-text-faint)' }}> · {durationStats.count} {durationStats.count === 1 ? 'volta' : 'volte'}</span>
                </span>
              </>
            )}
            {plan.current_status === 'in_corso' && (
              <>
                <span style={monoLabel}>Stato</span>
                <span style={{ color: 'var(--color-primary)' }}>In corso{plan.taken_by_name ? ` · ${plan.taken_by_name}` : ''}</span>
              </>
            )}
          </div>

          <div style={section}>
            <div style={{ ...monoLabel, marginBottom: 8 }}>Istruzioni</div>
            {plan.instructions ? (
              <div style={{
                fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                borderLeft: '3px solid var(--color-primary-dark)', padding: '4px 0 4px 12px',
              }}>{plan.instructions}</div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>Nessuna istruzione: si aggiungono da Modifica piano.</div>
            )}
          </div>

          <div style={{ padding: '16px 18px' }}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Ultimi interventi su questa macchina</div>
            {recentLogs.length ? recentLogs.map(log => (
              <button key={log.id} type="button" onClick={() => onOpenLog(log)}
                className="transition-colors hover:bg-white/[0.03]"
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                  background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', padding: '8px 0',
                }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{log.title}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2, textTransform: 'uppercase' }}>
                  {[formatDay(log.performed_at), log.performed_by_name, formatMinutes(log.duration_minutes)].filter(Boolean).join(' · ')}
                </div>
              </button>
            )) : (
              <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-faint)' }}>Nessun intervento registrato</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--color-border)' }}>
          <BtnGhost size="sm" onClick={() => onEdit(plan)}>Modifica piano</BtnGhost>
          <BtnGhost size="sm" onClick={() => onDuplicate(plan)}>Duplica</BtnGhost>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => onDelete(plan)} style={{
            padding: '6px 12px', cursor: 'pointer', background: 'transparent',
            border: '1px solid var(--color-red-bg)', color: 'var(--color-danger)',
            fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 1,
          }}>ELIMINA</button>
        </div>
      </aside>
    </>
  )
}
