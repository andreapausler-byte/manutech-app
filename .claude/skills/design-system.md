# Skill: Design System ManuTech

## Font
- **Outfit**: UI principale (weights: 300-700)
- **JetBrains Mono**: numeri, codice, punteggi (weights: 400-600)

```jsx
// Numeri/punteggi
style={{ fontFamily: "'JetBrains Mono', monospace" }}
```

## Colori — usa SEMPRE CSS variables
```css
/* Primario (cambia con accent preset) */
var(--color-primary)         /* #7c6aff default */
var(--color-primary-light)
var(--color-primary-dark)
var(--color-primary-glow)    /* per background highlight */

/* Semantici */
var(--color-success)    /* #3ddc84 - verde */
var(--color-warning)    /* #ffaa2c - arancio */
var(--color-danger)     /* #ff5c5c - rosso */
var(--color-info)       /* #00d4ff - cyan */

/* Superfici (dark mode) */
var(--color-bg)         /* #0a0a0f - sfondo app */
var(--color-surface-1)  /* #12121a - header, nav */
var(--color-surface-2)  /* #16161f - input bg, chip */
var(--color-surface-3)  /* #1a1a26 - hover */
var(--color-card)       /* #16161f - card background */

/* Testo */
var(--color-text)           /* primario */
var(--color-text-secondary) /* secondario */
var(--color-text-muted)     /* label, hint */
var(--color-text-faint)     /* disabilitato */

/* Bordi */
var(--color-border)         /* bordo base */
var(--color-border-hover)   /* bordo hover */
```

## Componenti base (`components/ui/index.jsx`)

### Button
```jsx
<Button variant="primary" size="md" onClick={...}>Salva</Button>
// Varianti: primary, success, danger, ghost, outline
// Size: sm, md, lg
```

### Input / Select / Textarea
```jsx
<Input label="Nome" value={v} onChange={...} error={err} />
<Select label="Ruolo" options={[{value:'admin',label:'Admin'}]} value={v} onChange={...} />
```

### Modal (bottom sheet)
```jsx
<Modal open={isOpen} onClose={() => setOpen(false)} title="Titolo">
  {children}
</Modal>
```

### Badge
```jsx
<Badge label="Critica" color="#ff5c5c" bg="rgba(255,92,92,0.10)" />
// Usa i valori da constants.js: SEVERITY, STATUS
```

### Loading
```jsx
<Spinner size={32} />
<SkeletonDashboard />  // placeholder durante caricamento
```

## Pattern card
```jsx
<div style={{
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 16,  // 16-24px per card
  padding: '16px 18px',
}}>
```

## Glass morphism
```jsx
// Classe utility
<div className="glass">        // blur 16px, opacity 88%
<div className="glass-heavy">  // blur 24px, opacity 92%

// Manuale
style={{
  background: 'var(--glass-bg)',
  backdropFilter: `blur(var(--glass-blur))`,
  border: '1px solid var(--glass-border)',
}}
```

## Bottoni interattivi mobile
```jsx
<button
  onClick={handler}
  className="press-scale"  // SEMPRE per feedback tap
  style={{
    padding: '14px 24px',
    borderRadius: 16,
    fontSize: 15,
    fontWeight: 700,
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  }}
>
```

## Section header (mobile dashboard)
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
  <div style={{
    width: 40, height: 40, borderRadius: 12,
    background: '#7c6aff18',  // colore + 18 per opacity
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <Icon size={20} style={{ color: '#7c6aff' }} />
  </div>
  <div>
    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Titolo</h3>
    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sottotitolo</p>
  </div>
</div>
```

## KPI card
```jsx
<div style={{
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderTop: `3px solid ${color}`,  // accento colorato in alto
  borderRadius: 14,
  padding: '14px 8px',
  textAlign: 'center',
}}>
  <p style={{
    fontSize: 28, fontWeight: 800, color,
    fontFamily: "'JetBrains Mono', monospace",
  }}>{value}</p>
  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</p>
</div>
```

## Status badge inline
```jsx
import { STATUS, SEVERITY } from '../lib/constants'
const s = STATUS[report.status]  // { label, color, bg, icon }
<span style={{
  fontSize: 11, fontWeight: 700,
  padding: '2px 8px', borderRadius: 6,
  background: `${s.color}15`, color: s.color,
}}>
  {s.icon} {s.label}
</span>
```

## Animazioni utili (definite in index.css)
```jsx
className="animate-fade-in"     // opacity 0→1
className="animate-slide-up"    // translateY(10px)→0 + fade
// Per elementi custom:
style={{ animation: 'fadeIn 0.3s ease' }}
style={{ animation: 'slideUp 0.4s var(--ease-out-expo)' }}
```

## Responsive
- Mobile-first: layout pensato per 375-428px width
- Admin layout: sidebar 260px (collassabile a 72px)
- Safe area: `padding-bottom: env(safe-area-inset-bottom)` via `.safe-area-bottom`
- Bottom nav mobile: fissa, z-40, altezza ~58px + safe area
