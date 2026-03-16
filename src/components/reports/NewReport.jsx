import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { SEVERITY, REPORT_TYPES } from '../../lib/constants'
import { Button, Input, Textarea, Select } from '../ui'
import MediaCapture from '../media/MediaCapture'
import SuccessAnimation from '../ui/SuccessAnimation'
import DraftBanner from '../ui/DraftBanner'
import QRScanner from '../media/QRScanner'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useAutosave } from '../../hooks/useAutosave'
import { ArrowLeft, Send, QrCode } from 'lucide-react'

const DEFAULT_FORM = { title: '', machine: '', severity: 'media', type: 'correttiva', description: '' }

export default function NewReport({ user, onBack, onCreated, preselectedMachine }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM, machine: preselectedMachine || '' })
  const [media, setMedia] = useState([])
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()
  const { hasDraft, lastSaved, clearDraft, discardDraft } = useAutosave('new-report', form, setForm)

  useEffect(() => { db.getMachines().then(setMachines) }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const isValid = form.title.trim() && form.description.trim()

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
      const created = await db.createReport({
        title: form.title.trim(), machine: form.machine || null,
        severity: form.severity, type: form.type, description: form.description.trim(),
        media, created_by: user.id, created_by_name: user.name, status: 'aperta',
      })
      // Log activity + notification
      db.addActivity(created.id, {
        type: 'created', user_id: user.id, user_name: user.name,
        detail: form.machine ? `Macchinario: ${form.machine}` : null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      db.addNotification({
        type: 'new_report', title: `Nuova segnalazione: ${form.title.trim()}`,
        body: `${user.name} ha creato una segnalazione ${form.severity}`,
        report_id: created.id, from_user: user.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      // Mostra animazione di successo invece di navigare subito
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

  // Overlay di successo
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
      <header className="header-page flex items-center gap-[2vw] px-[3vw] py-[2.5vw]">
        <button onClick={onBack} className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center active:bg-white/10 text-muted press-scale">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-themed">Nuova Segnalazione</h1>
      </header>

      <div className="px-[4vw] py-[5vw] space-y-[5vw] pb-10 animate-fade-in">
        {/* Banner bozza ripristinata */}
        {hasDraft && (
          <DraftBanner lastSaved={lastSaved} onDiscard={() => discardDraft(DEFAULT_FORM)} />
        )}

        <Input label="Titolo *" placeholder="Es. Pompa guasta linea 3" value={form.title} onChange={e => set('title', e.target.value)} />

        <div>
          <label className="block text-base text-muted mb-2.5 uppercase tracking-wider font-semibold">
            Macchinario
          </label>
          <div className="flex gap-[2.5vw]">
            <div className="flex-1">
              <Select
                value={form.machine}
                onChange={e => set('machine', e.target.value)}
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
              className="w-[14vw] h-[14vw] max-w-14 max-h-14 bg-surface-2 border border-token rounded-2xl flex items-center justify-center active:bg-gray-700 press-scale shrink-0"
            >
              <QrCode size={24} className="text-violet-400" />
            </button>
          </div>
        </div>

        {/* QR Scanner overlay */}
        {showQR && (
          <QRScanner
            machines={machines}
            onScan={(data) => {
              set('machine', data.name)
              setShowQR(false)
              toast.success(`Macchinario: ${data.name}`)
            }}
            onClose={() => setShowQR(false)}
          />
        )}

        {/* Tipo intervento — Design System: 4 bottoni affiancati */}
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Tipo Intervento</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Object.entries(REPORT_TYPES).map(([key, { label, icon }]) => {
              const selected = form.type === key
              return (
                <button
                  key={key}
                  onClick={() => { haptic.light(); set('type', key) }}
                  className="press-scale"
                  style={{
                    padding: '10px 4px', borderRadius: 8, fontSize: 13, fontWeight: selected ? 600 : 400,
                    border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: selected ? 'var(--color-primary-glow)' : 'var(--color-card)',
                    color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  {icon}<br />{label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Priorità — Design System: 4 bottoni flex con colori */}
        <div>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Priorità</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(SEVERITY).map(([key, { label, color }]) => {
              const selected = form.severity === key
              return (
                <button
                  key={key}
                  onClick={() => handleSeverityChange(key)}
                  className="press-scale"
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 8, fontSize: 12, fontWeight: selected ? 600 : 400,
                    border: `1px solid ${selected ? color : 'var(--color-border)'}`,
                    background: selected ? color + '18' : 'var(--color-card)',
                    color: selected ? color : 'var(--color-text-secondary)',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <Textarea label="Descrizione *" placeholder="Descrivi il problema..." value={form.description} onChange={e => set('description', e.target.value)} />

        <MediaCapture media={media} onChange={setMedia} />

        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className="press-scale"
          style={{
            width: '100%', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 600,
            background: (isValid && !loading) ? 'linear-gradient(135deg, var(--color-primary), #00d4ff)' : 'var(--color-surface-3)',
            color: (isValid && !loading) ? '#fff' : 'var(--color-text-muted)',
            border: 'none', cursor: (isValid && !loading) ? 'pointer' : 'not-allowed',
            opacity: (isValid && !loading) ? 1 : 0.5,
            transition: 'all 0.2s',
          }}
        >
          {loading ? '...' : 'Invia Segnalazione'}
        </button>
      </div>
    </div>
  )
}
