import { useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../lib/supabase'
import { Home, ClipboardList, Plus, User, LogOut, Zap, X, Cog, Sun, Moon, Settings } from 'lucide-react'
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
        <div className="fixed inset-0 bg-black/50 z-[48] backdrop-blur-sm" onClick={() => setOpen(false)} />
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

const TABS = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'reports', icon: ClipboardList, label: 'Segnalazioni' },
  { id: 'machines', icon: Cog, label: 'Macchine' },
  { id: 'profile', icon: User, label: 'Profilo' },
]

export default function MobileLayout() {
  const { user, logout } = useAuth()
  const { toggleMode, isDark } = useTheme()
  const [tab, setTab] = useState('home')
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
  const { notifPermission, canInstall, requestPermission, promptInstall, showNotification } = usePWA(handleNotifClick)

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
      {/* Header — theme primary gradient */}
      <header className="sticky top-0 z-40" style={{ background: 'var(--header-bg)', transition: 'background 0.4s ease' }}>
        <div className="flex items-center justify-between px-[4vw] py-[2.5vw]">
          <div className="flex items-center gap-[2.5vw]">
            <div
              className="w-[11vw] h-[11vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
            >
              <span className="text-xl">🔧</span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight" style={{ color: 'var(--header-text)' }}>ManuTech</h1>
              <p className="text-sm leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-[1vw]">
            {/* Theme toggle */}
            <button
              onClick={() => { haptic.light(); toggleMode() }}
              className="w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center press-scale"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              {isDark ? <Sun size={18} color="rgba(255,255,255,0.9)" /> : <Moon size={18} color="rgba(255,255,255,0.9)" />}
            </button>
            {/* Settings */}
            <button
              onClick={() => { haptic.light(); setSettingsOpen(true) }}
              className="w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center press-scale"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              <Settings size={18} color="rgba(255,255,255,0.9)" />
            </button>
            <NotificationCenter userId={user.id} onOpenReport={openReportById} onNewNotifications={showNotification} />
            <button onClick={logout} className="w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center active:bg-white/20" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <LogOut size={20} />
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
          {tab === 'machines' && (
            <MobileMachinesList onSelectMachine={openMachine} />
          )}
          {tab === 'profile' && <ProfilePage />}
        </div>
      </main>

      <FABMenu onNewReport={openNewReport} onQuickReport={() => openQuickReport()} />

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Bottom Nav — glass + badge non letti + theme-aware active pill */}
      <nav className="fixed bottom-0 left-0 right-0 glass-heavy border-t z-40 safe-area-bottom" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center justify-around h-[16vw] max-h-[68px] max-w-md mx-auto">
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = tab === id
            const showBadge = id === 'reports' && totalUnread > 0
            return (
              <button key={id} onClick={() => switchTab(id)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full press-scale relative">
                <div
                  className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200"
                  style={{
                    background: active ? 'var(--color-primary-glow)' : 'transparent',
                  }}
                >
                  <div className="relative">
                    <Icon size={22} strokeWidth={active ? 2.5 : 1.8}
                      className="transition-colors"
                      style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-faint)' }} />
                    {/* Badge non letti */}
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1 animate-scale-in"
                        style={{ background: 'var(--color-danger)' }}>
                        {totalUnread > 9 ? '9+' : totalUnread}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold transition-colors"
                    style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-faint)' }}>
                    {label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
