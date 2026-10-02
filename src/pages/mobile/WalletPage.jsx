/**
 * WalletPage — Wallet ManuCoin per operatori e tecnici (mobile)
 *
 * Mostra: saldo, storico transazioni, catalogo premi, riscatti
 */

import { useMemo, useState } from 'react'
import { useWallet, TOKEN_REWARDS } from '../../hooks/useWallet'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { Modal } from '../../components/ui'
import { timeAgo } from '../../lib/constants'
import { Wallet, ArrowUpRight, ArrowDownLeft, Gift, Clock, CheckCircle, Truck, XCircle, ShoppingBag, Coins, Sparkles } from 'lucide-react'

const TX_TYPES = {
  earn: { label: 'Guadagnato', color: '#22c55e', icon: ArrowDownLeft, sign: '+' },
  bonus: { label: 'Bonus', color: '#f59e0b', icon: ArrowDownLeft, sign: '+' },
  refund: { label: 'Rimborso', color: '#06b6d4', icon: ArrowDownLeft, sign: '+' },
  spend: { label: 'Speso', color: '#ef4444', icon: ArrowUpRight, sign: '-' },
}

const RED_STATUS = {
  pending: { label: 'In attesa', color: '#f59e0b', icon: Clock },
  approved: { label: 'Approvato', color: '#22c55e', icon: CheckCircle },
  delivered: { label: 'Consegnato', color: '#3b82f6', icon: Truck },
  rejected: { label: 'Rifiutato', color: '#ef4444', icon: XCircle },
}

// Come si guadagnano, per ruolo. Gli importi sono quelli che il server accetta.
const EARN_WAYS = {
  operatore: [
    { icon: '🏅', label: 'Ogni badge tenuto nel mese', amount: TOKEN_REWARDS.badge_unlock },
    { icon: '🥈', label: 'Ogni livello del mese, da Argento in su', amount: TOKEN_REWARDS.level_up },
  ],
  tecnico: [
    { icon: '🙌', label: 'Ogni collega a cui è servita una tua chiusura', amount: TOKEN_REWARDS.closure_helpful },
  ],
}

const buttonSpinner = (
  <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
)

