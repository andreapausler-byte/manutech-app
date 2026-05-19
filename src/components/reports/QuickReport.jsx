/**
 * QuickReport — Report rapido in 3 tap
 *
 * Flusso: Seleziona problema → Seleziona macchinario → Invia (+ foto opzionale)
 *
 * Step 1: Griglia icone grandi per tipo problema (pre-compilato)
 * Step 2: Selezione macchinario + nota opzionale + foto
 * Step 3: Conferma e invio con animazione successo
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { QUICK_TEMPLATES, SEVERITY, formatTicketId } from '../../lib/constants'
import { Button, Select, Input } from '../ui'
import MediaCapture from '../media/MediaCapture'
import QRScanner from '../media/QRScanner'
import SuccessAnimation from '../ui/SuccessAnimation'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { ArrowLeft, Send, ChevronRight, Zap, MessageSquare, Camera, QrCode } from 'lucide-react'

export default function QuickReport({ user, onBack, onCreated, preselectedMachine }) {
  const [step, setStep] = useState(1)
  const [template, setTemplate] = useState(null)
  const [machine, setMachine] = useState(preselectedMachine || '')
  const [note, setNote] = useState('')
  const [extraData, setExtraData] = useState({})
  const [media, setMedia] = useState([])
  const [machines, setMachines] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [assignMode, setAssignMode] = useState('none')
  const [assignTo, setAssignTo] = useState('')
  const [assignName, setAssignName] = useState('')

  const toast = useToast()
  const haptic = useHaptic()

  useEffect(() => {
    db.getMachines().then(setMachines)
    db.getUsers().then(u => setUsers(u.filter(x => x.role === 'tecnico' || x.role === 'admin')))
  }, [])

  const selectTemplate = (t) => {
    haptic.medium()
    setTemplate(t)
    setStep(2)
  }

  const handleSubmit = async () => {
    if (!template) return
    setLoading(true)
    haptic.light()

    try {
      let description = template.description

      const extraParts = Object.entries(extraData)
        .filter(([, val]) => val.trim())
        .map(([key, val]) => {
          const field = template.extraFields?.find(f => f.key === key)
          return field ? `${field.label}: ${val}` : ''
        })
        .filter(Boolean)

      if (extraParts.length > 0) {
        description += '\n\n' + extraParts.join('\n')
      }

      if (note.trim()) {
        description += `\n\nNota operatore: ${note.trim()}`
      }

      // Assegnazione
      const assignee = assignMode === 'internal' && assignTo
        ? users.find(u => u.id === assignTo) : null
      const assignedToId = assignee ? assignee.id : null
      const assignedToName = assignMode === 'external' && assignName.trim()
        ? assignName.trim()
        : assignee ? assignee.name : null
      const reportStatus = assignedToId || assignedToName ? 'assegnata' : 'aperta'

      const created = await db.createReport({
        title: template.title,
        machine: machine || null,
        severity: template.severity,
        description,
        media,
        created_by: user.id,
        created_by_name: user.name,
        assigned_to: assignedToId,
        assigned_to_name: assignedToName,
        status: reportStatus,
        is_quick: true,
        template_id: template.id,
        extra_data: Object.keys(extraData).length > 0 ? extraData : null,
      })
      db.addActivity(created.id, {
        type: 'quick_created', user_id: user.id, user_name: user.name,
        detail: `Template: ${template.label}${machine ? ` · ${machine}` : ''}`,
      }).catch(e => console.warn('Side effect failed:', e.message))
      db.addNotification({
        type: template.severity === 'critica' ? 'new_report_critical' : 'new_report',
        title: `${formatTicketId(created)} · ${template.title}`,
        body: `${user.name} — ${template.label}${machine ? ` su ${machine}` : ''}`,
        report_id: created.id, from_user: user.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))

      setShowSuccess(true)
    } catch (err) {
      toast.error('Errore invio: ' + err.message)
      setLoading(false)
    }
  }

  const handleSuccessComplete = () => {
    toast.success('Segnalazione rapida inviata!')
    onCreated()
  }

  if (showSuccess) {
    return (
      <SuccessAnimation
        message="Segnalazione Inviata!"
        subtitle="Report rapido creato"
        onComplete={handleSuccessComplete}
      />
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base">
      {/* Header */}
      <header className="header-page flex items-center gap-[2vw] px-[3vw] py-[2.5vw]">
        <button
          onClick={() => step === 2 ? setStep(1) : onBack()}
          className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center active:bg-white/10 text-muted press-scale"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <Zap size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-themed">Report Rapido</h1>
        </div>
      </header>

      {/* Progress bar segmented */}
      <div style={{
        display: 'flex', gap: 4,
        padding: '0 4vw', marginTop: 4,
      }}>
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          background: 'var(--color-warning)',
          transition: 'background 0.3s',
        }} />
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          background: step >= 2 ? 'var(--color-warning)' : 'var(--color-surface-3)',
          transition: 'background 0.3s',
        }} />
      </div>

      {/* ── STEP 1: Template selection ── */}
      {step === 1 && (
        <div className="px-[4vw] py-[5vw] animate-fade-in">
          <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', marginBottom: '4vw', fontWeight: 500 }}>
            Che tipo di problema?
          </p>

          <div className="grid grid-cols-2 gap-[3vw]">
            {QUICK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTemplate(t)}
                className="press-scale"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '2.5vw', padding: '5vw 2vw',
                  background: `linear-gradient(160deg, ${t.color}08 0%, ${t.color}03 100%)`,
                  border: '1.5px solid var(--color-border)',
                  borderRadius: 20,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = t.color + '50'
                  e.currentTarget.style.boxShadow = `0 4px 20px ${t.color}15`
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                <div style={{
                  width: '15vw', height: '15vw', maxWidth: 60, maxHeight: 60,
                  borderRadius: 16,
                  background: t.color + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28,
                }}>
                  {t.icon}
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{t.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '3px 10px', borderRadius: 'var(--radius-full)',
                  background: SEVERITY[t.severity].bg, color: SEVERITY[t.severity].color,
                }}>
                  {SEVERITY[t.severity].label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Details + submit ── */}
      {step === 2 && template && (
        <div className="px-[4vw] py-[5vw] space-y-[4vw] pb-10 animate-fade-in">
          {/* Selected template recap */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '3.5vw',
            padding: '14px 16px',
            background: template.color + '0C',
            border: `2px solid ${template.color}30`,
            borderRadius: 18,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: template.color + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>
              {template.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{template.title}</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.4, marginTop: 2 }}>{template.description}</p>
            </div>
          </div>

          {/* Machine selection — horizontal scrollable chips */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Macchinario
            </label>
            {machines.length > 0 ? (
              <div className="no-scrollbar" style={{
                display: 'flex', gap: 8, overflowX: 'auto',
                paddingBottom: 4,
              }}>
                <button
                  onClick={() => { haptic.light(); setMachine('') }}
                  className="press-scale"
                  style={{
                    padding: '10px 18px', borderRadius: 'var(--radius-full)',
                    fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                    background: !machine ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: !machine ? '#fff' : 'var(--color-text-secondary)',
                    border: `1.5px solid ${!machine ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  Nessuno
                </button>
                {machines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { haptic.light(); setMachine(m.name) }}
                    className="press-scale"
                    style={{
                      padding: '10px 18px', borderRadius: 'var(--radius-full)',
                      fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                      background: machine === m.name ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: machine === m.name ? '#fff' : 'var(--color-text-secondary)',
                      border: `1.5px solid ${machine === m.name ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>
                Nessun macchinario configurato
              </p>
            )}

            {/* QR Scan button */}
            <button
              onClick={() => { haptic.light(); setShowQR(true) }}
              className="press-scale"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 0', marginTop: 10,
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1.5px solid rgba(139, 92, 246, 0.25)',
                borderRadius: 16,
                fontSize: 14, fontWeight: 600, color: '#8b5cf6',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <QrCode size={18} />
              Scansiona QR Macchinario
            </button>
          </div>

          {/* QR Scanner overlay */}
          {showQR && (
            <QRScanner
              machines={machines}
              onScan={(data) => {
                setMachine(data.name)
                setShowQR(false)
                toast.success(`Macchinario: ${data.name}`)
              }}
              onClose={() => setShowQR(false)}
            />
          )}

          {/* Smart Form — Dynamic extra fields */}
          {template.extraFields?.length > 0 && (
            <div style={{
              background: 'var(--color-surface-2)',
              borderRadius: 18, padding: 16,
              border: '1px solid var(--color-border)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                📋 Dettagli specifici
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {template.extraFields.map((field) => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600 }}>
                      {field.label}
                    </label>
                    {field.type === 'select' ? (
                      <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                        {field.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              haptic.light()
                              setExtraData(prev => ({ ...prev, [field.key]: prev[field.key] === opt ? '' : opt }))
                            }}
                            className="press-scale"
                            style={{
                              padding: '8px 14px', borderRadius: 'var(--radius-full)',
                              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                              background: extraData[field.key] === opt ? template.color : 'var(--color-surface-3)',
                              color: extraData[field.key] === opt ? '#fff' : 'var(--color-text-secondary)',
                              border: `1.5px solid ${extraData[field.key] === opt ? template.color : 'var(--color-border)'}`,
                              cursor: 'pointer', transition: 'all 0.15s',
                              boxShadow: extraData[field.key] === opt ? `0 2px 10px ${template.color}33` : 'none',
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={extraData[field.key] || ''}
                        onChange={e => setExtraData(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder || ''}
                        className="input-field"
                        style={{ width: '100%', borderRadius: 14, padding: '12px 16px', fontSize: 14 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional note toggle */}
          {!showNote ? (
            <button
              onClick={() => { setShowNote(true); haptic.light() }}
              className="press-scale"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 0',
                background: 'var(--color-surface-2)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 16,
                fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <MessageSquare size={18} />
              Aggiungi nota (opzionale)
            </button>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Nota aggiuntiva
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Dettagli aggiuntivi..."
                className="input-field"
                style={{ width: '100%', borderRadius: 16, padding: '14px 16px', fontSize: 14, resize: 'none' }}
                rows={3}
                autoFocus
              />
            </div>
          )}

          {/* Assegnazione rapida */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Assegna a (opzionale)
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'none', label: 'Nessuno' },
                { id: 'internal', label: 'Tecnico' },
                { id: 'external', label: 'Fornitore' },
              ].map(opt => {
                const active = assignMode === opt.id
                return (
                  <button key={opt.id} onClick={() => { haptic.light(); setAssignMode(opt.id); setAssignTo(''); setAssignName('') }}
                    className="press-scale"
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
                      border: `2px solid ${active ? template.color : 'var(--color-border)'}`,
                      background: active ? `${template.color}15` : 'var(--color-surface-2)',
                      color: active ? template.color : 'var(--color-text-muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {assignMode === 'internal' && (
              <div style={{ marginTop: 10 }}>
                <Select
                  value={assignTo}
                  onChange={e => setAssignTo(e.target.value)}
                  options={[
                    { value: '', label: 'Seleziona tecnico...' },
                    ...users.map(u => ({ value: u.id, label: `${u.name} (${u.role})` }))
                  ]}
                />
              </div>
            )}
            {assignMode === 'external' && (
              <div style={{ marginTop: 10 }}>
                <Input
                  placeholder="Nome fornitore o azienda esterna"
                  value={assignName}
                  onChange={e => setAssignName(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Quick photo */}
          <MediaCapture media={media} onChange={setMedia} />

          {/* Submit button with glow */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="press-scale"
            style={{
              width: '100%', padding: 16, borderRadius: 16,
              fontSize: 16, fontWeight: 700,
              background: loading ? 'var(--color-surface-3)' : `linear-gradient(135deg, ${template.color}, ${template.color}cc)`,
              color: loading ? 'var(--color-text-muted)' : '#fff',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading ? 'none' : `0 4px 20px ${template.color}40`,
              transition: 'all 0.3s',
            }}
          >
            {loading ? (
              <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pulse 0.6s linear infinite' }} />
            ) : (
              <>
                <Zap size={18} />
                Invia Report Rapido
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
