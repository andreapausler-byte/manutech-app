import React from 'react'
import {
  MT, fDisplay, fMono,
  TopBar, BtnPrimary, BtnGhost,
  Pill, StatusPill, Avatar,
} from '../../components/manutech'
import { TICKETS, machineById } from '../../mocks/predictive'
import { useV6Nav } from './V6Nav'

export default function TicketDetail({ id }) {
  const { navigate } = useV6Nav()
  const t = TICKETS.find(x => x.id === id) || TICKETS[0]
  const m = machineById(t.machineId)

  return (
    <>
      <TopBar
        title={t.title}
        crumbs={<span style={{ cursor: 'pointer' }} onClick={() => navigate('tickets')}>← Ticket Board · {t.id}</span>}
        right={<>
          <StatusPill status={t.status}/>
          <BtnGhost size="sm">COMMENTA</BtnGhost>
          <BtnPrimary size="sm">CHIUDI TICKET</BtnPrimary>
        </>}
      />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Audio + transcription */}
          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pill tone="green" size="sm">
                  <span style={{ width: 5, height: 5, borderRadius: 5, background: MT.greenLight, animation: 'mt-pulse 1.5s infinite' }}/>
                  AI WHISPER
                </Pill>
                <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>
                  TRASCRITTO · confidence {Math.round(t.aiConfidence * 100)}%
                </span>
              </div>
              <BtnGhost size="sm">▶ RIASCOLTA ({t.audioDurationSec ?? 0}s)</BtnGhost>
            </div>

            {/* Waveform */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 40, padding: '8px 0', marginBottom: 12 }}>
              {Array.from({ length: 64 }).map((_, i) => {
                const h = 6 + (Math.sin(i * 0.7) + 1) / 2 * 28
                return <div key={i} style={{
                  flex: 1, height: h,
                  background: i < 20 ? MT.greenLight : MT.green,
                  opacity: i < 20 ? 1 : 0.4,
                }}/>
              })}
            </div>

            {t.transcript && (
              <div style={{
                fontSize: 15, lineHeight: 1.55, color: MT.text,
                borderLeft: `3px solid ${MT.green}`, padding: '8px 14px',
              }}>
                "{t.transcript}"
              </div>
            )}

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1,
              marginTop: 14, background: MT.border,
            }}>
              {[
                { l: 'MACCHINA', v: m.code },
                { l: 'PRIORITÀ', v: t.priority.toUpperCase() },
                { l: 'CATEGORIA', v: t.category.toUpperCase() },
                { l: 'AREA', v: m.area },
              ].map(f => (
                <div key={f.l} style={{ background: MT.surface2, padding: '10px 12px' }}>
                  <div style={{ fontFamily: fMono, fontSize: 11, color: MT.textMuted, letterSpacing: 0.6 }}>{f.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Copilot */}
          <div style={{
            background: `linear-gradient(180deg, ${MT.greenDim} 0%, ${MT.surface} 100%)`,
            border: `1px solid ${MT.green}`, padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MT.greenLight} strokeWidth="1.8">
                <path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z"/>
              </svg>
              <span style={{ fontFamily: fMono, fontSize: 13, color: MT.greenLight, letterSpacing: 0.6, fontWeight: 600 }}>
                AI COPILOT · ANALISI STORICA
              </span>
            </div>
            <div style={{ fontSize: 16, color: MT.text, lineHeight: 1.55, marginBottom: 12 }}>
              La macchina <strong>{m.name}</strong> ha avuto <strong style={{ color: MT.amber }}>3 ticket simili</strong> negli
              ultimi 6 mesi. Pattern suggerisce guasto ricorrente — ispezionare componente critico.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Pill tone="green" size="sm">→ TK-2501 (15 gg fa)</Pill>
              <Pill tone="green" size="sm">→ TK-2382 (2 mesi fa)</Pill>
              <Pill tone="amber" size="sm">📦 P/N disponibili</Pill>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6, marginBottom: 10 }}>
              IMPATTO STIMATO
            </div>
            <div style={{ fontFamily: fDisplay, fontSize: 40, fontWeight: 600, color: MT.red, letterSpacing: -0.5, lineHeight: 1 }}>
              {t.impactEurH}€<span style={{ fontSize: 18, color: MT.textDim }}>/h</span>
            </div>
            <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, marginTop: 6 }}>
              FERMO LINEA · impatto produzione
            </div>
          </div>

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
            ) : <BtnPrimary size="sm">+ ASSEGNA TECNICO</BtnPrimary>}
          </div>

          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, padding: 16 }}>
            <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted, letterSpacing: 0.6, marginBottom: 10 }}>
              SEGNALATO DA
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={t.operatorName} size={32}/>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{t.operatorName}</div>
                <div style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>TURNO A</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
