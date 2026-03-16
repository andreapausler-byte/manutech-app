import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../lib/supabase'
import { Home, ClipboardList, Plus, User, LogOut, Zap, X, Cog } from 'lucide-react'
import { useHaptic } from '../../hooks/useHaptic'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useChatRealtime } from '../../hooks/useChatRealtime'
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

// ── FAB Menu — 2 azioni: Quick Report + Report Completo ──
function FABMenu({ onNewReport, onQuickReport }) {
  const [open, setOpen] = useState(false)
  const haptic = useHaptic()

  const toggle = () => {
    haptic.light()
    setOpen(o => !o)
  }

  const handleAction = (fn) => {
    setOpen(false)
    fn()
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-[48] backdrop-blur-sm" aria-hidden="true" onClick={() => setOpen(false)} />
      )}

      <div className={`fixed bottom-[36vw] right-[4vw] z-[49] flex flex-col items-end gap-[3vw] transition-all duration-200 ${
        open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        <button
          onClick={() => handleAction(onQuickReport)}
          className="flex items-center gap-3 text-white px-5 py-3.5 rounded-full press-scale"
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
          }}
        >
          <Zap size={20} strokeWidth={2.5} />
          <span className="text-base font-bold whitespace-nowrap">Report Rapido</span>
        </button>
        <button
          onClick={() => handleAction(onNewReport)}
          className="flex items-center gap-3 text-white px-5 py-3.5 rounded-full press-scale"
          style={{
            background: 'var(--gradient-primary)',
            boxShadow: 'var(--shadow-glow-primary)',
          }}
        >
          <ClipboardList size={20} strokeWidth={2.5} />
          <span className="text-base font-bold whitespace-nowrap">Report Completo</span>
        </button>
      </div>

      <button
        onClick={toggle}
        aria-label={open ? 'Chiudi menu segnalazioni' : 'Nuova segnalazione'}
        aria-expanded={open}
        className={`fixed bottom-[20vw] right-[4vw] z-50 w-[15vw] h-[15vw] max-w-16 max-h-16 rounded-2xl flex items-center justify-center press-scale transition-all duration-200 ${
          open ? 'rotate-45' : ''
        }`}
        style={{
          background: open ? 'var(--color-surface-2)' : 'var(--gradient-primary)',
          boxShadow: open
            ? 'var(--shadow-md)'
            : 'var(--shadow-glow-primary)',
        }}
      >
        {open
          ? <X size={26} className="text-white" strokeWidth={2.5} style={{ color: 'var(--color-text-secondary)' }} />
          : <Plus size={28} className="text-white" strokeWidth={2.5} />
        }
      </button>
    </>
  )
}

// Tab basati su ruolo — Design System
const TABS_BY_ROLE = {
  admin: [
    { id: 'home', icon: Home, label: 'Dashboard' },
    { id: 'reports', icon: ClipboardList, label: 'Ticket' },
    { id: 'machines', icon: Cog, label: 'Macchine' },
  ],
  tecnico: [
    { id: 'reports', icon: ClipboardList, label: 'Assegnati' },
    { id: 'machines', icon: Cog, label: 'Macchine' },
  ],
  operatore: [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'reports', icon: ClipboardList, label: 'I Miei Ticket' },
  ],
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
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>ManuTech</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme toggle ☀/☾ */}
            <button
              onClick={() => { haptic.light(); toggleMode() }}
              aria-label={isDark ? 'Passa a modalità chiara' : 'Passa a modalità scura'}
              className="press-scale"
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'var(--color-surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                fontSize: 16,
              }}
            >
              {isDark ? '☀' : '☾'}
            </button>
            <NotificationCenter userId={user.id} userRole={user.role} onOpenReport={openReportById} onNewNotifications={showNotification} />
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
          {tab === 'machines' && (
            <MobileMachinesList onSelectMachine={openMachine} />
          )}
          {tab === 'profile' && <ProfilePage />}
        </div>
      </main>

      <FABMenu onNewReport={openNewReport} onQuickReport={() => openQuickReport()} />

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
            const showBadge = id === 'reports' && totalUnread > 0
            return (
              <button key={id} onClick={() => switchTab(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={showBadge ? `${label} (${totalUnread} non letti)` : label}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 press-scale"
                style={{ minHeight: 48, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <div className="relative">
                  <Icon size={18} strokeWidth={active ? 2.5 : 1.8}
                    style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)', transition: 'color 0.2s' }} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1"
                      style={{ background: 'var(--color-danger)' }}>
                      {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 10,
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
