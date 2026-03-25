/**
 * AdminRewards — Gestione catalogo premi e configurazione ManuCoin
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { TOKEN_REWARDS } from '../../hooks/useWallet'
import {
  Gift, Plus, Pencil, Trash2, Settings2, Save, Package,
  Coffee, Clock, BookOpen, Star, CheckCircle, XCircle, Truck
} from 'lucide-react'

const CATEGORIES = {
  buono: { label: 'Buono', icon: '🎟️', color: '#f59e0b' },
  tempo_libero: { label: 'Tempo Libero', icon: '🏖️', color: '#22c55e' },
  gadget: { label: 'Gadget', icon: '🎁', color: '#7c6aff' },
  formazione: { label: 'Formazione', icon: '📚', color: '#06b6d4' },
  altro: { label: 'Altro', icon: '✨', color: '#a855f7' },
}

const REDEMPTION_STATUS = {
  pending: { label: 'In attesa', color: '#f59e0b', icon: Clock },
  approved: { label: 'Approvato', color: '#22c55e', icon: CheckCircle },
  delivered: { label: 'Consegnato', color: '#3b82f6', icon: Truck },
  rejected: { label: 'Rifiutato', color: '#ef4444', icon: XCircle },
}

const emptyReward = { name: '', description: '', cost: '', category: 'buono', icon: '🎁', stock: '', active: true }

export default function AdminRewards() {
  const { user } = useAuth()
  const [rewards, setRewards] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [config, setConfig] = useState({ token_name: 'ManuCoin', token_symbol: 'MC', token_value_eur: 0.50, monthly_budget: '' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('catalog')
  const [editingReward, setEditingReward] = useState(null)
  const [form, setForm] = useState(emptyReward)
  const [saving, setSaving] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [rwd, cfg, red] = await Promise.all([
        db.getAllRewards(),
        db.getTokenConfig(),
        db.getRedemptions(),
      ])
      setRewards(rwd)
      if (cfg) setConfig(c => ({ ...c, ...cfg }))
      setRedemptions(red)
    } catch (e) { console.warn('Load error:', e) }
    setLoading(false)
  }

  const handleSaveConfig = async () => {
    setConfigSaving(true)
    try {
      await db.saveTokenConfig({
        token_name: config.token_name,
        token_symbol: config.token_symbol,
        token_value_eur: parseFloat(config.token_value_eur) || 0.50,
        monthly_budget: config.monthly_budget ? parseFloat(config.monthly_budget) : null,
      })
    } catch (e) { console.warn('Save config error:', e) }
    setConfigSaving(false)
  }

  const openNew = () => { setForm(emptyReward); setEditingReward('new') }
  const openEdit = (r) => { setForm({ ...r, stock: r.stock ?? '', cost: r.cost.toString() }); setEditingReward(r.id) }

  const handleSaveReward = async () => {
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        cost: parseInt(form.cost) || 10,
        category: form.category,
        icon: form.icon || '🎁',
        stock: form.stock ? parseInt(form.stock) : null,
        active: form.active,
      }
      if (editingReward === 'new') {
        await db.createReward(data)
      } else {
        await db.updateReward(editingReward, data)
      }
      setEditingReward(null)
      await loadData()
    } catch (e) { console.warn('Save reward error:', e) }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo premio?')) return
    await db.deleteReward(id)
    await loadData()
  }

  const handleRedemptionStatus = async (id, status) => {
    await db.updateRedemptionStatus(id, status)
    await loadData()
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, #7c6aff, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gift size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>Premi e ManuCoin</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Configura token e catalogo premi</p>
          </div>
        </div>
        <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          {[
            { id: 'catalog', label: 'Catalogo' },
            { id: 'redemptions', label: `Riscatti (${redemptions.filter(r => r.status === 'pending').length})` },
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

      {/* ═══ TAB: Catalogo Premi ═══ */}
      {tab === 'catalog' && (
        <>
          <button onClick={openNew} className="press-scale"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px',
              borderRadius: 14, fontSize: 14, fontWeight: 700, marginBottom: 20,
              background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="es. Buono Amazon 25€" className="input-field w-full"
                    style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Descrizione</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Descrizione opzionale..." className="input-field w-full"
                    style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14, resize: 'none' }} rows={2} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Costo (MC) *</label>
                  <input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="50" className="input-field w-full"
                    style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Categoria</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="input-field w-full" style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }}>
                    {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Icona</label>
                  <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="🎁" className="input-field w-full"
                    style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Stock (vuoto = illimitato)</label>
                  <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                    placeholder="Illimitato" className="input-field w-full"
                    style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={handleSaveReward} disabled={saving || !form.name || !form.cost}
                  className="press-scale"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                    borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                    opacity: saving || !form.name || !form.cost ? 0.5 : 1,
                  }}>
                  <Save size={16} /> {saving ? 'Salvando...' : 'Salva'}
                </button>
                <button onClick={() => setEditingReward(null)}
                  style={{
                    padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                    background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer',
                  }}>
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
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>Crea il primo premio per il tuo team</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {rewards.map(r => {
                const cat = CATEGORIES[r.category] || CATEGORIES.altro
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 18, padding: '18px 20px',
                    opacity: r.active === false ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 32 }}>{r.icon || '🎁'}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
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
                        {r.cost} MC
                      </span>
                    </div>
                    {r.stock !== null && r.stock !== undefined && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                        <Package size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        {r.stock} disponibili
                      </p>
                    )}
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
              {redemptions.map(r => {
                const st = REDEMPTION_STATUS[r.status] || REDEMPTION_STATUS.pending
                const StIcon = st.icon
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 16, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                        {r.user_name} — {r.cost} MC — {new Date(r.created_at).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleRedemptionStatus(r.id, 'approved')}
                          className="press-scale"
                          style={{
                            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                            background: '#22c55e18', color: '#22c55e', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <CheckCircle size={14} /> Approva
                        </button>
                        <button onClick={() => handleRedemptionStatus(r.id, 'rejected')}
                          className="press-scale"
                          style={{
                            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                            background: '#ef444418', color: '#ef4444', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <XCircle size={14} /> Rifiuta
                        </button>
                      </div>
                    )}
                    {r.status === 'approved' && (
                      <button onClick={() => handleRedemptionStatus(r.id, 'delivered')}
                        className="press-scale"
                        style={{
                          padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                          background: '#3b82f618', color: '#3b82f6', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <Truck size={14} /> Consegnato
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
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
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Nome token</label>
                <input value={config.token_name} onChange={e => setConfig(c => ({ ...c, token_name: e.target.value }))}
                  className="input-field w-full" style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Simbolo</label>
                  <input value={config.token_symbol} onChange={e => setConfig(c => ({ ...c, token_symbol: e.target.value }))}
                    className="input-field w-full" style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Valore (EUR)</label>
                  <input type="number" step="0.01" value={config.token_value_eur}
                    onChange={e => setConfig(c => ({ ...c, token_value_eur: e.target.value }))}
                    className="input-field w-full" style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Budget mensile (EUR, opzionale)</label>
                <input type="number" value={config.monthly_budget || ''} placeholder="Nessun limite"
                  onChange={e => setConfig(c => ({ ...c, monthly_budget: e.target.value }))}
                  className="input-field w-full" style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }} />
              </div>
            </div>

            <button onClick={handleSaveConfig} disabled={configSaving}
              className="press-scale"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px',
                borderRadius: 12, fontSize: 14, fontWeight: 700, marginTop: 20,
                background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer',
              }}>
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
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>Token automatici per evento</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Badge sbloccato', amount: TOKEN_REWARDS.badge_unlock },
                { label: 'Livello raggiunto', amount: TOKEN_REWARDS.level_up },
                { label: 'Streak 7 giorni', amount: TOKEN_REWARDS.streak_7 },
                { label: 'Streak 30 giorni', amount: TOKEN_REWARDS.streak_30 },
                { label: 'Primo report', amount: TOKEN_REWARDS.first_report },
              ].map(r => (
                <div key={r.label} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
                  borderRadius: 10, background: 'var(--color-surface-2)',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>+{r.amount} MC</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
