import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { LayoutDashboard, ClipboardList, Wrench, Users, Cog, LogOut, ChevronLeft, ChevronRight, Bell, Shield, Sun, Moon, Settings, MessageCircle, Trophy } from 'lucide-react'
import { useAutoNotifications } from '../../hooks/useAutoNotifications'
import { usePWA } from '../../hooks/usePWA'
import SettingsPanel from '../ui/SettingsPanel'
import AdminDashboard from '../../pages/admin/AdminDashboard'
import AdminReports from '../../pages/admin/AdminReports'
import AdminMachines from '../../pages/admin/AdminMachines'
import AdminMaintenance from '../../pages/admin/AdminMaintenance'
import AdminUsers from '../../pages/admin/AdminUsers'
import AdminTechnicians from '../../pages/admin/AdminTechnicians'
import AdminNotifSettings from '../../pages/admin/AdminNotifSettings'
import AdminMessaging from '../../pages/admin/AdminMessaging'
import AdminLeaderboard from '../../pages/admin/AdminLeaderboard'

const NAV = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Panoramica generale' },
  { id: 'reports', icon: ClipboardList, label: 'Segnalazioni', desc: 'Gestisci interventi' },
  { id: 'machines', icon: Cog, label: 'Macchinari', desc: 'Anagrafica impianti' },
  { id: 'maintenance', icon: Shield, label: 'Manutenzione', desc: 'Piani e interventi programmati' },
  { id: 'technicians', icon: Wrench, label: 'Tecnici', desc: 'Carico e performance' },
  { id: 'leaderboard', icon: Trophy, label: 'Classifica', desc: 'Punteggi e premi operatori' },
  { id: 'users', icon: Users, label: 'Utenti', desc: 'Account e ruoli' },
  { id: 'messages', icon: MessageCircle, label: 'Messaggi', desc: 'Chat diretta con il team' },
  { id: 'notifications', icon: Bell, label: 'Notifiche', desc: 'Preferenze notifiche per ruolo' },
]

export default function AdminLayout({ initialReportId }) {
  const { user, logout } = useAuth()
  const { toggleMode, isDark } = useTheme()
  const [tab, setTab] = useState(initialReportId ? 'reports' : 'dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ── Deep link da email ──
  useEffect(() => {
    if (initialReportId) {
      window.history.replaceState({}, '', '/')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto Notifications (scadenze manutenzione) ──
  useAutoNotifications(user?.id, user?.role)

  // ── PWA + Web Push per admin ──
  const handleNotifClick = (data) => {
    if (data.report_id) setTab('reports')
  }
  usePWA(handleNotifClick, { userId: user?.id, orgId: user?.org_id || 'default' })

  const renderPage = () => {
    switch (tab) {
      case 'dashboard': return <AdminDashboard onNavigate={setTab} />
      case 'reports': return <AdminReports initialReportId={initialReportId} />
      case 'machines': return <AdminMachines />
      case 'maintenance': return <AdminMaintenance />
      case 'technicians': return <AdminTechnicians />
      case 'leaderboard': return <AdminLeaderboard />
      case 'users': return <AdminUsers />
      case 'messages': return <AdminMessaging />
      case 'notifications': return <AdminNotifSettings />
      default: return <AdminDashboard onNavigate={setTab} />
    }
  }

  const current = NAV.find(n => n.id === tab)

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      {/* Sidebar — glass-heavy */}
      <aside
        aria-label="Navigazione principale"
        className={`${collapsed ? 'w-[72px]' : 'w-[260px]'} glass-heavy flex flex-col transition-all duration-300 shrink-0 relative`}
        style={{ borderRight: '1px solid var(--color-border)' }}
      >
        {/* Logo area */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-5'} py-5`} style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, fontFamily: "'Outfit', sans-serif" }}>M</span>
          </div>
          {!collapsed && (
            <div>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>ManuTech</span>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-faint)' }}>Admin Console</p>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          className="absolute -right-3 top-[72px] w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-hover)', color: 'var(--color-text-muted)' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2.5 space-y-1">
          {NAV.map(({ id, icon: Icon, label }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? label : undefined}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group"
                style={{
                  background: active ? 'var(--color-primary-glow)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                }}
                title={collapsed ? label : undefined}
              >
                <div
                  className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: active ? 'var(--color-primary-glow)' : undefined }}
                >
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                </div>
                {!collapsed && (
                  <span className="text-[15px] font-medium">{label}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          {!collapsed ? (
            <div className="flex items-center gap-3 px-2 py-2 mb-2">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-lg flex items-center justify-center text-base shrink-0">🛡️</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-themed truncate">{user.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>Amministratore</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-lg flex items-center justify-center text-base">🛡️</div>
            </div>
          )}
          <button
            onClick={logout}
            aria-label="Disconnetti"
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2 px-3'} py-2.5 rounded-lg text-sm transition-colors hover:text-red-400 hover:bg-red-500/10`}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <LogOut size={16} />
            {!collapsed && 'Disconnetti'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        {/* Top bar — glass */}
        <header className="glass flex items-center justify-between px-8 py-4 sticky top-0 z-30" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-xl font-extrabold text-themed tracking-tight">{current?.label}</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-faint)' }}>{current?.desc}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Theme toggle ☀/☾ */}
            <button
              onClick={toggleMode}
              aria-label={isDark ? 'Passa a modalità chiara' : 'Passa a modalità scura'}
              className="press-scale"
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'var(--color-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', fontSize: 16,
              }}
            >
              {isDark ? '☀' : '☾'}
            </button>
            {/* Settings */}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Personalizza tema"
              className="w-9 h-9 rounded-xl flex items-center justify-center press-scale transition-colors"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
            >
              <Settings size={17} />
            </button>
            <span className="text-sm" style={{ color: 'var(--color-text-faint)' }}>
              {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </header>

        <div className="p-8 animate-fade-in">
          {renderPage()}
        </div>
      </main>

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user.id} userRole={user.role} />
    </div>
  )
}
