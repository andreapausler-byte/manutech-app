/**
 * AdminLeaderboard — Classifica operatori con gamification
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useOperatorScore, SCORE_RULES, LEVELS, getLevel, getNextLevel } from '../../hooks/useOperatorScore'
import { Trophy, Medal, TrendingUp, Flame, Camera, Zap, FileText, AlertTriangle, ChevronDown, Star, Award } from 'lucide-react'

const PERIODS = [
  { id: 'week', label: 'Questa settimana' },
  { id: 'month', label: 'Questo mese' },
  { id: 'all', label: 'Sempre' },
]

function PodiumCard({ operator, rank, expanded, onToggle }) {
  if (!operator) return null
  const level = operator.level
  const podiumColors = {
    1: { bg: 'linear-gradient(135deg, #ffd700 0%, #f59e0b 100%)', border: '#ffd70060', shadow: 'rgba(255,215,0,0.25)' },
    2: { bg: 'linear-gradient(135deg, #c0c0c0 0%, #94a3b8 100%)', border: '#c0c0c060', shadow: 'rgba(192,192,192,0.25)' },
    3: { bg: 'linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)', border: '#cd7f3260', shadow: 'rgba(205,127,50,0.25)' },
  }
  const p = podiumColors[rank]

  return (
    <div
      onClick={onToggle}
      style={{
        flex: 1,
        background: 'var(--color-card)',
        border: `2px solid ${p.border}`,
        borderRadius: 20,
        padding: rank === 1 ? '24px 16px' : '18px 14px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        boxShadow: `0 4px 20px ${p.shadow}`,
        order: rank === 1 ? 0 : rank === 2 ? -1 : 1,
      }}
      className="press-scale"
    >
      {/* Medal */}
      <div style={{
        width: rank === 1 ? 56 : 48, height: rank === 1 ? 56 : 48,
        borderRadius: '50%', margin: '0 auto 10px',
        background: p.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 16px ${p.shadow}`,
      }}>
        <span style={{ fontSize: rank === 1 ? 26 : 22 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>
      </div>

      <p style={{ fontSize: rank === 1 ? 16 : 14, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3 }}>
        {operator.name?.split(' ')[0]}
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
        {operator.name?.split(' ').slice(1).join(' ')}
      </p>

      {/* Score */}
      <p style={{
        fontSize: rank === 1 ? 28 : 22, fontWeight: 800, marginTop: 8,
        color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace",
      }}>
        {operator.score}
      </p>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>punti</p>

      {/* Level badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginTop: 8, padding: '4px 10px', borderRadius: 8,
        background: `${level.color}18`, color: level.color,
        fontSize: 12, fontWeight: 700,
      }}>
        {level.icon} {level.label}
      </div>

      {/* Streak */}
      {operator.streak > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          marginTop: 6, fontSize: 12, fontWeight: 600, color: '#f59e0b',
        }}>
          <Flame size={14} /> {operator.streak}g streak
        </div>
      )}

      {/* Breakdown (expanded) */}
      {expanded && (
        <div style={{
          marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--color-border)',
          textAlign: 'left', fontSize: 12,
        }}>
          {Object.entries(operator.breakdown).filter(([, v]) => v > 0).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--color-text-secondary)' }}>
              <span>{{ reports: 'Report', quick: 'Quick', photos: 'Foto', severity: 'Severità', detailed: 'Dettaglio', streak: 'Streak' }[key]}</span>
              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>+{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LeaderboardRow({ operator, expanded, onToggle }) {
  const level = operator.level

  return (
    <div
      onClick={onToggle}
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: '14px 18px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      className="press-scale"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Rank */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'var(--color-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: 'var(--color-text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {operator.rank}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{operator.name}</p>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: `${level.color}18`, color: level.color,
            }}>
              {level.icon} {level.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{operator.reportCount} report</span>
            {operator.streak > 0 && (
              <span style={{ fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Flame size={12} /> {operator.streak}g
              </span>
            )}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
            {operator.score}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>punti</p>
        </div>
      </div>

      {/* Progress bar */}
      {operator.nextLevel && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            <span>{level.icon} {level.label}</span>
            <span>{operator.nextLevel.icon} {operator.nextLevel.label} ({operator.nextLevel.min} pt)</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: `linear-gradient(90deg, ${level.color}, ${operator.nextLevel.color})`,
              width: `${operator.progress}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      )}

      {/* Breakdown (expanded) */}
      {expanded && (
        <div style={{
          marginTop: 12, padding: '12px 0 0',
          borderTop: '1px solid var(--color-border)',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          {[
            { label: 'Report', value: operator.breakdown.reports, icon: FileText, color: '#7c6aff' },
            { label: 'Quick', value: operator.breakdown.quick, icon: Zap, color: '#f59e0b' },
            { label: 'Foto', value: operator.breakdown.photos, icon: Camera, color: '#06b6d4' },
            { label: 'Severità', value: operator.breakdown.severity, icon: AlertTriangle, color: '#ef4444' },
            { label: 'Dettaglio', value: operator.breakdown.detailed, icon: FileText, color: '#22c55e' },
            { label: 'Streak', value: operator.breakdown.streak, icon: Flame, color: '#f59e0b' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} style={{
              textAlign: 'center', padding: '8px 4px', borderRadius: 10,
              background: `${color}08`,
            }}>
              <Icon size={14} style={{ color, margin: '0 auto 4px', display: 'block' }} />
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text)' }}>+{value}</p>
              <p style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminLeaderboard() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    db.getReports().then(r => { setReports(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const { leaderboard } = useOperatorScore(reports, period)
  const top3 = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, #ffd700, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(255,215,0,0.25)',
          }}>
            <Trophy size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>Classifica Operatori</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{leaderboard.length} operatori attivi</p>
          </div>
        </div>

        {/* Period selector */}
        <div style={{
          display: 'flex', borderRadius: 12, overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: period === p.id ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: period === p.id ? '#fff' : 'var(--color-text-muted)',
                transition: 'all 0.2s',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Regole punteggio */}
      <div style={{
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 16, padding: '16px 20px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Star size={16} style={{ color: '#f59e0b' }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>Come si guadagnano i punti</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {[
            { label: 'Report creato', pts: SCORE_RULES.reportCreated, icon: '📋' },
            { label: 'Quick report', pts: SCORE_RULES.quickReportBonus, icon: '⚡' },
            { label: 'Ogni foto', pts: SCORE_RULES.photoBonus, icon: '📸' },
            { label: 'Severità alta', pts: SCORE_RULES.highSeverityBonus, icon: '🔴' },
            { label: 'Descriz. dettagliata', pts: SCORE_RULES.detailedDescBonus, icon: '📝' },
            { label: 'Streak/giorno', pts: SCORE_RULES.streakBonusPerDay, icon: '🔥' },
          ].map(r => (
            <div key={r.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 10, background: 'var(--color-surface-2)',
            }}>
              <span>{r.icon}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1 }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>+{r.pts}</span>
            </div>
          ))}
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <p style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>Nessun report nel periodo selezionato</p>
        </div>
      ) : (
        <>
          {/* Podio top 3 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
            {[2, 1, 3].map(rank => (
              <PodiumCard
                key={rank}
                operator={top3[rank - 1]}
                rank={rank}
                expanded={expandedId === top3[rank - 1]?.id}
                onToggle={() => setExpandedId(expandedId === top3[rank - 1]?.id ? null : top3[rank - 1]?.id)}
              />
            ))}
          </div>

          {/* Livelli legenda */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
            padding: '12px 16px', borderRadius: 14,
            background: 'var(--color-surface-2)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Award size={14} /> Livelli:
            </span>
            {LEVELS.map(l => (
              <span key={l.id} style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                background: `${l.color}18`, color: l.color,
              }}>
                {l.icon} {l.label} ({l.min}+)
              </span>
            ))}
          </div>

          {/* Resto classifica */}
          {rest.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rest.map(op => (
                <LeaderboardRow
                  key={op.id}
                  operator={op}
                  expanded={expandedId === op.id}
                  onToggle={() => setExpandedId(expandedId === op.id ? null : op.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
