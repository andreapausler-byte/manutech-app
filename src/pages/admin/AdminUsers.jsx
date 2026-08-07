import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ROLES, STATUS, SEVERITY, SUPPLIER_SPECIALTIES, formatDate, timeAgo, isReportOpen } from '../../lib/constants'
import { Button, Modal, Input, Spinner } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { Trash2, Search, Truck, Printer, Mail, Copy, Clock, XCircle, MessageCircle, Send, Share2, Phone, MapPin, UserCog } from 'lucide-react'
import PageHeader from '../../components/layout/PageHeader'
import SupplierFormModal from '../../components/SupplierFormModal'
import SupplierDetailModal from '../../components/SupplierDetailModal'
import { findNavItem } from '../../lib/adminNav'

const NAV_ITEM = findNavItem('users')

// Un utente è fornitore se ha un profilo supplier_profiles oppure (legacy) ha email @esterno.local
const isSupplier = (u, profileMap) =>
  !!profileMap?.[u.id] || u.email?.endsWith('@esterno.local')

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [profileMap, setProfileMap] = useState({}) // user_id → supplier_profile
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', email: '', role: 'operatore' })
  const [inviteResult, setInviteResult] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [printing, setPrinting] = useState(null)

  // Supplier flows
  const [supplierFormOpen, setSupplierFormOpen] = useState(false)
  const [supplierDetailOpen, setSupplierDetailOpen] = useState(false)
  const [supplierFormMode, setSupplierFormMode] = useState('create') // 'create' | 'edit'
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [savingSupplier, setSavingSupplier] = useState(false)

  // Role change flow
  const [roleEditUser, setRoleEditUser] = useState(null)
  const [savingRole, setSavingRole] = useState(false)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [u, profiles] = await Promise.all([db.getUsers(), db.getSupplierProfiles()])
      setUsers(u)
      const map = {}
      for (const p of (profiles || [])) map[p.user_id] = p
      setProfileMap(map)
    } catch (err) {
      toast.error('Errore caricamento: ' + (err.message || 'sconosciuto'))
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim()) return
    setInviting(true)
    try {
      const invited = await db.inviteUser({ email: form.email, name: form.name, role: form.role })
      const url = `${window.location.origin}/invite/${invited.invite_token}`
      setInviteResult({ user: invited, url })
      toast.success(`Invito creato per ${invited.name}`)
      load()
    } catch (err) {
      toast.error(err.message || 'Errore invio invito')
    }
    setInviting(false)
  }

  const closeInvite = () => {
    setShowInvite(false)
    setInviteResult(null)
    setForm({ name: '', email: '', role: 'operatore' })
  }

  const copyInviteUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiato negli appunti')
    } catch {
      toast.warning('Copia manualmente il link')
    }
  }

  const buildInviteMessage = (name, url) =>
    `Ciao ${name || ''}! Sei stato invitato in ManuTech. Attiva il tuo account qui: ${url}`

  const shareWhatsApp = (name, url) => {
    const text = encodeURIComponent(buildInviteMessage(name, url))
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  const shareEmail = (name, email, url) => {
    const subject = encodeURIComponent('Invito a ManuTech')
    const body = encodeURIComponent(buildInviteMessage(name, url))
    window.location.href = `mailto:${email || ''}?subject=${subject}&body=${body}`
  }

  const shareNative = async (name, url) => {
    if (!navigator.share) { copyInviteUrl(url); return }
    try {
      await navigator.share({
        title: 'Invito ManuTech',
        text: buildInviteMessage(name, url),
        url,
      })
    } catch {
      // Utente ha annullato, nessuna azione
    }
  }

  const revoke = async (userId) => {
    if (!confirm('Revocare questo invito?')) return
    try {
      await db.revokeInvite(userId)
      toast.success('Invito revocato')
      load()
    } catch (err) {
      toast.error(err.message || 'Errore revoca invito')
    }
  }

  const changeRole = async (newRole) => {
    if (!roleEditUser) return
    if (roleEditUser.role === newRole) {
      setRoleEditUser(null)
      return
    }
    // Safety: previene di rimanere senza admin nell'org
    if (roleEditUser.role === 'admin' && newRole !== 'admin') {
      const adminCount = users.filter(u => u.role === 'admin' && u.status !== 'disabled').length
      if (adminCount <= 1) {
        toast.error('Impossibile rimuovere l\'ultimo amministratore dell\'organizzazione')
        return
      }
    }
    setSavingRole(true)
    try {
      await db.updateUser(roleEditUser.id, { role: newRole })
      toast.success(`Ruolo aggiornato: ${ROLES[newRole]?.label || newRole}`)
      setRoleEditUser(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Errore cambio ruolo')
    }
    setSavingRole(false)
  }

  const openNewSupplier = () => {
    setSelectedSupplier(null)
    setSupplierFormMode('create')
    setSupplierFormOpen(true)
  }

  const openEditSupplier = (user) => {
    setSelectedSupplier(user)
    setSupplierFormMode('edit')
    setSupplierDetailOpen(false)
    setSupplierFormOpen(true)
  }

  const openSupplierDetail = (user) => {
    setSelectedSupplier(user)
    setSupplierDetailOpen(true)
  }

  const handleSaveSupplier = async (profileData) => {
    setSavingSupplier(true)
    try {
      let userId
      if (supplierFormMode === 'create') {
        // Email: usa email_public se fornita, altrimenti email fake @esterno.local (legacy, niente auth)
        const baseEmail = profileData.email_public
          || `${profileData.company_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}@esterno.local`
        const createdUser = await db.createUser({
          name: profileData.company_name,
          email: baseEmail,
          role: 'tecnico',
          org_id: currentUser?.org_id,
          status: 'active',
        })
        userId = createdUser.id
      } else {
        userId = selectedSupplier.id
        // Aggiorna anche il name dell'utente se è cambiata la ragione sociale
        if (profileData.company_name && profileData.company_name !== selectedSupplier.name) {
          await db.updateUser(userId, { name: profileData.company_name })
        }
      }

      await db.upsertSupplierProfile({ ...profileData, user_id: userId })
      setSupplierFormOpen(false)
      toast.success(supplierFormMode === 'create' ? 'Fornitore creato' : 'Fornitore aggiornato')
      await load()
    } catch (err) {
      toast.error('Errore: ' + (err.message || 'sconosciuto'))
    }
    setSavingSupplier(false)
  }

  const handleDeleteSupplier = async (user) => {
    if (!confirm(`Eliminare il fornitore "${user.name}"? L'operazione è irreversibile.`)) return
    try {
      await db.deleteSupplierProfile(user.id)
      await db.deleteUser(user.id)
      setSupplierDetailOpen(false)
      toast.success('Fornitore eliminato')
      await load()
    } catch (err) {
      toast.error('Errore: ' + (err.message || 'sconosciuto'))
    }
  }

  const remove = async (id) => {
    if (id === 'admin-1') return alert('Non puoi eliminare l\'admin principale')
    if (!confirm('Eliminare questo utente?')) return; await db.deleteUser(id); load()
  }

  const SEV_ORDER = { critica: 0, alta: 1, media: 2, bassa: 3 }

  const printUserSummary = async (targetUser) => {
    setPrinting(targetUser.id)
    try {
      const allReports = await db.getReports({ assigned_to: targetUser.id })
      const pending = allReports
        .filter(isReportOpen)
        .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))

      const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })

      const rows = pending.map((r, i) => {
        const sev = SEVERITY[r.severity]?.label || r.severity
        const sevColor = SEVERITY[r.severity]?.color || '#666'
        const sts = STATUS[r.status]?.label || r.status
        const desc = r.description?.length > 120 ? r.description.slice(0, 120) + '...' : (r.description || '')
        return `<tr>
          <td style="padding:8px 6px;border:1px solid #ddd;text-align:center;width:28px">
            <span style="display:inline-block;width:16px;height:16px;border:2px solid #888;border-radius:3px"></span>
          </td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;font-weight:600;width:28px">${i + 1}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;font-weight:600">${esc(r.title)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd">${esc(r.machine || '—')}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;font-weight:600;color:${sevColor}">${esc(sev)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center">${esc(sts)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;font-size:12px;color:#555">${esc(desc)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;white-space:nowrap">${formatDate(r.created_at)}</td>
        </tr>`
      }).join('')

      const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Checklist — ${esc(targetUser.name)}</title>
