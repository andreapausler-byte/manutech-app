import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../lib/supabase'
import { Home, ClipboardList, Plus, User, LogOut, Zap, X, Cog, MessageCircle, Wallet, Wrench, PenSquare, Save } from 'lucide-react'
import { useHaptic } from '../../hooks/useHaptic'
import { useToast } from '../../hooks/useToast'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useChatRealtime } from '../../hooks/useChatRealtime'
import { useDirectMessageRealtime } from '../../hooks/useDirectMessageRealtime'
import { useAutoNotifications } from '../../hooks/useAutoNotifications'
import { usePWA } from '../../hooks/usePWA'
import { InstallBanner, SafariInstallGuide, NotifPermissionBanner } from '../ui/PWABanners'
import OfflineBanner from '../ui/OfflineBanner'
import NotificationCenter from '../ui/NotificationCenter'
import SettingsPanel from '../ui/SettingsPanel'
import ReportsList from '../reports/ReportsList'
import NewReport from '../reports/NewReport'
import QuickReport from '../reports/QuickReport'
import ReportDetail from '../reports/ReportDetail'
import MobileMachinesList from '../machines/MobileMachinesList'
import MobileMachineDetail from '../machines/MobileMachineDetail'
import ProfilePage from '../../pages/mobile/ProfilePage'
import MobileDashboard from '../../pages/mobile/MobileDashboard'
import WalletPage from '../../pages/mobile/WalletPage'
import ConversationList from '../messaging/ConversationList'
import ConversationView from '../messaging/ConversationView'

// ── FAB Config per tab ──
const FAB_CONFIG = {
  home: { icon: Plus, label: 'Nuova segnalazione', action: 'report_menu', bg: 'var(--gradient-primary)', shadow: 'var(--shadow-glow-primary)' },
  reports: { icon: Plus, label: 'Nuova segnalazione', action: 'report_menu', bg: 'var(--gradient-primary)', shadow: 'var(--shadow-glow-primary)' },
  machines: { icon: Plus, label: 'Nuovo macchinario', action: 'new_machine', bg: 'linear-gradient(135deg, #22c55e, #16a34a)', shadow: '0 4px 20px rgba(34,197,94,0.35)' },
  messages: { icon: PenSquare, label: 'Nuova conversazione', action: 'new_conversation', bg: 'linear-gradient(135deg, #06b6d4, #0891b2)', shadow: '0 4px 20px rgba(6,182,212,0.35)' },
}

