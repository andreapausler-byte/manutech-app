import React from 'react'
import {
  MT, fDisplay, fMono,
  TopBar, SearchField, BtnPrimary, BtnGhost,
  Pill, StatusPill, PriorityDot, RiskBar, KpiCard,
} from '../../components/manutech'
import { PREDICTIVE_ALERTS, MACHINES, TICKETS, KPI, machineById } from '../../mocks/predictive'
import { useV6Nav } from './V6Nav'

export default function CommandCenter() {
  const { navigate } = useV6Nav()

  return (
    <>
      <TopBar
        title="Command Center"
        crumbs="Birra Amarcord · Stabilimento Rimini"
        right={<>
          <SearchField/>
          <BtnGhost size="sm">ESPORTA REPORT</BtnGhost>
          <BtnPrimary size="sm">+ NUOVO TICKET</BtnPrimary>
        </>}
      />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Predictive alerts */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Allerte predittive AI</h2>
              <Pill tone="red" size="sm">{PREDICTIVE_ALERTS.length} ATTIVE</Pill>
            </div>
            <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6 }}>
              AGGIORNATO 2 MIN FA · CLAUDE HAIKU 4.5
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {PREDICTIVE_ALERTS.map(a => {
              const m = machineById(a.machineId)
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
                        {m.code} · {m.area.toUpperCase()}
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
                      PATTERN IDENTIFICATO
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
        </section>

        {/* KPI */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>KPI produzione</h2>
            <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6 }}>
              ULTIME 24H · TREND VS. 7G
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <KpiCard label="UPTIME" value={KPI.uptime} unit="%" delta={KPI.uptimeDelta} tone="good" sub="target 97%"/>
            <KpiCard label="MTTR" value={KPI.mttr} unit="min" delta={KPI.mttrDelta} tone="good" sub="target ≤ 45 min"/>
            <KpiCard label="MTBF" value={KPI.mtbf} unit="h" delta={KPI.mtbfDelta} tone="good" sub="media mensile"/>
            <KpiCard label="€ FERMO OGGI" value="1.440" unit="€" delta={-420} tone="good" sub="ticket aperti"/>
            <KpiCard label="TICKET APERTI" value={KPI.openTickets} delta={1} tone="bad" sub={`${KPI.closedWeek} chiusi · 7g`}/>
          </div>
        </section>

        {/* Risk map + active tickets */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>Mappa rischio macchine</h2>
            <div style={{ background: MT.surface, border: `1px solid ${MT.border}` }}>
              {['Cantina', 'Filtrazione', 'Sala cotte', 'Confezionamento'].map(area => {
                const ms = MACHINES.filter(m => m.area === area)
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
              })}
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
              {TICKETS.filter(t => t.status !== 'chiuso').slice(0, 5).map(t => {
                const m = machineById(t.machineId)
                return (
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
                        {m.code} · {t.id}
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
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
