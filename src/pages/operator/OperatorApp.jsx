import { useCallback, useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useMachines } from '../../hooks/useMachines'
import { useVoiceTicket } from '../../hooks/useVoiceTicket'
import { ROLES } from '../../lib/constants'
import { isSupabaseConfigured } from '../../lib/supabase'
import OperatorNavBar from '../../components/operator/OperatorNavBar'
import OperatorHome from './OperatorHome'
import OperatorRecording from './OperatorRecording'
import OperatorReview from './OperatorReview'
import OperatorTicketList from './OperatorTicketList'
import OperatorTicketDetail from './OperatorTicketDetail'

function OperatorProfile({ onLogout }) {
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

export default function OperatorApp() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const { machines } = useMachines()
  const voice = useVoiceTicket(machines)

  // tab: home | list | profile
  const [tab, setTab] = useState('home')
  // selected ticket for detail view
  const [detailId, setDetailId] = useState(null)
  // force reload list after insert
  const [refreshKey, setRefreshKey] = useState(0)

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

  const handleSubmit = useCallback(async ({ finalFields, finalText, user: u }) => {
    const created = await voice.submitTicket({ finalFields, finalText, user: u })
    voice.reset()
    setRefreshKey(k => k + 1)
    setTab('list')
    return created
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
    screen = <OperatorProfile onLogout={logout} />
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
      {screen}
      {showNav && (
        <OperatorNavBar
          active={tab}
          onChange={(id) => { setDetailId(null); setTab(id) }}
        />
      )}
    </div>
  )
}
