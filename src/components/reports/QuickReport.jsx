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
import { QUICK_TEMPLATES, SEVERITY } from '../../lib/constants'
import { Button } from '../ui'
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
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()

  useEffect(() => { db.getMachines().then(setMachines) }, [])

  // Step 1: Seleziona template → vai a step 2
  const selectTemplate = (t) => {
    haptic.medium()
    setTemplate(t)
    setStep(2)
  }

  // Step 2: Conferma e invia
  const handleSubmit = async () => {
    if (!template) return
    setLoading(true)
    haptic.light()

    try {
      // Costruisci descrizione con campi extra
      let description = template.description

      // Aggiungi campi smart form
      const extraParts = Object.entries(extraData)
        .filter(([_, val]) => val.trim())
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

      const created = await db.createReport({
        title: template.title,
        machine: machine || null,
        severity: template.severity,
        description,
        media,
        created_by: user.id,
        created_by_name: user.name,
        status: 'aperta',
        is_quick: true,
        template_id: template.id,
        extra_data: Object.keys(extraData).length > 0 ? extraData : null,
      })
      // Log activity + notification
      db.addActivity(created.id, {
        type: 'quick_created', user_id: user.id, user_name: user.name,
        detail: `Template: ${template.label}${machine ? ` · ${machine}` : ''}`,
      }).catch(() => {})
      db.addNotification({
        type: 'new_report', title: `Report rapido: ${template.title}`,
        body: `${user.name} — ${template.label}${machine ? ` su ${machine}` : ''}`,
        report_id: created.id, from_user: user.id, target_user: null,
      }).catch(() => {})

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

  // ── Success screen ──────────────────
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
        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-full transition-all ${step >= 1 ? 'bg-amber-400 w-6' : 'bg-surface-3'}`} />
          <div className={`w-2.5 h-2.5 rounded-full transition-all ${step >= 2 ? 'bg-amber-400 w-6' : 'bg-surface-3'}`} />
        </div>
      </header>

      {/* ── STEP 1: Seleziona tipo problema ── */}
      {step === 1 && (
        <div className="px-[4vw] py-[5vw] animate-fade-in">
          <p className="text-lg text-secondary mb-[4vw]">Che tipo di problema?</p>

          <div className="grid grid-cols-2 gap-[3vw]">
            {QUICK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTemplate(t)}
                className="flex flex-col items-center justify-center gap-[2vw] card-elevated rounded-2xl py-[5vw] px-[2vw] active:bg-gray-800 transition-all press-scale"
              >
                <div
                  className="w-[16vw] h-[16vw] max-w-16 max-h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: t.color + '18' }}
                >
                  {t.icon}
                </div>
                <span className="text-base font-bold text-white">{t.label}</span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: SEVERITY[t.severity].bg, color: SEVERITY[t.severity].color }}
                >
                  {SEVERITY[t.severity].label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Macchinario + dettagli + invio ── */}
      {step === 2 && template && (
        <div className="px-[4vw] py-[5vw] space-y-[4vw] pb-10 animate-fade-in">
          {/* Selected template recap */}
          <div
            className="flex items-center gap-[3.5vw] rounded-2xl p-[3.5vw] border-2"
            style={{ background: template.color + '10', borderColor: template.color + '40' }}
          >
            <div
              className="w-[14vw] h-[14vw] max-w-14 max-h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: template.color + '20' }}
            >
              {template.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-themed">{template.title}</p>
              <p className="text-sm text-secondary leading-snug mt-0.5">{template.description}</p>
            </div>
          </div>

          {/* Machine selection — big buttons */}
          <div>
            <label className="block text-base text-muted mb-[2.5vw] uppercase tracking-wider font-semibold">
              Macchinario
            </label>
            {machines.length > 0 ? (
              <div className="grid grid-cols-2 gap-[2.5vw]">
                <button
                  onClick={() => { haptic.light(); setMachine('') }}
                  className={`py-[3.5vw] rounded-2xl text-base font-bold text-center transition-all press-scale ${
                    !machine ? 'bg-blue-600 text-white' : 'btn-chip'
                  }`}
                >
                  Nessuno
                </button>
                {machines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { haptic.light(); setMachine(m.name) }}
                    className={`py-[3.5vw] rounded-2xl text-base font-bold text-center transition-all press-scale truncate px-2 ${
                      machine === m.name ? 'bg-blue-600 text-white' : 'btn-chip'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-base text-muted text-center py-4">Nessun macchinario configurato</p>
            )}

            {/* QR Scan button */}
            <button
              onClick={() => { haptic.light(); setShowQR(true) }}
              className="w-full flex items-center justify-center gap-2 py-[3.5vw] mt-[2.5vw] bg-blue-600/10 border border-blue-500/30 rounded-2xl text-base font-bold text-blue-400 active:bg-blue-600/20 press-scale"
            >
              <QrCode size={20} />
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

          {/* Smart Form — Dynamic extra fields based on template */}
          {template.extraFields?.length > 0 && (
            <div className="space-y-[3vw]">
              <p className="label-section tracking-wider flex items-center gap-1.5">
                📋 Dettagli specifici
              </p>
              {template.extraFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-base text-muted mb-[2vw] font-semibold">
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <div className="grid grid-cols-2 gap-[2vw]">
                      {field.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            haptic.light()
                            setExtraData(prev => ({ ...prev, [field.key]: prev[field.key] === opt ? '' : opt }))
                          }}
                          className={`py-[3vw] px-[2vw] rounded-2xl text-sm font-bold text-center transition-all press-scale ${
                            extraData[field.key] === opt
                              ? 'text-white shadow-md'
                              : 'btn-chip'
                          }`}
                          style={extraData[field.key] === opt ? { background: template.color, boxShadow: `0 2px 10px ${template.color}33` } : {}}
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
                      className="w-full input-field rounded-2xl px-5 py-4 text-lg text-themed placeholder-current opacity-40 focus:outline-none focus:border-current focus:ring-1 focus:ring-current"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Optional note toggle */}
          {!showNote ? (
            <button
              onClick={() => { setShowNote(true); haptic.light() }}
              className="w-full flex items-center justify-center gap-2 py-[3.5vw] card-interactive rounded-2xl text-base font-semibold text-gray-400 active:bg-gray-700 press-scale"
            >
              <MessageSquare size={18} />
              Aggiungi nota (opzionale)
            </button>
          ) : (
            <div>
              <label className="block text-base text-muted mb-[2vw] uppercase tracking-wider font-semibold">
                Nota aggiuntiva
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Dettagli aggiuntivi..."
                className="w-full input-field rounded-2xl px-5 py-4 text-lg text-themed placeholder-current opacity-40 focus:outline-none focus:border-current focus:ring-1 focus:ring-current resize-none"
                rows={3}
                autoFocus
              />
            </div>
          )}

          {/* Quick photo */}
          <MediaCapture media={media} onChange={setMedia} />

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            className="w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Zap size={20} /> Invia Report Rapido</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