// ── FAB contestuale ──
function ContextualFAB({ tab, onNewReport, onQuickReport, onNewConversation, onNewMachine }) {
  const [open, setOpen] = useState(false)
  const haptic = useHaptic()

  const config = FAB_CONFIG[tab]
  if (!config) return null

  const FabIcon = config.icon

  const handleFABClick = () => {
    haptic.medium()
    if (config.action === 'report_menu') {
      setOpen(o => !o)
    } else if (config.action === 'quick_report') {
      onQuickReport()
    } else if (config.action === 'new_report') {
      onNewReport()
    } else if (config.action === 'new_machine') {
      onNewMachine()
    } else if (config.action === 'new_conversation') {
      onNewConversation()
    }
  }

  const handleAction = (fn) => {
    setOpen(false)
    fn()
  }

  return (
    <>
      {/* Overlay — solo per report_menu */}
      {open && config.action === 'report_menu' && (
        <div className="fixed inset-0 bg-black/60 z-[48] backdrop-blur-sm" aria-hidden="true" onClick={() => setOpen(false)}
          style={{ animation: 'fadeIn 0.2s ease' }}
        />
      )}

      {/* Menu report (solo per home/reports) */}
      {config.action === 'report_menu' && (
        <div className={`fixed left-0 right-0 bottom-[140px] z-[49] flex flex-col items-center gap-[14px] px-[6vw] transition-all duration-300 ${
          open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
        }`}>
          <button
            onClick={() => handleAction(onQuickReport)}
            className="w-full flex items-center justify-center gap-4 text-white rounded-2xl press-scale"
            style={{
              padding: '18px 24px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 6px 28px rgba(245, 158, 11, 0.35)',
              fontSize: 17, fontWeight: 700,
            }}
          >
            <Zap size={24} strokeWidth={2.5} />
            Report Rapido
          </button>
          <button
            onClick={() => handleAction(onNewReport)}
            className="w-full flex items-center justify-center gap-4 text-white rounded-2xl press-scale"
            style={{
              padding: '18px 24px',
              background: 'var(--gradient-primary)',
              boxShadow: '0 6px 28px rgba(124, 106, 255, 0.35)',
              fontSize: 17, fontWeight: 700,
            }}
          >
            <ClipboardList size={24} strokeWidth={2.5} />
            Report Completo
          </button>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={handleFABClick}
        aria-label={open ? 'Chiudi menu' : config.label}
        aria-expanded={config.action === 'report_menu' ? open : undefined}
        className={`fixed bottom-[76px] right-[16px] z-50 w-[56px] h-[56px] rounded-2xl flex items-center justify-center press-scale transition-all duration-200 ${
          open && config.action === 'report_menu' ? 'rotate-45' : ''
        }`}
        style={{
          background: open && config.action === 'report_menu' ? 'var(--color-surface-2)' : config.bg,
          boxShadow: open && config.action === 'report_menu' ? 'var(--shadow-md)' : config.shadow,
          animation: 'scaleIn 0.2s var(--ease-spring)',
        }}
      >
        {open && config.action === 'report_menu'
          ? <X size={26} strokeWidth={2.5} style={{ color: 'var(--color-text-secondary)' }} />
          : <FabIcon size={26} className="text-white" strokeWidth={2.5} />
        }
      </button>
    </>
  )
}

// Tab basati su ruolo — Design System (con Profilo per tutti)
const TABS_BY_ROLE = {
  admin: [
    { id: 'home', icon: Home, label: 'Dashboard' },
    { id: 'reports', icon: ClipboardList, label: 'Ticket' },
    { id: 'machines', icon: Cog, label: 'Macchine' },
    { id: 'messages', icon: MessageCircle, label: 'Messaggi' },
    { id: 'profile', icon: User, label: 'Profilo' },
  ],
  tecnico: [
    { id: 'reports', icon: ClipboardList, label: 'Assegnati' },
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'machines', icon: Cog, label: 'Macchine' },
    { id: 'messages', icon: MessageCircle, label: 'Messaggi' },
    { id: 'profile', icon: User, label: 'Profilo' },
  ],
  operatore: [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'reports', icon: ClipboardList, label: 'I Miei Ticket' },
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'messages', icon: MessageCircle, label: 'Messaggi' },
    { id: 'profile', icon: User, label: 'Profilo' },
  ],
}