export default function WalletPage() {
  const { user } = useAuth()
  const { balance, transactions, config, rewards, redemptions, loading, redeem } = useWallet(user?.id)
  const [tab, setTab] = useState('wallet')
  const [confirming, setConfirming] = useState(null)
  const [redeeming, setRedeeming] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

  const symbol = config.token_symbol || 'MC'
  const tokenValue = config.token_value_eur || 0.50

  // Guadagnati nel mese di calendario (accrediti e bonus, non i rimborsi).
  const earnedThisMonth = useMemo(() => {
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    return transactions
      .filter(tx => (tx.type === 'earn' || tx.type === 'bonus') && new Date(tx.created_at) >= start)
      .reduce((sum, tx) => sum + tx.amount, 0)
  }, [transactions])

  const openConfirm = (reward) => {
    haptic.light()
    setConfirming(reward)
  }

  const handleRedeem = async () => {
    const reward = confirming
    if (!reward) return
    setRedeeming(true)
    haptic.medium()
    try {
      await redeem(reward.id, user)
      toast.success(`${reward.icon || '🎁'} Richiesta inviata: l'admin la approva e te lo consegna`)
      setConfirming(null)
      setTab('orders')
    } catch (e) {
      toast.error(e.message || 'Errore nel riscatto')
    }
    setRedeeming(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const eurValue = (balance * tokenValue).toFixed(2)
  const earnWays = EARN_WAYS[user?.role] || []

  return (
    <div style={{ padding: '0 4vw 16px' }}>
      {/* ═══ Saldo Card ═══ */}
      <div style={{
        marginTop: 16, borderRadius: 24, padding: '28px 24px',
        background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
        color: '#fff', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(124,106,255,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <Coins size={22} />
          <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>{config.token_name || 'ManuCoin'}</span>
        </div>
        <p style={{
          fontSize: 48, fontWeight: 800, lineHeight: 1,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {balance}
        </p>
        <p style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
          {symbol} = {eurValue} EUR
        </p>
        {earnedThisMonth > 0 && (
          <p style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, marginTop: 8 }}>
            +{earnedThisMonth} {symbol} questo mese
          </p>
        )}
      </div>

      {/* ═══ Tab switcher ═══ */}
      <div style={{
        display: 'flex', gap: 4, marginTop: 20, marginBottom: 16,
        background: 'var(--color-surface-2)', borderRadius: 14, padding: 4,
      }}>
        {[
          { id: 'wallet', label: 'Movimenti', icon: Wallet },
          { id: 'shop', label: 'Premi', icon: Gift },
          { id: 'orders', label: 'Riscatti', icon: ShoppingBag },
        ].map(t => (
          <button key={t.id} onClick={() => { haptic.light(); setTab(t.id) }}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: tab === t.id ? 'var(--color-card)' : 'transparent',
              color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none', cursor: 'pointer',
              boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s',
            }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Movimenti ═══ */}
      {tab === 'wallet' && (
        <div>
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nessun movimento ancora</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {transactions.map(tx => {
                const t = TX_TYPES[tx.type] || TX_TYPES.earn
                const TxIcon = t.icon
                return (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 14, padding: '12px 16px',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `${t.color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TxIcon size={18} style={{ color: t.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.reason}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {new Date(tx.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{
                        fontSize: 16, fontWeight: 800, color: t.color,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {t.sign}{tx.amount}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                        = {tx.balance_after} {symbol}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Come si guadagnano */}
          <div style={{
            marginTop: 16, background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 16, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Sparkles size={15} style={{ color: '#f59e0b' }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Come si guadagnano</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...earnWays, { icon: '🎉', label: "Bonus dall'amministratore", amount: null }].map(w => (
                <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{w.icon}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>{w.label}</span>
                  {w.amount != null && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}>
                      +{w.amount}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {user?.role === 'operatore' && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10 }}>
                Badge e livello si calcolano sulle tue segnalazioni degli ultimi 30 giorni e si accreditano quando apri l'app, una volta al mese.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB: Catalogo Premi ═══ */}
      {tab === 'shop' && (
        <div>
          {rewards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nessun premio disponibile</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4 }}>I premi saranno aggiunti dall'admin</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rewards.map(r => {
                const soldOut = r.stock != null && r.stock <= 0
                const canAfford = balance >= r.cost
                const available = canAfford && !soldOut
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 18, overflow: 'hidden', opacity: soldOut ? 0.6 : 1,
                  }}>
                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 32 }}>{r.icon || '🎁'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{r.name}</h4>
                          {r.description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.description}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 16, fontWeight: 800, color: canAfford ? 'var(--color-primary)' : 'var(--color-text-muted)',
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              {r.cost} {symbol}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                              ({(r.cost * tokenValue).toFixed(2)} EUR)
                            </span>
                            {r.stock != null && r.stock > 0 && r.stock <= 5 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                                {r.stock === 1 ? 'Ultimo rimasto' : `Ultimi ${r.stock}`}
                              </span>
                            )}
                          </div>
                          {!canAfford && !soldOut && (
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-2)', marginTop: 8, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, (balance / r.cost) * 100)}%`, background: 'var(--color-primary)', borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => openConfirm(r)}
                      disabled={!available}
                      className="press-scale"
                      style={{
                        width: '100%', padding: '13px 0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        fontSize: 15, fontWeight: 700,
                        color: available ? '#fff' : 'var(--color-text-muted)',
                        background: available ? 'var(--color-primary)' : 'var(--color-surface-2)',
                        border: 'none', borderTop: '1px solid var(--color-border)',
                        cursor: available ? 'pointer' : 'not-allowed',
                      }}>
                      {soldOut
                        ? 'Esaurito'
                        : canAfford
                          ? <><Gift size={18} /> Riscatta</>
                          : <>Servono {r.cost - balance} {symbol} in più</>
                      }
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: I miei Riscatti ═══ */}
      {tab === 'orders' && (
        <div>
          {redemptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nessun riscatto ancora</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {redemptions.map(r => {
                const st = RED_STATUS[r.status] || RED_STATUS.pending
                const StIcon = st.icon
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 14, padding: '14px 16px',
                  }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{r.reward_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: `${st.color}15`, color: st.color,
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <StIcon size={11} /> {st.label}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {r.cost} {symbol} — {timeAgo(r.created_at)}
                      </span>
                    </div>
                    {r.status === 'pending' && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                        L'admin deve ancora approvarlo.
                      </p>
                    )}
                    {r.status === 'rejected' && (
                      <p style={{ fontSize: 12, color: '#06b6d4', marginTop: 6 }}>
                        {r.cost} {symbol} restituiti nel wallet.
                      </p>
                    )}
                    {r.admin_note && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, fontStyle: 'italic' }}>
                        "{r.admin_note}"
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Conferma riscatto ═══ */}
      <Modal open={!!confirming} onClose={() => !redeeming && setConfirming(null)} title="Confermi il riscatto?" size="sm">
        {confirming && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 36 }}>{confirming.icon || '🎁'}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{confirming.name}</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-primary)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                  {confirming.cost} {symbol}
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 16,
              padding: '10px 12px', borderRadius: 12, background: 'var(--color-surface-2)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Saldo dopo il riscatto</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                {balance - confirming.cost} {symbol}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12, lineHeight: 1.5 }}>
              L'admin riceve la richiesta, la approva e ti consegna il premio. Se la rifiuta, i {config.token_name || 'ManuCoin'} tornano nel wallet.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setConfirming(null)} disabled={redeeming}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, fontSize: 15, fontWeight: 600,
                  background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer',
                }}>
                Annulla
              </button>
              <button onClick={handleRedeem} disabled={redeeming} className="press-scale"
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: redeeming ? 0.7 : 1,
                }}>
                {redeeming ? buttonSpinner : <><Gift size={18} /> Riscatta</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
