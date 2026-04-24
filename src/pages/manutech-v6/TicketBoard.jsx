import React, { useMemo } from 'react'
import {
  MT, fMono,
  TopBar, SearchField, BtnPrimary, BtnGhost,
  Pill, PriorityDot, Avatar,
} from '../../components/manutech'
import { useV6Nav } from './V6Nav'

const COLS = [
  { k: 'aperto',   l: 'APERTI',        tone: MT.amber },
  { k: 'in_corso', l: 'IN CORSO',      tone: MT.greenLight },
  { k: 'chiuso',   l: 'CHIUSI · OGGI', tone: MT.textMuted },
]

export default function TicketBoard() {
  const { navigate, data } = useV6Nav()
  const { tickets = [], ticketBuckets } = data || {}

  // Colonna CHIUSI: solo di oggi (allineato al label "· OGGI")
  const columnsData = useMemo(() => {
    const buckets = ticketBuckets || { aperto: [], in_corso: [], chiuso: [] }
    return {
      aperto: buckets.aperto,
      in_corso: buckets.in_corso,
      chiuso: tickets.filter(t => {
        if (t.status !== 'chiuso' || !t.updatedAt) return false
        const d = new Date(t.updatedAt)
        const today = new Date()
        return d.getDate() === today.getDate()
          && d.getMonth() === today.getMonth()
          && d.getFullYear() === today.getFullYear()
      }),
    }
  }, [ticketBuckets, tickets])

  return (
    <>
      <TopBar
        title="Ticket Board"
        crumbs="Gestione segnalazioni"
        right={<>
          <SearchField placeholder="Cerca ticket…"/>
          <BtnGhost size="sm">FILTRI ▾</BtnGhost>
          <BtnPrimary size="sm" onClick={() => navigate('reports')}>+ NUOVO</BtnPrimary>
        </>}
      />

      <div style={{
        padding: '20px 28px', display: 'flex', gap: 10,
        borderBottom: `1px solid ${MT.border}`,
        fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6,
      }}>
        <span>FILTRI:</span>
        {['TUTTE LE MACCHINE', 'PRIORITÀ TUTTE', 'ULTIME 24H'].map(f => (
          <span key={f} style={{
            padding: '5px 11px', background: MT.surface,
            border: `1px solid ${MT.border}`, cursor: 'pointer',
          }}>{f} ▾</span>
        ))}
        <span style={{ marginLeft: 'auto', color: MT.textMuted }}>{tickets.length} TICKET</span>
      </div>

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {COLS.map(col => {
          const list = columnsData[col.k]
          return (
            <div key={col.k} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 4px 6px', borderBottom: `2px solid ${col.tone}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 8, background: col.tone }}/>
                  <span style={{ fontFamily: fMono, fontSize: 13, fontWeight: 600, letterSpacing: 0.6, color: col.tone }}>
                    {col.l}
                  </span>
                </div>
                <span style={{ fontFamily: fMono, fontSize: 13, color: MT.textMuted }}>{list.length}</span>
              </div>

              {list.map(t => {
                const prColor = t.priority === 'alta' ? MT.red : t.priority === 'media' ? MT.amber : MT.greenLight
                return (
                  <div key={t.id} onClick={() => navigate('ticket-detail', { id: t.id })} style={{
                    background: MT.surface, border: `1px solid ${MT.border}`,
                    borderLeft: `3px solid ${prColor}`, padding: 14, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>{t.id}</span>
                      <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>{t.ago}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.3 }}>{t.title}</div>
                    <div style={{ fontFamily: fMono, fontSize: 13, color: MT.greenLight }}>
                      {t.machineCode} · {t.machineName}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill tone="neutral" size="sm">
                        <PriorityDot p={t.priority} size={5}/>{(t.priority || 'bassa').toUpperCase()}
                      </Pill>
                      <Pill tone="muted" size="sm">{(t.category || 'altro').toUpperCase()}</Pill>
                      {t.impactEurH > 0 && (
                        <Pill tone={t.impactEurH > 300 ? 'red' : 'amber'} size="sm">
                          {t.impactEurH}€/H
                        </Pill>
                      )}
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingTop: 8, borderTop: `1px solid ${MT.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={t.operatorName} size={20}/>
                        <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>{t.operatorName}</span>
                      </div>
                      {t.techName
                        ? <Avatar name={t.techName} size={22}/>
                        : <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>+ ASSEGNA</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}
