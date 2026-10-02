/**
 * AdminRewards — Gestione catalogo premi e configurazione ManuCoin
 *
 * Tab: Catalogo · Riscatti (approva / rifiuta con rimborso / consegnato) ·
 * Saldi (chi può riscattare cosa, bonus manuale) · Impostazioni token.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { TOKEN_REWARDS } from '../../hooks/useWallet'
import { useToast } from '../../hooks/useToast'
import { Modal } from '../../components/ui'
import { timeAgo } from '../../lib/constants'
import {
  Gift, Plus, Pencil, Trash2, Settings2, Save, Package, Eye, EyeOff,
  Clock, Star, CheckCircle, XCircle, Truck, Coins, Sparkles
} from 'lucide-react'

const CATEGORIES = {
  buono: { label: 'Buono', icon: '🎟️', color: '#f59e0b' },
  tempo_libero: { label: 'Tempo Libero', icon: '🏖️', color: '#22c55e' },
  gadget: { label: 'Gadget', icon: '🎁', color: '#7c6aff' },
  formazione: { label: 'Formazione', icon: '📚', color: '#06b6d4' },
  altro: { label: 'Altro', icon: '✨', color: '#a855f7' },
}

const REDEMPTION_STATUS = {
  pending: { label: 'In attesa', color: '#f59e0b', icon: Clock, order: 0 },
  approved: { label: 'Approvato', color: '#22c55e', icon: CheckCircle, order: 1 },
  delivered: { label: 'Consegnato', color: '#3b82f6', icon: Truck, order: 2 },
  rejected: { label: 'Rifiutato', color: '#ef4444', icon: XCircle, order: 3 },
}

const ROLE_LABELS = { operatore: 'Operatore', tecnico: 'Tecnico' }

// Premi di esempio, in euro: il costo in ManuCoin si calcola dal valore del
// token. Si creano nascosti: l'admin li rivede, li corregge e li rende visibili.
const STARTER_REWARDS = [
  { name: 'Colazione al bar', description: 'Caffè e brioche offerti', eur: 5, category: 'buono', icon: '☕' },
  { name: 'Buono carburante 20 €', description: null, eur: 20, category: 'buono', icon: '⛽' },
  { name: "Uscita anticipata di un'ora", description: 'Da concordare con il responsabile', eur: 15, category: 'tempo_libero', icon: '🏖️' },
  { name: 'Gadget aziendale', description: 'Felpa, borraccia o cappellino', eur: 25, category: 'gadget', icon: '🧢' },
  { name: 'Corso di formazione', description: "A scelta tra quelli proposti dall'azienda", eur: 100, category: 'formazione', icon: '📚' },
]

// Un utente è fornitore se ha un profilo supplier_profiles oppure (legacy)
// un'email @esterno.local: stessa regola di AdminUsers. I fornitori non hanno wallet.
const isSupplier = (u, supplierIds) => supplierIds.has(u.id) || u.email?.endsWith('@esterno.local')

const emptyReward = { name: '', description: '', cost: '', category: 'buono', icon: '🎁', stock: '', active: true }

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }
const inputStyle = { borderRadius: 12, padding: '12px 14px', fontSize: 14 }
const primaryBtn = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
  borderRadius: 12, fontSize: 14, fontWeight: 700,
  background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer',
}
const ghostBtn = {
  padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600,
  background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer',
}
const chipBtn = (color) => ({
  padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
  background: `${color}18`, color, border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 4,
})

export default function AdminRewards() {
  const toast = useToast()
  const [rewards, setRewards] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [people, setPeople] = useState([])
  const [balances, setBalances] = useState({})
  const [balancesError, setBalancesError] = useState(null)
  const [config, setConfig] = useState({ token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50, monthly_budget: '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('catalog')
  const [editingReward, setEditingReward] = useState(null)
  const [form, setForm] = useState(emptyReward)
  const [saving, setSaving] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [review, setReview] = useState(null)          // { redemption, status }
  const [reviewNote, setReviewNote] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [grant, setGrant] = useState(null)            // { userId, amount, reason }
  const [granting, setGranting] = useState(false)

  const symbol = config.token_symbol || 'MC'
  const tokenValue = parseFloat(config.token_value_eur) || 0.50

  const loadData = useCallback(async () => {
    try {
      const [rwd, cfg, red, users, suppliers] = await Promise.all([
        db.getAllRewards(),
        db.getTokenConfig(),
        db.getRedemptions(),
        db.getUsers(),
        db.getSupplierProfiles().catch(() => []),
      ])
      setRewards(rwd)
      if (cfg) setConfig(c => ({ ...c, ...cfg }))
      setRedemptions(red)
      const supplierIds = new Set(suppliers.map(s => s.user_id))
      setPeople(users.filter(u =>
        (u.role === 'operatore' || u.role === 'tecnico') &&
        (!u.status || u.status === 'active') &&
        !isSupplier(u, supplierIds)))
      setLoadError(null)
    } catch (e) {
      console.warn('[AdminRewards] Load error:', e)
      setLoadError(e.message)
    }
    try {
      setBalances(await db.getOrgBalances())
      setBalancesError(null)
    } catch (e) {
      setBalancesError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Numeri per capire se i prezzi sono raggiungibili ──
  const activeRewards = rewards.filter(r => r.active !== false && !(r.stock != null && r.stock <= 0))
  const cheapest = activeRewards.length ? Math.min(...activeRewards.map(r => r.cost)) : null
  const sortedPeople = useMemo(() => [...people].sort((a, b) =>
    (balances[b.id]?.balance || 0) - (balances[a.id]?.balance || 0) || a.name.localeCompare(b.name)
  ), [people, balances])
  const avgBalance = people.length
    ? Math.round(people.reduce((s, p) => s + (balances[p.id]?.balance || 0), 0) / people.length)
    : 0
  const avgEarnedMonth = people.length
    ? Math.round(people.reduce((s, p) => s + (balances[p.id]?.earned_month || 0), 0) / people.length)
    : 0
  const canRedeem = cheapest == null ? 0 : people.filter(p => (balances[p.id]?.balance || 0) >= cheapest).length

  const sortedRedemptions = useMemo(() => [...redemptions].sort((a, b) =>
    (REDEMPTION_STATUS[a.status]?.order ?? 9) - (REDEMPTION_STATUS[b.status]?.order ?? 9) ||
    new Date(b.created_at) - new Date(a.created_at)
  ), [redemptions])
  const pendingCount = redemptions.filter(r => r.status === 'pending').length

  // Spesa del mese: riscatti non rifiutati, in euro al valore attuale del token.
  const monthSpend = useMemo(() => {
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    const month = redemptions.filter(r => r.status !== 'rejected' && new Date(r.created_at) >= start)
    return { count: month.length, eur: month.reduce((s, r) => s + r.cost, 0) * tokenValue }
  }, [redemptions, tokenValue])

  // ── Impostazioni ──
  const handleSaveConfig = async () => {
    setConfigSaving(true)
    try {
      await db.saveTokenConfig({
        token_name: config.token_name,
        token_symbol: config.token_symbol,
        token_value_eur: parseFloat(config.token_value_eur) || 0.50,
        monthly_budget: config.monthly_budget ? parseFloat(config.monthly_budget) : null,
      })
      toast.success('Configurazione salvata')
    } catch (e) {
      toast.error(`Configurazione non salvata: ${e.message}`)
    }
    setConfigSaving(false)
  }

  // ── Catalogo ──
  const openNew = () => { setForm(emptyReward); setEditingReward('new') }
  const openEdit = (r) => {
    setForm({ ...r, description: r.description || '', stock: r.stock ?? '', cost: r.cost.toString(), active: r.active !== false })
    setEditingReward(r.id)
  }

  const handleSaveReward = async () => {
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        cost: parseInt(form.cost) || 10,
        category: form.category,
        icon: form.icon || '🎁',
        stock: form.stock !== '' && form.stock != null ? parseInt(form.stock) : null,
        active: form.active,
      }
      if (editingReward === 'new') {
        await db.createReward(data)
        toast.success(data.active ? 'Premio creato: è già nel catalogo' : 'Premio creato (nascosto)')
      } else {
        await db.updateReward(editingReward, data)
        toast.success('Premio aggiornato')
      }
      setEditingReward(null)
      await loadData()
    } catch (e) {
      toast.error(`Premio non salvato: ${e.message}`)
    }
    setSaving(false)
  }

  const handleToggleActive = async (r) => {
    try {
      await db.updateReward(r.id, { active: r.active === false })
      toast.success(r.active === false ? `${r.name}: visibile nel catalogo` : `${r.name}: nascosto`)
      await loadData()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (r) => {
    if (!confirm(`Eliminare "${r.name}"?\n\nLo storico dei riscatti resta. Per toglierlo solo dal catalogo usa "Nascondi".`)) return
    try {
      await db.deleteReward(r.id)
      toast.success('Premio eliminato')
      await loadData()
    } catch (e) {
      toast.error(`Premio non eliminato: ${e.message}`)
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      // Il catalogo admin mostra prima i più recenti: si creano dal più caro,
      // così in cima resta il più economico.
      for (const s of [...STARTER_REWARDS].reverse()) {
        await db.createReward({
          name: s.name, description: s.description, category: s.category, icon: s.icon,
          cost: Math.max(1, Math.round(s.eur / tokenValue)), stock: null, active: false,
        })
      }
      toast.success('Premi di esempio aggiunti: sono nascosti, rivedili e rendili visibili')
      await loadData()
    } catch (e) {
      toast.error(`Premi di esempio non aggiunti: ${e.message}`)
    }
    setSeeding(false)
  }

  // ── Riscatti ──
  const openReview = (redemption, status) => { setReview({ redemption, status }); setReviewNote('') }

  const handleReview = async (redemption, status, note = null) => {
    setReviewing(true)
    try {
      await db.reviewRedemption(redemption.id, status, note)
      if (status === 'rejected') toast.success(`Rifiutato: ${redemption.cost} ${symbol} restituiti a ${redemption.user_name || 'chi l\'ha riscattato'}`)
      else if (status === 'approved') toast.success(`Approvato: ${redemption.user_name || 'chi l\'ha riscattato'} riceve un avviso`)
      else toast.success('Segnato come consegnato')
      setReview(null)
      await loadData()
    } catch (e) {
      toast.error(e.message)
    }
    setReviewing(false)
  }

  // ── Saldi: bonus manuale ──
  const handleGrant = async () => {
    const amount = parseInt(grant?.amount)
    const reason = grant?.reason?.trim()
    if (!amount || amount <= 0 || !reason) return
    const person = people.find(p => p.id === grant.userId)
    setGranting(true)
    try {
      await db.creditTokens(grant.userId, amount, reason, 'admin_bonus', null, 'bonus')
      toast.success(`+${amount} ${symbol} a ${person?.name || 'utente'}`)
      setGrant(null)
      await loadData()
    } catch (e) {
      toast.error(`Bonus non assegnato: ${e.message}`)
    }
    setGranting(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, #7c6aff, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gift size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>Premi e {config.token_name || 'ManuCoin'}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Catalogo, riscatti e saldi del team</p>
          </div>
        </div>
        <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          {[
            { id: 'catalog', label: 'Catalogo' },
            { id: 'redemptions', label: pendingCount ? `Riscatti (${pendingCount})` : 'Riscatti' },
            { id: 'balances', label: 'Saldi' },
            { id: 'settings', label: 'Impostazioni' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t.id ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: tab === t.id ? '#fff' : 'var(--color-text-muted)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div style={{
          background: '#ef444415', border: '1px solid #ef444440', borderRadius: 14,
          padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16,
        }}>
          Dati non caricati del tutto: {loadError}
        </div>
      )}

      {/* ═══ TAB: Catalogo Premi ═══ */}
      {tab === 'catalog' && (
        <>
          <button onClick={openNew} className="press-scale"
            style={{ ...primaryBtn, padding: '12px 20px', borderRadius: 14, marginBottom: 20, gap: 8 }}>
            <Plus size={18} /> Nuovo Premio
          </button>

          {/* Editing form */}
          {editingReward && (
            <div style={{
              background: 'var(--color-card)', border: '2px solid var(--color-primary)',
              borderRadius: 18, padding: 24, marginBottom: 20,
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>
                {editingReward === 'new' ? 'Nuovo Premio' : 'Modifica Premio'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="es. Buono Amazon 25€" className="input-field w-full" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Descrizione</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Descrizione opzionale..." className="input-field w-full"
                    style={{ ...inputStyle, resize: 'none' }} rows={2} />
                </div>
                <div>
                  <label style={labelStyle}>Costo ({symbol}) *</label>
                  <input type="number" min="1" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="50" className="input-field w-full" style={inputStyle} />
                  {parseInt(form.cost) > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      = {(parseInt(form.cost) * tokenValue).toFixed(2)} € · il team guadagna in media {avgEarnedMonth} {symbol} al mese
                    </p>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="input-field w-full" style={inputStyle}>
                    {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Icona</label>
                  <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="🎁" className="input-field w-full" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Stock (vuoto = illimitato)</label>
                  <input type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                    placeholder="Illimitato" className="input-field w-full" style={inputStyle} />
                </div>
                <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  Visibile nel catalogo di operatori e tecnici
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={handleSaveReward} disabled={saving || !form.name || !form.cost}
                  className="press-scale"
                  style={{ ...primaryBtn, opacity: saving || !form.name || !form.cost ? 0.5 : 1 }}>
                  <Save size={16} /> {saving ? 'Salvando...' : 'Salva'}
                </button>
                <button onClick={() => setEditingReward(null)} style={ghostBtn}>
                  Annulla
                </button>
              </div>
            </div>
          )}

          {/* Rewards grid */}
          {rewards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎁</div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 16 }}>Nessun premio configurato</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
                Senza premi nel catalogo operatori e tecnici non possono riscattare nulla.
              </p>
              <button onClick={handleSeed} disabled={seeding} className="press-scale"
                style={{ ...chipBtn('#7c6aff'), margin: '16px auto 0', padding: '10px 16px', fontSize: 13 }}>
                <Sparkles size={15} /> {seeding ? 'Aggiungo...' : 'Aggiungi 5 premi di esempio (nascosti)'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {rewards.map(r => {
                const cat = CATEGORIES[r.category] || CATEGORIES.altro
                const hidden = r.active === false
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 18, padding: '18px 20px',
                    opacity: hidden ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 32 }}>{r.icon || '🎁'}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleToggleActive(r)} title={hidden ? 'Rendi visibile' : 'Nascondi'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                          {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button onClick={() => openEdit(r)} title="Modifica" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(r)} title="Elimina" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{r.name}</h4>
                    {r.description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{r.description}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                        background: `${cat.color}15`, color: cat.color,
                      }}>
                        {cat.icon} {cat.label}
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {r.cost} {symbol}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {hidden && <span style={{ fontWeight: 700 }}>Nascosto</span>}
                      {r.stock != null && (
                        <span style={{ color: r.stock <= 0 ? '#ef4444' : undefined, fontWeight: r.stock <= 0 ? 700 : 400 }}>
                          <Package size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                          {r.stock <= 0 ? 'Esaurito' : `${r.stock} disponibili`}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: Riscatti ═══ */}
      {tab === 'redemptions' && (
        <div>
          {redemptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 16 }}>Nessun riscatto ancora</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedRedemptions.map(r => {
                const st = REDEMPTION_STATUS[r.status] || REDEMPTION_STATUS.pending
                const StIcon = st.icon
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 16, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{r.reward_name}</p>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: `${st.color}15`, color: st.color,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <StIcon size={11} /> {st.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                        {r.user_name} — {r.cost} {symbol} — {timeAgo(r.created_at)}
                      </p>
                      {r.admin_note && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, fontStyle: 'italic' }}>"{r.admin_note}"</p>
                      )}
                    </div>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openReview(r, 'approved')} className="press-scale" style={chipBtn('#22c55e')}>
                          <CheckCircle size={14} /> Approva
                        </button>
                        <button onClick={() => openReview(r, 'rejected')} className="press-scale" style={chipBtn('#ef4444')}>
                          <XCircle size={14} /> Rifiuta
                        </button>
                      </div>
                    )}
                    {r.status === 'approved' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleReview(r, 'delivered')} disabled={reviewing} className="press-scale" style={chipBtn('#3b82f6')}>
                          <Truck size={14} /> Consegnato
                        </button>
                        <button onClick={() => openReview(r, 'rejected')} className="press-scale" style={chipBtn('#ef4444')}>
                          <XCircle size={14} /> Rifiuta
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Saldi ═══ */}
      {tab === 'balances' && (
        <div>
          {balancesError ? (
            <div style={{
              background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 14,
              padding: '14px 16px', fontSize: 13, color: 'var(--color-text-secondary)',
            }}>
              Saldi non disponibili: {balancesError}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                {[
                  { label: 'Saldo medio', value: `${avgBalance} ${symbol}` },
                  { label: 'Guadagnati in media questo mese', value: `${avgEarnedMonth} ${symbol}` },
                  { label: 'Premio più economico', value: cheapest == null ? '—' : `${cheapest} ${symbol}` },
                  { label: 'Possono riscattarlo', value: cheapest == null ? '—' : `${canRedeem} su ${people.length}` },
                ].map(k => (
                  <div key={k.label} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 14, padding: '12px 14px',
                  }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{k.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {sortedPeople.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Nessun operatore o tecnico attivo</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedPeople.map(p => {
                    const b = balances[p.id] || { balance: 0, earned_month: 0 }
                    const open = grant?.userId === p.id
                    return (
                      <div key={p.id} style={{
                        background: 'var(--color-card)', border: `1px solid ${open ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 14, padding: '12px 16px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{p.name}</p>
                            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                              {ROLE_LABELS[p.role]}{b.earned_month > 0 ? ` · +${b.earned_month} ${symbol} questo mese` : ' · niente questo mese'}
                            </p>
                          </div>
                          <span style={{
                            fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                            color: cheapest != null && b.balance >= cheapest ? '#22c55e' : 'var(--color-text)',
                          }}>
                            {b.balance} {symbol}
                          </span>
                          {!open && (
                            <button onClick={() => setGrant({ userId: p.id, amount: '', reason: '' })} className="press-scale" style={chipBtn('#f59e0b')}>
                              <Coins size={14} /> Bonus
                            </button>
                          )}
                        </div>
                        {open && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                            <input type="number" min="1" value={grant.amount} autoFocus
                              onChange={e => setGrant(g => ({ ...g, amount: e.target.value }))}
                              placeholder={symbol} className="input-field" style={{ ...inputStyle, width: 90, padding: '10px 12px' }} />
                            <input value={grant.reason}
                              onChange={e => setGrant(g => ({ ...g, reason: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleGrant() }}
                              placeholder="Perché (lo legge nel wallet e nell'avviso)" className="input-field"
                              style={{ ...inputStyle, flex: 1, minWidth: 200, padding: '10px 12px' }} />
                            <button onClick={handleGrant}
                              disabled={granting || !(parseInt(grant.amount) > 0) || !grant.reason.trim()}
                              style={{ ...primaryBtn, opacity: granting || !(parseInt(grant.amount) > 0) || !grant.reason.trim() ? 0.5 : 1 }}>
                              {granting ? 'Assegno...' : 'Assegna'}
                            </button>
                            <button onClick={() => setGrant(null)} style={ghostBtn}>Annulla</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: Impostazioni Token ═══ */}
      {tab === 'settings' && (
        <div style={{ maxWidth: 500 }}>
          <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 18, padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Settings2 size={18} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>Configurazione Token</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Nome token</label>
                <input value={config.token_name} onChange={e => setConfig(c => ({ ...c, token_name: e.target.value }))}
                  className="input-field w-full" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Simbolo</label>
                  <input value={config.token_symbol} onChange={e => setConfig(c => ({ ...c, token_symbol: e.target.value }))}
                    className="input-field w-full" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Valore (EUR)</label>
                  <input type="number" step="0.01" value={config.token_value_eur}
                    onChange={e => setConfig(c => ({ ...c, token_value_eur: e.target.value }))}
                    className="input-field w-full" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Budget mensile (EUR, indicativo)</label>
                <input type="number" value={config.monthly_budget || ''} placeholder="Nessun limite"
                  onChange={e => setConfig(c => ({ ...c, monthly_budget: e.target.value }))}
                  className="input-field w-full" style={inputStyle} />
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  Questo mese: {monthSpend.count} riscatti, {monthSpend.eur.toFixed(2)} €
                  {config.monthly_budget ? ` su ${parseFloat(config.monthly_budget).toFixed(2)} €` : ''} (esclusi i rifiutati).
                  Non blocca i riscatti: serve a tenere d'occhio la spesa.
                </p>
              </div>
            </div>

            <button onClick={handleSaveConfig} disabled={configSaving}
              className="press-scale"
              style={{ ...primaryBtn, padding: '12px 24px', marginTop: 20 }}>
              <Save size={16} /> {configSaving ? 'Salvando...' : 'Salva Configurazione'}
            </button>
          </div>

          {/* Come si guadagnano */}
          <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 18, padding: 24, marginTop: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Star size={16} style={{ color: '#f59e0b' }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>Come si guadagnano</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Operatori — ogni badge tenuto nel mese', amount: TOKEN_REWARDS.badge_unlock },
                { label: 'Operatori — ogni livello del mese (da Argento)', amount: TOKEN_REWARDS.level_up },
                { label: 'Tecnici — ogni collega a cui è servita una chiusura', amount: TOKEN_REWARDS.closure_helpful },
              ].map(r => (
                <div key={r.label} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
                  borderRadius: 10, background: 'var(--color-surface-2)',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>+{r.amount} {symbol}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
              Badge e livelli si calcolano sulle segnalazioni degli ultimi 30 giorni e pagano una volta per mese,
              quando l'operatore apre l'app.
              Il resto lo decidi tu, dal tab Saldi.
            </p>
          </div>
        </div>
      )}

      {/* ═══ Approva / Rifiuta ═══ */}
      <Modal open={!!review} onClose={() => !reviewing && setReview(null)}
        title={review?.status === 'rejected' ? 'Rifiuta il riscatto' : 'Approva il riscatto'} size="sm">
        {review && (
          <div>
            <p style={{ fontSize: 14, color: 'var(--color-text)' }}>
              <strong>{review.redemption.reward_name}</strong> — {review.redemption.user_name}, {review.redemption.cost} {symbol}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              {review.status === 'rejected'
                ? `I ${review.redemption.cost} ${symbol} tornano nel suo wallet e il pezzo torna disponibile. Riceve un avviso con il motivo.`
                : 'Riceve un avviso. Scrivi dove e quando ritirarlo, se serve.'}
            </p>
            <label style={{ ...labelStyle, marginTop: 14 }}>
              {review.status === 'rejected' ? 'Motivo (facoltativo)' : 'Nota per chi lo riceve (facoltativa)'}
            </label>
            <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} autoFocus
              placeholder={review.status === 'rejected' ? 'es. Buoni finiti, ne ordiniamo altri' : 'es. Ritiralo in ufficio venerdì'}
              className="input-field w-full" style={{ ...inputStyle, resize: 'none' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setReview(null)} disabled={reviewing} style={{ ...ghostBtn, flex: 1 }}>Annulla</button>
              <button onClick={() => handleReview(review.redemption, review.status, reviewNote)} disabled={reviewing}
                className="press-scale"
                style={{
                  ...primaryBtn, flex: 1, justifyContent: 'center',
                  background: review.status === 'rejected' ? '#ef4444' : '#22c55e',
                  opacity: reviewing ? 0.6 : 1,
                }}>
                {review.status === 'rejected' ? <><XCircle size={16} /> Rifiuta e rimborsa</> : <><CheckCircle size={16} /> Approva</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
