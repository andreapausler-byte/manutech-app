import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Cog,
  Gauge,
  Inbox,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings,
  Timer,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'

const PALETTE = [
  { name: 'Bone', hex: '#FAF9F5', role: 'Background' },
  { name: 'Ivory', hex: '#F5F4EE', role: 'Surface' },
  { name: 'Linen', hex: '#EFEDE4', role: 'Surface elevated' },
  { name: 'Fog', hex: '#E4E1D6', role: 'Border' },
  { name: 'Slate', hex: '#141413', role: 'Text primary' },
  { name: 'Stone', hex: '#6B6B62', role: 'Text muted' },
  { name: 'Clay', hex: '#CC785C', role: 'Accent (rust)' },
  { name: 'Moss', hex: '#7A8B5C', role: 'Success' },
  { name: 'Amber', hex: '#D4A04A', role: 'Warning' },
  { name: 'Brick', hex: '#B54545', role: 'Danger' },
]

const KPIS = [
  { label: 'Segnalazioni aperte', value: '12', delta: '-3 ieri', icon: AlertTriangle, tone: 'danger' },
  { label: 'In lavorazione', value: '7', delta: '+1 oggi', icon: Wrench, tone: 'accent' },
  { label: 'Risolte questa sett.', value: '48', delta: '+22%', icon: CheckCircle2, tone: 'success' },
  { label: 'MTTR medio', value: '3h 42m', delta: '-18 min', icon: Timer, tone: 'muted' },
]

const REPORTS = [
  { id: 'R-2048', title: 'Perdita olio su pressa idraulica #3', machine: 'Pressa idraulica #3', severity: 'critica', status: 'Aperta', time: '8 minuti fa' },
  { id: 'R-2047', title: 'Rumore anomalo cuscinetto motore', machine: 'Fresatrice CNC 4-assi', severity: 'alta', status: 'In lavorazione', time: '2 ore fa' },
  { id: 'R-2046', title: 'Sostituzione filtro aria programmata', machine: 'Compressore C-12', severity: 'bassa', status: 'Assegnata', time: '5 ore fa' },
]

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: ClipboardList, label: 'Segnalazioni', badge: '12' },
  { icon: Cog, label: 'Macchinari' },
  { icon: Wrench, label: 'Manutenzione' },
  { icon: Package, label: 'Ricambi' },
  { icon: Users, label: 'Tecnici' },
  { icon: TrendingUp, label: 'Report' },
]

const severityColor = (sev) => {
  if (sev === 'critica') return { fg: '#B54545', bg: 'rgba(181,69,69,0.10)' }
  if (sev === 'alta') return { fg: '#CC785C', bg: 'rgba(204,120,92,0.12)' }
  if (sev === 'media') return { fg: '#D4A04A', bg: 'rgba(212,160,74,0.14)' }
  return { fg: '#7A8B5C', bg: 'rgba(122,139,92,0.12)' }
}

function Swatch({ name, hex, role }) {
  return (
    <div className="cd-card" style={{ padding: 16 }}>
      <div style={{ height: 64, borderRadius: 8, background: hex, border: '1px solid var(--cd-border)', marginBottom: 12 }} />
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cd-text)' }}>{name}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--cd-text-muted)', marginTop: 2 }}>{hex}</div>
      <div style={{ fontSize: 12, color: 'var(--cd-text-muted)', marginTop: 6 }}>{role}</div>
    </div>
  )
}

function Section({ eyebrow, title, description, children }) {
  return (
    <section style={{ marginTop: 56 }}>
      <div style={{ marginBottom: 20 }}>
        {eyebrow && (
          <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cd-accent)', fontWeight: 500, marginBottom: 8 }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--cd-text)', margin: 0 }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 15, color: 'var(--cd-text-muted)', marginTop: 8, maxWidth: 640, lineHeight: 1.6 }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function Badge({ children, fg, bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 500,
      color: fg, background: bg, border: `1px solid ${fg}22`,
    }}>
      {children}
    </span>
  )
}

