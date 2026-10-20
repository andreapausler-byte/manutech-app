// Pannello della mappa impianto: a destra su desktop, foglio dal basso sul
// telefono. Cinque viste: stabilimento, area, macchina, posizione della
// linea lenta, "Da posizionare". Solo variabili CSS, niente classi.

import { useState } from 'react'
import { X, ExternalLink, MapPin, Check, Move } from 'lucide-react'
import { STATUS, formatDay, formatTicketId } from '../../lib/constants'
import { MAP_CONF } from '../../lib/plantMap'

const STATUS_VAR = { ok: 'var(--color-green)', warn: 'var(--color-orange)', bad: 'var(--color-red)', none: 'var(--color-text-muted)' }
const SEV_VAR = { critica: 'var(--color-red)', alta: 'var(--color-red)', media: 'var(--color-orange)', bassa: 'var(--color-text-muted)' }
const LIGHT_VAR = { overdue: 'var(--color-red)', warning: 'var(--color-orange)', ok: 'var(--color-green)' }

const fmtM = (mm) => (mm / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function Eyebrow({ children, mono }) {
  return (
    <div style={{
      font: `500 10.5px ${mono}`, letterSpacing: '.09em', textTransform: 'uppercase',
      color: 'var(--color-text-faint)', margin: '16px 0 8px',
    }}>{children}</div>
  )
}

function Header({ title, subtitle, onClose, closeLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: 'var(--color-text)', textWrap: 'balance' }}>{title}</h2>
        {subtitle && <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: 12.5 }}>{subtitle}</p>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel || 'Chiudi'} style={{
          flex: 'none', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--color-border)',
          background: 'none', display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)', cursor: 'pointer',
        }}><X size={15} /></button>
      )}
    </div>
  )
}

function Row({ onClick, children, title }) {
  const [hover, setHover] = useState(false)
  return (
    <button type="button" onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="press-scale"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 0,
        background: hover ? 'var(--color-surface-2)' : 'none', padding: 8, borderRadius: 9, minWidth: 0,
        color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'inherit',
      }}>
      {children}
    </button>
  )
}

function RowName({ name, sub }) {
  return (
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
      {name}
      {sub && <small style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</small>}
    </span>
  )
}

const Swatch = ({ color, size = 12 }) => (
  <span style={{ width: size, height: size, borderRadius: 3, background: color, flex: 'none' }} />
)

function Dot({ status, estimated, off }) {
  const c = STATUS_VAR[status] || STATUS_VAR.none
  return (
    <span style={{
      width: 9, height: 9, borderRadius: '50%', flex: 'none',
      background: off ? 'transparent' : c,
      border: off ? `1.5px dashed ${c}` : 'none',
      boxShadow: estimated && !off ? `0 0 0 2px var(--color-surface-1), 0 0 0 3px ${c}` : 'none',
    }} />
  )
}

function Tag({ children, color, swatch }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', borderRadius: 999,
      border: `1px solid ${color && !swatch ? color : 'var(--color-border-hover)'}`, fontSize: 12, whiteSpace: 'nowrap',
      color: color && !swatch ? color : 'var(--color-text)',
    }}>
      {swatch && <Swatch color={swatch} size={9} />}
      {children}
    </span>
  )
}

function Btn({ onClick, children, primary, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="press-scale" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8,
      border: `1px solid ${primary ? 'var(--color-primary)' : 'var(--color-border-hover)'}`,
      background: primary ? 'var(--color-primary)' : 'var(--color-surface-2)',
      color: primary ? '#fff' : 'var(--color-text)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
    }}>{children}</button>
  )
}

function Note({ children }) {
  return (
    <div style={{
      fontSize: 12.5, color: 'var(--color-text-muted)', border: '1px dashed var(--color-border-hover)',
      borderRadius: 10, padding: '10px 12px', margin: '10px 0', lineHeight: 1.45,
    }}>{children}</div>
  )
}

const Strong = ({ children }) => <b style={{ color: 'var(--color-text)', fontWeight: 600 }}>{children}</b>

