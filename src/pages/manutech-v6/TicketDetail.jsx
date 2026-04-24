import React from 'react'
import {
  MT, fDisplay, fMono,
  TopBar, BtnPrimary, BtnGhost,
  Pill, StatusPill, Avatar,
} from '../../components/manutech'
import { useV6Nav } from './V6Nav'

export default function TicketDetail({ id }) {
  const { navigate, data } = useV6Nav()
  const { ticketById, machineById, tickets = [], loading } = data || {}

  if (loading) {
    return (
      <>
        <TopBar title="Ticket" crumbs="Caricamento…"/>
        <div style={{ padding: 24, color: MT.textMuted, fontFamily: fMono, fontSize: 13 }}>
          Caricamento ticket…
        </div>
      </>
    )
  }

  const t = (ticketById && ticketById(id)) || tickets[0]

  if (!t) {
    return (
      <>
        <TopBar
          title="Nessun ticket"
          crumbs={<span style={{ cursor: 'pointer' }} onClick={() => navigate('tickets')}>← Ticket Board</span>}
        />
        <div style={{ padding: 32, color: MT.textMuted, fontFamily: fMono, fontSize: 13 }}>
          Nessuna segnalazione presente. Apri la console segnalazioni per crearne una.
        </div>
      </>
    )
  }

  const m = (machineById && machineById(t.machineId)) || {
    code: t.machineCode, name: t.machineName, area: t.machineArea,
  }

  // Storico: altri ticket stessa macchina, più recenti, escluso corrente
  const related = tickets
    .filter(x => x.machineId && x.machineId === t.machineId && x.id !== t.id)
    .slice(0, 3)

  return (
    <>
      <TopBar
        title={t.title}
        crumbs={<span style={{ cursor: 'pointer' }} onClick={() => navigate('tickets')}>← Ticket Board · {t.id}</span>}
        right={<>
          <StatusPill status={t.status}/>
          <BtnGhost size="sm" onClick={() => navigate('reports')}>APRI IN CONSOLE</BtnGhost>
          <BtnPrimary size="sm" onClick={() => navigate('tickets')}>TORNA AL BOARD</BtnPrimary>
        </>}
      />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Descrizione segnalazione */}
          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pill tone="green" size="sm">SEGNALAZIONE</Pill>
                <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>
                  {t.reportStatus ? t.reportStatus.replace('_', ' ').toUpperCase() : '—'}
                </span>
              </div>
              <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>{t.ago}</span>
            </div>

            {t.description ? (
              <div style={{
                fontSize: 15, lineHeight: 1.55, color: MT.text,
                borderLeft: `3px solid ${MT.green}`, padding: '8px 14px',
              }}>
                {t.description}
              </div>
            ) : (
              <div style={{
                fontFamily: fMono, fontSize: 13, color: MT.textDim,
                border: `1px dashed ${MT.border}`, padding: '12px 14px',
              }}>
                Nessuna descrizione fornita — apri la console per aggiungere dettagli.
              </div>
            )}

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1,
              marginTop: 14, background: MT.border,
            }}>
              {[
                { l: 'MACCHINA', v: m.code || '—' },
                { l: 'PRIORITÀ', v: (t.priority || '—').toUpperCase() },
                { l: 'CATEGORIA', v: (t.category || '—').toUpperCase() },
                { l: 'AREA', v: m.area || '—' },
              ].map(f => (
                <div key={f.l} style={{ background: MT.surface2, padding: '10px 12px' }}>
                  <div style={{ fontFamily: fMono, fontSize: 11, color: MT.textMuted, letterSpacing: 0.6 }}>{f.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Storico macchina */}
          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: fMono, fontSize: 13, color: MT.greenLight, letterSpacing: 0.6, fontWeight: 600 }}>
                STORICO · {m.code || 'MACCHINA'}
              </span>
              <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>
                {related.length} ticket correlati
              </span>
            </div>
            {related.length === 0 ? (
              <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textDim, padding: '6px 0' }}>
                Nessun altro ticket associato a questa macchina.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {related.map(r => (
                  <div
                    key={r.id}
                    onClick={() => navigate('ticket-detail', { id: r.id })}
                    style={{
                      display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 12, alignItems: 'center',
                      padding: '8px 10px', border: `1px solid ${MT.border}`, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>{r.id}</span>
                    <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </span>
                    <StatusPill status={r.status}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {t.impactEurH > 0 && (
            <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
              <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6, marginBottom: 10 }}>
                IMPATTO STIMATO
              </div>
              <div style={{ fontFamily: fDisplay, fontSize: 40, fontWeight: 600, color: MT.red, letterSpacing: -0.5, lineHeight: 1 }}>
                {t.impactEurH}€<span style={{ fontSize: 18, color: MT.textDim }}>/h</span>
              </div>
              <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, marginTop: 6 }}>
                STIMA SU SEVERITÀ · non campo DB
              </div>
            </div>
          )}

          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6, marginBottom: 10 }}>
              TECNICO ASSEGNATO
            </div>
            {t.techName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={t.techName} size={40}/>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{t.techName}</div>
                  <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>SPECIALISTA</div>
                </div>
              </div>
            ) : (
              <div style={{ fontFamily: fMono, fontSize: 13, color: MT.textDim }}>
                Non ancora assegnato. Usa la console per assegnare un tecnico.
              </div>
            )}
          </div>

          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6, marginBottom: 10 }}>
              SEGNALATO DA
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={t.operatorName} size={32}/>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{t.operatorName}</div>
                <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>
                  {t.severity ? `SEVERITÀ ${t.severity.toUpperCase()}` : 'OPERATORE'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
