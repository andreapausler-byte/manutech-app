import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input, Spinner } from '../ui'
import { ROLES } from '../../lib/constants'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { Wrench, CheckCircle2, AlertCircle, Mail } from 'lucide-react'

export default function AcceptInvitePage({ token }) {
  const { acceptInvite } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [invite, setInvite] = useState(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [inviteError, setInviteError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)

  useEffect(() => {
    let cancelled = false
    db.getInviteInfo(token)
      .then(info => { if (!cancelled) setInvite(info) })
      .catch(err => { if (!cancelled) setInviteError(err.message || 'Invito non valido') })
      .finally(() => { if (!cancelled) setLoadingInvite(false) })
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (password.length < 8) { setSubmitError('La password deve avere almeno 8 caratteri'); return }
    if (password !== confirmPassword) { setSubmitError('Le password non coincidono'); return }
    setSubmitting(true)
    try {
      const result = await acceptInvite({ token, password })
      haptic.success()
      if (result.needsEmailConfirmation) {
        setNeedsEmailConfirmation(true)
        toast.success('Account creato! Controlla la tua email per confermare.')
      } else {
        toast.success('Benvenuto in ManuTech!')
        // AuthContext aggiorna user: App.jsx farà il redirect automatico
        window.history.replaceState({}, '', '/')
      }
    } catch (err) {
      const msg = err.message || 'Errore durante l\'attivazione'
      setSubmitError(msg)
      toast.error(msg)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-5 py-8 ambient-glow" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-md animate-scale-in relative z-[1]">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow-primary)' }}
          >
            <Wrench className="text-white" size={36} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>ManuTech</h1>
          <p className="text-lg mt-1" style={{ color: 'var(--color-text-muted)' }}>Attiva il tuo account</p>
        </div>

        <div className="glass-heavy rounded-2xl p-6" style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xl)' }}>
          {loadingInvite && (
            <div className="py-12 text-center">
              <Spinner />
              <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>Verifica invito…</p>
            </div>
          )}

          {!loadingInvite && inviteError && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ background: 'var(--color-danger-glow)' }}>
                <AlertCircle size={28} style={{ color: '#f87171' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text)' }}>Invito non valido</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>{inviteError}</p>
              <Button onClick={() => { window.location.href = '/' }} variant="secondary">Torna al login</Button>
            </div>
          )}

          {!loadingInvite && invite && needsEmailConfirmation && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ background: 'var(--color-primary-glow)' }}>
                <Mail size={28} style={{ color: 'var(--color-primary)' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text)' }}>Conferma la tua email</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Ti abbiamo inviato un'email a <strong>{invite.email}</strong>. Clicca sul link per completare l'attivazione.
              </p>
              <Button onClick={() => { window.location.href = '/' }} variant="secondary">Vai al login</Button>
            </div>
          )}

          {!loadingInvite && invite && !needsEmailConfirmation && (
            <>
              <div className="mb-5 rounded-xl p-4" style={{ background: 'var(--color-primary-glow)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={18} style={{ color: 'var(--color-primary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Sei stato invitato</p>
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  <strong>{invite.name}</strong> · {invite.email}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
                  Ruolo: {ROLES[invite.role]?.label || invite.role}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Scegli una password"
                  type="password"
                  placeholder="Minimo 8 caratteri"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  label="Conferma password"
                  type="password"
                  placeholder="Ripeti la password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />

                {submitError && (
                  <div role="alert" className="rounded-xl p-4 text-sm" style={{ background: 'var(--color-danger-glow)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                    {submitError}
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Attiva account'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
