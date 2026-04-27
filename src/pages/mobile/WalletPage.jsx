/**
 * WalletPage — Wallet ManuCoin per operatori e tecnici (mobile)
 *
 * Mostra: saldo, storico transazioni, catalogo premi, riscatti
 */

import { useState } from 'react'
import { useWallet } from '../../hooks/useWallet'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { Wallet, ArrowUpRight, ArrowDownLeft, Gift, Clock, CheckCircle, Truck, XCircle, ShoppingBag, ChevronRight, Coins } from 'lucide-react'

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

const CATEGORIES = {
  buono: { icon: '🎟️', color: '#f59e0b' },
  tempo_libero: { icon: '🏖️', color: '#22c55e' },
  gadget: { icon: '🎁', color: '#7c6aff' },
  formazione: { icon: '📚', color: '#06b6d4' },
  altro: { icon: '✨', color: '#a855f7' },
}

export default function WalletPage() {
  const { user } = useAuth()
  const { balance, transactions, config, rewards, redemptions, loading, redeem } = useWallet(user?.id)
  const [tab, setTab] = useState('wallet')
  const [redeeming, setRedeeming] = useState(null)
  const toast = useToast()
  const haptic = useHaptic()

  const handleRedeem = async (reward) => {
    if (balance < reward.cost) {
      toast.error(`Saldo insufficiente: hai ${balance} ${config.token_symbol}, servono ${reward.cost}`)
      return
    }
    setRedeeming(reward.id)
    haptic.medium()
    try {
      await redeem(reward.id)
      haptic.success()
      toast.success(`${reward.icon} ${reward.name} riscattato!`)
    } catch (e) {
      toast.error(e.message || 'Errore nel riscatto')
    }
    setRedeeming(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const eurValue = (balance * (config.token_value_eur || 0.50)).toFixed(2)

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
          {config.token_symbol || 'MC'} = {eurValue} EUR
        </p>
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
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nessun movimento ancora</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4 }}>Crea report per guadagnare {config.token_symbol}!</p>
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
                        = {tx.balance_after} {config.token_symbol}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
                const canAfford = balance >= r.cost
                const isRedeeming = redeeming === r.id
                return (
                  <div key={r.id} style={{
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 18, overflow: 'hidden',
                  }}>
                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 32 }}>{r.icon || '🎁'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{r.name}</h4>
                          {r.description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.description}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <span style={{
                              fontSize: 16, fontWeight: 800, color: canAfford ? 'var(--color-primary)' : 'var(--color-text-muted)',
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              {r.cost} {config.token_symbol}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                              ({(r.cost * (config.token_value_eur || 0.50)).toFixed(2)} EUR)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRedeem(r)}
                      disabled={!canAfford || isRedeeming}
                      className="press-scale"
                      style={{
                        width: '100%', padding: '13px 0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        fontSize: 15, fontWeight: 700,
                        color: canAfford ? '#fff' : 'var(--color-text-muted)',
                        background: canAfford ? 'var(--color-primary)' : 'var(--color-surface-2)',
                        border: 'none', borderTop: '1px solid var(--color-border)',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        opacity: isRedeeming ? 0.6 : 1,
                      }}>
                      {isRedeeming
                        ? <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        : canAfford
                          ? <><Gift size={18} /> Riscatta</>
                          : <>Servono {r.cost - balance} {config.token_symbol} in più</>
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
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 14, padding: '14px 16px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{r.reward_name}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: `${st.color}15`, color: st.color,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <StIcon size={11} /> {st.label}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {r.cost} {config.token_symbol} — {new Date(r.created_at).toLocaleDateString('it-IT')}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
