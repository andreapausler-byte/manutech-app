/**
 * useTicketAIContext — assembla il contesto per la chat AI in modalità 'ticket'.
 *
 * Tutte le query usano il client Supabase dell'utente loggato: la RLS
 * (`org_id = get_my_org_id()`) scopa automaticamente i dati all'org dell'utente,
 * quindi il pacchetto restituito è già org-safe. Lo passiamo poi all'Edge
 * Function come `context` (vedi assistant.sendMessage / scope 'ticket').
 *
 * Input:  { reportId, machineId }
 * Output: { context, loading, error }
 *
 * context = {
 *   report:  { display_id, title, description, severity, status, type, created_at, closed_at, closure_* },
 *   machine: { name, serial_number, manufacturer, model, year, department, location, status, criticality },
 *   same_machine_reports: [ { display_id, title, severity, status, type, created_at, closed_at, closure_root_cause } ]
 * }
 *
 * Taglio "altre segnalazioni stessa macchina": ancora APERTE (qualunque età)
 * + CHIUSE negli ultimi 12 mesi, esclusa la corrente, più recenti prima, cap 20.
 *
 * Gotcha gestita: il contesto è asincrono e dipende da reportId. L'effect si
 * ri-esegue al cambio di reportId/machineId; un flag `cancelled` evita race se
 * l'utente passa rapidamente da un ticket all'altro.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CLOSED_STATUSES = ['risolta', 'chiuso']
const SAME_MACHINE_CAP = 20

// Select con display_id (migration 049 TK-id). Se la colonna non esiste su DB
// più vecchi, la query fallisce: ripieghiamo sullo stesso select senza display_id.
async function selectWithDisplayIdFallback(buildQuery, withCols, withoutCols) {
  const r1 = await buildQuery(withCols)
  if (!r1.error) return r1.data
  console.warn('[useTicketAIContext] select con display_id fallito, retry senza:', r1.error.message)
  const r2 = await buildQuery(withoutCols)
  if (r2.error) throw r2.error
  return r2.data
}

export function useTicketAIContext({ reportId, machineId } = {}) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    // Demo mode o nessun ticket: nessun contesto da assemblare.
    if (!supabase || !reportId) {
      setContext(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        // 1. Segnalazione corrente (canonica dal DB).
        const report = await selectWithDisplayIdFallback(
          (cols) => supabase.from('reports').select(cols).eq('id', reportId).maybeSingle(),
          'id, display_id, title, description, severity, status, type, machine, machine_id, created_at, closed_at, closure_root_cause, closure_action, closure_parts',
          'id, title, description, severity, status, type, machine, machine_id, created_at, closed_at, closure_root_cause, closure_action, closure_parts',
        )

        const mId = machineId || report?.machine_id || null

        // 2. Macchinario + scheda tecnica.
        let machine = null
        if (mId) {
          const { data, error: mErr } = await supabase
            .from('machines')
            .select('id, name, serial_number, manufacturer, model, year, department, location, status, criticality')
            .eq('id', mId)
            .maybeSingle()
          if (mErr) console.warn('[useTicketAIContext] machine fetch:', mErr.message)
          machine = data || null
        }

        // 3. Altre segnalazioni stessa macchina: aperte (qualunque età) +
        //    chiuse ultimi 12 mesi, esclusa la corrente, più recenti prima.
        let sameMachineReports = []
        if (mId) {
          const since = new Date()
          since.setMonth(since.getMonth() - 12)
          const orFilter = `status.not.in.(${CLOSED_STATUSES.join(',')}),closed_at.gte.${since.toISOString()}`
          sameMachineReports = await selectWithDisplayIdFallback(
            (cols) =>
              supabase
                .from('reports')
                .select(cols)
                .eq('machine_id', mId)
                .neq('id', reportId)
                .or(orFilter)
                .order('created_at', { ascending: false })
                .limit(SAME_MACHINE_CAP),
            'id, display_id, title, severity, status, type, created_at, closed_at, closure_root_cause',
            'id, title, severity, status, type, created_at, closed_at, closure_root_cause',
          ) || []
        }

        if (cancelled) return

        setContext({
          report: report
            ? {
                display_id: report.display_id ?? null,
                title: report.title ?? null,
                description: report.description ?? null,
                severity: report.severity ?? null,
                status: report.status ?? null,
                type: report.type ?? null,
                created_at: report.created_at ?? null,
                closed_at: report.closed_at ?? null,
                closure_root_cause: report.closure_root_cause ?? null,
                closure_action: report.closure_action ?? null,
                closure_parts: report.closure_parts ?? null,
              }
            : null,
          machine,
          same_machine_reports: sameMachineReports,
        })
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Errore caricamento contesto ticket')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [reportId, machineId])

  return { context, loading, error }
}
