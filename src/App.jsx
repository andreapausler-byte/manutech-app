import { useMemo, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { Spinner } from './components/ui'

const LoginPage = lazy(() => import('./components/layout/LoginPage'))
const MobileLayout = lazy(() => import('./components/layout/MobileLayout'))
const V6App = lazy(() => import('./pages/manutech-v6/V6App'))
const OperatorApp = lazy(() => import('./pages/operator/OperatorApp'))
const GuestChatPage = lazy(() => import('./components/guest/GuestChatPage'))
const AcceptInvitePage = lazy(() => import('./components/layout/AcceptInvitePage'))
const DesignPreview = lazy(() => import('./pages/DesignPreview'))
const PendingApprovalScreen = lazy(() => import('./components/layout/PendingApprovalScreen'))
const RejectedScreen = lazy(() => import('./components/layout/RejectedScreen'))
const SuperAdminPendingOrgs = lazy(() => import('./pages/super-admin/SuperAdminPendingOrgs'))

function AppLoader({ label = 'Caricamento ManuTech...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Caricamento applicazione" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center">
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="w-20 h-20 mx-auto rounded-2xl animate-pulse"
          style={{ objectFit: 'cover', boxShadow: 'var(--shadow-glow-primary)', marginBottom: 16 }}
        />
        <Spinner />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)', marginTop: 10 }}>{label}</p>
      </div>
    </div>
  )
}

function getGuestParams() {
  const match = window.location.pathname.match(/^\/guest\/([^/]+)\/([^/]+)$/)
  return match ? { reportId: match[1], token: match[2] } : null
}

function getInviteToken() {
  const match = window.location.pathname.match(/^\/invite\/([^/]+)$/)
  return match ? match[1] : null
}

const guestParams = getGuestParams()
const inviteToken = getInviteToken()
const isDesignPreview = window.location.pathname === '/design-preview'

function AuthenticatedApp() {
  const { user, loading } = useAuth()
  const initialReportId = useMemo(() => {
    const match = window.location.pathname.match(/^\/reports\/(.+)$/)
    return match ? match[1] : null
  }, [])

  if (loading) return <AppLoader />

  if (!user) return <Suspense fallback={<AppLoader />}><LoginPage /></Suspense>

  // Super-admin: console moderazione, bypassa il flow di approval
  // (super_admin gestisce le approvazioni, non le subisce).
  if (user.role === 'super_admin') {
    return (
      <Suspense fallback={<AppLoader />}>
        <SuperAdminPendingOrgs />
      </Suspense>
    )
  }

  // Org in attesa o rifiutata: blocca l'accesso all'app reale finché
  // un super_admin non approva. La schermata permette il logout.
  if (user.org_approval_status === 'pending') {
    return <Suspense fallback={<AppLoader />}><PendingApprovalScreen /></Suspense>
  }
  if (user.org_approval_status === 'rejected') {
    return <Suspense fallback={<AppLoader />}><RejectedScreen /></Suspense>
  }

  if (user.role === 'admin') {
    return (
      <Suspense fallback={<AppLoader />}>
        <V6App userName={user.name} initialReportId={initialReportId} />
      </Suspense>
    )
  }
  if (user.role === 'operatore') return <Suspense fallback={<AppLoader />}><OperatorApp /></Suspense>
  return <Suspense fallback={<AppLoader />}><MobileLayout initialReportId={initialReportId} /></Suspense>
}

export default function App() {
  // Design preview: mockup statico fuori da auth/theme
  if (isDesignPreview) {
    return (
      <Suspense fallback={<AppLoader label="Caricamento mockup..." />}>
        <DesignPreview />
      </Suspense>
    )
  }

  // Guest route: render outside AuthProvider (no auth needed)
  if (guestParams) {
    return (
      <ThemeProvider>
        <Suspense fallback={<AppLoader />}>
          <GuestChatPage reportId={guestParams.reportId} token={guestParams.token} />
        </Suspense>
      </ThemeProvider>
    )
  }

  // Invite route: dentro AuthProvider (acceptInvite aggiorna user)
  if (inviteToken) {
    return (
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<AppLoader />}>
            <AcceptInvitePage token={inviteToken} />
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ThemeProvider>
  )
}
