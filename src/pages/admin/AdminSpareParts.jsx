/**
 * AdminSpareParts v1.0 — Gestione Ricambi e Magazzino
 *
 * Due sezioni:
 * 1. Magazzino: catalogo ricambi con stock, posizione, costo
 * 2. Ordini: ordini in corso collegati ai report
 */

import { useState, useEffect, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { ORDER_STATUS, formatDate } from '../../lib/constants'
import { Button, Input, Modal, Badge, Spinner, EmptyState } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import {
  Package, Plus, Edit, Trash2, Search, AlertTriangle,
  ShoppingCart, Check, Truck, MapPin, Hash, X,
  ArrowRight, Clock, Factory, ChevronRight, Archive
} from 'lucide-react'

const TABS = [
  { id: 'magazzino', label: 'Magazzino', icon: Package },
  { id: 'ordini', label: 'Ordini', icon: ShoppingCart },
]

const emptyPartForm = { name: '', code: '', manufacturer: '', unit_cost: '', stock_qty: 0, min_stock: 0, location: '', notes: '' }
const emptyOrderForm = { spare_part_name: '', spare_part_id: '', report_id: '', machine_id: '', component_id: '', quantity: 1, unit_cost: '', supplier: '', expected_at: '', notes: '' }

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

  // Part form
  const [showPartForm, setShowPartForm] = useState(false)
  const [editingPart, setEditingPart] = useState(null)
  const [partForm, setPartForm] = useState(emptyPartForm)

  // Order form
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderForm, setOrderForm] = useState(emptyOrderForm)

  const load = async () => {
    setLoading(true)
    try {
      const [p, o, r, m] = await Promise.all([
        db.getSpareParts(),
        db.getSparePartOrders(),
        db.getReports(),
        db.getMachines(),
      ])
      setParts(p); setOrders(o); setReports(r); setMachines(m)
    } catch (e) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  // ── Stats ──
  const lowStockParts = useMemo(() => parts.filter(p => p.stock_qty <= p.min_stock && p.min_stock > 0), [parts])
  const activeOrders = useMemo(() => orders.filter(o => o.status === 'ordinato' || o.status === 'spedito'), [orders])
  const overdueOrders = useMemo(() => activeOrders.filter(o => o.expected_at && new Date(o.expected_at) < new Date()), [activeOrders])

  // ── Search ──
  const filteredParts = useMemo(() =>
    parts.filter(p => !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()) ||
      p.location?.toLowerCase().includes(search.toLowerCase())
    ), [parts, search])

  const filteredOrders = useMemo(() =>
    orders.filter(o => !search ||
      o.spare_part_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.supplier?.toLowerCase().includes(search.toLowerCase())
    ), [orders, search])

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
  const getMachineName = (id) => machines.find(m => m.id === id)?.name || '—'
  const isOverdue = (o) => o.expected_at && new Date(o.expected_at) < new Date() && (o.status === 'ordinato' || o.status === 'spedito')

  // ── waitingReports: reports in_attesa_ricambi ──
  const waitingReports = useMemo(() => reports.filter(r => r.status === 'in_attesa_ricambi'), [reports])

  const set = (key, val) => setPartForm(f => ({ ...f, [key]: val }))
  const setO = (key, val) => setOrderForm(f => ({ ...f, [key]: val }))

  return (
    <div className="space-y-5 animate-fade-in">
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
                {filteredOrders.map(order => {
                  const st = ORDER_STATUS[order.status] || ORDER_STATUS.ordinato
                  const overdue = isOverdue(order)
                  return (
                    <div key={order.id} className={`card-elevated rounded-xl p-4 transition-all ${overdue ? 'ring-1 ring-red-500/30' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${overdue ? 'bg-red-500/15' : 'bg-surface-2'}`}>
                          {order.status === 'ordinato' && <Clock size={18} className={overdue ? 'text-red-400' : 'text-amber-400'} />}
                          {order.status === 'spedito' && <Truck size={18} className="text-violet-400" />}
                          {order.status === 'ricevuto' && <Check size={18} className="text-emerald-400" />}
                          {order.status === 'installato' && <Check size={18} className="text-green-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-themed">{order.spare_part_name}</p>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                            {overdue && <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">In ritardo</span>}
                            <span className="text-xs text-faint">x{order.quantity}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-faint flex-wrap">
                            {order.supplier && <span>Fornitore: {order.supplier}</span>}
                            {order.machine_id && <span>Macchina: {getMachineName(order.machine_id)}</span>}
                            {order.report_id && <span className="text-amber-400">Report: {getReportTitle(order.report_id)}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-faint">
                            <span>Ordinato: {formatDate(order.ordered_at)}</span>
                            {order.expected_at && <span>Previsto: {formatDate(order.expected_at)}</span>}
                            {order.received_at && <span className="text-emerald-400">Ricevuto: {formatDate(order.received_at)}</span>}
                          </div>
                          {order.notes && <p className="text-[11px] text-faint mt-1 italic">{order.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {order.status === 'ordinato' && (
                            <>
                              <button onClick={() => markShipped(order)} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 rounded-lg text-xs font-medium transition-all" title="Segna come spedito">
                                <Truck size={13} /> Spedito
                              </button>
                              <button onClick={() => markReceived(order)} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-all" title="Segna come ricevuto">
                                <Check size={13} /> Ricevuto
                              </button>
                            </>
                          )}
                          {order.status === 'spedito' && (
                            <button onClick={() => markReceived(order)} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                              <Check size={13} /> Ricevuto
                            </button>
                          )}
                          {order.status === 'ricevuto' && (
                            <button onClick={() => markInstalled(order)} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600/15 hover:bg-green-600/25 text-green-400 rounded-lg text-xs font-medium transition-all">
                              <Check size={13} /> Installato
                            </button>
                          )}
                          <button onClick={() => deleteOrder(order.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
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
    </div>
  )
}
