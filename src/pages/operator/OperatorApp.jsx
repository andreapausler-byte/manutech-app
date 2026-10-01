import { useCallback, useEffect, useState } from 'react'
import { LogOut, Bell } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useMachines } from '../../hooks/useMachines'
import { useVoiceTicket } from '../../hooks/useVoiceTicket'
import { ROLES } from '../../lib/constants'
import { db, isSupabaseConfigured } from '../../lib/supabase'
import OperatorNavBar from '../../components/operator/OperatorNavBar'
import OperatorHome from './OperatorHome'
import OperatorRecording from './OperatorRecording'
import OperatorReview from './OperatorReview'
import OperatorTicketList from './OperatorTicketList'
import OperatorTicketDetail from './OperatorTicketDetail'
import PendingVoiceRecordings from '../../components/voice/PendingVoiceRecordings'
import { usePWA } from '../../hooks/usePWA'

// iPhone/iPad senza l'app sulla schermata Home: Safari non espone le
// notifiche web, e l'unica cosa utile da dire è come installarla.
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

// Notifiche per l'operatore: fino a ott 2026 l'app dell'operatore non le
// chiedeva mai, e chi apriva una segnalazione non sapeva quando un tecnico
// rispondeva. Una card, non un popup: l'operatore la vede in home finché
// non decide, e in profilo può sempre ricontrollare.
function OperatorPushCard({ permission, onRequest, onTest, compact = false }) {
  const iosNeedsInstall = isIOS() && !isStandalone()
  const unsupported = typeof Notification === 'undefined'
  if (permission === 'granted') {
    return compact ? null : (
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="op-info">
          Notifiche attive: ti avvisiamo quando un tecnico risponde o cambia lo stato delle tue segnalazioni.
        </div>
        {onTest && (
          <button type="button" className="op-btn op-btn--ghost" onClick={onTest} style={{ width: '100%' }}>
            Invia una notifica di prova
          </button>
        )}
      </div>
    )
  }
  let text
  if (iosNeedsInstall) text = 'Su iPhone le notifiche arrivano solo se aggiungi l\'app alla schermata Home: tocca Condividi → "Aggiungi a Home", poi aprila da lì.'
  else if (unsupported) text = 'Questo browser non supporta le notifiche.'
  else if (permission === 'denied') text = 'Le notifiche sono bloccate: riattivale dalle impostazioni del browser (lucchetto accanto all\'indirizzo → Notifiche).'
  else text = 'Attiva le notifiche per sapere quando un tecnico risponde o chiude le tue segnalazioni.'
  const canAsk = !iosNeedsInstall && !unsupported && permission === 'default'
  return (
    <div className="op-detail-field" style={{ marginTop: compact ? 12 : 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Bell size={20} style={{ flexShrink: 0, color: 'var(--op-accent, #f59e0b)', marginTop: 2 }} />
        <div style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--op-text)' }}>{text}</div>
      </div>
      {canAsk && (
        <button type="button" className="op-btn op-btn--primary" onClick={onRequest} style={{ width: '100%' }}>
          Attiva notifiche
        </button>
      )}
    </div>
  )
}

function OperatorProfile({ onLogout, pushPermission, onRequestPush, onTestPush }) {
  const { user } = useAuth()
  const role = ROLES[user?.role] || ROLES.operatore
  return (
    <div className="op-screen">
      <div className="op-statusbar">
        <span className="op-mono">PROFILO</span>
      </div>
      <h1 className="op-header-name">{user?.name || 'Operatore'}</h1>
      <div className="op-mono" style={{ color: 'var(--op-text-soft)', marginTop: 4, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 12 }}>
        {role.label}
      </div>
      <div className="op-detail-field" style={{ marginTop: 22 }}>
        <div className="op-field__label">Email</div>
        <div style={{ marginTop: 6, fontFamily: 'DM Mono, monospace', fontSize: 14, color: 'var(--op-text)' }}>
          {user?.email || '—'}
        </div>
      </div>
      <OperatorPushCard permission={pushPermission} onRequest={onRequestPush} onTest={onTestPush} />
      <div style={{ marginTop: 28 }}>
        <button
          type="button"
          className="op-btn op-btn--ghost"
          onClick={onLogout}
          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          <LogOut size={18} /> Esci
        </button>
      </div>
    </div>
  )
}

export default function OperatorApp({ initialReportId = null }) {
  const { user, logout } = useAuth()
  const toast = useToast()
  const { machines } = useMachines()
  const voice = useVoiceTicket(machines, user)

  // tab: home | list | profile — con deep link /reports/:id si parte dalla
  // lista così il back dal dettaglio ha una destinazione sensata
  const [tab, setTab] = useState(initialReportId ? 'list' : 'home')
  // selected ticket for detail view
  const [detailId, setDetailId] = useState(initialReportId)
  // force reload list after insert
  const [refreshKey, setRefreshKey] = useState(0)

  // Push: registrazione SW + iscrizione allineata al server (lib/push.js).
  // Il tocco su una notifica apre direttamente la segnalazione.
  const handleNotifClick = useCallback((data) => {
    if (data?.report_id) { setTab('list'); setDetailId(data.report_id) }
  }, [])
  const { notifPermission, requestPermission } = usePWA(handleNotifClick, { userId: user?.id, orgId: user?.org_id })
  // Prova dall'inizio alla fine: riga in notifications → trigger → push.
  const sendTestPush = useCallback(async () => {
    if (!user?.id) return
    try {
      await db.addNotification({
        type: 'status_change',
        title: 'Notifica di prova',
        body: 'Se la vedi con l\'app chiusa, le notifiche funzionano.',
        target_user: user.id,
      })
      toast.success('Inviata: chiudi l\'app e aspetta qualche secondo')
    } catch (e) {
      toast.error('Invio non riuscito: ' + (e?.message || 'riprova'))
    }
  }, [user?.id, toast])

  // Mostra toast su errori audio non gestiti dal review
  useEffect(() => {
    if (voice.state === 'idle' && voice.error) {
      toast.error(voice.error)
      // Reset error locally to avoid repeated toasts
      voice.reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state, voice.error])

  const handleStartRecording = useCallback(async () => {
    if (!voice.supportsMediaRecorder) {
      toast.error('Registrazione non supportata. Compilo il ticket manualmente.')
      voice.openManual()
      return
    }
    await voice.startRecording()
  }, [voice, toast])

  const handleSubmit = useCallback(async ({ finalFields, finalText, finalMedia, user: u }) => {
    const result = await voice.submitTicket({ finalFields, finalText, finalMedia, user: u })
    voice.reset()
    setRefreshKey(k => k + 1)
    setTab('list')
    return result
  }, [voice])

  const handleOpenTicket = useCallback((report) => {
    setDetailId(report.id)
  }, [])

  const handleCloseDetail = useCallback(() => setDetailId(null), [])

  // Screen priority: recording > review > detail > tab
  let screen
  if (voice.state === 'recording') {
    screen = (
      <OperatorRecording
        elapsedMs={voice.elapsedMs}
        onStop={voice.stopRecording}
      />
    )
  } else if (voice.state === 'review') {
    // OperatorReview gestisce internamente la rehydration del form quando
    // fields/transcription arrivano dopo l'apertura della review (PR 3).
    screen = (
      <OperatorReview
        machines={machines}
        fields={voice.fields}
        transcription={voice.transcription}
        transcribing={voice.transcribing}
        error={voice.error}
        onSubmit={handleSubmit}
        onCancel={() => voice.reset()}
      />
    )
  } else if (detailId) {
    screen = <OperatorTicketDetail reportId={detailId} onBack={handleCloseDetail} />
  } else if (tab === 'list') {
    screen = <OperatorTicketList onOpenTicket={handleOpenTicket} refreshKey={refreshKey} />
  } else if (tab === 'profile') {
    screen = <OperatorProfile onLogout={logout} pushPermission={notifPermission} onRequestPush={requestPermission} onTestPush={sendTestPush} />
  } else {
    screen = (
      <OperatorHome
        onStartRecording={handleStartRecording}
        onOpenTicket={handleOpenTicket}
        onOpenList={() => setTab('list')}
        disabled={!user}
      />
    )
  }

  const showNav = voice.state !== 'recording'
    && voice.state !== 'review'
    && !detailId

  const isDemo = !isSupabaseConfigured()

  return (
    <div className="operator-shell">
      {isDemo && tab === 'home' && voice.state === 'idle' && (
        <div style={{ padding: '10px 20px 0' }}>
          <div className="op-info">Modalità demo attiva — AI vocale disattivata</div>
        </div>
      )}
      {showNav && tab === 'home' && voice.state === 'idle' && notifPermission !== 'granted' && (
        <div style={{ padding: '0 20px' }}>
          <OperatorPushCard permission={notifPermission} onRequest={requestPermission} compact />
        </div>
      )}
      {screen}
      {showNav && <PendingVoiceRecordings />}
      {showNav && (
        <OperatorNavBar
          active={tab}
          onChange={(id) => { setDetailId(null); setTab(id) }}
        />
      )}
    </div>
  )
}
