import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ROLES, STATUS, SEVERITY, formatDate } from '../../lib/constants'
import { Button, Modal, Input, EmptyState, Spinner } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { Plus, Trash2, Users, Search, Truck, Printer } from 'lucide-react'

const isSupplier = (u) => u.email?.endsWith('@esterno.local')

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operatore' })
  const [supplierName, setSupplierName] = useState('')
  const [printing, setPrinting] = useState(null)
  const toast = useToast()

  const load = async () => { setLoading(true); setUsers(await db.getUsers()); setLoading(false) }
  useEffect(() => { load() }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const create = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return
    await db.createUser(form); setShowNew(false); setForm({ name: '', email: '', password: '', role: 'operatore' }); load()
  }

  const createSupplier = async () => {
    const name = supplierName.trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const email = `${slug}-${Date.now()}@esterno.local`
    try {
      await db.createUser({ name, email, role: 'tecnico', org_id: 'default' })
      setShowNewSupplier(false)
      setSupplierName('')
      toast.success(`Fornitore "${name}" aggiunto`)
      load()
    } catch (err) {
      toast.error('Errore: ' + err.message)
    }
  }

  const remove = async (id) => {
    if (id === 'admin-1') return alert('Non puoi eliminare l\'admin principale')
    if (!confirm('Eliminare questo utente?')) return; await db.deleteUser(id); load()
  }

  const printUserSummary = async (targetUser) => {
    setPrinting(targetUser.id)
    try {
      const allReports = await db.getReports({ assigned_to: targetUser.id })
      const pending = allReports.filter(r => r.status !== 'risolta')

      const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })

      const rows = pending.map((r, i) => {
        const sev = SEVERITY[r.severity]?.label || r.severity
        const sts = STATUS[r.status]?.label || r.status
        const desc = r.description?.length > 120 ? r.description.slice(0, 120) + '...' : (r.description || '')
        return `<tr>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;font-weight:600">${i + 1}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;font-weight:600">${esc(r.title)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd">${esc(r.machine || '—')}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center">${esc(sev)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center">${esc(sts)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;font-size:12px;color:#555">${esc(desc)}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;white-space:nowrap">${formatDate(r.created_at)}</td>
        </tr>`
      }).join('')

      const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Riepilogo — ${esc(targetUser.name)}</title></head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e">
  <div style="max-width:900px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #6366f1;padding-bottom:16px">
      <div>
        <h1 style="margin:0;font-size:22px;color:#1a1a2e">Riepilogo Segnalazioni</h1>
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
            <th style="padding:10px;border:1px solid #ddd;width:30px">#</th>
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
  <script>window.onload=function(){window.print()}<\/script>
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
  const grouped = { admin: filtered.filter(u => u.role === 'admin'), tecnico: filtered.filter(u => u.role === 'tecnico'), operatore: filtered.filter(u => u.role === 'operatore') }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(ROLES).map(([key, { label, icon, color }]) => {
          const count = users.filter(u => u.role === key).length
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
            className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" />
        </div>
        <Button onClick={() => setShowNewSupplier(true)} variant="secondary"><Truck size={18} /> Aggiungi Fornitore</Button>
        <Button onClick={() => setShowNew(true)}><Plus size={18} /> Nuovo Utente</Button>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-6 stagger-children">
          {Object.entries(grouped).map(([role, list]) => {
            const info = ROLES[role]
            if (list.length === 0) return null
            return (
              <div key={role}>
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>{info.icon}</span> {info.label} ({list.length})
                </h3>
                <div className="bg-surface-1/60 border border-token rounded-2xl overflow-hidden divide-y divide-gray-800/40">
                  {list.map(u => (
                    <div key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: info.color + '15' }}>
                        {isSupplier(u) ? '🚚' : info.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-white">{u.name}</p>
                        {isSupplier(u)
                          ? <span className="text-xs font-medium text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-md">Fornitore esterno</span>
                          : <p className="text-sm text-faint">{u.email}</p>}
                      </div>
                      <button onClick={() => printUserSummary(u)} disabled={printing === u.id}
                        className="p-2 rounded-lg hover:bg-blue-500/20 text-muted hover:text-blue-400 transition-all"
                        title="Stampa riepilogo segnalazioni">
                        {printing === u.id
                          ? <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                          : <Printer size={15} />}
                      </button>
                      {u.id !== 'admin-1' && (
                        <button onClick={() => remove(u.id)}
                          className="p-2 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Nuovo Utente */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nuovo Utente">
        <div className="space-y-4">
          <Input label="Nome" placeholder="Mario Rossi" value={form.name} onChange={e => set('name', e.target.value)} />
          <Input label="Email" type="email" placeholder="mario@azienda.it" value={form.email} onChange={e => set('email', e.target.value)} />
          <Input label="Password" type="password" placeholder="Min. 6 caratteri" value={form.password} onChange={e => set('password', e.target.value)} />
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Ruolo</label>
            <div className="flex gap-2">
              {Object.entries(ROLES).map(([key, { label, icon }]) => (
                <button key={key} onClick={() => set('role', key)}
                  className={`flex-1 p-4 rounded-xl border text-center transition-all press-scale ${
                    form.role === key ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-token text-muted hover:border-gray-500'
                  }`}>
                  <div className="text-2xl mb-1.5">{icon}</div>
                  <div className="text-sm font-medium">{label}</div>
                </button>
              ))}
            </div>
          </div>
          <Button onClick={create} className="w-full" size="lg" disabled={!form.name || !form.email || !form.password}>Crea Utente</Button>
        </div>
      </Modal>

      {/* Modal: Aggiungi Fornitore */}
      <Modal open={showNewSupplier} onClose={() => setShowNewSupplier(false)} title="Aggiungi Fornitore Esterno">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Crea un fornitore esterno (es. elettricista, idraulico). Non richiede email o password — serve solo per assegnare segnalazioni e stampare riepiloghi.
          </p>
          <Input label="Nome fornitore" placeholder="Es. Elettricista Marco" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
          <Button onClick={createSupplier} className="w-full" size="lg" disabled={!supplierName.trim()}>
            <Truck size={18} /> Aggiungi Fornitore
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
