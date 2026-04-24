import React from 'react'
import {
  MT, fDisplay, fMono,
  TopBar, SearchField, BtnPrimary, BtnGhost,
  Pill, StatusPill, PriorityDot, RiskBar, KpiCard,
} from '../../components/manutech'
import { useV6Nav } from './V6Nav'

const AREAS_ORDER = ['Cantina', 'Filtrazione', 'Sala cotte', 'Confezionamento']

export default function CommandCenter() {
  const { navigate, data } = useV6Nav()
  const { machines = [], tickets = [], alerts = [], kpi, loading, reload } = data || {}

  if (loading) {
    return (
      <>
        <TopBar title="Command Center" crumbs="Caricamento…"/>
        <div style={{ padding: 24, color: MT.textMuted, fontFamily: fMono, fontSize: 13 }}>
          Caricamento dati produzione…
        </div>
      </>
    )
  }

  // Groups by area — use actual areas found in DB, fallback ad AREAS_ORDER
  const areasFound = Array.from(new Set(machines.map(m => m.area).filter(Boolean)))
  const areasToShow = areasFound.length > 0
    ? [...AREAS_ORDER.filter(a => areasFound.includes(a)), ...areasFound.filter(a => !AREAS_ORDER.includes(a))]
    : AREAS_ORDER

  const activeTickets = tickets.filter(t => t.status !== 'chiuso').slice(0, 6)

  const alertLabel = alerts.length > 0
    ? `${alerts.length} ${alerts.length === 1 ? 'ATTIVA' : 'ATTIVE'}`
    : '—'

  const kpiSafe = kpi || { uptime: 0, uptimeDelta: 0, mttr: 0, mttrDelta: 0, mtbf: 0, mtbfDelta: 0, lostEurToday: 0, lostEurDelta: 0, openTickets: 0, openTicketsDelta: 0, closedWeek: 0 }

  return (
    <>
      <TopBar
        title="Command Center"
        crumbs="Console admin · Stabilimento"
        right={<>
          <SearchField/>
          <BtnGhost size="sm" onClick={reload}>AGGIORNA</BtnGhost>
          <BtnPrimary size="sm" onClick={() => navigate('reports')}>SEGNALAZIONI →</BtnPrimary>
        </>}
      />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Risk analysis (non è vera AI: è storico) */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Macchine a rischio</h2>
              <Pill tone={alerts.length > 0 ? 'red' : 'muted'} size="sm">{alertLabel}</Pill>
            </div>
            <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6 }}>
              ANALISI STORICO · ULTIMI 30G
            </span>
          </div>

          {alerts.length === 0 ? (
            <div style={{
              background: MT.surface, border: `1px solid ${MT.border}`,
              padding: '32px 20px', textAlign: 'center',
              color: MT.textMuted, fontFamily: fMono, fontSize: 13,
            }}>
              Nessuna macchina a rischio · stato di produzione stabile
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, alerts.length)}, 1fr)`, gap: 12 }}>
              {alerts.map(a => {
                const m = machines.find(x => x.id === a.machineId)
                if (!m) return null
                const tone = a.risk >= 70 ? { b: MT.red, fg: MT.red } :
                             a.risk >= 40 ? { b: MT.amber, fg: MT.amber } :
                             { b: MT.greenLight, fg: MT.greenLight }
                return (
                  <div key={a.id} style={{
                    background: MT.surface, border: `1px solid ${MT.border}`,
                    borderLeft: `3px solid ${tone.b}`, padding: 16, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6 }}>
                          {m.code} · {(m.area || '').toUpperCase()}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 3 }}>{m.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: fDisplay, fontSize: 32, fontWeight: 600, color: tone.fg, lineHeight: 1 }}>
                          {a.risk}<span style={{ fontSize: 15, color: MT.textDim }}>%</span>
                        </div>
                        <div style={{ fontFamily: fMono, fontSize: 11, color: MT.textMuted, letterSpacing: 0.5 }}>
                          RISCHIO · {a.window}
                        </div>
                      </div>
                    </div>
                    <RiskBar value={a.risk} height={3}/>
                    <div>
                      <div style={{ fontFamily: fMono, fontSize: 11, color: MT.textMuted, letterSpacing: 0.6, marginBottom: 5 }}>
                        SEGNALE
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{a.pattern}</div>
                    </div>
                    <div style={{ fontSize: 14, color: MT.textMuted, lineHeight: 1.55 }}>{a.evidence}</div>
                    <div style={{
                      display: 'flex', gap: 6, alignItems: 'center', marginTop: 4,
                      paddingTop: 10, borderTop: `1px solid ${MT.border}`,
                    }}>
                      <span style={{ fontFamily: fDisplay, fontSize: 14, color: tone.fg, fontWeight: 500, flex: 1 }}>
                        → {a.action}
                      </span>
                      <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* KPI */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>KPI produzione</h2>
            <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6 }}>
              CALCOLO SU STORICO SEGNALAZIONI
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <KpiCard label="UPTIME" value={kpiSafe.uptime} unit="%" delta={kpiSafe.uptimeDelta} tone="good" sub="stima su aperti"/>
            <KpiCard label="MTTR" value={kpiSafe.mttr} unit="min" delta={kpiSafe.mttrDelta} tone="good" sub="media risolti"/>
            <KpiCard label="MTBF" value={kpiSafe.mtbf} unit="h" delta={kpiSafe.mtbfDelta} tone="good" sub="ultimi 12 mesi"/>
            <KpiCard label="€ FERMO STIMATO" value={kpiSafe.lostEurToday} unit="€" delta={kpiSafe.lostEurDelta} tone="good" sub="ticket aperti"/>
            <KpiCard label="TICKET APERTI" value={kpiSafe.openTickets} delta={kpiSafe.openTicketsDelta} tone={kpiSafe.openTicketsDelta > 0 ? 'bad' : 'good'} sub={`${kpiSafe.closedWeek} chiusi · 7g`}/>
          </div>
        </section>

        {/* Risk map + active tickets */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>Mappa rischio macchine</h2>
            <div style={{ background: MT.surface, border: `1px solid ${MT.border}` }}>
              {machines.length === 0 ? (
                <div style={{ padding: 20, color: MT.textMuted, fontFamily: fMono, fontSize: 13 }}>
                  Nessuna macchina registrata.
                </div>
              ) : (
                areasToShow.map(area => {
                  const ms = machines.filter(m => (m.area || 'Altro') === area)
                  if (ms.length === 0) return null
                  return (
                    <div key={area} style={{
                      borderBottom: `1px solid ${MT.border}`, padding: '12px 14px',
                      display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{area}</div>
                        <div style={{ fontFamily: fMono, fontSize: 11, color: MT.textMuted }}>{ms.length} macchine</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ms.map(m => {
                          const c = m.risk >= 70 ? MT.red : m.risk >= 40 ? MT.amber : MT.greenLight
                          const dim = m.risk >= 70 ? MT.redDim : m.risk >= 40 ? MT.amberDim : MT.greenDim
                          return (
                            <div key={m.id} style={{
                              padding: '6px 8px', background: dim, border: `1px solid ${c}`,
                              cursor: 'default', minWidth: 80,
                            }}>
                              <div style={{ fontFamily: fMono, fontSize: 11, color: c, fontWeight: 600 }}>{m.code}</div>
                              <div style={{ fontFamily: fMono, fontSize: 15, color: MT.text, fontWeight: 500 }}>
                                {m.risk}<span style={{ color: MT.textDim, fontSize: 11 }}>%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Ticket attivi</h2>
              <span onClick={() => navigate('tickets')} style={{
                fontFamily: fMono, fontSize: 12, color: MT.greenLight, letterSpacing: 0.6, cursor: 'pointer',
              }}>VEDI TUTTI →</span>
            </div>
            <div style={{ background: MT.surface, border: `1px solid ${MT.border}` }}>
              {activeTickets.length === 0 ? (
                <div style={{ padding: 20, color: MT.textMuted, fontFamily: fMono, fontSize: 13 }}>
                  Nessun ticket aperto · 🎉
                </div>
              ) : (
                activeTickets.map(t => (
                  <div key={t.id} onClick={() => navigate('ticket-detail', { id: t.id })} style={{
                    padding: '12px 14px', borderBottom: `1px solid ${MT.border}`, cursor: 'pointer',
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center',
                  }}>
                    <PriorityDot p={t.priority}/>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </div>
                      <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, marginTop: 3 }}>
                        {t.machineCode} · {t.id}
                      </div>
                    </div>
                    {t.impactEurH > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: fMono, fontSize: 13, color: MT.red, fontWeight: 600 }}>
                          {t.impactEurH}€/h
                        </div>
                      </div>
                    )}
                    <StatusPill status={t.status}/>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
