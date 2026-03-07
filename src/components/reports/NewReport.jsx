import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { SEVERITY } from '../../lib/constants'
import { Button, Input, Textarea, Select } from '../ui'
import MediaCapture from '../media/MediaCapture'
import SuccessAnimation from '../ui/SuccessAnimation'
import DraftBanner from '../ui/DraftBanner'
import QRScanner from '../media/QRScanner'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useAutosave } from '../../hooks/useAutosave'
import { ArrowLeft, Send, QrCode } from 'lucide-react'

const DEFAULT_FORM = { title: '', machine: '', severity: 'media', description: '' }

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
        severity: form.severity, description: form.description.trim(),
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
                options={[{ value: '', label: 'Seleziona (opzionale)' }, ...machines.map(m => ({ value: m.name, label: m.name }))]}
              />
            </div>
            <button
              type="button"
              onClick={() => { haptic.light(); setShowQR(true) }}
              className="w-[14vw] h-[14vw] max-w-14 max-h-14 bg-surface-2 border border-token rounded-2xl flex items-center justify-center active:bg-gray-700 press-scale shrink-0"
            >
              <QrCode size={24} className="text-blue-400" />
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

        {/* Severity — 2x2 responsive con haptic */}
        <div>
          <label className="block text-base text-muted mb-[2.5vw] uppercase tracking-wider font-semibold">Gravità</label>
          <div className="grid grid-cols-2 gap-[2.5vw]">
            {Object.entries(SEVERITY).map(([key, { label, color }]) => (
              <button
                key={key}
                onClick={() => handleSeverityChange(key)}
                className={`py-[4vw] rounded-2xl text-lg font-bold transition-all press-scale ${
                  form.severity === key
                    ? 'text-white shadow-lg'
                    : 'btn-chip'
                }`}
                style={form.severity === key ? { background: color, boxShadow: `0 4px 14px ${color}33` } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Textarea label="Descrizione *" placeholder="Descrivi il problema..." value={form.description} onChange={e => set('description', e.target.value)} />

        <MediaCapture media={media} onChange={setMedia} />

        <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!isValid || loading}>
          {loading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <><Send size={20} /> Invia Segnalazione</>
          )}
        </Button>
      </div>
    </div>
  )
}