function Legend({ mono, projectColor }) {
  const item = (el, label) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{el}{label}</span>
  )
  const ring = (c, style = 'solid', fill = true) => (
    <i style={{
      width: 12, height: 12, borderRadius: '50%', flex: 'none',
      background: fill ? c : 'transparent',
      border: fill ? 'none' : `1.5px ${style} var(--color-text-muted)`,
      boxShadow: fill ? `0 0 0 2px var(--color-surface-1), 0 0 0 3.5px ${c}` : 'none',
    }} />
  )
  return (
    <div>
      <Eyebrow mono={mono}>Legenda</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
        {item(ring(STATUS_VAR.ok), 'Nessun ticket aperto')}
        {item(ring(STATUS_VAR.warn), 'Ticket aperti')}
        {item(ring(STATUS_VAR.bad), 'Ticket con gravità alta o critica')}
        {projectColor && item(<i style={{ width: 12, height: 12, borderRadius: 4, flex: 'none', border: `1.5px solid ${projectColor}` }} />, 'Posizione linea lenta')}
        {item(ring(null, 'solid', false), 'Posizione dal disegno o confermata')}
        {item(ring(null, 'dashed', false), 'Posizione stimata, da verificare')}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', color: 'var(--color-text)' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }} />
      {children}
    </label>
  )
}

function MachineRow({ info, onSelect }) {
  const m = info.machine
  const sub = [m.manufacturer, m.model].filter(Boolean).join(' · ') || (info.pos ? MAP_CONF[info.pos.conf].label : 'Non ancora sulla mappa')
  return (
    <Row onClick={() => onSelect(info.id)}>
      <Dot status={info.status} estimated={info.pos?.estimated} off={!info.pos} />
      <RowName name={info.name} sub={sub} />
      {info.openReports.length > 0 && (
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-orange)', whiteSpace: 'nowrap' }}>{info.openReports.length} ticket</span>
      )}
    </Row>
  )
}

const sortByStatus = (a, b) => ({ bad: 0, warn: 1, ok: 2 })[a.status] - ({ bad: 0, warn: 1, ok: 2 })[b.status] || a.name.localeCompare(b.name)

// ── viste ────────────────────────────────────────────────────────────

