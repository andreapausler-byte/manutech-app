/**
 * Mini markdown renderer condiviso. Gestisce **bold**, ## / ### heading,
 * liste numerate/puntate, newline. Niente dipendenze esterne, niente
 * dangerouslySetInnerHTML — output di nodi React puri.
 *
 * Estratto da AssistantChat.jsx per riuso ovunque l'output LLM
 * (markdown semplice) venga mostrato in UI.
 */

function renderInline(text, keyBase) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) {
      return <strong key={`${keyBase}-b-${i}`} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
    }
    return <span key={`${keyBase}-t-${i}`}>{p}</span>
  })
}

export function renderMarkdown(content) {
  if (!content) return null
  const lines = String(content).split('\n')
  const nodes = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const heading = trimmed.match(/^(#{2,3})\s+(.*)$/)
    if (heading) {
      nodes.push(
        <div
          key={`h-${i}`}
          style={{
            fontSize: heading[1].length === 2 ? 14 : 13,
            fontWeight: 700,
            color: 'var(--color-primary)',
            marginTop: nodes.length === 0 ? 0 : 10,
            marginBottom: 4,
          }}
        >
          {renderInline(heading[2], `h${i}`)}
        </div>
      )
      i++
      continue
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/)
        if (m) items.push({ num: m[1], text: m[2] })
        i++
      }
      nodes.push(
        <ol key={`ol-${i}`} style={{ margin: '4px 0 6px 0', paddingLeft: 22 }}>
          {items.map((it, j) => (
            <li key={j} style={{ marginBottom: 3 }}>{renderInline(it.text, `ol-${i}-${j}`)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      nodes.push(
        <ul key={`ul-${i}`} style={{ margin: '4px 0 6px 0', paddingLeft: 20, listStyle: 'disc' }}>
          {items.map((it, j) => (
            <li key={j} style={{ marginBottom: 3 }}>{renderInline(it, `ul-${i}-${j}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (trimmed === '') {
      nodes.push(<div key={`sp-${i}`} style={{ height: 6 }} />)
      i++
      continue
    }

    nodes.push(
      <div key={`p-${i}`} style={{ marginBottom: 2 }}>
        {renderInline(line, `p${i}`)}
      </div>
    )
    i++
  }

  return <>{nodes}</>
}
