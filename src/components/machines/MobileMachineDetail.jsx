/**
 * MobileMachineDetail v4.0 — Le risorse al primo livello
 *
 * Fino alla v3 foto, documenti e interventi erano tre accordion in fondo
 * alla pagina, sotto tutte le segnalazioni: davanti alla macchina, per
 * aprire il manuale, l'operatore doveva scorrere otto guasti. Ora sono
 * cinque schede sotto l'intestazione — segnalazioni, foto, documenti,
 * storico, manutenzioni — e nessuna costa più di un tap.
 *
 * Layout: intestazione fissa → barra a schede fissa → contenuto che
 * scorre → barra azioni fissa (Rapido / Segnala).
 *
 * Misure pensate per l'uso con i guanti: nessun bersaglio sotto 56px,
 * schede da 80px, righe da 76-96px, testo lista 18px, nessun link
 * testuale. Ogni bersaglio ha uno stato premuto pieno: con i guanti il
 * feedback tattile non arriva, deve arrivare quello visivo.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { timeAgo, isReportOpen, isTerminalStatus } from '../../lib/constants'
import { getTrafficLight } from '../../lib/maintenanceStatus'
import { padX } from './machineTabs'
import MachineGallery from './MachineGallery'
import MachineTabBar from './MachineTabBar'
import MachineReportsTab from './MachineReportsTab'
import MachineDocsTab from './MachineDocsTab'
import MachineComponentsTab from './MachineComponentsTab'
import MachineLogsTab from './MachineLogsTab'
import MachinePlansTab from './MachinePlansTab'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useMachineMedia } from '../../hooks/useMachineMedia'
import { useMachineUpload } from '../../hooks/useMachineUpload'
import {
  ArrowLeft, Wrench, AlertTriangle, CheckCircle, Zap, Trash2,
} from 'lucide-react'

export default function MobileMachineDetail({ machine, onBack, onViewReport, onQuickReport, onNewReport, onDelete }) {
  const { user } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [tab, setTab] = useState('segnalazioni')
  const scrollRef = useRef(null)

  const [plans, setPlans] = useState([])
  const [logs, setLogs] = useState([])
  const [components, setComponents] = useState([])
  const [reports, setReports] = useState([])
  const [planLastLogs, setPlanLastLogs] = useState({})
  const [loading, setLoading] = useState(true)

  const [confirmPlan, setConfirmPlan] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmDuration, setConfirmDuration] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [resolveReport, setResolveReport] = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveDuration, setResolveDuration] = useState('')
  const [resolveParts, setResolveParts] = useState('')
  const [resolving, setResolving] = useState(false)

  const [assessment, setAssessment] = useState(null)

  // Registrazione intervento su un pezzo: il foglio è qui e non dentro il
  // tab perché deve poter sopravvivere al cambio scheda mentre si scrive.
  const [workComponent, setWorkComponent] = useState(null)
  const [workTitle, setWorkTitle] = useState('')
  const [workNote, setWorkNote] = useState('')
  const [workDuration, setWorkDuration] = useState('')
  const [savingWork, setSavingWork] = useState(false)

  // Il feed foto sta qui e non dentro la galleria: la barra a schede deve
  // poter mostrare il contatore anche quando il tab Foto non è aperto.
  const media = useMachineMedia(machine)

  // Scatta e Carica documento scrivono negli attachments della macchina.
  // La lista fresca torna dalla RPC e la passiamo all'hook del feed, così
  // contatori e griglia si aggiornano senza rileggere la macchina.
  const upload = useMachineUpload(machine, media.applyAttachments)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [p, l, r, comp] = await Promise.all([
        db.getMaintenancePlans(machine.id),
        db.getMaintenanceLogs(machine.id),
        db.getReports(),
        db.getMachineComponents(machine.id).catch(() => []),
      ])
      setPlans(p)
      setLogs(l)
      setComponents(comp)
      // Match sulla FK, con fallback sullo snapshot testuale per le
      // segnalazioni vecchie create prima di machine_id.
      setReports(r.filter(rep =>
        rep.machine_id === machine.id || (!rep.machine_id && rep.machine === machine.name)
      ))
      const ll = {}
      for (const plan of p) { ll[plan.id] = await db.getLastLogForPlan(plan.id) }
      setPlanLastLogs(ll)
    } catch (e) {
      console.warn('[MobileMachineDetail] loadData failed', e)
    }
    setLoading(false)
  }, [machine.id, machine.name])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    db.fetchMachineAssessments(machine.org_id || user?.org_id, machine.id)
      .then(result => {
        const a = result?.assessments?.find(a => a.machine_id === machine.id)
        setAssessment(a || null)
      })
      .catch(e => console.error('[MobileMachineDetail] fetchMachineAssessments failed:', e))
  }, [machine.id, machine.org_id, user?.org_id])

  // Cambiando scheda si riparte dall'alto: ereditare lo scroll della
  // scheda precedente fa sembrare il contenuto tagliato.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [tab])

  const goToTab = (id) => { haptic.light(); setTab(id) }

  const handleConfirmMaintenance = async () => {
    if (!confirmPlan) return
    setConfirming(true)
    try {
      await db.createMaintenanceLog({
        machine_id: machine.id, plan_id: confirmPlan.id, type: 'programmata',
        // Il piano può nominare il pezzo (migration 063): il log lo eredita,
        // così lo storico del componente si popola senza data entry.
        component_id: confirmPlan.component_id || null,
        title: confirmPlan.name, description: confirmNote.trim() || null,
        performed_by: user?.id, performed_by_name: user?.name,
        duration_minutes: confirmDuration ? parseInt(confirmDuration) : null,
        performed_at: new Date().toISOString(), org_id: user?.org_id,
      })
      haptic.success()
      toast.success('Manutenzione registrata!')
      db.addNotification({
        type: 'maintenance_completed', title: `Manutenzione registrata`,
        body: `${user?.name} ha completato "${confirmPlan.name}" su ${machine.name}`,
        report_id: null, from_user: user?.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      setConfirmPlan(null); setConfirmNote(''); setConfirmDuration('')
      await loadData()
    } catch (e) { toast.error('Errore: ' + e.message) }
    setConfirming(false)
  }

  const handleResolveAndLog = async () => {
    if (!resolveReport) return
    setResolving(true)
    try {
      await db.updateReport(resolveReport.id, { status: 'risolta' })
      db.addActivity(resolveReport.id, {
        type: 'status_change', from_status: resolveReport.status, to_status: 'risolta',
        user_id: user?.id, user_name: user?.name,
      }).catch(e => console.warn('Side effect failed:', e.message))
      await db.createMaintenanceLog({
        machine_id: machine.id, report_id: resolveReport.id, type: 'straordinaria',
        // Se la segnalazione dichiarava un pezzo, l'intervento è di quel
        // pezzo: ereditarlo è ciò che fa nascere lo storico del componente.
        component_id: resolveReport.component_id || null,
        title: `Risolto: ${resolveReport.title}`, description: resolveNote.trim() || null,
        performed_by: user?.id, performed_by_name: user?.name,
        duration_minutes: resolveDuration ? parseInt(resolveDuration) : null,
        parts_replaced: resolveParts.trim() || null,
        performed_at: new Date().toISOString(), org_id: user?.org_id,
      })
      haptic.success()
      toast.success('Segnalazione risolta e intervento registrato!')
      db.addNotification({
        type: 'status_change', title: `Segnalazione risolta: ${resolveReport.title}`,
        body: `${user?.name} ha risolto e registrato l'intervento su ${machine.name}`,
        report_id: resolveReport.id, from_user: user?.id,
        target_user: resolveReport.created_by !== user?.id ? resolveReport.created_by : null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      setResolveReport(null); setResolveNote(''); setResolveDuration(''); setResolveParts('')
      await loadData()
    } catch (e) { toast.error('Errore: ' + e.message) }
    setResolving(false)
  }

  const activeReports = reports.filter(isReportOpen)
  const resolvedReports = reports.filter(r => isTerminalStatus(r.status))
  const urgentCount = plans.filter(p => getTrafficLight(p, planLastLogs[p.id]).urgent).length
  // Le foto promosse in galleria vivono anche loro in `attachments`: il
  // tab Documenti conta solo i file veri. La lista viene dall'hook e non
  // dalla prop, così un caricamento appena fatto si vede subito.
  const documentCount = media.attachments.filter(a => a.category !== 'foto').length

  // Riga d'identità: reparto, matricola, anno. Costruttore e modello
  // stanno nella scheda tecnica dentro il tab Documenti — qui non ci
  // starebbero senza tagliare il nome della macchina.
  const identity = [machine.department, machine.serial_number, machine.year].filter(Boolean).join(' · ')

  const counts = {
    segnalazioni: activeReports.length || null,
    componenti: components.length || null,
    foto: media.loading ? null : (media.items.length || null),
    documenti: documentCount || null,
    storico: logs.length || null,
    manutenzioni: plans.length || null,
  }

  const accents = {
    segnalazioni: activeReports.length > 0 ? '#f59e0b' : null,
    manutenzioni: urgentCount > 0 ? '#ef4444' : (plans.length > 0 ? '#22c55e' : null),
  }

  // Registra un intervento sul pezzo. Stesso `maintenance_log` di sempre —
  // resta un intervento della macchina — con in più il componente, così lo
  // storico del pezzo si popola da solo (ADR-012).
  const saveComponentWork = async () => {
    if (!workComponent || !workTitle.trim()) return
    setSavingWork(true)
    try {
      await db.createMaintenanceLog({
        machine_id: machine.id,
        component_id: workComponent.id,
        type: 'straordinaria',
        title: workTitle.trim(),
        description: workNote.trim() || null,
        performed_by: user?.id,
        performed_by_name: user?.name,
        duration_minutes: workDuration ? parseInt(workDuration) : null,
        performed_at: new Date().toISOString(),
        org_id: user?.org_id,
      })
      haptic.success()
      toast.success(`Intervento registrato su ${workComponent.name}`)
      setWorkComponent(null); setWorkTitle(''); setWorkNote(''); setWorkDuration('')
      await loadData()
    } catch (e) {
      toast.error('Errore: ' + (e.message || 'riprova'))
    }
    setSavingWork(false)
  }

  // Registrare un intervento è riservato a tecnico e admin: la RPC
  // `create_maintenance_log` (migration 028) rifiuta gli altri ruoli, e un
  // tasto che porta a "permesso negato" è peggio di un tasto che non c'è.
  const canLogWork = user?.role === 'tecnico' || user?.role === 'admin'

  const openReport = (r) => onViewReport?.(r)

  return (
    <div className="h-screen h-[100dvh] bg-base flex flex-col overflow-hidden">

      {/* ═══ INTESTAZIONE FISSA ═══ */}
      <div className="shrink-0">
        <header
          className="header-page flex items-center gap-[3vw]"
          style={{ ...padX, paddingTop: '2.5vw', paddingBottom: '2.5vw' }}
        >
          <button
            onClick={onBack}
            aria-label="Torna ai macchinari"
            className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center bg-surface-2 active:bg-surface-3 text-muted shrink-0 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-themed truncate leading-tight">{machine.name}</h1>
            {identity && (
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 4 }}>
                {identity}
              </p>
            )}
          </div>

          {assessment && (() => {
            const colors = { ottimo: '#22c55e', buono: '#7c6aff', attenzione: '#f59e0b', critico: '#ef4444' }
            const c = colors[assessment.status] || '#6b7280'
            return (
              <div className="relative w-11 h-11 shrink-0" title={`Salute macchina: ${assessment.health_score}`}>
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3.5" strokeDasharray={`${assessment.health_score} ${100 - assessment.health_score}`} strokeLinecap="round" style={{ stroke: c }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-bold text-themed">
                  {assessment.health_score}
                </span>
              </div>
            )
          })()}

          {onDelete && (
            <button
              onClick={onDelete}
              aria-label="Elimina macchinario"
              className="w-[56px] h-[56px] rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0 active:bg-red-500/20 transition-colors"
            >
              <Trash2 size={20} style={{ color: '#ef4444' }} />
            </button>
          )}
        </header>

        <MachineTabBar active={tab} counts={counts} accents={accents} onChange={goToTab} />
      </div>

      {/* ═══ CONTENUTO ═══ */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(68px + 10vw)' }}
      >
        <div
          role="tabpanel"
          id={`machine-panel-${tab}`}
          aria-labelledby={`machine-tab-${tab}`}
          className="animate-fade-in"
        >
          {tab === 'segnalazioni' && (
            <MachineReportsTab
              reports={activeReports}
              resolved={resolvedReports}
              urgentCount={urgentCount}
              onOpenReport={openReport}
              onResolveReport={setResolveReport}
              onGoToPlans={() => setTab('manutenzioni')}
            />
          )}

          {tab === 'componenti' && (
            <MachineComponentsTab
              machine={machine}
              components={components}
              attachments={media.attachments}
              reports={reports}
              logs={logs}
              canLogWork={canLogWork}
              uploading={upload.busy}
              onCapture={(comp) => upload.capturePhoto(comp)}
              onUploadDoc={(category, comp) => upload.uploadDocument(category, comp)}
              onRegisterWork={(comp) => { setWorkTitle(''); setWorkNote(''); setWorkDuration(''); setWorkComponent(comp) }}
              onReport={(comp) => onNewReport?.(machine.name, comp.id)}
              onViewReport={openReport}
            />
          )}

          {tab === 'foto' && (
            <>
              {machine.photo_url && (
                <div style={{ ...padX, paddingTop: '4vw' }}>
                  <div className="rounded-2xl overflow-hidden border border-token aspect-video relative">
                    <img src={machine.photo_url} alt={machine.name} className="w-full h-full object-cover" />
                    <span className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(0,0,0,0.55)', color: '#8b96a8' }}>
                      Scheda
                    </span>
                  </div>
                </div>
              )}
              <MachineGallery
                machine={machine}
                media={media}
                onCapture={upload.capturePhoto}
                capturing={upload.busy}
                onOpenReport={(reportId) => {
                  const target = reports.find(r => r.id === reportId)
                  if (target) openReport(target)
                  else toast.info('Segnalazione non più disponibile')
                }}
              />
            </>
          )}

          {tab === 'documenti' && (
            <MachineDocsTab
              machine={machine}
              attachments={media.attachments}
              onUpload={upload.uploadDocument}
              uploading={upload.busy}
            />
          )}

          {tab === 'storico' && <MachineLogsTab logs={logs} loading={loading} />}

          {tab === 'manutenzioni' && (
            <MachinePlansTab
              plans={plans}
              planLastLogs={planLastLogs}
              loading={loading}
              onConfirmPlan={setConfirmPlan}
            />
          )}
        </div>
      </div>

      {/* ═══ AZIONI ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom"
        style={{
          ...padX,
          paddingTop: '3vw',
          paddingBottom: 'calc(4vw + env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(to top, var(--color-bg) 60%, transparent)',
        }}>
        <div className="flex gap-[3.5vw]">
          <button
            onClick={() => { haptic.medium(); if (onQuickReport) onQuickReport(machine.name) }}
            className="flex-1 h-[68px] rounded-xl text-xl font-bold text-white flex items-center justify-center gap-3 press-scale active:scale-[0.97] transition-all"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 6px 24px rgba(245,158,11,0.35)' }}
          >
            <Zap size={26} strokeWidth={2.5} /> Rapido
          </button>
          <button
            onClick={() => { haptic.medium(); if (onNewReport) onNewReport(machine.name) }}
            className="flex-1 h-[68px] rounded-xl text-xl font-bold text-white flex items-center justify-center gap-3 press-scale active:scale-[0.97] transition-all"
            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 6px 24px rgba(239,68,68,0.3)' }}
          >
            <AlertTriangle size={26} strokeWidth={2.5} /> Segnala
          </button>
        </div>
      </div>

      {/* ═══ MODAL — Conferma Manutenzione ═══ */}
      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setConfirmPlan(null)} role="dialog" aria-modal="true" aria-labelledby="confirm-plan-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom"
            style={{ maxHeight: '75vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />
            <div className="flex items-center gap-3 mb-[4vw]">
              <div className="w-12 h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-400" />
              </div>
              <div>
                <h3 id="confirm-plan-title" className="text-lg font-bold text-themed">Conferma Manutenzione</h3>
                <p className="text-sm text-faint">{confirmPlan.name}</p>
              </div>
            </div>
            <div className="space-y-[3vw] mb-[4vw]">
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Note (opzionale)</label>
                <textarea value={confirmNote} onChange={e => setConfirmNote(e.target.value)}
                  placeholder="Es. Tutto regolare" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Durata (minuti)</label>
                <input type="number" value={confirmDuration} onChange={e => setConfirmDuration(e.target.value)}
                  placeholder="30" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
              </div>
            </div>
            <div className="flex gap-[3vw]">
              <button onClick={handleConfirmMaintenance} disabled={confirming}
                className="flex-1 h-[68px] rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: '#22c55e', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {confirming ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><CheckCircle size={20} /> Conferma</>}
              </button>
              <button onClick={() => setConfirmPlan(null)}
                className="w-[25vw] h-[68px] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">Annulla</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Intervento sul pezzo ═══ */}
      {workComponent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setWorkComponent(null)} role="dialog" aria-modal="true" aria-labelledby="work-component-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
          {/* Spaziature inline: il reset globale in styles/index.css annulla
              p-* e mb-* (debito tecnico noto), e senza queste il foglio
              tocca i bordi dello schermo. */}
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl animate-slide-up safe-area-bottom"
            style={{ maxHeight: '80vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '5vw 5vw 8vw' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto" style={{ marginBottom: '4vw' }} />
            <div className="flex items-center gap-3" style={{ marginBottom: '4vw' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.15)' }}>
                <Wrench size={24} style={{ color: '#22d3ee' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="work-component-title" className="text-lg font-bold text-themed">Registra intervento</h3>
                <p className="text-sm text-faint truncate">{workComponent.name}</p>
              </div>
            </div>
            <div className="flex flex-col gap-[3vw]" style={{ marginBottom: '4vw' }}>
              <div>
                <label className="block text-sm text-muted font-semibold" style={{ marginBottom: '1.5vw' }}>Cosa hai fatto *</label>
                <input value={workTitle} onChange={e => setWorkTitle(e.target.value)}
                  placeholder="Es. Sostituita tenuta meccanica"
                  className="w-full input-field rounded-2xl text-base" style={{ padding: '3vw 16px' }} />
              </div>
              <div>
                <label className="block text-sm text-muted font-semibold" style={{ marginBottom: '1.5vw' }}>Note (opzionale)</label>
                <textarea value={workNote} onChange={e => setWorkNote(e.target.value)}
                  placeholder="Ricambi usati, cosa controllare la prossima volta…"
                  className="w-full input-field rounded-2xl text-base resize-none" rows={3} style={{ padding: '3vw 16px' }} />
              </div>
              <div>
                <label className="block text-sm text-muted font-semibold" style={{ marginBottom: '1.5vw' }}>Durata (minuti)</label>
                <input type="number" inputMode="numeric" value={workDuration} onChange={e => setWorkDuration(e.target.value)}
                  placeholder="30" className="w-full input-field rounded-2xl text-base" style={{ padding: '3vw 16px' }} />
              </div>
            </div>
            <p className="text-[13px] text-faint leading-relaxed" style={{ marginBottom: '4vw' }}>
              Finisce nel registro interventi del macchinario, con il pezzo indicato.
            </p>
            <div className="flex gap-[3vw]">
              <button onClick={saveComponentWork} disabled={savingWork || !workTitle.trim()}
                className="flex-1 h-[68px] rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 press-scale transition-all disabled:opacity-50"
                style={{ background: '#22c55e', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {savingWork ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><CheckCircle size={20} /> Registra</>}
              </button>
              <button onClick={() => setWorkComponent(null)}
                className="w-[25vw] h-[68px] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">Annulla</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Risolvi + Registra ═══ */}
      {resolveReport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setResolveReport(null)} role="dialog" aria-modal="true" aria-labelledby="resolve-report-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom"
            style={{ maxHeight: '75vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />
            <div className="flex items-center gap-3 mb-[4vw]">
              <div className="w-12 h-12 bg-amber-500/15 rounded-xl flex items-center justify-center">
                <Wrench size={24} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="resolve-report-title" className="text-lg font-bold text-themed">Risolvi e Registra</h3>
                <p className="text-sm text-faint truncate">{resolveReport.title}</p>
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint truncate mt-0.5">
                  {resolveReport.created_by_name} · {timeAgo(resolveReport.created_at)}
                </p>
              </div>
            </div>
            <div className="space-y-[3vw] mb-[4vw]">
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Cosa hai fatto?</label>
                <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                  placeholder="Es. Sostituita guarnizione" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-[3vw]">
                <div>
                  <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Durata (min)</label>
                  <input type="number" value={resolveDuration} onChange={e => setResolveDuration(e.target.value)}
                    placeholder="60" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Ricambi</label>
                  <input type="text" value={resolveParts} onChange={e => setResolveParts(e.target.value)}
                    placeholder="Filtro XF-420" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
                </div>
              </div>
            </div>
            <p className="text-xs text-faint text-center mb-[3vw]">La segnalazione verrà chiusa e l'intervento registrato</p>
            <div className="flex gap-[3vw]">
              <button onClick={handleResolveAndLog} disabled={resolving}
                className="flex-1 h-[68px] rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {resolving ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Wrench size={20} /> Risolvi e Registra</>}
              </button>
              <button onClick={() => setResolveReport(null)}
                className="w-[25vw] h-[68px] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
