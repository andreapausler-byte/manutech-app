import { useState, useEffect, useMemo } from 'react'
import { useDraggable } from '../../../hooks/useDraggable'
import { STATUS, SEVERITY, timeAgo } from '../../../lib/constants'
import { db } from '../../../lib/supabase'
import { Badge } from '../../../components/ui'
import {
  Edit, Trash2, FileText, Video, Cog, X, QrCode, Download, Camera,
  Calendar, Hash, Factory, Building, ClipboardList, ChevronRight,
  Wrench, Shield, Plus, Play, Upload, Activity, LayoutDashboard,
  AlertTriangle, Clock, Filter, Package, FolderOpen,
  Star, Sparkles, BookOpen, Image as ImageIcon, FileSignature, ShieldCheck,
} from 'lucide-react'
import MachineDocumentationTab from './MachineDocumentationTab'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft }
}

const healthColors = {
  ottimo: { bg: '#22c55e', ring: '#22c55e40' },
  buono: { bg: '#7c6aff', ring: '#7c6aff40' },
  attenzione: { bg: '#f59e0b', ring: '#f59e0b40' },
  critico: { bg: '#ef4444', ring: '#ef444440' },
}

const healthLabels = {
  ottimo: 'Ottimo',
  buono: 'Buono',
  attenzione: 'Attenzione',
  critico: 'Critico',
}

