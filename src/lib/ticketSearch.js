import { formatTicketId } from './constants'

// Suggerimenti "forse cercavi" per la ricerca ticket: quando una query
// numerica (TK-id copiato a mano) non trova nulla, propone i ticket con
// le cifre a distanza di massimo 1 errore di battitura. Usato dalla lista
// mobile (ReportsList) e dalla lista admin desktop (AdminReports).

// Distanza di edit tra due stringhe corte (gruppi di cifre dei TK-id).
function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[m][n]
}

// Migliore distanza tra la query numerica e una finestra scorrevole delle
// cifre del TK-id (lunghezze q-1..q+1 per coprire inserzioni/cancellazioni).
export function bestDigitsDistance(query, digits) {
  if (digits.includes(query)) return 0
  let best = Infinity
  for (const len of [query.length - 1, query.length, query.length + 1]) {
    if (len < 1) continue
    for (let i = 0; i + len <= digits.length; i++) {
      best = Math.min(best, editDistance(digits.slice(i, i + len), query))
      if (best === 0) return 0
    }
  }
  return best
}

// Ticket con TK-id "vicino" alla query (≤1 errore di battitura sulle cifre),
// ordinati per distanza e poi per attività recente. Va chiamata su TUTTI i
// report visibili, ignorando i filtri attivi: un ID esatto nascosto da un
// filtro deve comunque riemergere come suggerimento.
export function findSimilarTickets(query, reports, limit = 3) {
  const q = (query || '').replace(/\D/g, '')
  if (q.length < 4) return []
  const scored = []
  for (const r of reports) {
    const digits = formatTicketId(r).replace(/\D/g, '')
    const d = bestDigitsDistance(q, digits)
    if (d <= 1) scored.push({ r, d })
  }
  return scored
    .sort((a, b) => a.d - b.d
      || new Date(b.r.updated_at || b.r.created_at) - new Date(a.r.updated_at || a.r.created_at))
    .slice(0, limit)
    .map(x => x.r)
}
