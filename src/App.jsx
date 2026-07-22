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
    <div className="min-h-screen relative" role="status" aria-label="Caricamento applicazione" style={{ background: 'var(--color-bg)' }}>
      {/* Logo ancorato al centro esatto dello schermo: stessa posizione e
          dimensione dello splash statico in index.html e dello splash di
          sistema della PWA — il passaggio tra le fasi non fa saltare l'icona. */}
      <div className="absolute" style={{ left: '50%', top: '50%', width: 96, height: 96, margin: '-48px 0 0 -48px' }}>
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            inset: -8, borderRadius: 30,
            border: '2px solid var(--color-primary)',
            animation: 'logoRing 1.9s ease-out infinite',
          }}
        />
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          style={{
            width: 96, height: 96, borderRadius: 24,
            objectFit: 'cover', display: 'block',
            boxShadow: 'var(--shadow-glow-primary)',
            animation: 'logoFloat 2.8s ease-in-out infinite',
          }}
        />
      </div>
      <div className="absolute text-center" style={{ left: 0, right: 0, top: 'calc(50% + 66px)' }}>
        <Spinner />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>{label}</p>
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