// ── System status derivato dall'assessment per il banner hero ──
function getSystemStatus(assessment, criticalReports, activeReports) {
  if (criticalReports.length > 0) {
    return { label: 'CRITICO', color: '#ef4444', bgClass: 'bg-red-500/10', borderClass: 'border-red-500/30', dotClass: 'bg-red-500' }
  }
  if (!assessment) {
    return { label: 'NON VALUTATO', color: '#64748b', bgClass: 'bg-slate-500/10', borderClass: 'border-slate-500/30', dotClass: 'bg-slate-500' }
  }
  if (assessment.status === 'ottimo') {
    return { label: 'OPERATIVO', color: '#22c55e', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', dotClass: 'bg-emerald-500' }
  }
  if (assessment.status === 'buono') {
    return { label: 'OPERATIVO', color: '#22c55e', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', dotClass: 'bg-emerald-500' }
  }
  if (assessment.status === 'attenzione' || activeReports.length > 0) {
    return { label: 'ATTENZIONE', color: '#f59e0b', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/30', dotClass: 'bg-amber-500' }
  }
  return { label: 'CRITICO', color: '#ef4444', bgClass: 'bg-red-500/10', borderClass: 'border-red-500/30', dotClass: 'bg-red-500' }
}

// ── Overview Tab: hero banner, health index, specs, severity, next maintenance, last log ──
function OverviewTab({
  sel, assessment, assessmentLoading,
  activeReports, criticalReports, machineReports,
  plans, logs, nextMaintenance, components,
  onOpenReport, onOpenPlanForm, onOpenLogForm, setDetailTab,
}) {
  // ── Severity distribution ──
  const severityBreakdown = useMemo(() => {
    const counts = { critica: 0, alta: 0, media: 0, bassa: 0 }
    activeReports.forEach(r => {
      if (counts[r.severity] !== undefined) counts[r.severity] += 1
    })
    const max = Math.max(1, counts.critica, counts.alta, counts.media, counts.bassa)
    return [
      { key: 'critica', label: 'Critica', value: counts.critica, color: '#ef4444', pct: (counts.critica / max) * 100 },
      { key: 'alta',    label: 'Alta',    value: counts.alta,    color: '#f97316', pct: (counts.alta / max) * 100 },
      { key: 'media',   label: 'Media',   value: counts.media,   color: '#f59e0b', pct: (counts.media / max) * 100 },
      { key: 'bassa',   label: 'Bassa',   value: counts.bassa,   color: '#22c55e', pct: (counts.bassa / max) * 100 },
    ]
  }, [activeReports])

  // ── Last intervention (log più recente) ──
  const lastLog = useMemo(() => {
    if (!logs || logs.length === 0) return null
    const sorted = [...logs].sort((a, b) => new Date(b.performed_at || b.created_at) - new Date(a.performed_at || a.created_at))
    return sorted[0]
  }, [logs])

  // ── Stats derivati ──
  const totalReports = machineReports.length
  const resolvedReports = totalReports - activeReports.length
  const resolveRate = totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : null

  const systemStatus = getSystemStatus(assessment, criticalReports, activeReports)
  const healthScore = assessment?.health_score ?? null
  const healthDashArray = 452
  const healthDashOffset = healthScore != null ? healthDashArray * (1 - healthScore / 100) : healthDashArray

  // ── Tech specs (filtrati a quelli valorizzati) ──
  const specs = [
    { label: 'Produttore',     value: sel.manufacturer },
    { label: 'Modello',        value: sel.model },
    { label: 'Seriale',        value: sel.serial_number },
    { label: 'Anno',           value: sel.year },
    { label: 'Reparto',        value: sel.department },
    { label: 'Posizione',      value: sel.location },
    { label: 'Criticità',      value: sel.criticality },
    { label: 'Stato',          value: sel.status },
  ].filter(s => s.value != null && s.value !== '')

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Hero banner: nome + zona + badge stato ── */}
      <div
        className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(16,185,129,0.04))',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-themed truncate">{sel.name}</h2>
          <p className="text-xs text-muted mt-0.5">
            {[sel.department, sel.location].filter(Boolean).join(' · ') || 'Telemetria in tempo reale'}
          </p>
        </div>
        <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full border ${systemStatus.bgClass} ${systemStatus.borderClass} shrink-0`}>
          <span className={`w-2 h-2 rounded-full ${systemStatus.dotClass} animate-pulse`} />
          <span className="text-[11px] font-bold tracking-wider" style={{ color: systemStatus.color }}>
            {systemStatus.label}
          </span>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* ─── Sinistra: Specs + Severity ─── */}
        <div className="lg:col-span-7 space-y-4">

          {/* Technical Specifications */}
          <div className="bg-surface-2 rounded-2xl p-5 border border-token">
            <div className="flex items-center gap-2 mb-4">
              <Hash size={15} className="text-muted" />
              <h3 className="text-sm font-bold text-themed uppercase tracking-wider">Specifiche tecniche</h3>
            </div>
            {specs.length === 0 ? (
              <p className="text-xs text-faint italic">Nessuna specifica tecnica inserita. Usa il pulsante modifica per aggiungerne.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                {specs.map((s, i) => (
                  <div key={s.label} className={i < specs.length - (specs.length % 3 || 3) ? 'pb-3 border-b border-white/5' : ''}>
                    <span className="block text-[10px] text-faint font-bold uppercase mb-1 tracking-wider">{s.label}</span>
                    <span className="text-sm font-medium text-themed capitalize">{String(s.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Severity Distribution */}
          <div className="bg-surface-2 rounded-2xl p-5 border border-token">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-muted" />
                <h3 className="text-sm font-bold text-themed uppercase tracking-wider">Distribuzione severità</h3>
              </div>
              <span className="text-[11px] text-faint">
                {activeReports.length} segnalazion{activeReports.length === 1 ? 'e' : 'i'} attiv{activeReports.length === 1 ? 'a' : 'e'}
              </span>
            </div>
            <div className="space-y-3">
              {severityBreakdown.map(s => (
                <div key={s.key}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-secondary">{s.label}</span>
                    <span className="font-bold" style={{ color: s.value > 0 ? s.color : 'var(--color-text-muted)' }}>
                      {s.value}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-3)' }}>
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${s.value > 0 ? Math.max(5, s.pct) : 0}%`, background: s.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {totalReports > 0 && (
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-faint">Tasso di risoluzione storico</span>
                <span className="font-bold text-emerald-400">{resolveRate}%</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Destra: Health Index + Quick Actions ─── */}
        <div className="lg:col-span-5 space-y-4">

          {/* Health Index Circular */}
          <div className="bg-surface-2 rounded-2xl p-5 border border-token flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-themed uppercase tracking-wider">Health Index</h3>
              <Activity size={15} className="text-cyan-400" />
            </div>
            <div className="relative flex items-center justify-center py-4">
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
                <circle cx="80" cy="80" r="72" fill="transparent" stroke="var(--color-surface-3)" strokeWidth="8" />
                {healthScore != null && (
                  <circle
                    cx="80" cy="80" r="72"
                    fill="transparent"
                    stroke={healthColors[assessment.status]?.bg || '#3b82f6'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={healthDashArray}
                    strokeDashoffset={healthDashOffset}
                    style={{ filter: `drop-shadow(0 0 8px ${healthColors[assessment.status]?.bg || '#3b82f6'}80)`, transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {assessmentLoading ? (
                  <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                ) : healthScore != null ? (
                  <>
                    <span className="text-4xl font-black text-themed leading-none">{healthScore}%</span>
                    <span className="text-[10px] text-faint font-bold uppercase mt-1 tracking-wider">
                      {healthLabels[assessment.status] || assessment.status}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-faint leading-none">N/D</span>
                    <span className="text-[10px] text-faint uppercase mt-1">Nessun dato</span>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="block text-[9px] text-faint font-bold uppercase mb-0.5 tracking-wider">Piani</span>
                <span className="text-lg font-black text-violet-400">{plans.length}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="block text-[9px] text-faint font-bold uppercase mb-0.5 tracking-wider">Componenti</span>
                <span className="text-lg font-black text-cyan-400">{components.length}</span>
              </div>
            </div>
          </div>

          {/* Quick action: request intervention */}
          <button
            onClick={() => onOpenLogForm?.()}
            className="w-full flex flex-col items-center justify-center gap-2 p-5 rounded-2xl transition-all border press-scale"
            style={{
              background: 'rgba(59,130,246,0.08)',
              borderColor: 'rgba(59,130,246,0.3)',
              color: 'var(--color-primary)',
            }}
          >
            <Wrench size={24} />
            <span className="font-bold text-[11px] tracking-wider uppercase">Registra intervento</span>
          </button>
        </div>
      </div>

      {/* ── Bottom row: Next maintenance + Last log ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Next maintenance */}
        <div className="bg-surface-2 rounded-2xl p-5 border border-token flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] text-faint font-bold uppercase mb-1 tracking-wider">Prossima manutenzione</p>
            {nextMaintenance ? (
              <>
                <h4 className="text-sm font-bold text-themed truncate">{nextMaintenance.name}</h4>
                <p className="text-xs mt-0.5" style={{ color: nextMaintenance.color }}>{nextMaintenance.label}</p>
              </>
            ) : (
              <h4 className="text-sm font-bold text-faint">Nessun piano attivo</h4>
            )}
          </div>
          {nextMaintenance ? (
            <button
              onClick={() => setDetailTab('plans')}
              aria-label="Gestisci piani manutenzione"
              className="w-11 h-11 rounded-full flex items-center justify-center text-white press-scale shrink-0"
              style={{
                background: 'var(--color-primary)',
                boxShadow: '0 0 15px var(--color-primary-glow)',
              }}
            >
              <Play size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => onOpenPlanForm?.()}
              className="w-11 h-11 rounded-full flex items-center justify-center text-muted border border-token press-scale shrink-0 hover:text-primary"
              aria-label="Crea piano manutenzione"
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        {/* Last log */}
        <div className="bg-surface-2 rounded-2xl p-5 border border-token flex items-center gap-4">
          {lastLog ? (
            <>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircleIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-faint font-bold uppercase mb-0.5 tracking-wider">Ultimo intervento</p>
                <h4 className="text-sm font-bold text-themed truncate">
                  {lastLog.title || lastLog.description || 'Intervento registrato'}
                </h4>
                <p className="text-[11px] text-faint mt-0.5">
                  {lastLog.performed_by_name || '—'} · {timeAgo(lastLog.performed_at || lastLog.created_at)}
                </p>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full shrink-0">
                COMPLETATO
              </span>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-faint" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-faint font-bold uppercase mb-0.5 tracking-wider">Ultimo intervento</p>
                <h4 className="text-sm font-bold text-faint">Nessun intervento registrato</h4>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Recent active reports ── */}
      {activeReports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-muted flex items-center gap-2">
              <ClipboardList size={15} /> Segnalazioni attive recenti
            </p>
            {activeReports.length > 3 && (
              <button onClick={() => setDetailTab('reports')} className="text-xs hover:underline flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
                Vedi tutte ({activeReports.length}) <ChevronRight size={12} />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {activeReports.slice(0, 3).map(r => {
              const s = STATUS[r.status] || STATUS.aperta
              const sv = SEVERITY[r.severity] || SEVERITY.media
              const isCritical = r.severity === 'critica'
              return (
                <div key={r.id} onClick={() => onOpenReport?.(r)}
                  className={`flex items-start gap-4 p-4 bg-surface-2 rounded-2xl cursor-pointer hover:bg-surface-3 transition-all border ${isCritical ? 'border-red-500/30' : 'border-token'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-themed font-bold mb-1">{r.title}</p>
                    {r.description && <p className="text-xs text-faint line-clamp-2 leading-relaxed mb-2">{r.description}</p>}
                    <p className="text-[11px] text-faint">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: s.color + '18', color: s.color }}>
                      {s.icon} {s.label}
                    </span>
                    <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: sv.color + '18', color: sv.color }}>
                      {sv.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// DocsLeftTree: tree inline nel left-rail della scheda macchina.
// Mostra le 7 cartelle (con count + icona-folder colorata) + 3 filtri
// rapidi (Preferiti / Recenti / Indicizzati AI). Click su un nodo
// porta al tab Documentazione filtrato. Tree e' sempre visibile, la
// selezione si evidenzia solo quando il tab attivo e' 'docs'.
// ──────────────────────────────────────────────────────────────
const DOCS_TREE_ITEMS = [
  { id: 'foto', label: 'Galleria Foto', frontColor: '#5b8eff', backColor: '#3b6ad9' },
  { id: 'scheda_tecnica', label: 'Schede Tecniche', frontColor: '#e0a82e', backColor: '#b58220' },
  { id: 'manuale_uso', label: "Istruzioni d'Uso", frontColor: '#3ddc84', backColor: '#2aa564' },
  { id: 'manuale_manutenzione', label: 'Manutenzione', frontColor: '#ff8a3d', backColor: '#cc5e1d' },
  { id: 'intervento_esterno', label: 'Ditta Esterna', frontColor: '#8b6ff5', backColor: '#6a52c4' },
  { id: 'contratto_manutenzione', label: 'Contratti Manut.', frontColor: '#e85d75', backColor: '#a73a4d' },
  { id: 'certificato', label: 'Certificati', frontColor: '#5dd3b8', backColor: '#36a187' },
]
const F_MONO = "'DM Mono', 'JetBrains Mono', ui-monospace, monospace"
const GOLD = '#e0a82e'

// Folder icon mini (14×11) per il tree del left-rail.
function FolderMini({ frontColor, backColor, empty }) {
  return (
    <span className="relative w-3.5 h-[11px] inline-block shrink-0" style={{ opacity: empty ? 0.45 : 1 }}>
      <span style={{
        inset: '1px 0 0 0', position: 'absolute',
        background: empty ? '#3d3017' : backColor,
        clipPath: 'polygon(0 0, 38% 0, 44% 22%, 100% 22%, 100% 100%, 0 100%)',
      }} />
      <span style={{
        inset: '3px 0 0 0', position: 'absolute',
        background: empty ? '#5a4520' : frontColor,
      }} />
    </span>
  )
}

function DocsLeftTree({ attachments, detailTab, docsFolder, docsTypeFilter, onSelectFolder, onSelectFilter }) {
  // Conteggi per cartella (foto legacy senza category vanno in 'foto')
  const counts = {}
  for (const item of DOCS_TREE_ITEMS) counts[item.id] = 0
  for (const a of attachments) {
    const id = a.category || (a.type === 'image' ? 'foto' : null)
    if (id && counts[id] != null) counts[id]++
  }
  const favoritesCount = attachments.filter(a => a.is_favorite).length
  const recentsCount = attachments.filter(a => a.uploaded_at).length
  const indexedCount = attachments.filter(a => a.type === 'pdf').length
  const isDocsTab = detailTab === 'docs'

  return (
    <div className="flex flex-col mt-0.5 ml-1.5 pl-0.5"
      style={{ borderLeft: '1px dashed var(--color-border)' }}>
      {/* "Tutto" — root */}
      <button
        onClick={() => onSelectFilter('all')}
        className={`flex items-center gap-1.5 px-1.5 py-1 cursor-pointer transition-colors text-left ${
          isDocsTab && !docsFolder && docsTypeFilter === 'all' ? 'border-l-2' : 'border-l-2 border-transparent'
        }`}
        style={{
          fontFamily: "'Barlow Condensed', system-ui, sans-serif",
          fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.4px',
          color: isDocsTab && !docsFolder && docsTypeFilter === 'all' ? GOLD : 'var(--color-text)',
          background: isDocsTab && !docsFolder && docsTypeFilter === 'all' ? 'var(--color-surface-2)' : 'transparent',
          borderLeftColor: isDocsTab && !docsFolder && docsTypeFilter === 'all' ? GOLD : 'transparent',
        }}
      >
        <span className="w-2 text-[9px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>▾</span>
        <FolderMini frontColor="#e0a82e" backColor="#b58220" empty={attachments.length === 0} />
        <span className="flex-1 truncate">Tutto</span>
        <span className="text-[9px] px-1.5 py-px"
          style={{
            fontFamily: F_MONO,
            background: attachments.length > 0 ? 'rgba(42,157,110,0.18)' : 'transparent',
            color: attachments.length > 0 ? 'var(--color-primary-light, #3db685)' : 'var(--color-text-faint)',
            borderRadius: 8, minWidth: 14, textAlign: 'center',
          }}>{attachments.length}</span>
      </button>

      {/* Sub-cartelle */}
      <div className="flex flex-col pl-2.5">
        {DOCS_TREE_ITEMS.map(item => {
          const active = isDocsTab && docsFolder === item.id
          const count = counts[item.id] || 0
          return (
            <button key={item.id}
              onClick={() => onSelectFolder(item.id)}
              className="flex items-center gap-1.5 px-1.5 py-1 cursor-pointer transition-colors text-left"
              style={{
                fontSize: 11,
                color: active ? GOLD : 'var(--color-text-muted)',
                background: active ? 'var(--color-surface-2)' : 'transparent',
                borderLeft: active ? `2px solid ${GOLD}` : '2px solid transparent',
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--color-surface-1)'; e.currentTarget.style.color = 'var(--color-text)' } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' } }}>
              <span className="w-2 text-[9px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>·</span>
              <FolderMini frontColor={item.frontColor} backColor={item.backColor} empty={count === 0} />
              <span className="flex-1 truncate">{item.label}</span>
              <span className="text-[9px] px-1 py-px"
                style={{
                  fontFamily: F_MONO,
                  background: count > 0 ? 'rgba(42,157,110,0.18)' : 'transparent',
                  color: count > 0 ? 'var(--color-primary-light, #3db685)' : 'var(--color-text-faint)',
                  borderRadius: 8, minWidth: 14, textAlign: 'center',
                }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Filtri rapidi */}
      <div className="flex flex-col gap-0.5 mt-1.5 pt-1.5"
        style={{ borderTop: '1px dashed var(--color-border)' }}>
        <div className="px-1.5 text-[9px] uppercase tracking-[0.1em]"
          style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
          Filtri rapidi
        </div>
        {[
          { id: 'favorites', label: 'Preferiti', count: favoritesCount, icon: <Star size={10} fill={GOLD} stroke={GOLD} />,
            color: GOLD, bg: 'rgba(224,168,46,0.18)' },
          { id: 'all', label: 'Recenti', count: recentsCount, icon: <Clock size={10} className="text-emerald-400" />,
            color: 'var(--color-primary-light, #3db685)', bg: 'rgba(42,157,110,0.18)' },
          { id: 'pdf', label: 'Indicizzati AI', count: indexedCount, icon: <Sparkles size={10} className="text-violet-400" fill="currentColor" />,
            color: '#8b6ff5', bg: 'rgba(139,111,245,0.18)' },
        ].map(f => {
          // active solo se siamo nel tab docs E nessuna cartella E typeFilter combacia
          const active = isDocsTab && !docsFolder && docsTypeFilter === f.id
          return (
            <button key={f.label}
              onClick={() => onSelectFilter(f.id)}
              className="flex items-center gap-1.5 px-1.5 py-1 cursor-pointer transition-colors text-left"
              style={{
                fontSize: 10,
                color: active ? f.color : 'var(--color-text-muted)',
                background: active ? 'var(--color-surface-2)' : 'transparent',
                borderLeft: active ? `2px solid ${f.color}` : '2px solid transparent',
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--color-surface-1)'; e.currentTarget.style.color = 'var(--color-text)' } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' } }}>
              <span className="w-2" />
              {f.icon}
              <span className="flex-1 truncate">{f.label}</span>
              <span className="text-[9px] px-1 py-px"
                style={{
                  fontFamily: F_MONO,
                  background: f.count > 0 ? f.bg : 'transparent',
                  color: f.count > 0 ? f.color : 'var(--color-text-faint)',
                  borderRadius: 8, minWidth: 14, textAlign: 'center',
                }}>{f.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Piccolo helper SVG per la checkmark nel last log card
function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function MachineDetailSheet({
  sel, plans, logs, planLastLogs, reports,
  components = [],
  detailTab, setDetailTab,
  onClose, onEdit, onDelete, onDownloadQR, onOpenReport,
  onOpenPlanForm, onDeletePlan, onOpenLogForm, onEditLog, onDeleteLog,
  onHandleCSVFile,
  onOpenComponentForm, onDeleteComponent,
  onUploadToMachine, onUploadFileToMachine, onRemoveAttachment, onToggleFavoriteAttachment, onSaveField,
  onOpenAssistant,
  reindexing = false,
}) {
  const machineReports = useMemo(() =>
    reports.filter(r => r.machine === sel.name).sort((a, b) => {
      const aActive = a.status !== 'risolta' ? 0 : 1
      const bActive = b.status !== 'risolta' ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return new Date(b.created_at) - new Date(a.created_at)
    }),
    [reports, sel.name]
  )

  const activeReports = useMemo(() => machineReports.filter(r => r.status !== 'risolta'), [machineReports])
  const criticalReports = useMemo(() => activeReports.filter(r => r.severity === 'critica' || r.severity === 'alta'), [activeReports])

  // Health score assessment
  const [assessment, setAssessment] = useState(null)
  const [assessmentLoading, setAssessmentLoading] = useState(true)

  useEffect(() => {
    if (!sel?.id) return
    setAssessmentLoading(true)
    db.fetchMachineAssessments(sel.org_id, sel.id)
      .then(result => {
        const a = result?.assessments?.find(a => a.machine_id === sel.id)
        setAssessment(a || null)
      })
      .catch(() => setAssessment(null))
      .finally(() => setAssessmentLoading(false))
  }, [sel?.id])

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Report status filter
  const [reportFilter, setReportFilter] = useState('all')

  // Stato del tab Documentazione, lifted qui cosi' il tree nel left-rail
  // puo' guidare la navigazione del pannello docs (cartella corrente +
  // filter chip attivo: 'all' | 'pdf' | 'image' | 'favorites').
  const [docsFolder, setDocsFolder] = useState(null)
  const [docsTypeFilter, setDocsTypeFilter] = useState('all')
  const handleDocsFolder = (id) => { setDocsFolder(id); setDocsTypeFilter('all'); setDetailTab('docs') }
  const handleDocsFilter = (filter) => { setDocsFolder(null); setDocsTypeFilter(filter); setDetailTab('docs') }
  const filteredReports = useMemo(() => {
    if (reportFilter === 'all') return machineReports
    return machineReports.filter(r => r.status === reportFilter)
  }, [machineReports, reportFilter])

  // Quick stats
  const nextMaintenance = useMemo(() => {
    if (plans.length === 0) return null
    let closest = null
    for (const plan of plans) {
      const light = getTrafficLight(plan, planLastLogs[plan.id])
      if (!closest || light.daysLeft < closest.daysLeft) {
        closest = { ...light, name: plan.name }
      }
    }
    return closest
  }, [plans, planLastLogs])

  const healthColor = assessment ? (healthColors[assessment.status]?.bg || '#6b7280') : '#6b7280'
  const { position, dragProps } = useDraggable()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: '5vh' }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease' }} />
      <div {...dragProps} className="relative bg-surface-1 border border-token rounded-2xl w-full animate-fade-in shadow-2xl overflow-hidden"
        style={{ ...dragProps.style, maxWidth: 1200, height: '85vh', transform: `translate(${position.x}px, ${position.y}px)` }} onClick={e => e.stopPropagation()}>

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-token bg-surface-0/50">
          <div className="flex items-center gap-3 min-w-0">
            {/* Health dot */}
            {assessment && (
              <div className="w-3 h-3 rounded-full shrink-0 animate-pulse" style={{ background: healthColor, boxShadow: `0 0 8px ${healthColor}60` }} />
            )}
            <Cog size={20} className="text-violet-400 shrink-0" />
            <h2 className="text-lg font-bold text-themed truncate">{sel.name}</h2>
            {sel.department && (
              <span className="text-xs text-faint px-2.5 py-1 bg-surface-2 rounded-lg shrink-0 font-medium">{sel.department}</span>
            )}
            {sel.manufacturer && (
              <span className="text-xs text-muted shrink-0">{sel.manufacturer}</span>
            )}
            {activeReports.length > 0 && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${criticalReports.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {activeReports.length} segnalaz. attive
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => onDownloadQR(sel)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-violet-400 hover:bg-violet-400/10 transition-all" title="Scarica QR Code">
              <QrCode size={15} />
            </button>
            <button onClick={() => onEdit(sel)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all">
              <Edit size={14} /> Modifica
            </button>
            {onDelete && (
              <button onClick={() => { if (confirm(`Eliminare il macchinario "${sel.name}"? Questa azione è irreversibile.`)) onDelete(sel.id) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Elimina macchinario">
                <Trash2 size={14} /> Elimina
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-all">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(85vh - 57px)' }}>

          {/* ═══ SIDEBAR LEFT ═══ */}
          <div className="col-span-3 border-r border-token overflow-y-auto p-4 space-y-3">

            {/* Photo with Live badge */}
            <div className="relative rounded-2xl overflow-hidden border border-violet-500/30 aspect-[4/3] shadow-lg">
              {sel.photo_url ? (
                <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <button onClick={() => onEdit(sel)} className="w-full h-full bg-surface-2/30 flex flex-col items-center justify-center text-faint hover:text-violet-400 transition-all">
                  <Camera size={28} className="mb-1 opacity-40" />
                  <span className="text-xs">Aggiungi foto</span>
                </button>
              )}
              <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/20 backdrop-blur-md border border-emerald-400/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Live</span>
              </div>
            </div>

            {/* STATO SALUTE — 2 mini circular charts */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #10b98180' }} />
                <p className="text-[10px] text-faint uppercase tracking-wider font-semibold">Stato Salute</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Segnalazioni mini chart */}
                <button
                  onClick={() => setDetailTab('reports')}
                  className="bg-surface-2/50 rounded-2xl p-3 flex flex-col items-center hover:bg-surface-3 transition-all border border-token press-scale"
                >
                  <div className="relative w-16 h-16 mb-1">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${Math.min(activeReports.length * 25, 100)} 100`}
                        style={{
                          stroke: criticalReports.length > 0 ? '#ef4444' : activeReports.length > 0 ? '#f59e0b' : '#10b981',
                          filter: `drop-shadow(0 0 6px ${criticalReports.length > 0 ? '#ef4444' : activeReports.length > 0 ? '#f59e0b' : '#10b981'}60)`,
                        }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-themed">{activeReports.length}</span>
                  </div>
                  <p className="text-[9px] text-faint uppercase tracking-wider font-semibold truncate w-full text-center">Segnalazioni</p>
                  <p className="text-[9px] text-faint uppercase tracking-wider mt-1 opacity-60 truncate w-full text-center">Ultimo Interv.</p>
                </button>

                {/* Piani mini chart */}
                <button
                  onClick={() => setDetailTab('plans')}
                  className="bg-surface-2/50 rounded-2xl p-3 flex flex-col items-center hover:bg-surface-3 transition-all border border-token press-scale"
                >
                  <div className="relative w-16 h-16 mb-1">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${plans.length > 0 ? 75 : 0} 100`}
                        style={{
                          stroke: nextMaintenance?.color || '#ef4444',
                          filter: `drop-shadow(0 0 6px ${nextMaintenance?.color || '#ef4444'}60)`,
                        }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-themed">{plans.length}</span>
                  </div>
                  <p className="text-[9px] text-faint uppercase tracking-wider font-semibold truncate w-full text-center">Piani</p>
                  <p className="text-[9px] text-faint uppercase tracking-wider mt-1 opacity-60 truncate w-full text-center">Prossima Scad.</p>
                </button>
              </div>
            </div>

            {/* Scheda Tecnica */}
            <div className="space-y-2">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold px-1">Scheda Tecnica</p>
              <div className="bg-surface-2/50 rounded-2xl border border-token overflow-hidden">
                {(() => {
                  const rows = [
                    { icon: Factory, label: 'Costruttore', value: sel.manufacturer },
                    { icon: Cog, label: 'Modello', value: sel.model },
                    { icon: Hash, label: 'Serial', value: sel.serial_number },
                    { icon: Calendar, label: 'Anno', value: sel.year },
                    { icon: Building, label: 'Reparto', value: sel.department },
                  ].filter(f => f.value)
                  if (rows.length === 0) {
                    return <p className="text-xs text-faint text-center py-3">Nessun dato tecnico. <button onClick={() => onEdit(sel)} className="text-violet-400 underline">Compila</button></p>
                  }
                  return rows.map(({ icon: Icon, label, value }, i) => (
                    <div key={label} className={`flex items-center justify-between px-3 py-2.5 ${i < rows.length - 1 ? 'border-b border-token' : ''}`}>
                      <div className="flex items-center gap-2 text-faint">
                        <Icon size={13} />
                        <span className="text-xs">{label}</span>
                      </div>
                      <span className="text-xs text-themed font-semibold truncate ml-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* Documentazione + tree cartelle */}
            <div className="space-y-2">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold px-1">Documentazione</p>
              <button
                onClick={() => { setDetailTab('docs'); setDocsFolder(null); setDocsTypeFilter('all') }}
                className={`w-full flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                  detailTab === 'docs' && !docsFolder && docsTypeFilter === 'all'
                    ? 'bg-surface-3 border-amber-500/40'
                    : 'bg-surface-2/50 border-token hover:bg-surface-3'
                }`}
              >
                <FolderOpen size={16} className="text-amber-400 shrink-0" fill="currentColor" />
                <span className="text-xs font-bold text-themed flex-1">Documentazione</span>
                <span className="text-[10px] font-mono text-faint">{sel.attachments?.length || 0}</span>
              </button>

              <DocsLeftTree
                attachments={sel.attachments || []}
                detailTab={detailTab}
                docsFolder={docsFolder}
                docsTypeFilter={docsTypeFilter}
                onSelectFolder={handleDocsFolder}
                onSelectFilter={handleDocsFilter}
              />
            </div>
          </div>

          {/* ═══ RIGHT: TABS ═══ */}
          <div className="col-span-9 flex flex-col overflow-hidden">

            {/* Title block */}
            <div className="px-5 pt-4 pb-2 shrink-0 min-w-0">
              <h1 className="text-xl font-bold text-themed truncate">{sel.name}</h1>
              <p className="text-xs text-faint mt-0.5 truncate">
                {[sel.manufacturer, sel.model].filter(Boolean).join(' ')}
                {sel.serial_number && <> · Serial <span className="text-secondary font-medium">{sel.serial_number}</span></>}
                {sel.year && <> · Year <span className="text-secondary font-medium">{sel.year}</span></>}
              </p>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-token shrink-0">
              <button onClick={() => setDetailTab('overview')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'overview' ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-400/5' : 'text-faint hover:text-secondary'}`}>
                <LayoutDashboard size={16} /> Panoramica
              </button>
              <button onClick={() => setDetailTab('plans')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'plans' ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-400/5' : 'text-faint hover:text-secondary'}`}>
                <Shield size={16} /> Piani Manutenzione
                {plans.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{plans.length}</span>}
              </button>
              <button onClick={() => setDetailTab('logs')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'logs' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-faint hover:text-secondary'}`}>
                <Wrench size={16} /> Registro Interventi
                {logs.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{logs.length}</span>}
              </button>
              <button onClick={() => setDetailTab('components')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'components' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5' : 'text-faint hover:text-secondary'}`}>
                <Package size={16} /> Componenti
                {components.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{components.length}</span>}
              </button>
              <button onClick={() => setDetailTab('docs')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'docs' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' : 'text-faint hover:text-secondary'}`}>
                <FolderOpen size={16} /> Documentazione
                {(sel.attachments?.length > 0) && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{sel.attachments.length}</span>}
              </button>
              <button onClick={() => setDetailTab('reports')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'reports' ? 'text-red-400 border-b-2 border-red-400 bg-red-400/5' : 'text-faint hover:text-secondary'}`}>
                <ClipboardList size={16} /> Segnalazioni
                {activeReports.length > 0 && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-bold ${criticalReports.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {activeReports.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">

              {/* ═══ OVERVIEW TAB ═══ */}
              {detailTab === 'overview' && (
                <OverviewTab
                  sel={sel}
                  assessment={assessment}
                  assessmentLoading={assessmentLoading}
                  activeReports={activeReports}
                  criticalReports={criticalReports}
                  machineReports={machineReports}
                  plans={plans}
                  logs={logs}
                  nextMaintenance={nextMaintenance}
                  components={components}
                  onOpenReport={onOpenReport}
                  onOpenPlanForm={onOpenPlanForm}
                  onOpenLogForm={onOpenLogForm}
                  setDetailTab={setDetailTab}
                />
              )}

              {/* ═══ PLANS TAB ═══ */}
              {detailTab === 'plans' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{plans.length} piani</p>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-xl text-sm font-medium cursor-pointer transition-all">
                        <Upload size={14} /> CSV
                        <input type="file" accept=".csv,.txt" className="hidden" onChange={onHandleCSVFile} />
                      </label>
                      <button onClick={() => onOpenPlanForm()} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all"><Plus size={14} /> Nuovo Piano</button>
                    </div>
                  </div>

                  {plans.length === 0 ? (
                    <div className="text-center py-16"><Shield size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun piano configurato</p><p className="text-xs text-faint mt-1">Crea un piano o importa da CSV</p></div>
                  ) : (
                    <div className="space-y-3">
                      {plans.map(plan => {
                        const light = getTrafficLight(plan, planLastLogs[plan.id])
                        return (
                          <div key={plan.id} className="bg-surface-2 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: light.color, boxShadow: `0 0 8px ${light.color}40` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white">{plan.name}</p>
                                <p className="text-xs text-faint mt-0.5">Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}</p>
                              </div>
                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg shrink-0" style={{ background: light.color + '18', color: light.color }}>{light.label}</span>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => onOpenLogForm(plan.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-faint hover:text-emerald-400" title="Registra intervento"><Play size={14} /></button>
                                <button onClick={() => onOpenPlanForm(plan)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                                <button onClick={() => onDeletePlan(plan.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                              </div>
                            </div>
                            {plan.instructions && <p className="text-xs text-muted mt-2 pl-7 leading-relaxed">{plan.instructions}</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ LOGS TAB ═══ */}
              {detailTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{logs.length} interventi</p>
                    <button onClick={() => onOpenLogForm()} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all"><Plus size={14} /> Registra</button>
                  </div>
                  {logs.length === 0 ? (
                    <div className="text-center py-16"><Wrench size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun intervento</p></div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 p-4 bg-surface-2 rounded-xl group">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.type === 'programmata' ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}>
                            {log.type === 'programmata' ? <Shield size={14} className="text-violet-400" /> : <Wrench size={14} className="text-amber-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-white">{log.title}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${log.type === 'programmata' ? 'bg-violet-500/15 text-violet-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {log.type === 'programmata' ? 'Programmata' : 'Straordinaria'}
                              </span>
                            </div>
                            {log.description && <p className="text-xs text-muted mt-1">{log.description}</p>}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-faint flex-wrap">
                              <span>{log.performed_by_name || '—'}</span>
                              <span>{timeAgo(log.performed_at)}</span>
                              {log.duration_minutes && <span>⏱ {log.duration_minutes} min</span>}
                              {log.parts_replaced && <span>🔩 {log.parts_replaced}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                            {onEditLog && (
                              <button
                                onClick={() => onEditLog(log)}
                                title="Modifica intervento"
                                className="p-1.5 rounded-lg hover:bg-violet-500/15 text-faint hover:text-violet-400 transition-colors"
                              >
                                <Edit size={14} />
                              </button>
                            )}
                            {onDeleteLog && (
                              <button
                                onClick={() => onDeleteLog(log.id)}
                                title="Elimina intervento"
                                className="p-1.5 rounded-lg hover:bg-red-500/15 text-faint hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ COMPONENTS TAB ═══ */}
              {detailTab === 'components' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{components.length} componenti</p>
                    <button onClick={() => onOpenComponentForm?.()} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all">
                      <Plus size={14} /> Nuovo Componente
                    </button>
                  </div>

                  {components.length === 0 ? (
                    <div className="text-center py-16">
                      <Package size={48} className="mx-auto text-faint opacity-15 mb-3" />
                      <p className="text-sm text-faint">Nessun componente registrato</p>
                      <p className="text-xs text-faint mt-1">Aggiungi sotto-macchine e componenti per tracciare guasti specifici</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {components.map(comp => (
                        <div key={comp.id} className="bg-surface-2 rounded-xl p-4 group hover:bg-surface-3 transition-all">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                              <Package size={18} className="text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-themed truncate">{comp.name}</p>
                              {comp.type && (
                                <span className="text-[10px] font-medium text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded inline-block mt-0.5">{comp.type}</span>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-faint flex-wrap">
                                {comp.manufacturer && <span className="flex items-center gap-1"><Factory size={10} /> {comp.manufacturer}</span>}
                                {comp.model && <span className="flex items-center gap-1"><Cog size={10} /> {comp.model}</span>}
                                {comp.serial_number && <span className="flex items-center gap-1"><Hash size={10} /> {comp.serial_number}</span>}
                                {comp.year && <span className="flex items-center gap-1"><Calendar size={10} /> {comp.year}</span>}
                              </div>
                              {comp.notes && <p className="text-[11px] text-faint mt-1.5 line-clamp-2">{comp.notes}</p>}
                            </div>
                            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => onOpenComponentForm?.(comp)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                              <button onClick={() => { if (confirm(`Eliminare "${comp.name}"?`)) onDeleteComponent?.(comp.id) }}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ DOCUMENTATION TAB ═══ */}
              {detailTab === 'docs' && (
                <MachineDocumentationTab
                  sel={sel}
                  onUpload={onUploadToMachine}
                  onUploadFile={onUploadFileToMachine}
                  onRemoveAttachment={onRemoveAttachment}
                  onToggleFavorite={onToggleFavoriteAttachment}
                  onSaveField={onSaveField}
                  onOpenAssistant={onOpenAssistant}
                  reindexing={reindexing}
                  currentFolder={docsFolder}
                  onChangeFolder={setDocsFolder}
                  typeFilter={docsTypeFilter}
                  onChangeTypeFilter={setDocsTypeFilter}
                />
              )}

              {/* ═══ REPORTS TAB ═══ */}
              {detailTab === 'reports' && (
                <div className="space-y-4 animate-fade-in">
                  {/* Filter bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { key: 'all', label: 'Tutte', count: machineReports.length, color: 'text-themed' },
                      { key: 'aperta', label: 'Aperte', count: machineReports.filter(r => r.status === 'aperta').length, color: 'text-amber-400' },
                      { key: 'assegnata', label: 'Assegnate', count: machineReports.filter(r => r.status === 'assegnata').length, color: 'text-violet-400' },
                      { key: 'in_lavorazione', label: 'In Lavorazione', count: machineReports.filter(r => r.status === 'in_lavorazione').length, color: 'text-purple-400' },
                      { key: 'risolta', label: 'Risolte', count: machineReports.filter(r => r.status === 'risolta').length, color: 'text-emerald-400' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setReportFilter(f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${reportFilter === f.key ? 'bg-surface-3 ' + f.color + ' ring-1 ring-current/20' : 'bg-surface-2 text-faint hover:text-secondary'}`}>
                        {f.label}
                        {f.count > 0 && <span className="text-[10px] font-bold opacity-70">{f.count}</span>}
                      </button>
                    ))}
                  </div>

                  {/* Reports list */}
                  {filteredReports.length === 0 ? (
                    <div className="text-center py-16">
                      <ClipboardList size={48} className="mx-auto text-faint opacity-15 mb-3" />
                      <p className="text-sm text-faint">
                        {machineReports.length === 0 ? 'Nessuna segnalazione' : 'Nessuna segnalazione con questo filtro'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredReports.map(r => {
                        const s = STATUS[r.status] || STATUS.aperta
                        const sv = SEVERITY[r.severity] || SEVERITY.media
                        const isCritical = r.severity === 'critica'
                        const isActive = r.status !== 'risolta'
                        return (
                          <div key={r.id} onClick={() => onOpenReport?.(r)}
                            className={`flex items-center gap-3 p-3.5 bg-surface-2 rounded-xl transition-all cursor-pointer hover:bg-surface-3 group ${isCritical && isActive ? 'ring-1 ring-red-500/30 hover:ring-red-500/50' : ''}`}>
                            {/* Severity bar */}
                            <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: sv.color }} />
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm text-themed font-medium truncate">{r.title}</p>
                              </div>
                              {r.description && (
                                <p className="text-[11px] text-faint line-clamp-2 leading-relaxed">{r.description}</p>
                              )}
                              <p className="text-[10px] text-faint mt-1">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                            </div>
                            {/* Badges + Arrow */}
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge {...s} />
                              <Badge {...sv} />
                              <ChevronRight size={14} className="text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
