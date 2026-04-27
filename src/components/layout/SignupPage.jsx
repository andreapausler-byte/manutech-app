import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../ui'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { Wrench, Building2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function SignupPage({ onBack }) {
  const { signupOrganization } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [form, setForm] = useState({ orgName: '', adminName: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (!form.orgName.trim()) throw new Error('Inserisci il nome dell\'organizzazione')
      if (!form.email.trim()) throw new Error('Inserisci l\'email')
      if (form.password.length < 8) throw new Error('La password deve avere almeno 8 caratteri')
      if (form.password !== form.confirmPassword) throw new Error('Le password non coincidono')

      const result = await signupOrganization({
        orgName: form.orgName,
        adminName: form.adminName,
        email: form.email,
        password: form.password,
      })
      haptic.success()
      if (result.needsEmailConfirmation) {
        setConfirmationEmail(result.email)
        setNeedsEmailConfirmation(true)
        toast.success('Account creato! Controlla la tua email per confermare.')
      } else {
        toast.success(`Benvenuto in ${form.orgName}!`)
        // Redirect: AuthenticatedApp riprende il flusso una volta che user è settato
        window.location.replace('/')
      }
    } catch (err) {
      const msg = err.message || 'Errore durante la registrazione'
      setError(msg)
      toast.error(msg)
    }
    setLoading(false)
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
          <p className="text-lg mt-1" style={{ color: 'var(--color-text-muted)' }}>Crea la tua organizzazione</p>
        </div>

        <div className="glass-heavy rounded-2xl p-6" style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xl)' }}>
          {needsEmailConfirmation ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ background: 'var(--color-primary-glow)' }}>
                <Mail size={28} style={{ color: 'var(--color-primary)' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text)' }}>Conferma la tua email</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Ti abbiamo inviato un'email a <strong>{confirmationEmail}</strong>. Clicca sul link per attivare l'organizzazione.
              </p>
              <Button onClick={() => { window.location.replace('/') }} variant="secondary">Vai al login</Button>
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-xl p-3 flex items-start gap-2" style={{ background: 'var(--color-primary-glow)', border: '1px solid var(--color-border)' }}>
                <Building2 size={18} style={{ color: 'var(--color-primary)', marginTop: 2 }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Diventerai l'<strong>amministratore</strong> della tua organizzazione e potrai invitare operatori e tecnici.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Nome organizzazione" type="text" placeholder="Es. Officina Rossi Srl" value={form.orgName} onChange={e => set('orgName', e.target.value)} autoComplete="organization" />
                <Input label="Nome admin (opzionale)" type="text" placeholder="Mario Rossi" value={form.adminName} onChange={e => set('adminName', e.target.value)} autoComplete="name" />
                <Input label="Email admin" type="email" placeholder="mario@azienda.it" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
                <Input label="Password" type="password" placeholder="Minimo 8 caratteri" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" />
                <Input label="Conferma password" type="password" placeholder="Ripeti la password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} autoComplete="new-password" />

                {error && (
                  <div role="alert" className="rounded-xl p-4 text-sm" style={{ background: 'var(--color-danger-glow)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading
                    ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><CheckCircle2 size={22} /> Crea organizzazione</>}
                </Button>
              </form>

              <button
                type="button"
                onClick={onBack}
                className="mt-5 pt-4 border-t w-full flex items-center justify-center gap-2 text-sm press-scale"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                <ArrowLeft size={16} /> Hai già un account? Accedi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
