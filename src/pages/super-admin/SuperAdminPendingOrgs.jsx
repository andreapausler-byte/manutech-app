import { useEffect, useState } from 'react'
import {
  ShieldCheck, RefreshCw, CheckCircle2, XCircle, Mail, Calendar, Hash,
  LogOut, Loader2,
} from 'lucide-react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { Button, Modal, Spinner, EmptyState } from '../../components/ui'
import { timeAgo } from '../../lib/constants'

export default function SuperAdminPendingOrgs() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actioning, setActioning] = useState(null) // org.id in corso
  const [rejectTarget, setRejectTarget] = useState(null) // org per modal motivazione
  const [rejectReason, setRejectReason] = useState('')

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    else setRefreshing(true)
    try {
      const data = await db.listPendingOrgs()
      setOrgs(data || [])
    } catch (err) {
      toast.error(err.message || 'Errore caricamento coda')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (org) => {
    if (!confirm(`Approvare "${org.name}"?\n\nL'organizzazione potrà accedere immediatamente.`)) return
    setActioning(org.id)
    try {
      await db.approveOrg(org.id)
      toast.success(`${org.name} approvata`)
      setOrgs(prev => prev.filter(o => o.id !== org.id))
    } catch (err) {
      toast.error(err.message || 'Errore approvazione')
    } finally {
      setActioning(null)
    }
  }

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return
    const reason = rejectReason.trim()
    if (reason.length < 3) {
      toast.error('Motivo richiesto (min 3 caratteri)')
      return
    }
    setActioning(rejectTarget.id)
    try {
      await db.rejectOrg(rejectTarget.id, reason)
      toast.success(`${rejectTarget.name} rifiutata`)
      setOrgs(prev => prev.filter(o => o.id !== rejectTarget.id))
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) {
      toast.error(err.message || 'Errore rifiuto')
    } finally {
      setActioning(null)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh]" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between"
        style={{
          background: 'var(--color-bg-elevated)',
          borderBottom: '1px solid var(--color-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-primary-glow)' }}
          >
            <ShieldCheck size={20} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              Console super-admin
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="p-2 rounded-lg transition press-scale"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
            aria-label="Ricarica"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={logout}
            className="p-2 rounded-lg transition press-scale"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
            aria-label="Esci"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 py-6">
        <div className="mb-5">
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
            Organizzazioni in attesa
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {loading
              ? 'Caricamento...'
              : `${orgs.length} ${orgs.length === 1 ? 'richiesta' : 'richieste'} da revisionare`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : orgs.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={48} />}
            title="Nessuna richiesta in coda"
            subtitle="Tutte le richieste sono state processate. Verrai notificato via email al prossimo signup."
          />
        ) : (
          <div className="space-y-3">
            {orgs.map(org => (
              <PendingOrgCard
                key={org.id}
                org={org}
                actioning={actioning === org.id}
                onApprove={() => handleApprove(org)}
                onReject={() => { setRejectTarget(org); setRejectReason('') }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <Modal
          open
          onClose={() => { if (actioning !== rejectTarget.id) { setRejectTarget(null); setRejectReason('') } }}
          title="Rifiuta organizzazione"
        >
          <div className="space-y-4">
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ color: 'var(--color-text)' }} className="font-semibold">
                {rejectTarget.name}
              </div>
              <div style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-1">
                {rejectTarget.owner_email || rejectTarget.ownerEmail}
              </div>
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--color-text)' }}
              >
                Motivazione (visibile all'utente)
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Es. azienda non in target, dati non verificabili..."
                disabled={actioning === rejectTarget.id}
                className="w-full rounded-xl p-3 text-sm focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Min 3 caratteri. L'utente vedrà questo testo nella pagina di rifiuto.
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => { setRejectTarget(null); setRejectReason('') }}
                disabled={actioning === rejectTarget.id}
                className="flex-1"
              >
                Annulla
              </Button>
              <Button
                variant="danger"
                onClick={handleRejectConfirm}
                disabled={actioning === rejectTarget.id || rejectReason.trim().length < 3}
                className="flex-1"
              >
                {actioning === rejectTarget.id
                  ? <Loader2 size={18} className="animate-spin" />
                  : <><XCircle size={18} /> Rifiuta</>}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PendingOrgCard({ org, actioning, onApprove, onReject }) {
  const ownerEmail = org.owner_email || org.ownerEmail
  const ownerName = org.owner_name || org.ownerName

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-lg font-bold truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {org.name}
          </h3>
          <div className="flex items-center gap-2 text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <Hash size={12} />
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{org.slug}</span>
            <span>·</span>
            <Calendar size={12} />
            <span>{timeAgo(org.created_at)}</span>
          </div>
        </div>
        <span
          className="text-xs px-2 py-1 rounded-md whitespace-nowrap"
          style={{
            background: 'rgba(255, 170, 44, 0.15)',
            color: '#ffaa2c',
            fontWeight: 600,
          }}
        >
          PENDING
        </span>
      </div>

      <div
        className="rounded-xl p-3 mb-4 text-sm"
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
          <Mail size={14} />
          <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{ownerName}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>· {ownerEmail}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="success"
          size="sm"
          onClick={onApprove}
          disabled={actioning}
          className="flex-1"
        >
          {actioning
            ? <Loader2 size={16} className="animate-spin" />
            : <><CheckCircle2 size={16} /> Approva</>}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={actioning}
          className="flex-1"
        >
          <XCircle size={16} /> Rifiuta
        </Button>
      </div>
    </div>
  )
}
