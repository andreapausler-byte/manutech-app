import { Clock, LogOut, Mail } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui'

export default function PendingApprovalScreen() {
  const { user, logout } = useAuth()

  return (
    <div
      className="min-h-screen min-h-[100dvh] flex items-center justify-center px-5 py-8 ambient-glow"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-md animate-scale-in relative z-[1]">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{
              background: 'var(--color-warning-glow, rgba(255, 170, 44, 0.2))',
              border: '1px solid rgba(255, 170, 44, 0.3)',
            }}
          >
            <Clock size={36} style={{ color: '#ffaa2c' }} />
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            In attesa di approvazione
          </h1>
          <p className="text-base mt-2" style={{ color: 'var(--color-text-muted)' }}>
            La tua organizzazione è in revisione
          </p>
        </div>

        <div
          className="glass-heavy rounded-2xl p-6"
          style={{
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          <p
            className="text-base leading-relaxed mb-4"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Grazie per esserti registrato a ManuTech. Verifichiamo manualmente
            ogni nuova organizzazione prima di attivare l'accesso completo.
          </p>

          <div
            className="rounded-xl p-4 mb-5"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-start gap-3">
              <Mail
                size={18}
                style={{ color: 'var(--color-primary)', marginTop: 2 }}
              />
              <div className="flex-1">
                <div
                  className="text-sm font-semibold mb-1"
                  style={{ color: 'var(--color-text)' }}
                >
                  Cosa succede ora
                </div>
                <ul
                  className="text-sm space-y-1.5"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <li>· Riceverai un'email entro 24 ore lavorative</li>
                  <li>· Una volta approvata, potrai accedere normalmente</li>
                  <li>· Il trial di 30 giorni partirà dall'approvazione</li>
                </ul>
              </div>
            </div>
          </div>

          {user?.email && (
            <div
              className="text-xs text-center mb-5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Account: <span style={{ color: 'var(--color-text)' }}>{user.email}</span>
            </div>
          )}

          <Button
            variant="ghost"
            onClick={logout}
            className="w-full"
          >
            <LogOut size={18} /> Esci
          </Button>
        </div>

        <p
          className="text-xs text-center mt-6"
          style={{ color: 'var(--color-text-faint)' }}
        >
          Per richieste urgenti scrivi a{' '}
          <a
            href="mailto:support@manutech.app"
            style={{ color: 'var(--color-primary)' }}
          >
            support@manutech.app
          </a>
        </p>
      </div>
    </div>
  )
}