<style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e">
  <div style="max-width:960px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #6366f1;padding-bottom:16px">
      <div>
        <h1 style="margin:0;font-size:22px;color:#1a1a2e">Checklist Segnalazioni</h1>
        <p style="margin:4px 0 0;font-size:16px;color:#6366f1;font-weight:600">${esc(targetUser.name)}</p>
      </div>
      <div style="text-align:right">
        <p style="margin:0;font-size:13px;color:#666">${today}</p>
        <p style="margin:4px 0 0;font-size:14px;font-weight:700">${pending.length} segnalazion${pending.length === 1 ? 'e' : 'i'} in sospeso</p>
      </div>
    </div>
    ${pending.length === 0
      ? '<p style="text-align:center;padding:40px;color:#999;font-size:16px">Nessuna segnalazione in sospeso</p>'
      : `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:10px;border:1px solid #ddd;width:28px">&#x2610;</th>
            <th style="padding:10px;border:1px solid #ddd;width:28px">#</th>
            <th style="padding:10px;border:1px solid #ddd;text-align:left">Titolo</th>
            <th style="padding:10px;border:1px solid #ddd;text-align:left">Macchinario</th>
            <th style="padding:10px;border:1px solid #ddd">Gravit&agrave;</th>
            <th style="padding:10px;border:1px solid #ddd">Stato</th>
            <th style="padding:10px;border:1px solid #ddd;text-align:left">Descrizione</th>
            <th style="padding:10px;border:1px solid #ddd;text-align:left">Data</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`}
    <p style="margin-top:32px;font-size:11px;color:#aaa;text-align:center">Generato da ManuTech &mdash; ${today}</p>
  </div>
  <script>window.onload=function(){window.print()}</script>
