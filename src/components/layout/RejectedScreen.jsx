import { XCircle, LogOut, Mail } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui'

export default function RejectedScreen() {
  const { user, logout } = useAuth()
  const reason = user?.org_rejection_reason

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
              background: 'var(--color-danger-glow, rgba(239, 68, 68, 0.2))',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <XCircle size={36} style={{ color: 'var(--color-danger)' }} />
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            Registrazione rifiutata
          </h1>
          <p className="text-base mt-2" style={{ color: 'var(--color-text-muted)' }}>
            La richiesta non è stata approvata
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
            La tua richiesta di registrazione a ManuTech è stata esaminata e
            non è stata approvata in questa fase.
          </p>

          {reason && (
            <div
              className="rounded-xl p-4 mb-5"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Motivazione
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--color-text)' }}
              >
                {reason}
              </p>
            </div>
          )}

          <div
            className="rounded-xl p-4 mb-5"
            style={{
              background: 'var(--color-primary-glow)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-start gap-3">
              <Mail
                size={18}
                style={{ color: 'var(--color-primary)', marginTop: 2 }}
              />
              <div
                className="text-sm leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Se ritieni che questa decisione sia un errore, contatta{' '}
                <a
                  href="mailto:support@manutech.app"
                  style={{ color: 'var(--color-primary)' }}
                >
                  support@manutech.app
                </a>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={logout}
            className="w-full"
          >
            <LogOut size={18} /> Esci
          </Button>
        </div>
      </div>
    </div>
  )
}
