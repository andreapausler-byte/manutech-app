import { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, Activity, Wrench, AlertTriangle,
  Lightbulb, ArrowRight, Clock, BarChart3, Zap, Minus,
} from 'lucide-react'
import { db } from '../../lib/supabase'
import PageHeader from '../../components/layout/PageHeader'
import { findNavItem } from '../../lib/adminNav'
import { Spinner, EmptyState } from '../../components/ui'
import { CountUp } from '../../hooks/usePremiumUI'

const NAV_ITEM = findNavItem('optimization') || { label: 'Ottimizzazione', desc: 'KPI e insight per ridurre fermi macchina' }

// ── Helpers presentazione ─────────────────────────────────────────────────

function formatHours(h) {
  if (!h && h !== 0) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}g`
}

function formatDays(d) {
  if (!d && d !== 0) return '—'
  return `${d.toFixed(1)}g`
}

// Delta % rispetto periodo precedente. `betterWhen='down'` per metriche dove
// più basso è meglio (es. MTTR), 'up' per dove più alto è meglio (MTBF, ratio).
function computeDelta(curr, prev, betterWhen = 'up') {
  if (!prev || prev === 0) return { pct: null, isPositive: null, label: '—' }
  const pct = ((curr - prev) / prev) * 100
  const rounded = Math.round(pct * 10) / 10
  const isPositive = betterWhen === 'up' ? rounded > 0 : rounded < 0
  const sign = rounded > 0 ? '+' : ''
  return { pct: rounded, isPositive, label: `${sign}${rounded}%` }
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, subtitle, icon: Icon, color, delta }) {
  const deltaColor = delta?.isPositive === true ? '#22c55e'
    : delta?.isPositive === false ? '#ef4444'
    : 'var(--color-text-muted)'
  const DeltaIcon = delta?.pct == null ? Minus
    : delta.pct > 0 ? TrendingUp
    : delta.pct < 0 ? TrendingDown
    : Minus

  return (
    <div style={{
      position: 'relative',
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderTop: `3px solid ${color}`,
      borderRadius: 16,
      padding: '20px 20px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} style={{ color }} />
        </div>
        {delta && delta.pct != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 700, color: deltaColor,
            background: `${deltaColor}12`,
            padding: '4px 8px', borderRadius: 8,
          }}>
            <DeltaIcon size={12} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{delta.label}</span>
          </div>
        )}
      </div>
      <div style={{
        fontSize: 32, fontWeight: 800, color: 'var(--color-text)',
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1, marginBottom: 8,
      }}>
        {value}
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
        {subtitle}
      </p>
    </div>
  )
}

// ── Insight Card ──────────────────────────────────────────────────────────

function InsightCard({ insight, onAction }) {
  const colorMap = {
    warning: '#f59e0b',
    danger: '#ef4444',
    success: '#22c55e',
    info: '#3b82f6',
  }
  const color = colorMap[insight.severity] || colorMap.info

  return (
    <div style={{
      display: 'flex', gap: 14,
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderLeft: `4px solid ${color}`,
      borderRadius: 14, padding: 16,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Lightbulb size={18} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4, lineHeight: 1.35 }}>
          {insight.title}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
          {insight.body}
        </p>
        {insight.action && onAction && (
          <button
            onClick={() => onAction(insight.action)}
            className="press-scale"
            style={{
              marginTop: 10,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color,
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {insight.action.label}
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Generazione insight rule-based ────────────────────────────────────────

function generateInsights(d) {
  if (!d) return []
  const insights = []

  if (d.preventive_ratio_pct != null && d.preventive_ratio_pct < 30 && (d.corrective_count + d.preventive_count) >= 5) {
    insights.push({
      severity: 'warning',
      title: `Solo il ${d.preventive_ratio_pct.toFixed(0)}% degli interventi è preventivo`,
      body: `Negli ultimi 90gg hai ${d.corrective_count} guasti e ${d.preventive_count} interventi programmati. Aumenta la manutenzione preventiva sopra il 50% per ridurre i fermi imprevisti.`,
      action: { label: 'Vai a piani manutenzione', target: 'maintenance' },
    })
  } else if (d.preventive_ratio_pct >= 60) {
    insights.push({
      severity: 'success',
      title: `Manutenzione preventiva al ${d.preventive_ratio_pct.toFixed(0)}%`,
      body: `Sei sopra la media di settore (50%). Continua così: meno fermi imprevisti e MTTR più stabile nel tempo.`,
    })
  }

  if (d.overdue_plans > 0) {
    insights.push({
      severity: 'danger',
      title: `${d.overdue_plans} ${d.overdue_plans === 1 ? 'piano manutenzione scaduto' : 'piani manutenzione scaduti'}`,
      body: 'Piani con frequenza superata e nessun intervento recente. Ogni giorno in più aumenta il rischio di guasto critico.',
      action: { label: 'Apri piani in ritardo', target: 'maintenance' },
    })
  }

  if (d.top_machines && d.top_machines.length > 0) {
    const top = d.top_machines[0]
    if (top.incident_count >= 3) {
      insights.push({
        severity: 'warning',
        title: `${top.machine_name}: ${top.incident_count} guasti in 90gg`,
        body: `Ore-fermo accumulate: ${formatHours(top.downtime_hours)}. Macchina con il maggior impatto: indaga la causa radice o pianifica un intervento di fondo.`,
        action: { label: 'Apri segnalazioni macchina', target: 'reports' },
      })
    }
  }

  if (d.top_root_causes && d.top_root_causes.length > 0) {
    const top = d.top_root_causes[0]
    if (top.count >= 3) {
      insights.push({
        severity: 'info',
        title: `Causa ricorrente: "${top.cause}"`,
        body: `Si è ripetuta ${top.count} volte negli ultimi 90gg. Considera un intervento sistematico o una modifica di processo per eliminarla alla radice.`,
      })
    }
  }

  if (d.trend_30d) {
    const t = d.trend_30d
    if (t.corrective_prev > 0) {
      const delta = ((t.corrective_now - t.corrective_prev) / t.corrective_prev) * 100
      if (delta >= 25) {
        insights.push({
          severity: 'danger',
          title: `Guasti in aumento: +${delta.toFixed(0)}% negli ultimi 30gg`,
          body: `${t.corrective_now} guasti vs ${t.corrective_prev} del mese precedente. Verifica concentrazioni per macchina o turno per individuare la causa.`,
        })
      } else if (delta <= -25) {
        insights.push({
          severity: 'success',
          title: `Guasti in calo: ${delta.toFixed(0)}% negli ultimi 30gg`,
          body: `${t.corrective_now} guasti vs ${t.corrective_prev} del mese precedente. La strategia attuale sta funzionando.`,
        })
      }
    }
  }

  if (d.open_critical > 0) {
    insights.push({
      severity: 'danger',
      title: `${d.open_critical} ${d.open_critical === 1 ? 'segnalazione critica aperta' : 'segnalazioni critiche aperte'}`,
      body: 'Le segnalazioni con severità "critica" hanno priorità di risoluzione: ogni ora aperte aumenta il rischio operativo.',
      action: { label: 'Apri segnalazioni critiche', target: 'reports' },
    })
  }

  return insights
}

// ── Pagina ────────────────────────────────────────────────────────────────

export default function AdminOptimization({ onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const d = await db.getOptimizationDashboard()
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Errore caricamento KPI')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const insights = useMemo(() => generateInsights(data), [data])

  const handleInsightAction = (action) => {
    if (action?.target && onNavigate) onNavigate(action.target)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title="Impossibile caricare i KPI"
          subtitle={error}
        />
      </div>
    )
  }

  const totalInterventions = (data.preventive_count || 0) + (data.corrective_count || 0)
  const hasData = totalInterventions > 0 || (data.top_machines || []).length > 0

  if (!hasData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />
        <EmptyState
          icon={<BarChart3 size={32} />}
          title="Nessun dato negli ultimi 90 giorni"
          subtitle="I KPI di ottimizzazione si popolano man mano che le segnalazioni vengono chiuse e gli interventi registrati."
        />
      </div>
    )
  }

  const mttrDelta = computeDelta(data.mttr_hours, data.mttr_hours_prev, 'down')
  const mtbfDelta = computeDelta(data.mtbf_days, data.mtbf_days_prev, 'up')
  const ratioDelta = computeDelta(data.preventive_ratio_pct, data.preventive_ratio_prev_pct, 'up')

  const trend = data.trend_30d || {}
  const trendDelta = trend.corrective_prev > 0
    ? Math.round(((trend.corrective_now - trend.corrective_prev) / trend.corrective_prev) * 100)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="stagger-children">
      <PageHeader
        title={NAV_ITEM.label}
        description={`Finestra ${data.window_days || 90}gg · ${totalInterventions} interventi · ${data.total_machines} macchinari`}
      />

      {/* ── Riga 1: KPI principali ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard
          label="MTTR"
          subtitle="Tempo medio risoluzione"
          value={formatHours(data.mttr_hours)}
          icon={Clock}
          color="#3b82f6"
          delta={mttrDelta}
        />
        <KpiCard
          label="MTBF"
          subtitle="Tempo medio tra guasti"
          value={formatDays(data.mtbf_days)}
          icon={Activity}
          color="#8b5cf6"
          delta={mtbfDelta}
        />
        <KpiCard
          label="Preventiva"
          subtitle={`${data.preventive_count} programmati / ${data.corrective_count} guasti`}
          value={`${(data.preventive_ratio_pct || 0).toFixed(0)}%`}
          icon={Wrench}
          color="#22c55e"
          delta={ratioDelta}
        />
        <KpiCard
          label="Aperti urgenti"
          subtitle={`${data.open_critical} critici · ${data.open_high} alta priorità · ${data.overdue_plans} piani scaduti`}
          value={<CountUp value={data.open_critical + data.open_high} />}
          icon={AlertTriangle}
          color="#ef4444"
        />
      </div>

      {/* ── Riga 2: Insight automatici ── */}
      {insights.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={16} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
              Cosa fare adesso
            </h2>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
              padding: '2px 8px', borderRadius: 8,
              background: 'var(--color-surface-2)',
            }}>
              {insights.length} {insights.length === 1 ? 'insight' : 'insight'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} onAction={handleInsightAction} />
            ))}
          </div>
        </section>
      )}

      {/* ── Riga 3: Top macchine + Top cause ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <TopMachinesPanel machines={data.top_machines || []} onNavigate={onNavigate} />
        <TopCausesPanel causes={data.top_root_causes || []} />
      </div>

      {/* ── Riga 4: Trend 30gg ── */}
      <Trend30Panel trend={data.trend_30d} delta={trendDelta} />
    </div>
  )
}

// ── Sub-pannelli ──────────────────────────────────────────────────────────

function TopMachinesPanel({ machines, onNavigate }) {
  const max = Math.max(1, ...machines.map(m => m.downtime_hours || 0))

  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
        Top 5 macchine per ore-fermo
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
        Ultimi 90 giorni · ordina dove concentrare le risorse
      </p>
      {machines.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nessuna macchina con segnalazioni nel periodo.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {machines.map((m, i) => (
            <button
              key={m.machine_id || i}
              onClick={() => onNavigate?.('reports')}
              className="press-scale"
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '8px 0', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>
                  {i + 1}. {m.machine_name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  <span>{m.incident_count} {m.incident_count === 1 ? 'guasto' : 'guasti'}</span>
                  {m.open_count > 0 && (
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{m.open_count} aperti</span>
                  )}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'var(--color-text)' }}>
                    {formatHours(m.downtime_hours)}
                  </span>
                </div>
              </div>
              <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(m.downtime_hours / max) * 100}%`,
                  background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                  borderRadius: 3,
                }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TopCausesPanel({ causes }) {
  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
        Top 5 cause radice
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
        Ricorrenze nelle chiusure intervento
      </p>
      {causes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Nessuna causa registrata. Compila il campo &quot;causa radice&quot; alla chiusura per popolare questa lista.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {causes.map((c, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '10px 12px',
              background: 'var(--color-surface-2)',
              borderRadius: 10,
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.cause}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, color: 'var(--color-primary)',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '2px 10px', borderRadius: 8,
                background: 'var(--color-primary-glow)',
              }}>
                ×{c.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Trend30Panel({ trend, delta }) {
  if (!trend) return null
  const items = [
    { label: 'Guasti (correttivi)', curr: trend.corrective_now, prev: trend.corrective_prev, color: '#ef4444', betterDown: true },
    { label: 'Interventi programmati', curr: trend.preventive_now, prev: trend.preventive_prev, color: '#22c55e', betterDown: false },
  ]

  return (
    <div style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
            Trend ultimi 30 giorni
          </h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Confronto con i 30 giorni precedenti
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {items.map((it, i) => {
          const d = computeDelta(it.curr, it.prev, it.betterDown ? 'down' : 'up')
          const deltaColor = d.isPositive === true ? '#22c55e' : d.isPositive === false ? '#ef4444' : 'var(--color-text-muted)'
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: 16,
              background: 'var(--color-surface-2)',
              borderRadius: 12,
              borderLeft: `3px solid ${it.color}`,
            }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {it.label}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{
                  fontSize: 28, fontWeight: 800, color: 'var(--color-text)',
                  fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
                }}>
                  {it.curr ?? 0}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  vs {it.prev ?? 0}
                </span>
                {d.pct != null && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: deltaColor,
                    fontFamily: "'JetBrains Mono', monospace",
                    marginLeft: 'auto',
                  }}>
                    {d.label}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {delta != null && Math.abs(delta) >= 10 && (
        <p style={{
          fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 14,
          padding: '10px 12px',
          background: 'var(--color-surface-2)',
          borderRadius: 10,
        }}>
          {delta < 0
            ? `I guasti sono diminuiti del ${Math.abs(delta)}%. Continua sulla strategia attuale.`
            : `I guasti sono aumentati del ${delta}%. Verifica se è legato a uno specifico macchinario o a un cambio di processo.`
          }
        </p>
      )}
    </div>
  )
}