</body>
</html>`

      const w = window.open('', '_blank')
      if (w) {
        w.document.write(html)
        w.document.close()
      } else {
        toast.warning('Popup bloccato dal browser. Consenti i popup per stampare.')
      }
    } catch (err) {
      toast.error('Errore caricamento report: ' + err.message)
    }
    setPrinting(null)
  }

  const filtered = users.filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  const activeUsers = filtered.filter(u => !u.status || u.status === 'active')
  const pendingInvites = filtered.filter(u => u.status === 'pending')
  // I fornitori sono utenti con un supplier_profile (o legacy email @esterno.local).
  // Vivono come gruppo a sé: mostrati separatamente, esclusi dai gruppi role.
  const grouped = {
    fornitore: activeUsers.filter(u => isSupplier(u, profileMap)),
    admin: activeUsers.filter(u => u.role === 'admin' && !isSupplier(u, profileMap)),
    tecnico: activeUsers.filter(u => u.role === 'tecnico' && !isSupplier(u, profileMap)),
    operatore: activeUsers.filter(u => u.role === 'operatore' && !isSupplier(u, profileMap)),
  }
  const GROUP_INFO = {
    fornitore: { label: 'Fornitori', color: '#a78bfa', icon: '🚚' },
    ...ROLES,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(GROUP_INFO).map(([key, { label, icon, color }]) => {
          const count = key === 'fornitore'
            ? users.filter(u => isSupplier(u, profileMap)).length
            : users.filter(u => u.role === key && !isSupplier(u, profileMap)).length
          return (
            <div key={key} className="card-elevated rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: color + '15' }}>{icon}</div>
              <div>
                <p className="text-3xl font-bold text-white">{count}</p>
                <p className="text-sm text-muted">{label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input type="text" placeholder="Cerca utenti..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
        </div>
        <Button onClick={openNewSupplier} variant="secondary"><Truck size={18} /> Aggiungi Fornitore</Button>
        <Button onClick={() => setShowInvite(true)}><Mail size={18} /> Invita Utente</Button>
      </div>

      {/* Sezione inviti pendenti */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={14} /> Inviti in sospeso ({pendingInvites.length})
          </h3>
          <div className="bg-surface-1/60 border border-token rounded-2xl overflow-hidden divide-y divide-gray-800/40">
            {pendingInvites.map(u => {
              const expired = u.invite_expires_at && new Date(u.invite_expires_at) < new Date()
              const inviteUrl = u.invite_token ? `${window.location.origin}/invite/${u.invite_token}` : null
              return (
                <div key={u.id} className="flex items-center gap-4 px-5 py-4 group">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'var(--color-primary-glow)' }}>
                    <Mail size={18} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[15px] font-medium text-white">{u.name}</p>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md"
                        style={{
                          background: expired ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-primary-glow)',
                          color: expired ? '#f87171' : 'var(--color-primary)',
                        }}>
                        {ROLES[u.role]?.label || u.role}
                      </span>
                      {expired && <span className="text-xs text-red-400">Scaduto</span>}
                    </div>
                    <p className="text-sm text-faint">{u.email}</p>
                    {u.invited_at && (
                      <p className="text-xs text-faint mt-0.5">Invitato {timeAgo(u.invited_at)}</p>
                    )}
                  </div>
                  {inviteUrl && !expired && (
                    <>
                      <button onClick={() => shareWhatsApp(u.name, inviteUrl)}
                        className="p-2 rounded-lg hover:bg-green-500/20 text-muted hover:text-green-400 transition-all"
                        title="Invia su WhatsApp">
                        <MessageCircle size={15} />
                      </button>
                      <button onClick={() => shareEmail(u.name, u.email, inviteUrl)}
                        className="p-2 rounded-lg hover:bg-violet-500/20 text-muted hover:text-violet-400 transition-all"
                        title="Invia via email">
                        <Send size={15} />
                      </button>
                      <button onClick={() => copyInviteUrl(inviteUrl)}
                        className="p-2 rounded-lg hover:bg-violet-500/20 text-muted hover:text-violet-400 transition-all"
                        title="Copia link invito">
                        <Copy size={15} />
                      </button>
                    </>
                  )}
                  <button onClick={() => revoke(u.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 transition-all"
                    title="Revoca invito">
                    <XCircle size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="space-y-6 stagger-children">
          {Object.entries(grouped).map(([role, list]) => {
            const info = GROUP_INFO[role]
            if (list.length === 0) return null
            return (
              <div key={role}>
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>{info.icon}</span> {info.label} ({list.length})
                </h3>
                <div className="bg-surface-1/60 border border-token rounded-2xl overflow-hidden divide-y divide-gray-800/40">
                  {list.map(u => {
                    const isSup = isSupplier(u, profileMap)
                    const profile = profileMap[u.id]
                    const specialties = (profile?.specialties || []).slice(0, 3)
                    const rowClickable = isSup
                    return (
                      <div key={u.id}
                        onClick={rowClickable ? () => openSupplierDetail(u) : undefined}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group ${rowClickable ? 'cursor-pointer' : ''}`}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: info.color + '15' }}>
                          {isSup ? '🚚' : info.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[15px] font-medium text-white truncate">{profile?.company_name || u.name}</p>
                            {isSup && <span className="text-xs font-medium text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-md shrink-0">Fornitore</span>}
                          </div>
                          {isSup ? (
                            <div className="space-y-0.5 mt-0.5">
                              {profile?.referent_name && (
                                <p className="text-sm text-faint truncate">👤 {profile.referent_name}</p>
                              )}
                              <div className="flex items-center gap-3 flex-wrap text-xs text-faint">
                                {profile?.phone && (
                                  <span className="inline-flex items-center gap-1"><Phone size={11} />{profile.phone}</span>
                                )}
                                {profile?.city && (
                                  <span className="inline-flex items-center gap-1"><MapPin size={11} />{profile.city}</span>
                                )}
                              </div>
                              {specialties.length > 0 && (
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  {specialties.map(key => {
                                    const s = SUPPLIER_SPECIALTIES[key]
                                    if (!s) return null
                                    return (
                                      <span key={key} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
                                        style={{ background: s.color + '20', color: s.color }}>
                                        <span>{s.icon}</span> {s.label}
                                      </span>
                                    )
                                  })}
                                  {(profile?.specialties?.length || 0) > 3 && (
                                    <span className="text-[10px] text-faint">+{profile.specialties.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-faint">{u.email}</p>
                          )}
                        </div>
                        <button onClick={e => { e.stopPropagation(); printUserSummary(u) }} disabled={printing === u.id}
                          className="p-2 rounded-lg hover:bg-violet-500/20 text-muted hover:text-violet-400 transition-all"
                          title="Stampa riepilogo segnalazioni">
                          {printing === u.id
                            ? <div className="w-4 h-4 border-2 border-violet-400/30 border-t-blue-400 rounded-full animate-spin" />
                            : <Printer size={15} />}
                        </button>
                        {u.id !== 'admin-1' && !isSup && u.id !== currentUser?.id && (
                          <button onClick={e => { e.stopPropagation(); setRoleEditUser(u) }}
                            className="p-2 rounded-lg hover:bg-blue-500/20 text-muted hover:text-blue-400 transition-all"
                            title="Cambia ruolo">
                            <UserCog size={15} />
                          </button>
                        )}
                        {u.id !== 'admin-1' && !isSup && (
                          <button onClick={e => { e.stopPropagation(); remove(u.id) }}
                            className="p-2 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Invita Utente */}
      <Modal open={showInvite} onClose={closeInvite} title={inviteResult ? 'Invito creato' : 'Invita Utente'}>
        {!inviteResult ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              L'utente riceverà un link per impostare la propria password e accedere. L'invito scade dopo 7 giorni.
            </p>
            <Input label="Nome" placeholder="Mario Rossi" value={form.name} onChange={e => set('name', e.target.value)} />
            <Input label="Email" type="email" placeholder="mario@azienda.it" value={form.email} onChange={e => set('email', e.target.value)} />
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Ruolo</label>
              <div className="flex gap-2">
                {Object.entries(ROLES).map(([key, { label, icon }]) => (
                  <button key={key} onClick={() => set('role', key)}
                    className={`flex-1 p-4 rounded-xl border text-center transition-all press-scale ${
                      form.role === key ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-token text-muted hover:border-gray-500'
                    }`}>
                    <div className="text-2xl mb-1.5">{icon}</div>
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={invite} className="w-full" size="lg" disabled={!form.name || !form.email || inviting}>
              {inviting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Mail size={18} /> Crea invito</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ background: 'var(--color-primary-glow)', border: '1px solid var(--color-border)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
                Condividi questo link con {inviteResult.user.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                L'invito è valido 7 giorni. Puoi ricopiare il link anche dopo dalla lista "Inviti in sospeso".
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-0)' }}>
              <code className="flex-1 text-xs break-all" style={{ color: 'var(--color-text)' }}>{inviteResult.url}</code>
              <button onClick={() => copyInviteUrl(inviteResult.url)}
                className="p-2 rounded-lg hover:bg-violet-500/20 text-muted hover:text-violet-400 transition-all"
                title="Copia link">
                <Copy size={15} />
              </button>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Condividi via</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => shareWhatsApp(inviteResult.user.name, inviteResult.url)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border transition-all press-scale hover:border-violet-500"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-0)' }}>
                  <MessageCircle size={20} style={{ color: '#25d366' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>WhatsApp</span>
                </button>
                <button onClick={() => shareEmail(inviteResult.user.name, inviteResult.user.email, inviteResult.url)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border transition-all press-scale hover:border-violet-500"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-0)' }}>
                  <Send size={20} style={{ color: 'var(--color-primary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Email</span>
                </button>
                <button onClick={() => shareNative(inviteResult.user.name, inviteResult.url)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border transition-all press-scale hover:border-violet-500"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-0)' }}>
                  <Share2 size={20} style={{ color: 'var(--color-text-muted)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Altro</span>
                </button>
              </div>
            </div>
            <Button onClick={closeInvite} className="w-full" size="lg" variant="secondary">Chiudi</Button>
          </div>
        )}
      </Modal>

      {/* Modal: Form fornitore (create/edit) */}
      <SupplierFormModal
        open={supplierFormOpen}
        onClose={() => setSupplierFormOpen(false)}
        initialProfile={supplierFormMode === 'edit' && selectedSupplier ? profileMap[selectedSupplier.id] : null}
        onSubmit={handleSaveSupplier}
        submitting={savingSupplier}
      />

      {/* Modal: Scheda dettaglio fornitore */}
      <SupplierDetailModal
        open={supplierDetailOpen}
        onClose={() => setSupplierDetailOpen(false)}
        supplier={selectedSupplier}
        profile={selectedSupplier ? profileMap[selectedSupplier.id] : null}
        onEdit={() => selectedSupplier && openEditSupplier(selectedSupplier)}
        onDelete={() => selectedSupplier && handleDeleteSupplier(selectedSupplier)}
      />

      {/* Modal: Cambia ruolo utente */}
      <Modal open={!!roleEditUser} onClose={() => !savingRole && setRoleEditUser(null)} title="Cambia ruolo">
        {roleEditUser && (
          <div className="space-y-4">
            <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{roleEditUser.name}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{roleEditUser.email}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Ruolo attuale: <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{ROLES[roleEditUser.role]?.label || roleEditUser.role}</span>
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Nuovo ruolo</label>
              <div className="flex gap-2">
                {Object.entries(ROLES).map(([key, { label, icon }]) => {
                  const current = roleEditUser.role === key
                  return (
                    <button key={key} onClick={() => changeRole(key)}
                      disabled={savingRole || current}
                      className={`flex-1 p-4 rounded-xl border text-center transition-all press-scale ${
                        current
                          ? 'border-violet-500 bg-violet-500/10 text-white opacity-60 cursor-not-allowed'
                          : 'border-token text-muted hover:border-violet-500 hover:bg-violet-500/5'
                      }`}>
                      <div className="text-2xl mb-1.5">{icon}</div>
                      <div className="text-sm font-medium">{label}</div>
                      {current && <div className="text-[10px] mt-1 text-violet-400">Attuale</div>}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Il cambio è immediato. L'utente vedrà la nuova interfaccia al prossimo accesso o refresh.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
