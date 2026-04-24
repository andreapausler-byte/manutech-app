/**
 * Feature flags runtime.
 *
 * Vite espone `import.meta.env.VITE_*` a build time.
 * Per attivare una feature in locale: aggiungere in `.env.local`:
 *   VITE_MT_V6=true
 *
 * In produzione il flag può essere cambiato da Vercel/Netlify → Environment
 * Variables → redeploy. Se spento (default), la feature non è raggiungibile.
 */
export const FEATURES = {
  // ManuTech v6 "Amarcord" — sandbox con Command Center + Ticket Board + Ticket Detail
  manutechV6: true,
}
