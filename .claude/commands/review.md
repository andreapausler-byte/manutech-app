Esegui una code review del branch corrente rispetto al branch principale.

## Passaggi

1. Esegui `git diff main...HEAD` per vedere tutte le modifiche del branch
2. Per ogni file modificato, analizza:

### Sicurezza
- Input non sanitizzati (XSS, injection)
- Segreti hardcodati (.env vars usate correttamente?)
- RLS bypass (query senza org_id, insert senza RPC su tabelle protette)

### Pattern progetto
- Demo mode: ogni funzione DB ha fallback localStorage?
- UI in italiano? Codice in inglese?
- Stili: usa Tailwind + CSS vars? No file CSS separati?
- Icone: solo lucide-react?
- Date: usa formatDate/timeAgo da constants.js?
- Stato: Context + useState, no Redux?

### Performance
- Query N+1? (loop con await singoli)
- Re-render non necessari? (dipendenze useMemo/useCallback corrette?)
- Immagini non compresse?

### Qualità
- Componenti >300 righe? Suggerisci split
- Error handling: .catch silenti?
- Console.log dimenticati?

3. Riporta un sommario con:
   - Problemi critici (da fixare)
   - Suggerimenti (miglioramenti opzionali)
   - Checklist pre-merge