export default function DesignPreview() {
  return (
    <div
      className="claude-design"
      style={{
        '--cd-bg': '#FAF9F5',
        '--cd-surface': '#F5F4EE',
        '--cd-surface-2': '#EFEDE4',
        '--cd-border': '#E4E1D6',
        '--cd-text': '#141413',
        '--cd-text-muted': '#6B6B62',
        '--cd-accent': '#CC785C',
        '--cd-accent-hover': '#B86648',
        '--cd-success': '#7A8B5C',
        '--cd-warning': '#D4A04A',
        '--cd-danger': '#B54545',
        minHeight: '100vh',
        background: 'var(--cd-bg)',
        color: 'var(--cd-text)',
      }}
    >
      {/* ── Top bar ─────────────────────────────────── */}
      <div style={{
        borderBottom: '1px solid var(--cd-border)',
        background: 'var(--cd-bg)',
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'saturate(1.2)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--cd-accent)', display: 'grid', placeItems: 'center' }}>
              <Wrench size={16} color="#FAF9F5" />
            </div>
            <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>
              ManuTech
            </span>
            <span style={{ fontSize: 12, color: 'var(--cd-text-muted)', marginLeft: 6 }}>× Claude Design</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="cd-btn-ghost" aria-label="Notifiche"><Bell size={16} /></button>
            <button className="cd-btn-ghost" aria-label="Impostazioni"><Settings size={16} /></button>
            <button className="cd-btn-primary"><Plus size={14} /> Nuova segnalazione</button>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '56px 24px 96px' }}>
        {/* ── Hero ─────────────────────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cd-accent)', fontWeight: 500, marginBottom: 14 }}>
            Design mockup · claude.design
          </div>
          <h1 style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 'clamp(40px, 5vw, 64px)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: 0,
            color: 'var(--cd-text)',
          }}>
            Manutenzione industriale,<br />
            <em style={{ fontStyle: 'italic', color: 'var(--cd-accent)' }}>con calma</em> e carattere.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--cd-text-muted)', marginTop: 20, maxWidth: 640 }}>
            Una rilettura di ManuTech con il design-language di Claude: palette crema
            e terracotta, tipografia serif editoriale, spaziature generose. Stesso stack
            tecnico, tono editoriale.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
            <button className="cd-btn-primary">Esplora il mockup <ArrowRight size={14} /></button>
            <button className="cd-btn-outline">Confronta con l&apos;attuale</button>
          </div>
        </div>

        {/* ── Palette ─────────────────────────────── */}
        <Section
          eyebrow="01 · Palette"
          title="Toni caldi, neutri terrosi"
          description="Una base crema con accenti terracotta e semantici non saturi. Nessun nero puro: il testo primario è uno slate scuro #141413 che conserva calore."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {PALETTE.map(p => <Swatch key={p.hex} {...p} />)}
          </div>
        </Section>

        {/* ── Typography ──────────────────────────── */}
        <Section
          eyebrow="02 · Tipografia"
          title="Fraunces per la voce, Inter per la forma"
          description="Le intestazioni in Fraunces — un serif contemporaneo con varianti ottiche — danno carattere editoriale. Inter regge UI e testo corrente. JetBrains Mono per numeri e codici."
        >
          <div className="cd-card" style={{ padding: 32 }}>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 56, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Display — 56/60
            </div>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 20 }}>
              Heading 2 — 32/40
            </div>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 500, marginTop: 12 }}>
              Heading 3 — 22/28
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--cd-text-muted)', marginTop: 20, maxWidth: 620 }}>
              Body — 16/26. Le segnalazioni dei tecnici meritano di essere lette come un
              documento, non come un ticket. Inter ha un&apos;altezza-x alta che mantiene la
              leggibilità anche a corpi piccoli, mentre Fraunces firma i momenti chiave.
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--cd-text-muted)', marginTop: 16 }}>
              R-2048 · 3h 42m · MTTR -18%
            </div>
          </div>
        </Section>

        {/* ── Buttons ─────────────────────────────── */}
        <Section eyebrow="03 · Azioni" title="Pulsanti">
          <div className="cd-card" style={{ padding: 32, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button className="cd-btn-primary">Assegna tecnico</button>
            <button className="cd-btn-outline">Visualizza dettagli</button>
            <button className="cd-btn-ghost">Annulla</button>
            <button className="cd-btn-danger">Chiudi segnalazione</button>
            <div style={{ width: '100%', height: 1, background: 'var(--cd-border)', margin: '8px 0' }} />
            <button className="cd-btn-primary cd-btn-sm">Small</button>
            <button className="cd-btn-primary">Medium</button>
            <button className="cd-btn-primary cd-btn-lg">Large</button>
          </div>
        </Section>

        {/* ── KPI cards ───────────────────────────── */}
        <Section
          eyebrow="04 · Dashboard"
          title="KPI con respiro"
          description="Numeri grandi serif come titoli editoriali. Variazioni sobrie, niente effetti glow."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {KPIS.map(k => {
              const Icon = k.icon
              const toneMap = {
                danger: 'var(--cd-danger)',
                accent: 'var(--cd-accent)',
                success: 'var(--cd-success)',
                muted: 'var(--cd-text-muted)',
              }
              return (
                <div key={k.label} className="cd-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--cd-text-muted)', fontWeight: 500 }}>{k.label}</div>
                    <div style={{ color: toneMap[k.tone] }}><Icon size={18} /></div>
                  </div>
                  <div className="cd-kpi-value">{k.value}</div>
                  <div style={{ fontSize: 12, color: toneMap[k.tone], marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                    {k.delta}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── Layout: sidebar + reports ─────────── */}
        <Section
          eyebrow="05 · Layout"
          title="Navigazione e lista segnalazioni"
          description="Sidebar silenziosa, lista principale come un indice editoriale."
        >
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
            {/* Sidebar mock */}
            <nav className="cd-card" style={{ padding: 16, alignSelf: 'start' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cd-text-muted)', padding: '8px 10px 10px' }}>
                Area admin
              </div>
              {NAV_ITEMS.map(n => {
                const Icon = n.icon
                return (
                  <div key={n.label} className={`cd-nav-item ${n.active ? 'active' : ''}`}>
                    <Icon size={16} />
                    <span style={{ flex: 1 }}>{n.label}</span>
                    {n.badge && <span className="cd-nav-badge">{n.badge}</span>}
                  </div>
                )
              })}
            </nav>

            {/* Reports list */}
            <div className="cd-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 20, borderBottom: '1px solid var(--cd-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontWeight: 500 }}>Segnalazioni recenti</div>
                  <div style={{ fontSize: 13, color: 'var(--cd-text-muted)', marginTop: 2 }}>Ultime 24 ore · 19 totali</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--cd-border)', borderRadius: 6, background: 'var(--cd-bg)' }}>
                  <Search size={14} color="var(--cd-text-muted)" />
                  <span style={{ fontSize: 13, color: 'var(--cd-text-muted)' }}>Cerca…</span>
                </div>
              </div>
              {REPORTS.map((r, i) => {
                const sev = severityColor(r.severity)
                return (
                  <div key={r.id} style={{
                    padding: 20,
                    borderBottom: i < REPORTS.length - 1 ? '1px solid var(--cd-border)' : 'none',
                    display: 'flex', gap: 16, alignItems: 'center',
                  }}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--cd-text-muted)', width: 64 }}>
                      {r.id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cd-text)' }}>{r.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--cd-text-muted)', marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Cog size={12} /> {r.machine} · {r.time}
                      </div>
                    </div>
                    <Badge fg={sev.fg} bg={sev.bg}>{r.severity}</Badge>
                    <Badge fg="var(--cd-text-muted)" bg="var(--cd-surface-2)">{r.status}</Badge>
                    <ChevronRight size={16} color="var(--cd-text-muted)" />
                  </div>
                )
              })}
            </div>
          </div>
        </Section>

        {/* ── Form ───────────────────────────────── */}
        <Section eyebrow="06 · Input" title="Form: segnalazione nuova">
          <div className="cd-card" style={{ padding: 32, maxWidth: 640 }}>
            <label className="cd-label">Titolo</label>
            <input className="cd-input" placeholder="Es. Vibrazione anomala motore asse X" defaultValue="Perdita olio su pressa idraulica #3" />

            <label className="cd-label" style={{ marginTop: 20 }}>Macchinario</label>
            <select className="cd-input">
              <option>Pressa idraulica #3</option>
              <option>Fresatrice CNC 4-assi</option>
              <option>Compressore C-12</option>
            </select>

            <label className="cd-label" style={{ marginTop: 20 }}>Descrizione</label>
            <textarea className="cd-input" rows={4} placeholder="Descrivi il problema rilevato…" />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button className="cd-btn-outline">Annulla</button>
              <button className="cd-btn-primary">Invia segnalazione</button>
            </div>
          </div>
        </Section>

        {/* ── Empty state ────────────────────────── */}
        <Section eyebrow="07 · Vuoto" title="Empty state">
          <div className="cd-card" style={{ padding: 64, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--cd-surface-2)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <Inbox size={24} color="var(--cd-text-muted)" />
            </div>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 500 }}>Nessuna segnalazione aperta</div>
            <div style={{ fontSize: 14, color: 'var(--cd-text-muted)', marginTop: 8, maxWidth: 360, lineHeight: 1.6 }}>
              Tutti i macchinari sono operativi. Goditi il silenzio — o crea una manutenzione preventiva.
            </div>
            <button className="cd-btn-outline" style={{ marginTop: 20 }}>Pianifica manutenzione</button>
          </div>
        </Section>

        {/* ── Before / After ─────────────────────── */}
        <Section
          eyebrow="08 · Confronto"
          title="Prima / Dopo"
          description="Lo stesso KPI, due linguaggi visivi."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* ManuTech current */}
            <div style={{
              background: '#0a0a0f',
              border: '1px solid #1a1a26',
              borderRadius: 20,
              padding: 24,
              fontFamily: 'system-ui, sans-serif',
            }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>ManuTech · attuale</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Segnalazioni aperte</div>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(124,106,255,0.15)', display: 'grid', placeItems: 'center' }}>
                  <Gauge size={16} color="#7c6aff" />
                </div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>12</div>
              <div style={{ fontSize: 12, color: '#3ddc84', marginTop: 4 }}>-3 ieri</div>
            </div>

            {/* Claude redesign */}
            <div className="cd-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 12, color: 'var(--cd-accent)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>ManuTech · Claude</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--cd-text-muted)' }}>Segnalazioni aperte</div>
                <Gauge size={18} color="var(--cd-accent)" />
              </div>
              <div className="cd-kpi-value">12</div>
              <div style={{ fontSize: 12, color: 'var(--cd-success)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>-3 ieri</div>
            </div>
          </div>
        </Section>

        {/* ── Footer note ────────────────────────── */}
        <div style={{ marginTop: 80, paddingTop: 24, borderTop: '1px solid var(--cd-border)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--cd-text-muted)' }}>
            Mockup statico · <a href="/" style={{ color: 'var(--cd-accent)', textDecoration: 'none' }}>torna a ManuTech</a>
          </div>
        </div>
      </main>
    </div>
  )
}
