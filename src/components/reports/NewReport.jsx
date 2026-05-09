import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { SEVERITY, REPORT_TYPES, formatTicketId } from '../../lib/constants'
import { Button, Input, Textarea, Select } from '../ui'
import MediaCapture from '../media/MediaCapture'
import SuccessAnimation from '../ui/SuccessAnimation'
import DraftBanner from '../ui/DraftBanner'
import QRScanner from '../media/QRScanner'
import SimilarCasesLivePanel from './SimilarCasesLivePanel'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useAutosave } from '../../hooks/useAutosave'
import { ArrowLeft, Send, QrCode, Camera, FileText, AlertTriangle, Wrench, UserCheck } from 'lucide-react'

const DEFAULT_FORM = { title: '', machine: '', severity: 'media', type: 'correttiva', description: '', assignMode: 'none', assignTo: '', assignName: '' }

// ── Type Icons mapping ──
const TYPE_ICONS = {
  correttiva: Wrench,
  preventiva: FileText,
  migliorativa: Send,
  ispezione: AlertTriangle,
}

export default function NewReport({ user, onBack, onCreated, preselectedMachine }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM, machine: preselectedMachine || '' })
  const [media, setMedia] = useState([])
  const [machines, setMachines] = useState([])
  const [users, setUsers] = useState([])
  const [components, setComponents] = useState([])
  const [selectedComponent, setSelectedComponent] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()
  const { hasDraft, lastSaved, clearDraft, discardDraft } = useAutosave('new-report', form, setForm)

  useEffect(() => {
    db.getMachines().then(m => {
      setMachines(m)
      if (preselectedMachine) {
        const machine = m.find(x => x.name === preselectedMachine)
        if (machine) db.getMachineComponents(machine.id).then(setComponents).catch(e => console.error('[NewReport] getMachineComponents failed:', e))
      }
    })
    db.getUsers().then(u => setUsers(u.filter(x => x.role === 'tecnico' || x.role === 'admin')))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load components for selected machine
  const loadComponents = (machineName) => {
    if (!machineName) { setComponents([]); setSelectedComponent(''); return }
    const machine = machines.find(m => m.name === machineName)
    if (machine) {
      db.getMachineComponents(machine.id).then(setComponents).catch(() => setComponents([]))
    } else { setComponents([]); setSelectedComponent('') }
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const isValid = form.title.trim() && form.description.trim()

  // Progress calculation
  const filledFields = [form.title.trim(), form.machine, form.description.trim()].filter(Boolean).length
  const totalFields = 3
  const progress = (filledFields / totalFields) * 100

  const handleSeverityChange = (key) => {
    haptic.light()
    set('severity', key)
  }

  const handleSubmit = async () => {
    if (!isValid) {
      toast.warning('Compila titolo e descrizione')
      haptic.warning()
      return
    }

    setLoading(true)
    try {
      // Determina assegnazione
      const assignee = form.assignMode === 'internal' && form.assignTo
        ? users.find(u => u.id === form.assignTo) : null
      const assignedTo = assignee ? assignee.id : null
      const assignedName = form.assignMode === 'external' && form.assignName.trim()
        ? form.assignName.trim()
        : assignee ? assignee.name : null
      const reportStatus = assignedTo || assignedName ? 'assegnata' : 'aperta'

      const selComp = components.find(c => c.id === selectedComponent)
      const created = await db.createReport({
        title: form.title.trim(), machine: form.machine || null,
        component_id: selComp?.id || null, component_name: selComp?.name || null,
        severity: form.severity, type: form.type, description: form.description.trim(),
        media, created_by: user.id, created_by_name: user.name,
        assigned_to: assignedTo, assigned_to_name: assignedName,
        status: reportStatus,
      })
      db.addActivity(created.id, {
        type: 'created', user_id: user.id, user_name: user.name,
        detail: form.machine ? `Macchinario: ${form.machine}` : null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      db.addNotification({
        type: 'new_report', title: `${formatTicketId(created.id)} · ${form.title.trim()}`,
        body: `${user.name} ha creato una segnalazione ${form.severity}`,
        report_id: created.id, from_user: user.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      clearDraft()
      setShowSuccess(true)
    } catch (err) {
      toast.error('Errore nell\'invio: ' + err.message)
      setLoading(false)
    }
  }

  const handleSuccessComplete = () => {
    toast.success('Segnalazione inviata!')
    onCreated()
  }

  if (showSuccess) {
    return (
      <SuccessAnimation
        message="Segnalazione Inviata!"
        subtitle="Il team è stato notificato"
        onComplete={handleSuccessComplete}
      />
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base">
      {/* Header */}
      <header className="header-page flex items-center gap-[2vw] px-[3vw] py-[2.5vw]">
        <button onClick={onBack} className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center active:bg-white/10 text-muted press-scale">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-themed flex-1">Nuova Segnalazione</h1>
      </header>

      {/* Progress bar */}
      <div className="progress-bar-form" style={{ margin: '0 4vw' }}>
        <div className="progress-bar-form-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="px-[4vw] py-[5vw] space-y-[5vw] pb-10 animate-fade-in">
        {/* Draft banner */}
        {hasDraft && (
          <DraftBanner lastSaved={lastSaved} onDiscard={() => discardDraft(DEFAULT_FORM)} />
        )}

        {/* Title */}
        <Input label="Titolo *" placeholder="Es. Pompa guasta linea 3" value={form.title} onChange={e => set('title', e.target.value)} />

        {/* Machine selector */}
        <div>
          <label className="block text-base text-muted mb-2.5 uppercase tracking-wider font-semibold">
            Macchinario
          </label>
          <div className="flex gap-[2.5vw]">
            <div className="flex-1">
              <Select
                value={form.machine}
                onChange={e => { set('machine', e.target.value); loadComponents(e.target.value) }}
                options={[
                  { value: '', label: 'Seleziona (opzionale)' },
                  ...machines
                    .filter(m => m.status !== 'dismessa')
                    .map(m => ({ value: m.name, label: m.code ? `${m.code} — ${m.name}` : m.name }))
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => { haptic.light(); setShowQR(true) }}
              aria-label="Scansiona QR macchinario"
              style={{
                width: 56, height: 56, flexShrink: 0,
                background: 'var(--color-surface-2)',
                border: '1.5px solid rgba(139, 92, 246, 0.3)',
                borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              className="press-scale"
            >
              <QrCode size={22} style={{ color: '#8b5cf6' }} />
            </button>
          </div>
        </div>

        {/* QR Scanner overlay */}
        {showQR && (
          <QRScanner
            machines={machines}
            onScan={(data) => {
              set('machine', data.name)
              loadComponents(data.name)
              setShowQR(false)
              toast.success(`Macchinario: ${data.name}`)
            }}
            onClose={() => setShowQR(false)}
          />
        )}

        {/* Component selector (shown only when machine has components) */}
        {form.machine && components.length > 0 && (
          <div className="animate-fade-in">
            <Select
              label="Componente specifico"
              value={selectedComponent}
              onChange={e => setSelectedComponent(e.target.value)}
              options={[
                { value: '', label: 'Generico (intera macchina)' },
                ...components.map(c => ({ value: c.id, label: c.type ? `${c.name} (${c.type})` : c.name }))
              ]}
            />
          </div>
        )}

        {/* Report Type — 2x2 card grid */}
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Tipo Intervento
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {Object.entries(REPORT_TYPES).map(([key, { label, icon, color }]) => {
              const selected = form.type === key
              const Icon = TYPE_ICONS[key] || Wrench
              return (
                <button
                  key={key}
                  onClick={() => { haptic.light(); set('type', key) }}
                  className="press-scale"
                  style={{
                    padding: '14px 12px',
                    borderRadius: 14,
                    border: `2px solid ${selected ? color : 'var(--color-border)'}`,
                    background: selected ? color + '15' : 'var(--color-surface-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: selected ? color + '25' : 'var(--color-surface-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{
                      fontSize: 14, fontWeight: selected ? 700 : 500,
                      color: selected ? color : 'var(--color-text-secondary)',
                      display: 'block',
                    }}>
                      {label}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Severity — Expressive colored cards */}
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Priorità
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Object.entries(SEVERITY).map(([key, { label, color }]) => {
              const selected = form.severity === key
              return (
                <button
                  key={key}
                  onClick={() => handleSeverityChange(key)}
                  className="press-scale"
                  style={{
                    padding: '12px 6px',
                    borderRadius: 14,
                    border: `2px solid ${selected ? color : 'var(--color-border)'}`,
                    background: selected ? color + '18' : 'var(--color-surface-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: color,
                    boxShadow: selected ? `0 0 12px ${color}60` : 'none',
                    transition: 'box-shadow 0.2s',
                  }} />
                  <span style={{
                    fontSize: 12, fontWeight: selected ? 700 : 500,
                    color: selected ? color : 'var(--color-text-secondary)',
                  }}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <Textarea label="Descrizione *" placeholder="Descrivi il problema..." value={form.description} onChange={e => set('description', e.target.value)} />

        {/* Casi simili dallo storico (live, debounced) */}
        <SimilarCasesLivePanel
          text={[form.title, form.description].filter(Boolean).join('. ')}
          machineId={machines.find(m => m.name === form.machine)?.id || null}
        />

        {/* Assegnazione */}
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Assegna a (opzionale)
          </label>
          {/* Toggle: nessuno / interno / esterno */}
          <div style={{ display: 'flex', gap: 8, marginBottom: form.assignMode !== 'none' ? 12 : 0 }}>
            {[
              { id: 'none', label: 'Nessuno' },
              { id: 'internal', label: 'Tecnico' },
              { id: 'external', label: 'Fornitore' },
            ].map(opt => {
              const active = form.assignMode === opt.id
              return (
                <button key={opt.id} onClick={() => { haptic.light(); set('assignMode', opt.id); set('assignTo', ''); set('assignName', '') }}
                  className="press-scale"
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 600,
                    border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: active ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Selezione tecnico interno */}
          {form.assignMode === 'internal' && (
            <Select
              value={form.assignTo}
              onChange={e => set('assignTo', e.target.value)}
              options={[
                { value: '', label: 'Seleziona tecnico...' },
                ...users.map(u => ({ value: u.id, label: `${u.name} (${u.role})` }))
              ]}
            />
          )}

          {/* Input fornitore esterno */}
          {form.assignMode === 'external' && (
            <div>
              <Input
                placeholder="Nome fornitore o azienda esterna"
                value={form.assignName}
                onChange={e => set('assignName', e.target.value)}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                Il fornitore verrà notificato via email se configurato
              </p>
            </div>
          )}
        </div>

        {/* Media */}
        <MediaCapture media={media} onChange={setMedia} />

        {/* Submit button with gradient */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className="press-scale"
          style={{
            width: '100%', padding: 16, borderRadius: 16, fontSize: 16, fontWeight: 700,
            background: (isValid && !loading)
              ? 'linear-gradient(135deg, var(--color-primary), #00d4ff)'
              : 'var(--color-surface-3)',
            color: (isValid && !loading) ? '#fff' : 'var(--color-text-muted)',
            border: 'none',
            cursor: (isValid && !loading) ? 'pointer' : 'not-allowed',
            opacity: (isValid && !loading) ? 1 : 0.5,
            transition: 'all 0.3s',
            boxShadow: (isValid && !loading) ? '0 4px 20px rgba(124, 106, 255, 0.3)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (
            <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pulse 0.6s linear infinite' }} />
          ) : (
            <>
              <Send size={18} />
              Invia Segnalazione
            </>
          )}
        </button>
      </div>
    </div>
  )
}
