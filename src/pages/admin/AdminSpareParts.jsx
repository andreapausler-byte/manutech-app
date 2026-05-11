/**
 * AdminSpareParts v1.0 — Gestione Ricambi e Magazzino
 *
 * Due sezioni:
 * 1. Magazzino: catalogo ricambi con stock, posizione, costo
 * 2. Ordini: ordini in corso collegati ai report
 */

import { useState, useEffect, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { ORDER_STATUS, SPARE_URGENCY, ORDER_STAGES, REQUEST_KIND, orderStageIndex, statusLabel, formatDate, timeAgo } from '../../lib/constants'
import RequestDetailPanel from '../../components/spare/RequestDetailPanel'
import { Button, Input, Modal, Badge, Spinner, EmptyState } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import PageHeader from '../../components/layout/PageHeader'
import { findNavItem } from '../../lib/adminNav'
import {
  Package, Plus, Edit, Trash2, Search, AlertTriangle,
  ShoppingCart, Check, Truck, MapPin, Hash, X,
  ArrowRight, Clock, Factory, ChevronRight, Archive,
  Phone, MessageCircle, Mail, Inbox, Image as ImageIcon, User,
  Send, FileText, ChevronDown, Euro, UserCog, Eye
} from 'lucide-react'

const NAV_ITEM = findNavItem('spare-parts')

const TABS = [
  { id: 'ordini', label: 'Ordini', icon: ShoppingCart },
  { id: 'magazzino', label: 'Magazzino', icon: Package },
]

// Sezioni kanban verticale del tab Ordini.
// Ogni sezione raggruppa uno o più status interni.
const ORDER_SECTIONS = [
  { id: 'richiesto',  label: 'Da elaborare',         statuses: ['richiesto'],              color: '#f59e0b' },
  { id: 'preventivo', label: 'Preventivo richiesto', statuses: ['preventivo'],             color: '#fbbf24' },
  { id: 'ordinato',   label: 'Ordinato',             statuses: ['ordinato', 'spedito'],    color: '#06b6d4' },
  { id: 'ricevuto',   label: 'Ricevuto',             statuses: ['ricevuto', 'installato'], color: '#3ddc84' },
]

const emptyPartForm = { name: '', code: '', manufacturer: '', unit_cost: '', stock_qty: 0, min_stock: 0, location: '', notes: '' }
const emptyOrderForm = { spare_part_name: '', spare_part_id: '', report_id: '', machine_id: '', component_id: '', quantity: 1, unit_cost: '', supplier: '', expected_at: '', notes: '' }

const URGENCY_RANK = { urgente: 0, alta: 1, media: 2, bassa: 3 }
const STATUS_RANK = { richiesto: 0, ordinato: 1, spedito: 2, ricevuto: 3, installato: 4 }

export default function AdminSpareParts() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('ordini')
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

  // Modali ordini
  const [processingOrder, setProcessingOrder] = useState(null)   // 'richiesto' → richiedi preventivi
  const [quotingOrder, setQuotingOrder] = useState(null)         // 'preventivo' → gestisci quotes
  const [photoLightbox, setPhotoLightbox] = useState(null)       // { url, all, idx }
  const [openDetailId, setOpenDetailId] = useState(null)         // tap su card → fullscreen detail panel

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
      const updated = await db.updateSparePartOrder(order.id, { status: 'spedito' })
      db._emitOrderActivity?.(updated, {
        type: 'status_change',
        from_status: 'ordinato', to_status: 'spedito',
        detail: order.kind === 'intervento' ? 'Tecnico in arrivo' : 'Spedito dal fornitore',
      })
      toast.success('Stato aggiornato: spedito')
      load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const markInstalled = async (order) => {
    try {
      const updated = await db.updateSparePartOrder(order.id, { status: 'installato', installed_at: new Date().toISOString() })
      db._emitOrderActivity?.(updated, {
        type: 'status_change',
        from_status: 'ricevuto', to_status: 'installato',
        detail: order.kind === 'intervento' ? 'Intervento concluso' : 'Ricambio installato',
      })
      toast.success(order.kind === 'intervento' ? 'Intervento concluso!' : 'Ricambio installato!')
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
  const isOverdue = (o) => o.expected_at && new Date(o.expected_at) < new Date() && (o.status === 'ordinato' || o.status === 'spedito')

  // ── Richiedi preventivi: richiesto → preventivo (multi-fornitore) ──
  const requestQuotes = async (orderId, quotes) => {
    try {
      await db.requestSparePartQuotes(orderId, quotes)
      toast.success(`Preventivo richiesto a ${quotes.length} ${quotes.length === 1 ? 'fornitore' : 'fornitori'}`)
      setProcessingOrder(null)
      load()
    } catch (e) { toast.error('Errore: ' + (e?.message || 'riprova')) }
  }

  // ── Bypass preventivo: ordina direttamente (uso vecchia "Conferma ordine") ──
  const directOrder = async (orderId, payload) => {
    try {
      await db.confirmSparePartOrder(orderId, payload)
      toast.success('Ordine confermato')
      setProcessingOrder(null)
      load()
    } catch (e) { toast.error('Errore: ' + (e?.message || 'riprova')) }
  }

  // ── Aggiorna risposta fornitore (quote) ──
  const updateQuote = async (orderId, quoteId, patch) => {
    try {
      await db.updateSparePartQuote(orderId, quoteId, patch)
      load()
    } catch (e) { toast.error('Errore: ' + (e?.message || 'riprova')) }
  }

  // ── Accetta preventivo: preventivo → ordinato + notifica tecnico ──
  const acceptQuote = async (orderId, quoteId, payload) => {
    try {
      await db.acceptSparePartQuote(orderId, quoteId, payload)
      toast.success('Preventivo accettato · ordine in corso')
      setQuotingOrder(null)
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

          {/* ═══ ORDINI TAB — kanban verticale ═══ */}
          {tab === 'ordini' && (
            filteredOrders.length === 0 ? (
              <EmptyState icon="🛒" title="Nessun ordine" subtitle="Le richieste dei tecnici appariranno qui" />
            ) : (
              <div className="space-y-5">
                {ORDER_SECTIONS.map(section => {
                  const items = filteredOrders.filter(o => section.statuses.includes(o.status))
                  if (items.length === 0) return null
                  return (
                    <section key={section.id}>
                      <div className="flex items-center gap-2 mb-2.5 px-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: section.color }}
                        />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
                          {section.label}
                        </h3>
                        <span className="text-xs text-faint font-mono">{items.length}</span>
                      </div>
                      <div className="space-y-3">
                        {items.map(order => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            overdue={isOverdue(order)}
                            getReportTitle={getReportTitle}
                            getMachineName={getMachineName}
                            getUserName={getUserName}
                            onPhotoClick={(idx, all) => setPhotoLightbox({ idx, all })}
                            onProcess={() => setProcessingOrder(order)}
                            onManageQuotes={() => setQuotingOrder(order)}
                            onShipped={() => markShipped(order)}
                            onReceived={() => markReceived(order)}
                            onInstalled={() => markInstalled(order)}
                            onDelete={() => deleteOrder(order.id)}
                            onView={() => setOpenDetailId(order.id)}
                          />
                        ))}
                      </div>
                    </section>
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

      {/* ═══ PROCESS REQUEST MODAL — 'richiesto' → richiedi preventivi ═══ */}
      <ProcessRequestModal
        order={processingOrder}
        onClose={() => setProcessingOrder(null)}
        onRequestQuotes={requestQuotes}
        onDirectOrder={directOrder}
        onPhotoClick={(idx, all) => setPhotoLightbox({ idx, all })}
        report={processingOrder ? getReport(processingOrder.report_id) : null}
        requesterName={processingOrder ? getUserName(processingOrder.requested_by) : ''}
        machineName={processingOrder ? getMachineName(processingOrder.machine_id) : ''}
        supplierProfiles={supplierProfiles}
      />

      {/* ═══ MANAGE QUOTES MODAL — 'preventivo' → gestisci risposte fornitori ═══ */}
      <ManageQuotesModal
        order={quotingOrder}
        onClose={() => setQuotingOrder(null)}
        onUpdateQuote={updateQuote}
        onAcceptQuote={acceptQuote}
        onAddQuotes={requestQuotes}
        onPhotoClick={(idx, all) => setPhotoLightbox({ idx, all })}
        report={quotingOrder ? getReport(quotingOrder.report_id) : null}
        requesterName={quotingOrder ? getUserName(quotingOrder.requested_by) : ''}
        machineName={quotingOrder ? getMachineName(quotingOrder.machine_id) : ''}
        supplierProfiles={supplierProfiles}
        getUserName={getUserName}
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

      {/* ═══ REQUEST DETAIL — apri timeline + chat ═══ */}
      {openDetailId && user && (
        <RequestDetailPanel
          orderId={openDetailId}
          user={user}
          onClose={() => { setOpenDetailId(null); load() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OrderCard — variante richiesto vs ordini esistenti
// ─────────────────────────────────────────────────────────────
function OrderCard({
  order, overdue,
  getReportTitle, getMachineName, getUserName,
  onPhotoClick, onProcess, onManageQuotes, onShipped, onReceived, onInstalled, onDelete, onView,
}) {
  const kind = order.kind || 'ricambio'
  const kindMeta = REQUEST_KIND[kind] || REQUEST_KIND.ricambio
  const KindIcon = kind === 'intervento' ? UserCog : Package
  const st = ORDER_STATUS[order.status] || ORDER_STATUS.ordinato
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  const images = Array.isArray(order.images) ? order.images : []
  const hasPhotos = images.length > 0
  const quotes = Array.isArray(order.quotes) ? order.quotes : []
  const pendingQuotes = quotes.filter(q => q.status === 'pending').length
  const receivedQuotes = quotes.filter(q => q.status === 'received').length

  const isRequested = order.status === 'richiesto'
  const isQuoting = order.status === 'preventivo'
  const stage = orderStageIndex(order.status)

  const ringClass = overdue
    ? 'ring-1 ring-red-500/30'
    : isRequested ? 'ring-1 ring-orange-500/30'
    : isQuoting ? 'ring-1 ring-amber-400/30'
    : ''

  return (
    <div className={`card-elevated rounded-xl p-4 transition-all ${ringClass}`}>
      <div className="flex items-start gap-3">
        {/* Thumb foto + badge kind, oppure icona kind */}
        {hasPhotos ? (
          <button
            onClick={() => onPhotoClick(0, images)}
            className="press-scale shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-token relative"
            aria-label="Apri foto"
          >
            <img src={images[0].url} alt="" className="w-full h-full object-cover" />
            {images.length > 1 && (
              <span className="absolute bottom-0 right-0 text-[9px] font-bold px-1 py-0.5 bg-black/70 text-white rounded-tl">
                +{images.length - 1}
              </span>
            )}
            <span
              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: kindMeta.color, border: '2px solid var(--color-bg)' }}
            >
              <KindIcon size={11} className="text-white" />
            </span>
          </button>
        ) : (
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: kindMeta.color + '22', color: kindMeta.color }}
          >
            <KindIcon size={22} />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-themed">{order.spare_part_name}</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.color }}>{statusLabel(order.status, kind)}</span>
            {(isRequested || isQuoting) && urg && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: urg.bg, color: urg.color }}>
                {urg.label}
              </span>
            )}
            {overdue && <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">In ritardo</span>}
            <span className="text-xs text-faint">x{order.quantity}</span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-faint flex-wrap">
            {(isRequested || isQuoting) && order.requested_by && (
              <span className="flex items-center gap-1"><User size={11} />{getUserName(order.requested_by)}</span>
            )}
            {!isRequested && !isQuoting && order.supplier && <span>Fornitore: {order.supplier}</span>}
            {order.machine_id && <span>Macchina: {getMachineName(order.machine_id)}</span>}
            {order.report_id && <span className="text-amber-400">Report: {getReportTitle(order.report_id)}</span>}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[11px] text-faint">
            {isRequested
              ? <span>Richiesto: {timeAgo(order.created_at || order.ordered_at)}</span>
              : isQuoting
                ? <span>Preventivo: {timeAgo(order.updated_at || order.created_at)}</span>
                : <span>Ordinato: {formatDate(order.ordered_at)}</span>}
            {order.expected_at && !isRequested && !isQuoting && <span>Previsto: {formatDate(order.expected_at)}</span>}
            {order.received_at && <span className="text-emerald-400">Ricevuto: {formatDate(order.received_at)}</span>}
          </div>

          {/* Riepilogo quotes per stato preventivo */}
          {isQuoting && quotes.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
              <span className="text-secondary font-medium">{quotes.length} preventiv{quotes.length === 1 ? 'o' : 'i'}:</span>
              {pendingQuotes > 0 && (
                <span className="text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                  {pendingQuotes} in attesa
                </span>
              )}
              {receivedQuotes > 0 && (
                <span className="text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
                  {receivedQuotes} ricevut{receivedQuotes === 1 ? 'o' : 'i'}
                </span>
              )}
            </div>
          )}

          {order.notes && <p className="text-[11px] text-secondary mt-1.5 leading-relaxed line-clamp-2">{order.notes}</p>}

          {/* Strip foto extra */}
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

          {/* Mini progress bar 4 stadi */}
          <ProgressStepper stage={stage} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onView && (
            <button onClick={onView} className="p-2 rounded-lg hover:bg-white/10 text-faint hover:text-white" aria-label="Apri dettaglio" title="Apri dettaglio richiesta">
              <Eye size={14} />
            </button>
          )}
          {isRequested && (
            <button onClick={onProcess} className="flex items-center gap-1 px-3 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 rounded-lg text-xs font-bold transition-all">
              <ArrowRight size={13} /> Elabora
            </button>
          )}
          {isQuoting && (
            <button onClick={onManageQuotes} className="flex items-center gap-1 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg text-xs font-bold transition-all">
              <FileText size={13} /> Gestisci
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
// ProgressStepper — 4 stadi visivi (Nuova → Preventivo → Ordinato → Ricevuto)
// ─────────────────────────────────────────────────────────────
export function ProgressStepper({ stage = 0, compact = false }) {
  return (
    <div className={`flex items-center gap-1 ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
      {ORDER_STAGES.map((s, i) => {
        const done = i < stage
        const active = i === stage
        return (
          <div key={s.key} className="flex-1 flex items-center gap-1">
            <div
              className="h-1 rounded-full flex-1 transition-all"
              style={{
                background: done || active
                  ? (i === 3 ? '#3ddc84' : i === 2 ? '#06b6d4' : i === 1 ? '#fbbf24' : '#f59e0b')
                  : 'rgba(255,255,255,0.08)',
                opacity: active ? 1 : done ? 0.7 : 1,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OrderSummaryHeader — header riusabile (foto + sommario + note tecnico)
// ─────────────────────────────────────────────────────────────
function OrderSummaryHeader({ order, requesterName, machineName, report, onPhotoClick }) {
  const images = Array.isArray(order.images) ? order.images : []
  const urg = order.urgency ? SPARE_URGENCY[order.urgency] : null
  return (
    <>
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
            Ticket: {report.title}{machineName && machineName !== '—' && ` · ${machineName}`}
          </p>
        )}
        {order.notes && (
          <div className="mt-2 pt-2 border-t border-token">
            <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Note del tecnico</p>
            <p className="text-sm text-themed leading-relaxed whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// ContactButtons — chiama / WhatsApp / Email da supplier_profile
// ─────────────────────────────────────────────────────────────
function ContactButtons({ supplier, subject = '' }) {
  if (!supplier) return null
  const tel = supplier.phone?.replace(/\s+/g, '')
  const wa = supplier.whatsapp?.replace(/[^0-9]/g, '')
  const email = supplier.email_public
  if (!tel && !wa && !email) return null
  return (
    <div className="flex gap-2 mt-2">
      {tel && (
        <a href={`tel:${tel}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-600/15 hover:bg-cyan-600/25 text-cyan-400 rounded-lg text-xs font-medium transition-all">
          <Phone size={13} /> Chiama
        </a>
      )}
      {wa && (
        <a href={`https://wa.me/${wa}${subject ? '?text=' + encodeURIComponent(subject) : ''}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-all">
          <MessageCircle size={13} /> WhatsApp
        </a>
      )}
      {email && (
        <a href={`mailto:${email}${subject ? '?subject=' + encodeURIComponent(subject) : ''}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 rounded-lg text-xs font-medium transition-all">
          <Mail size={13} /> Email
        </a>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ProcessRequestModal — admin elabora una richiesta del tecnico
//
// Il flusso primario è: scegli 1+ fornitori → richiedi preventivi.
// Esiste un secondo flusso "salta preventivo" per quando l'admin sa già
// da chi comprare (es. ricambio standardizzato): fornitore singolo +
// data/costo → ordine direttamente in 'ordinato'.
// ─────────────────────────────────────────────────────────────
function ProcessRequestModal({
  order, onClose, onRequestQuotes, onDirectOrder, onPhotoClick,
  report, requesterName, machineName, supplierProfiles,
}) {
  if (!order) return null
  return (
    <ProcessRequestModalBody
      key={order.id}
      order={order}
      onClose={onClose}
      onRequestQuotes={onRequestQuotes}
      onDirectOrder={onDirectOrder}
      onPhotoClick={onPhotoClick}
      report={report}
      requesterName={requesterName}
      machineName={machineName}
      supplierProfiles={supplierProfiles}
    />
  )
}

function ProcessRequestModalBody({
  order, onClose, onRequestQuotes, onDirectOrder, onPhotoClick,
  report, requesterName, machineName, supplierProfiles,
}) {
  // Smart filter: se l'ordine specifica una specialty, ordina i fornitori
  // con quella specialty in cima.
  const sortedSuppliers = useMemo(() => {
    const ts = order.specialty
    if (!ts) return supplierProfiles
    return [...supplierProfiles].sort((a, b) => {
      const am = (a.specialties || []).includes(ts) ? 0 : 1
      const bm = (b.specialties || []).includes(ts) ? 0 : 1
      return am - bm
    })
  }, [supplierProfiles, order.specialty])

  const isUrgent = order?.urgency === 'urgente'
  const [mode, setMode] = useState(isUrgent ? 'direct' : 'quote') // 'quote' | 'direct'
  const [selectedIds, setSelectedIds] = useState([])  // user_id dei fornitori selezionati
  const [extraName, setExtraName] = useState('')      // nome libero opzionale
  const [globalNote, setGlobalNote] = useState('')
  // direct mode
  const [directSupplierId, setDirectSupplierId] = useState('')
  const [directSupplierText, setDirectSupplierText] = useState('')
  const [directExpectedAt, setDirectExpectedAt] = useState('')
  const [directUnitCost, setDirectUnitCost] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const toggleSupplier = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const directSupplier = directSupplierId ? supplierProfiles.find(s => s.user_id === directSupplierId) : null

  const handleRequestQuotes = async () => {
    const items = selectedIds.map(id => {
      const s = supplierProfiles.find(p => p.user_id === id)
      return { supplier_id: id, supplier_name: s?.company_name || '—', note: globalNote || null }
    })
    if (extraName.trim()) {
      items.push({ supplier_id: null, supplier_name: extraName.trim(), note: globalNote || null })
    }
    if (items.length === 0) return
    setSubmitting(true)
    await onRequestQuotes(order.id, items)
    setSubmitting(false)
  }

  const handleDirectOrder = async () => {
    setSubmitting(true)
    await onDirectOrder(order.id, {
      supplier_id: directSupplierId || null,
      supplier: directSupplier?.company_name || directSupplierText.trim() || null,
      expected_at: directExpectedAt ? new Date(directExpectedAt).toISOString() : null,
      unit_cost: directUnitCost ? parseFloat(directUnitCost) : 0,
    })
    setSubmitting(false)
  }

  const canRequestQuotes = selectedIds.length > 0 || extraName.trim().length > 0
  const canDirectOrder = directSupplierId || directSupplierText.trim().length > 0

  return (
    <Modal open={true} onClose={onClose} title="Elabora richiesta ricambio" size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <OrderSummaryHeader
          order={order}
          requesterName={requesterName}
          machineName={machineName}
          report={report}
          onPhotoClick={onPhotoClick}
        />

        {isUrgent && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-bold text-red-300">Richiesta urgente</p>
              <p className="text-faint mt-0.5 leading-relaxed">
                Consigliato saltare i preventivi e ordinare diretto al fornitore di fiducia per non perdere tempo.
              </p>
            </div>
          </div>
        )}

        {/* Tab interno: chiedi preventivi vs ordina diretto */}
        <div className="flex bg-surface-2 rounded-xl p-1">
          <button onClick={() => setMode('quote')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'quote' ? 'bg-amber-500/20 text-amber-300' : 'text-faint hover:text-secondary'}`}>
            <FileText size={13} /> Richiedi preventivi
          </button>
          <button onClick={() => setMode('direct')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'direct' ? 'bg-cyan-500/20 text-cyan-300' : 'text-faint hover:text-secondary'}`}>
            <Send size={13} /> Salta, ordina diretto
            {isUrgent && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/30 text-red-200 uppercase ml-0.5">consigliato</span>}
          </button>
        </div>

        {mode === 'quote' && (
          <>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">
                Fornitori da contattare ({selectedIds.length} selezionati)
              </label>
              {supplierProfiles.length === 0 ? (
                <p className="text-xs text-faint italic bg-surface-2 rounded-xl p-3">
                  Nessun fornitore in anagrafica. Aggiungine uno da Admin → Fornitori, oppure usa il nome libero qui sotto.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {sortedSuppliers.map(s => {
                    const checked = selectedIds.includes(s.user_id)
                    const matchesSpecialty = order.specialty && (s.specialties || []).includes(order.specialty)
                    return (
                      <label key={s.user_id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${checked ? 'bg-amber-500/10 ring-1 ring-amber-500/30' : matchesSpecialty ? 'bg-emerald-500/5 ring-1 ring-emerald-500/20 hover:bg-emerald-500/10' : 'bg-surface-2 hover:bg-surface-3'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSupplier(s.user_id)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-themed truncate">{s.company_name}</p>
                            {matchesSpecialty && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 uppercase tracking-wide shrink-0">Match</span>
                            )}
                          </div>
                          {s.specialties?.length > 0 && (
                            <p className="text-[11px] text-faint truncate">{s.specialties.slice(0, 3).join(' · ')}</p>
                          )}
                        </div>
                        {checked && <ContactButtonsCompact supplier={s} subject={`Richiesta preventivo: ${order.spare_part_name}`} />}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <Input
              label="Aggiungi un fornitore non in anagrafica (opzionale)"
              placeholder="es. Comac S.p.A."
              value={extraName}
              onChange={e => setExtraName(e.target.value)}
            />

            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Nota per i preventivi (opzionale)</label>
              <textarea
                className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed placeholder:text-faint focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 outline-none resize-none"
                rows={2}
                placeholder="es. Risposta entro venerdì, urgenza alta, alternative ammesse..."
                value={globalNote}
                onChange={e => setGlobalNote(e.target.value)}
              />
            </div>

            <Button onClick={handleRequestQuotes} disabled={!canRequestQuotes || submitting} className="w-full">
              {submitting ? 'Invio…' : `Richiedi preventiv${(selectedIds.length + (extraName.trim() ? 1 : 0)) === 1 ? 'o' : 'i'} (${selectedIds.length + (extraName.trim() ? 1 : 0)})`}
            </Button>
          </>
        )}

        {mode === 'direct' && (
          <>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Fornitore</label>
              {supplierProfiles.length > 0 && (
                <select
                  className="w-full bg-surface-2 border border-token rounded-xl px-3 py-2.5 text-sm text-themed focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 outline-none mb-2"
                  value={directSupplierId}
                  onChange={e => setDirectSupplierId(e.target.value)}
                >
                  <option value="">— Seleziona dall'anagrafica —</option>
                  {supplierProfiles.map(s => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.company_name}{s.specialties?.length ? ` · ${s.specialties.slice(0, 2).join(', ')}` : ''}
                    </option>
                  ))}
                </select>
              )}
              <Input
                label=""
                placeholder={supplierProfiles.length > 0 ? 'Oppure inserisci nome libero' : 'Nome fornitore'}
                value={directSupplierText}
                onChange={e => setDirectSupplierText(e.target.value)}
              />
              <ContactButtons supplier={directSupplier} subject={`Ordine: ${order.spare_part_name}`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Data arrivo prevista" type="date" value={directExpectedAt} onChange={e => setDirectExpectedAt(e.target.value)} />
              <Input label="Costo unitario (€)" type="number" step="0.01" value={directUnitCost} onChange={e => setDirectUnitCost(e.target.value)} placeholder="0.00" />
            </div>

            <Button onClick={handleDirectOrder} disabled={!canDirectOrder || submitting} className="w-full">
              {submitting ? 'Conferma…' : 'Conferma ordine al fornitore'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

// Versione compatta dei contact buttons usata nelle righe della lista fornitori
function ContactButtonsCompact({ supplier, subject = '' }) {
  if (!supplier) return null
  const tel = supplier.phone?.replace(/\s+/g, '')
  const wa = supplier.whatsapp?.replace(/[^0-9]/g, '')
  const email = supplier.email_public
  return (
    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
      {tel && (
        <a href={`tel:${tel}`} className="press-scale w-8 h-8 rounded-lg bg-cyan-600/15 text-cyan-400 flex items-center justify-center" aria-label="Chiama">
          <Phone size={13} />
        </a>
      )}
      {wa && (
        <a href={`https://wa.me/${wa}${subject ? '?text=' + encodeURIComponent(subject) : ''}`} target="_blank" rel="noopener noreferrer" className="press-scale w-8 h-8 rounded-lg bg-emerald-600/15 text-emerald-400 flex items-center justify-center" aria-label="WhatsApp">
          <MessageCircle size={13} />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}${subject ? '?subject=' + encodeURIComponent(subject) : ''}`} className="press-scale w-8 h-8 rounded-lg bg-violet-600/15 text-violet-400 flex items-center justify-center" aria-label="Email">
          <Mail size={13} />
        </a>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ManageQuotesModal — gestisce un ordine in stato 'preventivo'
// ─────────────────────────────────────────────────────────────
function ManageQuotesModal({
  order, onClose, onUpdateQuote, onAcceptQuote, onAddQuotes, onPhotoClick,
  report, requesterName, machineName, supplierProfiles, getUserName,
}) {
  if (!order) return null
  return (
    <ManageQuotesModalBody
      key={order.id}
      order={order}
      onClose={onClose}
      onUpdateQuote={onUpdateQuote}
      onAcceptQuote={onAcceptQuote}
      onAddQuotes={onAddQuotes}
      onPhotoClick={onPhotoClick}
      report={report}
      requesterName={requesterName}
      machineName={machineName}
      supplierProfiles={supplierProfiles}
      getUserName={getUserName}
    />
  )
}

function ManageQuotesModalBody({
  order, onClose, onUpdateQuote, onAcceptQuote, onAddQuotes, onPhotoClick,
  report, requesterName, machineName, supplierProfiles,
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSupplierIds, setNewSupplierIds] = useState([])
  const [newExtraName, setNewExtraName] = useState('')
  const [newNote, setNewNote] = useState('')
  const [acceptingId, setAcceptingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const quotes = Array.isArray(order.quotes) ? order.quotes : []
  // Esclude fornitori già contattati dall'elenco "aggiungi"
  const alreadyAskedIds = new Set(quotes.map(q => q.supplier_id).filter(Boolean))
  const availableSuppliers = supplierProfiles.filter(s => !alreadyAskedIds.has(s.user_id))

  const handleQuotePatch = (quoteId, patch) => onUpdateQuote(order.id, quoteId, patch)

  const handleAddMore = async () => {
    const items = newSupplierIds.map(id => {
      const s = supplierProfiles.find(p => p.user_id === id)
      return { supplier_id: id, supplier_name: s?.company_name || '—', note: newNote || null }
    })
    if (newExtraName.trim()) {
      items.push({ supplier_id: null, supplier_name: newExtraName.trim(), note: newNote || null })
    }
    if (items.length === 0) return
    setSubmitting(true)
    await onAddQuotes(order.id, items)
    setNewSupplierIds([]); setNewExtraName(''); setNewNote(''); setShowAddForm(false)
    setSubmitting(false)
  }

  return (
    <Modal open={true} onClose={onClose} title="Preventivi richiesti" size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <OrderSummaryHeader
          order={order}
          requesterName={requesterName}
          machineName={machineName}
          report={report}
          onPhotoClick={onPhotoClick}
        />

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-secondary mb-2">
            {quotes.length} preventiv{quotes.length === 1 ? 'o' : 'i'}
          </h4>
          {quotes.length === 0 && (
            <p className="text-xs text-faint italic bg-surface-2 rounded-xl p-3">
              Nessun preventivo. Strano — questo ordine è in stato &quot;preventivo&quot;.
            </p>
          )}
          <div className="space-y-2.5">
            {quotes.map(q => {
              const supplier = q.supplier_id ? supplierProfiles.find(s => s.user_id === q.supplier_id) : null
              const isAccepted = q.status === 'accepted'
              const isRejected = q.status === 'rejected'
              const isAcceptingThis = acceptingId === q.id
              return (
                <div key={q.id}
                  className={`rounded-xl p-3 transition-all ${
                    isAccepted ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                    : isRejected ? 'bg-surface-2 opacity-60'
                    : 'bg-surface-2'
                  }`}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-themed">{q.supplier_name}</p>
                      <p className="text-[11px] text-faint">
                        Chiesto: {timeAgo(q.asked_at)}
                        {q.note && <> · <span className="italic">{q.note}</span></>}
                      </p>
                    </div>
                    <QuoteStatusBadge status={q.status} />
                    {!isAccepted && !isRejected && supplier && (
                      <ContactButtonsCompact supplier={supplier} subject={`Preventivo: ${order.spare_part_name}`} />
                    )}
                  </div>

                  {/* Form risposta fornitore: prezzo + lead time */}
                  {!isAccepted && !isRejected && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="relative">
                        <Euro size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                        <input
                          type="number" step="0.01"
                          placeholder="Prezzo"
                          defaultValue={q.quoted_price || ''}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            handleQuotePatch(q.id, {
                              quoted_price: Number.isFinite(v) ? v : null,
                              status: Number.isFinite(v) || q.quoted_lead_time_days ? 'received' : 'pending',
                              received_at: Number.isFinite(v) ? new Date().toISOString() : q.received_at,
                            })
                          }}
                          className="w-full bg-surface-3 border border-token rounded-lg pl-7 pr-2 py-1.5 text-xs text-themed outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <input
                        type="number"
                        placeholder="Giorni"
                        defaultValue={q.quoted_lead_time_days || ''}
                        onBlur={e => {
                          const v = parseInt(e.target.value, 10)
                          handleQuotePatch(q.id, {
                            quoted_lead_time_days: Number.isFinite(v) ? v : null,
                            status: Number.isFinite(v) || q.quoted_price ? 'received' : 'pending',
                            received_at: Number.isFinite(v) ? new Date().toISOString() : q.received_at,
                          })
                        }}
                        className="w-full bg-surface-3 border border-token rounded-lg px-2 py-1.5 text-xs text-themed outline-none focus:border-amber-500/50"
                      />
                    </div>
                  )}

                  {(q.quoted_price || q.quoted_lead_time_days) && (
                    <div className="mt-2 flex gap-3 text-[11px]">
                      {q.quoted_price && <span className="text-emerald-300 font-mono">€ {parseFloat(q.quoted_price).toFixed(2)}</span>}
                      {q.quoted_lead_time_days && <span className="text-cyan-300 font-mono">{q.quoted_lead_time_days}gg</span>}
                    </div>
                  )}

                  {/* Azioni accetta/rifiuta */}
                  {!isAccepted && !isRejected && (
                    <div className="flex gap-2 mt-2.5">
                      {isAcceptingThis ? (
                        <AcceptQuoteForm
                          quote={q}
                          onCancel={() => setAcceptingId(null)}
                          onConfirm={async (payload) => {
                            setSubmitting(true)
                            await onAcceptQuote(order.id, q.id, payload)
                            setAcceptingId(null); setSubmitting(false)
                          }}
                          submitting={submitting}
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => setAcceptingId(q.id)}
                            className="press-scale flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg text-xs font-bold">
                            <Check size={13} /> Accetta
                          </button>
                          <button
                            onClick={() => handleQuotePatch(q.id, { status: 'rejected', decided_at: new Date().toISOString() })}
                            className="press-scale px-3 py-2 bg-red-600/15 hover:bg-red-600/25 text-red-400 rounded-lg text-xs font-medium">
                            Rifiuta
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Aggiungi un altro fornitore */}
        {!showAddForm ? (
          <button onClick={() => setShowAddForm(true)}
            className="press-scale w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-surface-2 hover:bg-surface-3 border border-dashed border-token rounded-xl text-xs font-medium text-secondary">
            <Plus size={14} /> Chiedi a un altro fornitore
          </button>
        ) : (
          <div className="bg-surface-2 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-themed">Aggiungi richiesta preventivo</p>
            {availableSuppliers.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {availableSuppliers.map(s => {
                  const checked = newSupplierIds.includes(s.user_id)
                  return (
                    <label key={s.user_id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${checked ? 'bg-amber-500/10' : 'hover:bg-surface-3'}`}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setNewSupplierIds(prev => prev.includes(s.user_id) ? prev.filter(x => x !== s.user_id) : [...prev, s.user_id])}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span className="text-xs text-themed truncate flex-1">{s.company_name}</span>
                    </label>
                  )
                })}
              </div>
            )}
            <Input label="" placeholder="Oppure nome libero" value={newExtraName} onChange={e => setNewExtraName(e.target.value)} />
            <Input label="" placeholder="Nota (opzionale)" value={newNote} onChange={e => setNewNote(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={handleAddMore} disabled={(newSupplierIds.length === 0 && !newExtraName.trim()) || submitting} className="flex-1">
                {submitting ? '...' : 'Richiedi'}
              </Button>
              <button onClick={() => { setShowAddForm(false); setNewSupplierIds([]); setNewExtraName(''); setNewNote('') }}
                className="px-4 py-2 text-xs text-faint">Annulla</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function QuoteStatusBadge({ status }) {
  const map = {
    pending:  { label: 'In attesa', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    received: { label: 'Ricevuto',  color: '#3ddc84', bg: 'rgba(61,220,132,0.15)' },
    accepted: { label: 'Accettato', color: '#22c55e', bg: 'rgba(34,197,94,0.20)' },
    rejected: { label: 'Rifiutato', color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' },
  }
  const m = map[status] || map.pending
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
      style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  )
}

function AcceptQuoteForm({ quote, onCancel, onConfirm, submitting }) {
  const [eta, setEta] = useState(() => quote.quoted_lead_time_days
    ? new Date(Date.now() + quote.quoted_lead_time_days * 86400000).toISOString().slice(0, 10)
    : '')
  const [cost, setCost] = useState(quote.quoted_price || '')
  return (
    <div className="flex-1 grid grid-cols-2 gap-2">
      <input type="date" value={eta} onChange={e => setEta(e.target.value)}
        className="bg-surface-3 border border-token rounded-lg px-2 py-1.5 text-xs text-themed outline-none focus:border-emerald-500/50" />
      <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
        placeholder="Prezzo finale (€)"
        className="bg-surface-3 border border-token rounded-lg px-2 py-1.5 text-xs text-themed outline-none focus:border-emerald-500/50" />
      <button onClick={() => onConfirm({
        expected_at: eta ? new Date(eta).toISOString() : null,
        unit_cost: cost ? parseFloat(cost) : 0,
      })}
        disabled={submitting}
        className="press-scale flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold col-span-2">
        <Check size={13} /> {submitting ? 'Conferma…' : 'Conferma & ordina'}
      </button>
      <button onClick={onCancel} className="text-[11px] text-faint col-span-2 -mt-1">Annulla</button>
    </div>
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