function Overview({ plant, infos, areaColor, areaStats, noArea, canEdit, showProject, onlyOpen, onToggleProject, onToggleOnlyOpen, onFocusArea, loading, mono }) {
  const placed = infos.filter(i => i.pos)
  const open = infos.reduce((n, i) => n + i.openReports.length, 0)
  const withOpen = infos.filter(i => i.openReports.length).length
  const pa = plant.projectArea
  return (
    <>
      <Header title={plant.title} subtitle="Scegli un'area per vedere le sue macchine, poi tocca un punto per aprire la scheda." />
      {loading ? (
        <div style={{ padding: '12px 4px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          <Strong>Caricamento delle macchine…</Strong><br />Le aree sono già navigabili.
        </div>
      ) : !placed.length ? (
        <Note>
          <Strong>Nessuna macchina sulla mappa. </Strong>
          {canEdit ? 'Passa a Posiziona e usa «Da posizionare» per mettere la prima.' : 'I punti compariranno appena un tecnico o un admin li mette.'}
        </Note>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 6 }}>
          {[
            [placed.length < infos.length ? `${placed.length}/${infos.length}` : placed.length, placed.length < infos.length ? 'sulla mappa' : 'macchine', null],
            [open, 'ticket aperti', 'var(--color-orange)'],
            [withOpen, 'macchine con ticket', null],
          ].map(([v, l, c]) => (
            <div key={l} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 10px' }}>
              <b style={{ display: 'block', font: `500 20px/1.1 ${mono}`, color: c || 'var(--color-text)' }}>{v}</b>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      <Eyebrow mono={mono}>Aree</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {plant.areas.map(a => {
          const st = areaStats.get(a.key) || { n: 0, open: 0 }
          return (
            <Row key={a.key} onClick={() => onFocusArea(a.key)}>
              <Swatch color={areaColor(a)} />
              <RowName name={a.key} />
              <span style={{ font: `500 11.5px ${mono}`, color: 'var(--color-text-muted)' }}>{st.n}</span>
              {st.open > 0 && <span style={{ font: `500 11px ${mono}`, color: 'var(--color-orange)' }}>{st.open} tk</span>}
            </Row>
          )
        })}
        {pa && (
          <Row onClick={() => onFocusArea(pa.key)}>
            <Swatch color={areaColor(pa)} />
            <RowName name={pa.key} sub={pa.sub} />
            <span style={{ font: `500 11.5px ${mono}`, color: 'var(--color-text-muted)' }}>{pa.positions.length} pos.</span>
          </Row>
        )}
        {noArea.list.length > 0 && (
          <Row onClick={() => onFocusArea(noArea.key)}>
            <Swatch color="var(--color-text-muted)" />
            <RowName name="Senza area in ManuTech" sub={noArea.list.map(i => i.name).join(', ')} />
            <span style={{ font: `500 11.5px ${mono}`, color: 'var(--color-text-muted)' }}>{noArea.list.length}</span>
          </Row>
        )}
      </div>
      <Eyebrow mono={mono}>Livelli</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plant.project && <Toggle checked={showProject} onChange={onToggleProject}>{plant.projectLabel} (linea lenta e studi)</Toggle>}
        <Toggle checked={onlyOpen} onChange={onToggleOnlyOpen}>Evidenzia solo macchine con ticket aperti</Toggle>
      </div>
      <Legend mono={mono} projectColor={pa ? areaColor(pa) : null} />
    </>
  )
}

function AreaView({ plant, focus, infos, areaStats, noArea, canEdit, onSelectMachine, onSelectProject, onBack, mono, areaColor }) {
  const pa = plant.projectArea
  if (pa && focus === pa.key) {
    return (
      <>
        <Header title={pa.key} subtitle={pa.note} onClose={onBack} closeLabel="Torna allo stabilimento" />
        <Eyebrow mono={mono}>{pa.positions.length} posizioni</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pa.positions.map(p => (
            <Row key={p.n} onClick={() => onSelectProject(p.n)}>
              <span style={{
                width: 22, height: 20, borderRadius: 5, border: `1.5px solid ${areaColor(pa)}`, color: areaColor(pa),
                font: `600 10px/17px ${mono}`, textAlign: 'center', flex: 'none',
              }}>{p.n}</span>
              <RowName name={p.name} sub={p.original} />
            </Row>
          ))}
        </div>
      </>
    )
  }
  const list = (focus === noArea.key ? noArea.list : infos.filter(i => i.areaKey === focus)).slice().sort(sortByStatus)
  const open = list.reduce((n, i) => n + i.openReports.length, 0)
  const est = list.filter(i => i.pos?.estimated).length
  const off = list.filter(i => !i.pos).length
  const title = focus === noArea.key ? 'Senza area in ManuTech' : focus
  const st = areaStats.get(focus)
  return (
    <>
      <Header title={title} subtitle={`${st?.n ?? list.length} macchine · ${open} ticket aperti`} onClose={onBack} closeLabel="Torna allo stabilimento" />
      {!list.length && (
        <div style={{ padding: '12px 4px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          <Strong>Nessuna macchina in quest'area.</Strong><br />Le macchine assegnate a quest'area in ManuTech compariranno qui.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {list.map(i => <MachineRow key={i.id} info={i} onSelect={onSelectMachine} />)}
      </div>
      {est > 0 && (
        <Note>
          <Strong>{est === 1 ? '1 posizione da verificare. ' : `${est} posizioni da verificare. `}</Strong>
          {canEdit ? 'In Posiziona trascina i punti tratteggiati sulla macchina vera, o aprili e premi «Conferma posizione».' : 'I punti tratteggiati sono stime ricavate dalla planimetria.'}
        </Note>
      )}
      {off > 0 && (
        <Note>
          <Strong>{off === 1 ? '1 macchina non è sulla mappa. ' : `${off} macchine non sono sulla mappa. `}</Strong>
          {canEdit ? 'Aprila e premi «Posiziona», poi tocca il punto dove si trova.' : 'La vedrai appena un tecnico o un admin la posiziona.'}
        </Note>
      )}
    </>
  )
}

function Kv({ rows, mono }) {
  const shown = rows.filter(([, v]) => v != null && v !== '')
  if (!shown.length) return null
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px', margin: 0, fontSize: 13 }}>
      {shown.map(([k, v, m]) => [
        <dt key={k + 't'} style={{ color: 'var(--color-text-muted)' }}>{k}</dt>,
        <dd key={k + 'd'} style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere', color: 'var(--color-text)', fontFamily: m ? mono : undefined, fontSize: m ? 12.5 : undefined }}>{v}</dd>,
      ])}
    </dl>
  )
}

function MachineView({ info, areaLabel, areaSwatch, canEdit, saving, onBack, onOpenMachine, onOpenReport, onConfirm, onReposition, mono }) {
  const m = info.machine
  const sub = [m.manufacturer, m.model].filter(Boolean).join(' · ') || 'Dati anagrafici non compilati in ManuTech'
  const pos = info.pos
  const nOpen = info.openReports.length
  return (
    <>
      <Header title={info.name} subtitle={sub} onClose={onBack} closeLabel="Chiudi scheda" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 10px' }}>
        <Tag swatch={areaSwatch}>{areaLabel}</Tag>
        <Tag color={STATUS_VAR[info.status]}>{nOpen ? `${nOpen} ticket aperti` : 'Nessun ticket aperto'}</Tag>
        {m.criticality && <Tag>Criticità {m.criticality}</Tag>}
        {m.status && m.status !== 'attivo' && <Tag>{m.status}</Tag>}
      </div>
      {onOpenMachine && (
        <Btn primary onClick={() => onOpenMachine(m)}><ExternalLink size={14} /> Apri scheda macchina</Btn>
      )}

      <Eyebrow mono={mono}>Scheda</Eyebrow>
      <Kv mono={mono} rows={[
        ['Costruttore', m.manufacturer],
        ['Modello', m.model, true],
        ['Matricola', m.serial_number, true],
        ['Anno', m.year ? String(m.year) : '', true],
        ['Reparto', m.department],
        ['Allegati', Array.isArray(m.attachments) && m.attachments.length ? String(m.attachments.length) : '', true],
        ['Segnalazioni', info.totReports ? `${info.totReports}${info.lastReportAt ? ` · ultima ${formatDay(info.lastReportAt)}` : ''}` : '0', true],
      ]} />

      <Eyebrow mono={mono}>Ticket aperti{nOpen ? ` (${nOpen})` : ''}</Eyebrow>
      {!nOpen ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nessun ticket aperto.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {info.openReports.slice(0, 8).map(r => (
            <button key={r.id} type="button" onClick={() => onOpenReport?.(r)} disabled={!onOpenReport} className="press-scale" style={{
              textAlign: 'left', border: '1px solid var(--color-border)', borderLeft: `3px solid ${SEV_VAR[r.severity] || 'var(--color-orange)'}`,
              borderRadius: 9, padding: '8px 10px', fontSize: 13, background: 'none', color: 'var(--color-text)',
              cursor: onOpenReport ? 'pointer' : 'default', fontFamily: 'inherit',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', font: `500 11px ${mono}`, color: 'var(--color-text-muted)', marginBottom: 2 }}>
                <b style={{ color: SEV_VAR[r.severity] || 'var(--color-orange)', fontWeight: 500 }}>{formatTicketId(r)}</b>
                <span>{STATUS[r.status]?.label || r.status}</span>
                <span style={{ marginLeft: 'auto' }}>{formatDay(r.created_at)}</span>
              </div>
              <div style={{ fontSize: 13 }}>{r.title}</div>
            </button>
          ))}
          {nOpen > 8 && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>e altri {nOpen - 8} nella scheda macchina</div>}
        </div>
      )}

      {info.plans.length > 0 && (
        <>
          <Eyebrow mono={mono}>Piani di manutenzione ({info.plans.length})</Eyebrow>
          <div>
            {info.plans.map(({ plan, light }, i) => (
              <div key={plan.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0',
                borderBottom: i < info.plans.length - 1 ? '1px solid var(--color-border)' : 'none', color: 'var(--color-text)',
              }}>
                <span style={{ minWidth: 0 }}>{plan.name}</span>
                <span style={{ font: `500 11.5px ${mono}`, whiteSpace: 'nowrap', color: LIGHT_VAR[light.status] }}>
                  {plan.frequency_days ? `ogni ${plan.frequency_days} gg · ` : ''}{light.label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <Eyebrow mono={mono}>Posizione sulla mappa</Eyebrow>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--color-text)' }}>
        {pos ? (
          <>
            <div><Strong>{MAP_CONF[pos.conf].label}</Strong>{pos.basis ? ` — ${pos.basis}` : ''}</div>
            <div style={{ font: `400 12px ${mono}`, color: 'var(--color-text-muted)', marginTop: 4 }}>
              X {fmtM(pos.x)} m · Y {fmtM(pos.y)} m (coordinate del disegno)
            </div>
            {pos.updatedAt && (
              <div style={{ font: `400 12px ${mono}`, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Aggiornata il {formatDay(pos.updatedAt)}{pos.updatedByName ? ` da ${pos.updatedByName}` : ''}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>Non ancora sulla mappa.</div>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {pos && pos.conf !== 'confermata' && (
              <Btn primary disabled={saving} onClick={() => onConfirm(info.id)}><Check size={14} /> Conferma posizione</Btn>
            )}
            <Btn disabled={saving} onClick={() => onReposition(info.id)}>
              {pos ? <><Move size={14} /> Riposiziona</> : <><MapPin size={14} /> Posiziona</>}
            </Btn>
          </div>
        )}
      </div>
    </>
  )
}

function ProjectView({ plant, n, onBack, mono, areaColor }) {
  const pa = plant.projectArea
  const p = pa.positions.find(x => x.n === n)
  if (!p) return null
  return (
    <>
      <Header title={p.name} subtitle={p.original} onClose={onBack} closeLabel="Chiudi scheda" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 6px' }}>
        <Tag swatch={areaColor(pa)}>{pa.key} · progetto</Tag>
        <Tag>Posizione {p.n}</Tag>
      </div>
      <Note>Macchina prevista dal layout Beertec della linea lenta. Quando sarà installata e creata in ManuTech, si posiziona qui come le altre.</Note>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--color-text)' }}>
        <div><Strong>Dal layout Beertec</Strong> — numero di posizione sulla tavola</div>
        <div style={{ font: `400 12px ${mono}`, color: 'var(--color-text-muted)', marginTop: 4 }}>X {fmtM(p.x)} m · Y {fmtM(p.y)} m (coordinate del disegno)</div>
      </div>
    </>
  )
}

function TrayView({ unplaced, onStartPlacing, onClose }) {
  return (
    <>
      <Header title="Da posizionare" subtitle="Macchine in ManuTech che non sono ancora sulla mappa. Sceglile, poi tocca il punto esatto." onClose={onClose} />
      {!unplaced.length ? (
        <div style={{ padding: '12px 4px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          <Strong>Tutte le macchine sono sulla mappa.</Strong><br />Le nuove macchine create in ManuTech compariranno qui.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {unplaced.map(i => (
            <Row key={i.id} onClick={() => onStartPlacing(i.id)}>
              <Dot status="none" off />
              <RowName name={i.name} sub={i.areaName || 'Senza area'} />
              <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Posiziona</span>
            </Row>
          ))}
        </div>
      )}
    </>
  )
}

export default function PlantMapPanel(props) {
  const { view } = props
  if (view === 'tray') return <TrayView {...props} />
  if (view === 'project') return <ProjectView {...props} />
  if (view === 'machine') return <MachineView {...props} />
  if (view === 'area') return <AreaView {...props} />
  return <Overview {...props} />
}
