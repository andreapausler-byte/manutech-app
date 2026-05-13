// Facade del layer DB.
//
// L'API pubblica resta `db.<metodo>()` come prima: ogni metodo gira su Supabase
// se configurato (env VITE_SUPABASE_*) o cade su localStorage in demo mode.
//
// L'implementazione è ora suddivisa per dominio in `src/lib/db/`. Questo file
// si limita a riesportare il client e a comporre `db` dai moduli, così i
// chiamanti esistenti (47 file) non hanno bisogno di modifiche.

export { supabase, isSupabaseConfigured, DEMO_ORG_ID } from './db/_client'
export { ensureDefaultAdmin } from './db/_demoStore'

import { auth } from './db/auth'
import { reports } from './db/reports'
import { machines } from './db/machines'
import { maintenance } from './db/maintenance'
import { spareParts } from './db/spareParts'
import { storage } from './db/storage'
import { activities } from './db/activities'
import { notifications } from './db/notifications'
import { guest } from './db/guest'
import { messaging } from './db/messaging'
import { wallet } from './db/wallet'
import { analytics } from './db/analytics'
import { interventions } from './db/interventions'

export const db = {
  ...auth,
  ...reports,
  ...machines,
  ...maintenance,
  ...spareParts,
  ...storage,
  ...activities,
  ...notifications,
  ...guest,
  ...messaging,
  ...wallet,
  ...analytics,
  ...interventions,
}
