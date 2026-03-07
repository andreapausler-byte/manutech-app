import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ROLES } from '../../lib/constants'
import { Button, Modal, Input, EmptyState, Spinner } from '../../components/ui'
import { Plus, Trash2, Users, Search } from 'lucide-react'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operatore' })

  const load = async () => { setLoading(true); setUsers(await db.getUsers()); setLoading(false) }
  useEffect(() => { load() }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const create = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return
    await db.createUser(form); setShowNew(false); setForm({ name: '', email: '', password: '', role: 'operatore' }); load()
  }

  const remove = async (id) => {
    if (id === 'admin-1') return alert('Non puoi eliminare l\'admin principale')
    if (!confirm('Eliminare questo utente?')) return; await db.deleteUser(id); load()
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
                        {info.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-white">{u.name}</p>
                        <p className="text-sm text-faint">{u.email}</p>
                      </div>
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
    </div>
  )
}
