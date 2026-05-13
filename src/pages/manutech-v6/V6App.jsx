import React, { useCallback, useMemo, useState, lazy, Suspense } from 'react'
import { LogOut, Sun, Moon, Settings } from 'lucide-react'
import { Shell, MT, fMono } from '../../components/manutech'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { NAV as ADMIN_NAV } from '../../lib/adminNav'
import NotificationCenter from '../../components/ui/NotificationCenter'
import SettingsPanel from '../../components/ui/SettingsPanel'
import { Spinner } from '../../components/ui'

const AdminDashboard = lazy(() => import('../admin/AdminDashboard'))
const AdminOptimization = lazy(() => import('../admin/AdminOptimization'))
const AdminReports = lazy(() => import('../admin/AdminReports'))
const AdminMachines = lazy(() => import('../admin/AdminMachines'))
const AdminMaintenance = lazy(() => import('../admin/AdminMaintenance'))
const AdminUsers = lazy(() => import('../admin/AdminUsers'))
const AdminTechnicians = lazy(() => import('../admin/AdminTechnicians'))
const AdminNotifSettings = lazy(() => import('../admin/AdminNotifSettings'))
const AdminMessaging = lazy(() => import('../admin/AdminMessaging'))
const AdminLeaderboard = lazy(() => import('../admin/AdminLeaderboard'))
const AdminRewards = lazy(() => import('../admin/AdminRewards'))
const AdminSpareParts = lazy(() => import('../admin/AdminSpareParts'))
const AdminAssistantPage = lazy(() => import('../admin/AdminAssistantPage'))
const AdminCalendar = lazy(() => import('../admin/AdminCalendar'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Caricamento pagina">
      <Spinner />
    </div>
  )
}

function buildNavItems(adminNav) {
  return adminNav
    .filter(n => n.id !== 'v6')
    .map(n => ({ route: n.id, label: n.label, IconCmp: n.icon }))
}

function V6TopBar({ title, crumbs }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 28px', borderBottom: `1px solid ${MT.border}`,
      background: MT.bg, position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div style={{ minWidth: 0 }}>
        {crumbs && (
          <div style={{
            fontFamily: fMono, fontSize: 12, color: MT.textMuted,
            letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase',
          }}>{crumbs}</div>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.2, margin: 0, lineHeight: 1.1, color: MT.text }}>
          {title}
        </h1>
      </div>
    </div>
  )
}

function AdminPageFrame({ title, crumbs, children, fullBleed = false }) {
  return (
    <>
      <V6TopBar title={title} crumbs={crumbs} />
      <div style={{
        flex: 1, minHeight: 0,
        background: 'var(--color-app-bg)',
        color: 'var(--color-text)',
        padding: fullBleed ? 0 : '28px 32px',
        display: fullBleed ? 'flex' : 'block',
        flexDirection: fullBleed ? 'column' : undefined,
      }}>
        {fullBleed ? (
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
        ) : (
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <Suspense fallback={<PageFallback />}>{children}</Suspense>
          </div>
        )}
      </div>
    </>
  )
}

export default function V6App({ userName, initialReportId }) {
  const { user, logout } = useAuth()
  const { toggleMode, isDark } = useTheme()
  const [route, setRoute] = useState(() =>
    initialReportId ? { name: 'reports' } : { name: 'dashboard' }
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  const navigate = useCallback((name, params = {}) => {
    setRoute({ name, ...params })
  }, [])

  const navItems = useMemo(() => buildNavItems(ADMIN_NAV), [])
  const adminNavItem = ADMIN_NAV.find(n => n.id === route.name)

  const sidebarFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
      <button
        onClick={toggleMode}
        title={isDark ? 'Modalità chiara' : 'Modalità scura'}
        style={{
          flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted, cursor: 'pointer',
        }}
      >
        {isDark ? <Sun size={15}/> : <Moon size={15}/>}
      </button>
      <div style={{
        flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted,
      }}>
        <NotificationCenter
          userId={user?.id}
          userRole={user?.role}
          onOpenReport={() => navigate('reports')}
        />
      </div>
      <button
        onClick={() => setSettingsOpen(true)}
        title="Impostazioni tema"
        style={{
          flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted, cursor: 'pointer',
        }}
      >
        <Settings size={15}/>
      </button>
      <button
        onClick={logout}
        title="Disconnetti"
        style={{
          flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted, cursor: 'pointer',
        }}
      >
        <LogOut size={15}/>
      </button>
    </div>
  )

  return (
    <div className="mt-scope" style={{ minHeight: '100vh' }}>
      <Shell
        activeRoute={route.name}
        onNavigate={(r) => navigate(r)}
        userName={userName || user?.name}
        userSubtitle={user ? `${(user.role || '').toUpperCase()} · ${user?.org_name || 'MANUTECH'}` : 'ADMIN · MANUTECH'}
        navItems={navItems}
        versionLabel={`v${__APP_VERSION__} · CONSOLE`}
        sidebarFooter={sidebarFooter}
      >
        <AdminPageFrame
          title={adminNavItem?.label || 'Console'}
          crumbs={user?.org_name || 'ManuTech · Console'}
          fullBleed={route.name === 'calendar'}
        >
          {route.name === 'dashboard' && <AdminDashboard onNavigate={(t) => navigate(t)} />}
          {route.name === 'optimization' && <AdminOptimization onNavigate={(t) => navigate(t)} />}
          {route.name === 'reports' && <AdminReports initialReportId={initialReportId || route.reportId} />}
          {route.name === 'calendar' && <AdminCalendar onNavigate={(name, params) => navigate(name, params)} />}
          {route.name === 'assistant' && <AdminAssistantPage onOpenReport={() => navigate('reports')} initialMachineId={route.machineId} />}
          {route.name === 'machines' && <AdminMachines onOpenAssistant={(machineId) => navigate('assistant', { machineId })} />}
          {route.name === 'maintenance' && <AdminMaintenance />}
          {route.name === 'spare-parts' && <AdminSpareParts />}
          {route.name === 'technicians' && <AdminTechnicians />}
          {route.name === 'leaderboard' && <AdminLeaderboard />}
          {route.name === 'rewards' && <AdminRewards />}
          {route.name === 'users' && <AdminUsers />}
          {route.name === 'messages' && <AdminMessaging />}
          {route.name === 'notifications' && <AdminNotifSettings />}
        </AdminPageFrame>
      </Shell>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user?.id} userRole={user?.role} />
    </div>
  )
}