// ── Schermata fullscreen nuovo macchinario ──
function NewMachineScreen({ onBack, onCreated }) {
  const [form, setForm] = useState({ name: '', department: '', manufacturer: '', model: '', year: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await db.createMachine({
        name: form.name.trim(),
        department: form.department.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? parseInt(form.year) : null,
        notes: form.notes.trim() || null,
        status: 'operativa',
      })
      haptic.success()
      toast.success('Macchinario aggiunto!')
      onCreated()
    } catch (e) {
      toast.error('Errore: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen min-h-[100dvh]" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={onBack} className="press-scale"
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-surface-2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} style={{ color: 'var(--color-text-muted)' }} />
        </button>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>Nuovo Macchinario</h3>
        </div>
      </header>

      {/* Form — scroll nativo */}
      <div style={{ padding: '20px 5vw 120px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Nome macchinario *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="es. Pressa idraulica #3" className="w-full input-field"
              style={{ borderRadius: 14, padding: '14px 16px', fontSize: 16 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Reparto</label>
              <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="es. Linea 1" className="w-full input-field"
                style={{ borderRadius: 14, padding: '14px 16px', fontSize: 16 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Produttore</label>
              <input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                placeholder="es. Siemens" className="w-full input-field"
                style={{ borderRadius: 14, padding: '14px 16px', fontSize: 16 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Modello</label>
              <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="es. XR-500" className="w-full input-field"
                style={{ borderRadius: 14, padding: '14px 16px', fontSize: 16 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Anno</label>
              <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                placeholder="es. 2024" className="w-full input-field"
                style={{ borderRadius: 14, padding: '14px 16px', fontSize: 16 }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Note</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Note aggiuntive..." className="w-full input-field"
              style={{ borderRadius: 14, padding: '14px 16px', fontSize: 16, resize: 'none' }} rows={3} />
          </div>
        </div>
      </div>

      {/* Bottone fisso in fondo */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: '16px 5vw', paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        background: 'var(--color-surface-1)', borderTop: '1px solid var(--color-border)',
      }}>
        <button onClick={handleSave} disabled={saving || !form.name.trim()}
          className="press-scale"
          style={{
            width: '100%', padding: '16px 0', borderRadius: 16,
            fontSize: 16, fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
            opacity: saving || !form.name.trim() ? 0.5 : 1,
          }}>
          {saving
            ? <div style={{ width: 22, height: 22, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            : <><Save size={20} /> Aggiungi Macchinario</>}
        </button>
      </div>
    </div>
  )
}

export default function MobileLayout({ initialReportId }) {
  const { user, logout } = useAuth()
  const { toggleMode, isDark } = useTheme()
  const [tab, setTab] = useState(user?.role === 'tecnico' ? 'reports' : 'home')
  const [screen, setScreen] = useState(null)
  const [selectedReport, setSelectedReport] = useState(null)
  const [transitionClass, setTransitionClass] = useState('page-slide-in')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const haptic = useHaptic()
  const { isOnline, wasOffline } = useOnlineStatus()

  // ── Chat Realtime ──
  const { unreadByReport, totalUnread, markAsRead, refreshUnread } = useChatRealtime(user?.id)

  // ── DM Realtime ──
  const { unreadByConversation, totalUnreadDM, markDMAsRead } = useDirectMessageRealtime(user?.id)
  const [selectedConversation, setSelectedConversation] = useState(null)

  // ── Auto Notifications (scadenze manutenzione) ──
  useAutoNotifications(user?.id, user?.role)

  // ── PWA + Web Notifications ──
  const handleNotifClick = (data) => {
    if (data.report_id) openReportById(data.report_id)
  }
  const { notifPermission, canInstall, requestPermission, promptInstall, showNotification } = usePWA(handleNotifClick, { userId: user?.id, orgId: user?.org_id || 'default' })

  // ── Deep link da email ──
  useEffect(() => {
    if (initialReportId) {
      openReportById(initialReportId)
      window.history.replaceState({}, '', '/')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (id) => {
    haptic.light()
    setTab(id)
    setShowNewConversation(false)
  }

  // ── Navigazione con transizioni fluide ──
  const navigateTo = (screenName, data = null) => {
    haptic.medium()
    setTransitionClass('page-slide-in')
    setSelectedReport(data)
    setScreen(screenName)
  }

  const goBack = () => {
    setTransitionClass('page-slide-back')
    setTimeout(() => {
      setScreen(null)
      setSelectedReport(null)
    }, 50)
  }

  const openNewReport = () => navigateTo('new-report')
  const openQuickReport = (machineName) => navigateTo('quick-report', machineName || null)
  const openReport = (report) => {
    // Segna la chat come letta quando apri il report
    markAsRead(report.id)
    navigateTo('report-detail', report)
  }

  const openReportById = async (reportId) => {
    try {
      const report = await db.getReport(reportId)
      if (report) openReport(report)
    } catch {}
  }

  const openMachine = (machine) => navigateTo('machine-detail', machine)

  const openConversation = (conv) => {
    setSelectedConversation(conv)
    markDMAsRead(conv.id)
    navigateTo('conversation-detail')
  }

  const [showNewConversation, setShowNewConversation] = useState(false)

  const handleNewConversation = () => {
    haptic.medium()
    setShowNewConversation(true)
  }

  const handleNewMachine = () => {
    haptic.medium()
    navigateTo('new-machine')
  }

  const handleCreated = () => {
    goBack()
    setTimeout(() => setTab('reports'), 100)
  }

  if (screen === 'new-report') {
    return (
      <div className={transitionClass}>
        <NewReport
          user={user}
          onBack={goBack}
          onCreated={handleCreated}
          preselectedMachine={typeof selectedReport === 'string' ? selectedReport : null}
        />
      </div>
    )
  }
  if (screen === 'quick-report') {
    return (
      <div className={transitionClass}>
        <QuickReport
          user={user}
          onBack={goBack}
          onCreated={handleCreated}
          preselectedMachine={typeof selectedReport === 'string' ? selectedReport : null}
        />
      </div>
    )
  }
  if (screen === 'report-detail' && selectedReport) {
    return (
      <div className={transitionClass}>
        <ReportDetail
          report={selectedReport}
          user={user}
          onBack={() => { refreshUnread(); goBack() }}
        />
      </div>
    )
  }
  if (screen === 'conversation-detail' && selectedConversation) {
    return (
      <div className={transitionClass} style={{ height: '100dvh' }}>
        <ConversationView
          conversation={selectedConversation}
          user={user}
          otherUser={selectedConversation.otherUser}
          variant="mobile"
          onBack={() => { goBack(); setSelectedConversation(null) }}
          onMessageSent={() => markDMAsRead(selectedConversation.id)}
        />
      </div>
    )
  }
  if (screen === 'machine-detail' && selectedReport) {
    return (
      <div className={transitionClass}>
        <MobileMachineDetail
          machine={selectedReport}
          onBack={goBack}
          onViewReport={openReport}
          onQuickReport={openQuickReport}
          onNewReport={(machineName) => navigateTo('new-report', machineName)}
        />
      </div>
    )
  }
  if (screen === 'new-machine') {
    return (
      <div className={transitionClass}>
        <NewMachineScreen onBack={goBack} onCreated={() => { goBack(); setTab('machines') }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col ambient-glow bg-base">
      {/* Top Bar — Design System */}
      <header className="sticky top-0 z-40" style={{
        background: 'var(--color-surface-1)',
        borderBottom: '1px solid var(--color-border)',
        padding: '10px 16px',
        transition: 'background 0.4s ease',
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, fontFamily: "'Outfit', sans-serif" }}>M</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)', display: 'block', lineHeight: 1.2 }}>ManuTech</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{user.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme toggle ☀/☾ */}
            <button
              onClick={() => { haptic.light(); toggleMode() }}
              aria-label={isDark ? 'Passa a modalità chiara' : 'Passa a modalità scura'}
              className="press-scale"
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'var(--color-surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                fontSize: 18,
              }}
            >
              {isDark ? '☀' : '☾'}
            </button>
            <NotificationCenter userId={user.id} userRole={user.role} onOpenReport={openReportById} onNewNotifications={showNotification} />
            {/* Logout */}
            <button
              onClick={logout}
              aria-label="Disconnetti"
              className="press-scale"
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'var(--color-surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <OfflineBanner isOnline={isOnline} wasOffline={wasOffline} />

      {/* PWA Banners */}
      <InstallBanner canInstall={canInstall} onInstall={promptInstall} />
      <SafariInstallGuide />
      <NotifPermissionBanner permission={notifPermission} onRequest={requestPermission} />

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-[18vw] scroll-smooth relative z-[1]">
        <div className="animate-fade-in">
          {tab === 'home' && <MobileDashboard user={user} onViewReport={openReport} onQuickReport={openQuickReport} />}
          {tab === 'reports' && (
            <ReportsList
              user={user}
              onSelectReport={openReport}
              unreadByReport={unreadByReport}
            />
          )}
          {tab === 'wallet' && <WalletPage />}
          {tab === 'machines' && (
            <MobileMachinesList onSelectMachine={openMachine} />
          )}
          {tab === 'messages' && (
            <ConversationList
              user={user}
              onSelectConversation={(conv) => { setShowNewConversation(false); openConversation(conv) }}
              unreadByConversation={unreadByConversation}
              openNewChat={showNewConversation}
            />
          )}
          {tab === 'profile' && <ProfilePage />}
        </div>
      </main>

      <ContextualFAB
        tab={tab}
        onNewReport={openNewReport}
        onQuickReport={() => openQuickReport()}
        onNewConversation={handleNewConversation}
        onNewMachine={handleNewMachine}
      />

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user.id} userRole={user.role} />

      {/* Bottom Nav — Design System */}
      <nav aria-label="Navigazione principale" className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom" style={{
        background: 'var(--color-surface-1)',
        borderTop: '1px solid var(--color-border)',
        padding: '6px 0 10px',
      }}>
        <div className="flex items-center justify-around max-w-md mx-auto">
          {(TABS_BY_ROLE[user?.role] || TABS_BY_ROLE.operatore).map(({ id, icon: Icon, label }) => {
            const active = tab === id
            const showBadge = (id === 'reports' && totalUnread > 0) || (id === 'messages' && totalUnreadDM > 0)
            const badgeCount = id === 'reports' ? totalUnread : id === 'messages' ? totalUnreadDM : 0
            return (
              <button key={id} onClick={() => switchTab(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={showBadge ? `${label} (${badgeCount} non letti)` : label}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 press-scale"
                style={{ minHeight: 48, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <div className="relative">
                  <Icon size={18} strokeWidth={active ? 2.5 : 1.8}
                    style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)', transition: 'color 0.2s' }} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1"
                      style={{ background: 'var(--color-danger)' }}>
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  transition: 'color 0.2s',
                }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
