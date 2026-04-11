/**
 * PageHeader — header locale per le pagine admin.
 *
 * Dopo il restyle Stitch, il top header del layout è minimale (solo azioni
 * globali). Ogni pagina mostra il proprio titolo/descrizione tramite questo
 * componente, mantenendo la coerenza tipografica.
 */
export default function PageHeader({ title, description, actions }) {
  return (
    <header className="flex items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="text-sm mt-1.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </header>
  )
}
