/**
 * AdminSpareParts v1.0 — Gestione Ricambi e Magazzino
 *
 * Due sezioni:
 * 1. Magazzino: catalogo ricambi con stock, posizione, costo
 * 2. Ordini: ordini in corso collegati ai report
 */

import { useState, useEffect, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { ORDER_STATUS, SPARE_URGENCY, formatDate, timeAgo } from '../../lib/constants'
import { Button, Input, Modal, Badge, Spinner, EmptyState } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import PageHeader from '../../components/layout/PageHeader'
import { findNavItem } from '../../lib/adminNav'
import {
  Package, Plus, Edit, Trash2, Search, AlertTriangle,
  ShoppingCart, Check, Truck, MapPin, Hash, X,
  ArrowRight, Clock, Factory, ChevronRight, Archive,
  Phone, MessageCircle, Mail, Inbox, Image as ImageIcon, User
} from 'lucide-react'

const NAV_ITEM = findNavItem('spare-parts')

const TABS = [
  { id: 'magazzino', label: 'Magazzino', icon: Package },
  { id: 'ordini', label: 'Ordini', icon: ShoppingCart },
]

const emptyPartForm = { name: '', code: '', manufacturer: '', unit_cost: '', stock_qty: 0, min_stock: 0, location: '', notes: '' }
const emptyOrderForm = { spare_part_name: '', spare_part_id: '', report_id: '', machine_id: '', component_id: '', quantity: 1, unit_cost: '', supplier: '', expected_at: '', notes: '' }

const URGENCY_RANK = { urgente: 0, alta: 1, media: 2, bassa: 3 }
const STATUS_RANK = { richiesto: 0, ordinato: 1, spedito: 2, ricevuto: 3, installato: 4 }

export default function AdminSpareParts() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('magazzino')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Data
  const [parts, setParts] = useState([])
  const [orders, setOrders] = useState([])
  const [reports, setReports] = useState([])
  const [machines, setMachines] = useState([])
  const [users, setUsers] = useState([])
  const [supplierProfiles, setSupplierProfiles] = useState([])

  // Part form
  const [showPartForm, setShowPartForm] = useState(false)
  const [editingPart, setEditingPart] = useState(null)
  const [partForm, setPartForm] = useState(emptyPartForm)

  // Order form
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderForm, setOrderForm] = useState(emptyOrderForm)

  // Process request modal
  const [processingOrder, setProcessingOrder] = useState(null)
  const [photoLightbox, setPhotoLightbox] = useState(null) // { url, all, idx }

  const load = async () => {
    setLoading(true)
    try {
      const [p, o, r, m, u, sp] = await Promise.all([
        db.getSpareParts(),
        db.getSparePartOrders(),
        db.getReports(),
        db.getMachines(),
        db.getUsers().catch(() => []),
        db.getSupplierProfiles().catch(() => []),
      ])
      setParts(p); setOrders(o); setReports(r); setMachines(m); setUsers(u); setSupplierProfiles(sp)
    } catch (e) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  // ── Stats ──
  const lowStockParts = useMemo(() => parts.filter(p => p.stock_qty <= p.min_stock && p.min_stock > 0), [parts])
  const requestedOrders = useMemo(() => orders.filter(o => o.status === 'richiesto'), [orders])
  const activeOrders = useMemo(() => orders.filter(o => ['richiesto', 'ordinato', 'spedito'].includes(o.status)), [orders])
  const overdueOrders = useMemo(() => activeOrders.filter(o => o.expected_at && new Date(o.expected_at) < new Date()), [activeOrders])

  // ── Search ──
  const filteredParts = useMemo(() =>
    parts.filter(p => !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()) ||
      p.location?.toLowerCase().includes(search.toLowerCase())
    ), [parts, search])

  // Sort: richiesto in cima (più urgenti prima), poi per data desc
  const filteredOrders = useMemo(() =>
    orders
      .filter(o => !search ||
        o.spare_part_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.supplier?.toLowerCase().includes(search.toLowerCase()) ||
        o.notes?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const sd = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
        if (sd !== 0) return sd
        if (a.status === 'richiesto') {
          const ud = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9)
          if (ud !== 0) return ud
        }
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      })
    , [orders, search])

  // ── Part CRUD ──
  const openPartForm = (part = null) => {
    setEditingPart(part)
    setPartForm(part ? {
      name: part.name, code: part.code || '', manufacturer: part.manufacturer || '',
      unit_cost: part.unit_cost || '', stock_qty: part.stock_qty || 0,
      min_stock: part.min_stock || 0, location: part.location || '', notes: part.notes || ''
    } : emptyPartForm)
    setShowPartForm(true)
  }

  const savePart = async () => {
    if (!partForm.name.trim()) return
    try {
      const data = {
        name: partForm.name.trim(),
        code: partForm.code.trim() || null,
        manufacturer: partForm.manufacturer.trim() || null,
        unit_cost: partForm.unit_cost ? parseFloat(partForm.unit_cost) : 0,
        stock_qty: parseInt(partForm.stock_qty) || 0,
        min_stock: parseInt(partForm.min_stock) || 0,
        location: partForm.location.trim() || null,
        notes: partForm.notes.trim() || null,
      }
      if (editingPart) { await db.updateSparePart(editingPart.id, data); toast.success('Ricambio aggiornato') }
      else { await db.createSparePart(data); toast.success('Ricambio aggiunto') }
      setShowPartForm(false); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deletePart = async (id) => {
    if (!confirm('Eliminare questo ricambio?')) return
    await db.deleteSparePart(id); toast.success('Eliminato'); load()
  }

  // ── Order CRUD ──
  const openOrderForm = () => {
    setOrderForm(emptyOrderForm)
    setShowOrderForm(true)
  }

  const saveOrder = async () => {
    if (!orderForm.spare_part_name.trim()) return
    try {
      await db.createSparePartOrder({
        spare_part_id: orderForm.spare_part_id || null,
        spare_part_name: orderForm.spare_part_name.trim(),
        report_id: orderForm.report_id || null,
        machine_id: orderForm.machine_id || null,
        component_id: orderForm.component_id || null,
        quantity: parseInt(orderForm.quantity) || 1,
        unit_cost: orderForm.unit_cost ? parseFloat(orderForm.unit_cost) : 0,
        supplier: orderForm.supplier.trim() || null,
        expected_at: orderForm.expected_at || null,
        notes: orderForm.notes.trim() || null,
        status: 'ordinato',
        ordered_by: user?.id,
      })
      toast.success('Ordine registrato')
      setShowOrderForm(false); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const markReceived = async (order) => {
    try {
      await db.receiveSparePartOrder(order.id)
      toast.success(`${order.spare_part_name} ricevuto! Stock aggiornato.`)
      load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const markShipped = async (order) => {
    try {
      await db.updateSparePartOrder(order.id, { status: 'spedito' })
      toast.success('Stato aggiornato: spedito')
      load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const markInstalled = async (order) => {
    try {
      await db.updateSparePartOrder(order.id, { status: 'installato', installed_at: new Date().toISOString() })
      toast.success('Ricambio installato!')
      load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deleteOrder = async (id) => {
    if (!confirm('Eliminare questo ordine?')) return
    await db.deleteSparePartOrder(id); toast.success('Eliminato'); load()
  }

  // ── Helpers ──
  const getReportTitle = (id) => reports.find(r => r.id === id)?.title || '—'
  const getReport = (id) => reports.find(r => r.id === id)
  const getMachineName = (id) => machines.find(m => m.id === id)?.name || '—'
  const getUserName = (id) => users.find(u => u.id === id)?.name || '—'
  const getSupplierProfile = (id) => supplierProfiles.find(s => s.user_id === id) || null
  const isOverdue = (o) => o.expected_at && new Date(o.expected_at) < new Date() && (o.status === 'ordinato' || o.status === 'spedito')

  // ── Conferma richiesta tecnico → ordinato ──
  const confirmRequest = async (orderId, payload) => {
    try {
      await db.confirmSparePartOrder(orderId, payload)
      toast.success('Ordine confermato')
      setProcessingOrder(null)
      load()
    } catch (e) { toast.error('Errore: ' + (e?.message || 'riprova')) }
  }

  // ── waitingReports: reports in_attesa_ricambi ──
  const waitingReports = useMemo(() => reports.filter(r => r.status === 'in_attesa_ricambi'), [reports])

  const set = (key, val) => setPartForm(f => ({ ...f, [key]: val }))
  const setO = (key, val) => setOrderForm(f => ({ ...f, [key]: val }))

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card-elevated rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-violet-400">{parts.length}</p>
          <p className="text-[10px] text-faint uppercase tracking-wider mt-0.5">Articoli</p>
        </div>
        <div className={`card-elevated rounded-xl p-4 text-center ${lowStockParts.length > 0 ? 'ring-1 ring-amber-500/30' : ''}`}>
          <p className={`text-2xl font-bold ${lowStockParts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{lowStockParts.length}</p>
          <p className="text-[10px] text-faint uppercase tracking-wider mt-0.5">Sotto Scorta</p>
        </div>
        <div className="card-elevated rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-cyan-400">{activeOrders.length}</p>
          <p className="text-[10px] text-faint uppercase tracking-wider mt-0.5">Ordini Attivi</p>
        </div>
        <div className={`card-elevated rounded-xl p-4 text-center ${overdueOrders.length > 0 ? 'ring-1 ring-red-500/30' : ''}`}>
          <p className={`text-2xl font-bold ${overdueOrders.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{overdueOrders.length}</p>
          <p className="text-[10px] text-faint uppercase tracking-wider mt-0.5">In Ritardo</p>
        </div>
      </div>

      {/* ── Richieste tecnici da elaborare ── */}
      {requestedOrders.length > 0 && (
        <button
          onClick={() => setTab('ordini')}
          className="w-full press-scale text-left bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-center gap-3 hover:bg-orange-500/15 transition-all"
        >
          <Inbox size={20} className="text-orange-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-400">
              {requestedOrders.length} {requestedOrders.length === 1 ? 'richiesta da elaborare' : 'richieste da elaborare'}
            </p>
            <p className="text-xs text-faint mt-0.5 truncate">
              Dai tecnici: {requestedOrders.slice(0, 3).map(o => o.spare_part_name).join(', ')}
              {requestedOrders.length > 3 && ` e altre ${requestedOrders.length - 3}`}
            </p>
          </div>
          <ChevronRight size={18} className="text-orange-400 shrink-0" />
        </button>
      )}

      {/* ── Waiting Reports Alert ── */}
      {waitingReports.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-400">{waitingReports.length} segnalazioni in attesa di ricambi</p>
            <p className="text-xs text-faint mt-0.5">
              {waitingReports.slice(0, 3).map(r => r.title).join(', ')}
              {waitingReports.length > 3 && ` e altre ${waitingReports.length - 3}`}
            </p>
          </div>
        </div>
      )}

      {/* ── Tab Bar + Search ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-surface-2 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-violet-600 text-white' : 'text-faint hover:text-secondary'}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input type="text" placeholder="Cerca ricambi..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
        </div>
        {tab === 'magazzino' && <Button onClick={() => openPartForm()}><Plus size={18} /> Nuovo Ricambio</Button>}
        {tab === 'ordini' && <Button onClick={openOrderForm}><Plus size={18} /> Nuovo Ordine</Button>}
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ═══ MAGAZZINO TAB ═══ */}
          {tab === 'magazzino' && (
            filteredParts.length === 0 ? (
              <EmptyState icon="📦" title="Magazzino vuoto" subtitle="Aggiungi il primo ricambio" />
            ) : (
              <div className="space-y-2">
                {filteredParts.map(part => {
                  const isLow = part.min_stock > 0 && part.stock_qty <= part.min_stock
                  return (
                    <div key={part.id} className={`card-elevated rounded-xl p-4 group hover:border-violet-500/30 transition-all ${isLow ? 'ring-1 ring-amber-500/30' : ''}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isLow ? 'bg-amber-500/15' : 'bg-violet-500/15'}`}>
                          <Package size={22} className={isLow ? 'text-amber-400' : 'text-violet-400'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-themed truncate">{part.name}</p>
                            {part.code && <span className="text-[10px] font-mono text-faint bg-surface-2 px-1.5 py-0.5 rounded">{part.code}</span>}
                            {isLow && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Sotto scorta</span>}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-faint">
                            {part.manufacturer && <span className="flex items-center gap-1"><Factory size={10} /> {part.manufacturer}</span>}
                            {part.location && <span className="flex items-center gap-1"><MapPin size={10} /> {part.location}</span>}
                            {part.unit_cost > 0 && <span>&euro;{parseFloat(part.unit_cost).toFixed(2)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-center">
                            <p className={`text-xl font-bold ${isLow ? 'text-amber-400' : 'text-themed'}`}>{part.stock_qty}</p>
                            <p className="text-[9px] text-faint uppercase">in stock</p>
                          </div>
                          {part.min_stock > 0 && (
                            <div className="text-center">
                              <p className="text-sm font-medium text-faint">{part.min_stock}</p>
                              <p className="text-[9px] text-faint uppercase">minimo</p>
                            </div>
                          )}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openPartForm(part)} className="p-2 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={14} /></button>
                            <button onClick={() => deletePart(part.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ═══ ORDINI TAB ═══ */}
          {tab === 'ordini' && (
            filteredOrders.length === 0 ? (
              <EmptyState icon="🛒" title="Nessun ordine" subtitle="Registra un ordine ricambio" />
            ) : (
              <div className="space-y-3">
                {filteredOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isRequested={order.status === 'richiesto'}
                    overdue={isOverdue(order)}
                    getReportTitle={getReportTitle}
                    getMachineName={getMachineName}
                    getUserName={getUserName}
                    onPhotoClick={(idx, all) => setPhotoLightbox({ idx, all })}
                    onProcess={() => setProcessingOrder(order)}
                    onShipped={() => markShipped(order)}
                    onReceived={() => markReceived(order)}
                    onInstalled={() => markInstalled(order)}
                    onDelete={() => deleteOrder(order.id)}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* ═══ PART FORM MODAL ═══ */}
      <Modal open={showPartForm} onClose={() => setShowPartForm(false)} title={editingPart ? 'Modifica Ricambio' : 'Nuovo Ricambio'} size="md">
        <div className="space-y-4">
          <Input label="Nome ricambio *" placeholder="es. Guarnizione OR-22" value={partForm.name} onChange={e => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Codice" placeholder="es. OR-22" value={partForm.code} onChange={e => set('code', e.target.value)} />
            <Input label="Costruttore" placeholder="es. SKF" value={partForm.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Costo unitario (&euro;)" type="number" step="0.01" value={partForm.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
            <Input label="Quantità in stock" type="number" value={partForm.stock_qty} onChange={e => set('stock_qty', e.target.value)} />
            <Input label="Scorta minima" type="number" value={partForm.min_stock} onChange={e => set('min_stock', e.target.value)} />
          </div>
          <Input label="Posizione in magazzino" placeholder="es. Scaffale B3" value={partForm.location} onChange={e => set('location', e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Note</label>
            <textarea className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed placeholder:text-faint focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none resize-none"
              rows={2} placeholder="Note opzionali..." value={partForm.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <Button onClick={savePart} disabled={!partForm.name.trim()} className="w-full">
            {editingPart ? 'Salva Modifiche' : 'Aggiungi Ricambio'}
          </Button>
        </div>
      </Modal>

      {/* ═══ ORDER FORM MODAL ═══ */}
      <Modal open={showOrderForm} onClose={() => setShowOrderForm(false)} title="Nuovo Ordine Ricambio" size="lg">
        <div className="space-y-4">
          {/* Spare part selection: from catalog or manual */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Ricambio *</label>
            {parts.length > 0 ? (
              <select className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none"
                value={orderForm.spare_part_id}
                onChange={e => {
                  const p = parts.find(x => x.id === e.target.value)
                  setO('spare_part_id', e.target.value)
                  if (p) { setO('spare_part_name', p.name); setO('unit_cost', p.unit_cost || '') }
                }}>
                <option value="">Seleziona dal catalogo o scrivi sotto</option>
                {parts.map(p => <option key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ''} — stock: {p.stock_qty}</option>)}
              </select>
            ) : null}
            <Input label="" placeholder="Oppure inserisci nome manualmente" value={orderForm.spare_part_name}
              onChange={e => setO('spare_part_name', e.target.value)} className="mt-2" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input label="Quantità" type="number" value={orderForm.quantity} onChange={e => setO('quantity', e.target.value)} />
            <Input label="Costo unitario (&euro;)" type="number" step="0.01" value={orderForm.unit_cost} onChange={e => setO('unit_cost', e.target.value)} />
            <Input label="Fornitore" placeholder="Nome fornitore" value={orderForm.supplier} onChange={e => setO('supplier', e.target.value)} />
          </div>

          <Input label="Data arrivo prevista" type="date" value={orderForm.expected_at} onChange={e => setO('expected_at', e.target.value)} />

          {/* Link to report */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Collegato a segnalazione (opzionale)</label>
            <select className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none"
              value={orderForm.report_id} onChange={e => {
                setO('report_id', e.target.value)
                const r = reports.find(x => x.id === e.target.value)
                if (r) {
                  const m = machines.find(x => x.name === r.machine)
                  if (m) setO('machine_id', m.id)
                }
              }}>
              <option value="">Nessuna segnalazione</option>
              {waitingReports.map(r => (
                <option key={r.id} value={r.id}>{r.title} — {r.machine || 'Nessuna macchina'}</option>
              ))}
              <optgroup label="Altre segnalazioni attive">
                {reports.filter(r => r.status !== 'risolta' && r.status !== 'chiuso' && r.status !== 'in_attesa_ricambi').map(r => (
                  <option key={r.id} value={r.id}>{r.title} — {r.machine || 'Nessuna macchina'}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Link to machine */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Macchina destinazione (opzionale)</label>
            <select className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none"
              value={orderForm.machine_id} onChange={e => setO('machine_id', e.target.value)}>
              <option value="">Nessuna macchina</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}{m.department ? ` (${m.department})` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Note</label>
            <textarea className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed placeholder:text-faint focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none resize-none"
              rows={2} placeholder="es. Codice tracking, urgenza..." value={orderForm.notes} onChange={e => setO('notes', e.target.value)} />
          </div>

          <Button onClick={saveOrder} disabled={!orderForm.spare_part_name.trim()} className="w-full">
            Registra Ordine
          </Button>
        </div>
      </Modal>

      {/* ═══ PROCESS REQUEST MODAL ═══ */}
      <ProcessRequestModal
        order={processingOrder}
        onClose={() => setProcessingOrder(null)}
        onConfirm={confirmRequest}
        onPhotoClick={(idx, all) => setPhotoLightbox({ idx, all })}
        report={processingOrder ? getReport(processingOrder.report_id) : null}
        requesterName={processingOrder ? getUserName(processingOrder.requested_by) : ''}
        machineName={processingOrder ? getMachineName(processingOrder.machine_id) : ''}
        supplierProfiles={supplierProfiles}
        getSupplierProfile={getSupplierProfile}
      />

      {/* ═══ PHOTO LIGHTBOX ═══ */}
      {photoLightbox && (
        <PhotoLightbox
          key={`${photoLightbox.idx}-${photoLightbox.all?.length || 0}`}
          initialIdx={photoLightbox.idx || 0}
          all={photoLightbox.all || []}
          onClose={() => setPhotoLightbox(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OrderCard — variante richiesto vs ordini esistenti
// ─────────────────────────────────────────────────────────────
function OrderCard({
  order, isRequested, overdue,
  getReportTitle, getMachineName, getUserName,
  onPhotoClick, onProcess, onShipped, onReceived, onInstalled, onDelete,
}) {
  const st = ORDER_STATUS[order.status] || ORDER_STATUS.ordinato
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  const images = Array.isArray(order.images) ? order.images : []
  const hasPhotos = images.length > 0

  return (
    <div className={`card-elevated rounded-xl p-4 transition-all ${overdue ? 'ring-1 ring-red-500/30' : ''} ${isRequested ? 'ring-1 ring-orange-500/30' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Icon o thumbnail principale */}
        {hasPhotos ? (
          <button
            onClick={() => onPhotoClick(0, images)}
            className="press-scale shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-token relative"
            aria-label="Apri foto targhetta"
          >
            <img src={images[0].url} alt="" className="w-full h-full object-cover" />
            {images.length > 1 && (
              <span className="absolute bottom-0 right-0 text-[9px] font-bold px-1 py-0.5 bg-black/70 text-white rounded-tl">
                +{images.length - 1}
              </span>
            )}
          </button>
        ) : (
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${overdue ? 'bg-red-500/15' : isRequested ? 'bg-orange-500/15' : 'bg-surface-2'}`}>
            {isRequested && <Inbox size={20} className="text-orange-400" />}
            {order.status === 'ordinato' && <Clock size={20} className={overdue ? 'text-red-400' : 'text-cyan-400'} />}
            {order.status === 'spedito' && <Truck size={20} className="text-violet-400" />}
            {order.status === 'ricevuto' && <Check size={20} className="text-emerald-400" />}
            {order.status === 'installato' && <Check size={20} className="text-green-400" />}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-themed">{order.spare_part_name}</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.color }}>{st.label}</span>
            {isRequested && urg && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: urg.bg, color: urg.color }}>
                {urg.label}
              </span>
            )}
            {overdue && <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">In ritardo</span>}
            <span className="text-xs text-faint">x{order.quantity}</span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-faint flex-wrap">
            {isRequested && order.requested_by && (
              <span className="flex items-center gap-1"><User size={11} />{getUserName(order.requested_by)}</span>
            )}
            {!isRequested && order.supplier && <span>Fornitore: {order.supplier}</span>}
            {order.machine_id && <span>Macchina: {getMachineName(order.machine_id)}</span>}
            {order.report_id && <span className="text-amber-400">Report: {getReportTitle(order.report_id)}</span>}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[11px] text-faint">
            {isRequested
              ? <span>Richiesto: {timeAgo(order.created_at || order.ordered_at)}</span>
              : <span>Ordinato: {formatDate(order.ordered_at)}</span>}
            {order.expected_at && !isRequested && <span>Previsto: {formatDate(order.expected_at)}</span>}
            {order.received_at && <span className="text-emerald-400">Ricevuto: {formatDate(order.received_at)}</span>}
          </div>

          {order.notes && <p className="text-[11px] text-secondary mt-1.5 leading-relaxed line-clamp-2">{order.notes}</p>}

          {/* Strip foto extra (oltre la 1ª) */}
          {hasPhotos && images.length > 1 && (
            <div className="flex gap-1.5 mt-2">
              {images.slice(1, 5).map((img, i) => (
                <button
                  key={i}
                  onClick={() => onPhotoClick(i + 1, images)}
                  className="press-scale w-10 h-10 rounded-lg overflow-hidden border border-token"
                  aria-label={`Apri foto ${i + 2}`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {images.length > 5 && (
                <button
                  onClick={() => onPhotoClick(5, images)}
                  className="press-scale w-10 h-10 rounded-lg bg-surface-2 border border-token text-[10px] font-bold text-faint flex items-center justify-center"
                >
                  +{images.length - 5}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isRequested && (
            <button onClick={onProcess} className="flex items-center gap-1 px-3 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 rounded-lg text-xs font-bold transition-all">
              <ArrowRight size={13} /> Elabora
            </button>
          )}
          {order.status === 'ordinato' && (
            <>
              <button onClick={onShipped} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 rounded-lg text-xs font-medium transition-all" title="Segna come spedito">
                <Truck size={13} /> Spedito
              </button>
              <button onClick={onReceived} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-all" title="Segna come ricevuto">
                <Check size={13} /> Ricevuto
              </button>
            </>
          )}
          {order.status === 'spedito' && (
            <button onClick={onReceived} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-all">
              <Check size={13} /> Ricevuto
            </button>
          )}
          {order.status === 'ricevuto' && (
            <button onClick={onInstalled} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600/15 hover:bg-green-600/25 text-green-400 rounded-lg text-xs font-medium transition-all">
              <Check size={13} /> Installato
            </button>
          )}
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400" aria-label="Elimina"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ProcessRequestModal — admin elabora una richiesta del tecnico
// ─────────────────────────────────────────────────────────────
function ProcessRequestModal({
  order, onClose, onConfirm, onPhotoClick,
  report, requesterName, machineName,
  supplierProfiles, getSupplierProfile,
}) {
  if (!order) return null
  return (
    <ProcessRequestModalBody
      key={order.id}
      order={order}
      onClose={onClose}
      onConfirm={onConfirm}
      onPhotoClick={onPhotoClick}
      report={report}
      requesterName={requesterName}
      machineName={machineName}
      supplierProfiles={supplierProfiles}
      getSupplierProfile={getSupplierProfile}
    />
  )
}

function ProcessRequestModalBody({
  order, onClose, onConfirm, onPhotoClick,
  report, requesterName, machineName,
  supplierProfiles, getSupplierProfile,
}) {
  const [supplierId, setSupplierId] = useState(order.supplier_id || '')
  const [supplierText, setSupplierText] = useState(order.supplier || '')
  const [expectedAt, setExpectedAt] = useState(order.expected_at ? order.expected_at.slice(0, 10) : '')
  const [unitCost, setUnitCost] = useState(order.unit_cost || '')
  const [submitting, setSubmitting] = useState(false)

  const images = Array.isArray(order.images) ? order.images : []
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  const selectedSupplier = supplierId ? getSupplierProfile(supplierId) : null

  const handleConfirm = async () => {
    setSubmitting(true)
    await onConfirm(order.id, {
      supplier_id: supplierId || null,
      supplier: selectedSupplier?.company_name || supplierText.trim() || null,
      expected_at: expectedAt ? new Date(expectedAt).toISOString() : null,
      unit_cost: unitCost ? parseFloat(unitCost) : 0,
    })
    setSubmitting(false)
  }

  return (
    <Modal open={true} onClose={onClose} title="Elabora richiesta ricambio" size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Foto strip */}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => onPhotoClick(i, images)}
                className="press-scale shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-token relative"
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 right-1 text-[8px] font-bold tracking-wide text-amber-400 bg-black/75 rounded text-center py-0.5">
                    TARGHETTA
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Sommario richiesta */}
        <div className="bg-surface-2 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-bold text-themed">{order.spare_part_name}</p>
            {urg && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: urg.bg, color: urg.color }}>
                {urg.label}
              </span>
            )}
            <span className="text-xs text-faint">x{order.quantity}</span>
          </div>
          <p className="text-xs text-faint">
            Richiesto da <span className="text-secondary font-medium">{requesterName}</span>
            {' · '}{timeAgo(order.created_at || order.ordered_at)}
          </p>
          {report && (
            <p className="text-xs text-amber-400">
              Ticket: {report.title}{machineName !== '—' && ` · ${machineName}`}
            </p>
          )}
          {order.notes && (
            <div className="mt-2 pt-2 border-t border-token">
              <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Note del tecnico</p>
              <p className="text-sm text-themed leading-relaxed whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Fornitore */}
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Fornitore</label>
          {supplierProfiles.length > 0 ? (
            <select
              className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 outline-none mb-2"
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
            >
              <option value="">— Seleziona dall'anagrafica —</option>
              {supplierProfiles.map(s => (
                <option key={s.user_id} value={s.user_id}>
                  {s.company_name}{s.specialties?.length ? ` · ${s.specialties.slice(0, 2).join(', ')}` : ''}
                </option>
              ))}
            </select>
          ) : null}
          <Input
            label=""
            placeholder={supplierProfiles.length > 0 ? 'Oppure inserisci nome libero' : 'Nome fornitore'}
            value={supplierText}
            onChange={e => setSupplierText(e.target.value)}
          />

          {/* Bottoni contatto */}
          {selectedSupplier && (
            <div className="flex gap-2 mt-2">
              {selectedSupplier.phone && (
                <a href={`tel:${selectedSupplier.phone.replace(/\s+/g, '')}`}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-600/15 hover:bg-cyan-600/25 text-cyan-400 rounded-lg text-xs font-medium transition-all">
                  <Phone size={13} /> Chiama
                </a>
              )}
              {selectedSupplier.whatsapp && (
                <a href={`https://wa.me/${selectedSupplier.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                  <MessageCircle size={13} /> WhatsApp
                </a>
              )}
              {selectedSupplier.email_public && (
                <a href={`mailto:${selectedSupplier.email_public}?subject=${encodeURIComponent('Richiesta: ' + order.spare_part_name)}`}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 rounded-lg text-xs font-medium transition-all">
                  <Mail size={13} /> Email
                </a>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Data arrivo prevista" type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)} />
          <Input label="Costo unitario (€)" type="number" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" />
        </div>

        <Button onClick={handleConfirm} disabled={submitting} className="w-full">
          {submitting ? 'Conferma…' : 'Conferma ordine al fornitore'}
        </Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// PhotoLightbox — visualizzatore foto fullscreen
// ─────────────────────────────────────────────────────────────
function PhotoLightbox({ initialIdx, all, onClose }) {
  const [idx, setIdx] = useState(initialIdx)
  const current = all[idx]
  if (!current) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Chiudi"
        style={{
          position: 'absolute', top: 16, right: 16,
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(255,255,255,0.1)', border: 'none',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={20} />
      </button>
      <img
        src={current.url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
      />
      {all.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, alignItems: 'center',
            background: 'rgba(0,0,0,0.6)', padding: '8px 14px', borderRadius: 999,
          }}
        >
          <button
            onClick={() => setIdx(i => (i - 1 + all.length) % all.length)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}
            aria-label="Precedente"
          >‹</button>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
            {idx + 1} / {all.length}
          </span>
          <button
            onClick={() => setIdx(i => (i + 1) % all.length)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}
            aria-label="Successiva"
          >›</button>
        </div>
      )}
    </div>
  )
}
