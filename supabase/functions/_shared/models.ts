// supabase/functions/_shared/models.ts
//
// Resolver centralizzato dei modelli Anthropic per ManuTech.
// Mappa la "Potenza AI" (vocabolario user-facing: veloce/equilibrato/approfondito)
// sul modello concreto, per superficie. Vedi:
//   docs/decisions/ADR-010-ai-strategy-vision.md → sezione "Politica modelli" (6/6/2026)
//
// Lo usano:
//   - assistant-chat (questo sprint)
//   - summarize (Fase B, futuro)
//
// Caveat Opus 4.8 e Sonnet 5.5 (verificato sui doc Anthropic): NON si possono
// inviare temperature/top_p/top_k né thinking.budget_tokens → 400. La profondità
// si controlla con thinking adaptive + output_config.effort. Su Haiku i
// parametri standard restano ammessi.
//
// Sonnet 5.5 (dal 1/10/2026, prima Sonnet 4.6): ragiona sempre (adaptive) —
// su 4.6 senza `thinking` non ragionava affatto — e il ragionamento conta dentro
// max_tokens, quindi i chiamanti aggiungono `thinkingHeadroom` al loro tetto.
// Il suo tokenizer conta ~30% di token in più a parità di testo.

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-4-8',
} as const

export type Power = 'veloce' | 'equilibrato' | 'approfondito'
export type Surface = 'assistant_chat' | 'summarize'

export const DEFAULT_POWER: Power = 'equilibrato'

// Livello di effort di partenza per Opus 4.8. Da tarare col pilota (Fase D).
const OPUS_EFFORT_DEFAULT = 'medium'

// Sonnet 5.5: 'low' è il punto di partenza consigliato per chat, riassunti e
// ricerca — ragiona poco e salta il ragionamento sulle richieste semplici, la
// cosa più vicina a Sonnet 4.6 che non ragionava. Se le risposte risultano
// superficiali si alza a 'medium' qui, non con istruzioni nel prompt.
const SONNET_EFFORT_DEFAULT = 'low'

// Token in più oltre al tetto della risposta per i modelli che ragionano: il
// thinking conta dentro max_tokens e, senza margine, la risposta si tronca.
const THINKING_HEADROOM = 6000

export interface ResolvedModel {
  model: string
  // Parametri extra da fondere nel body di POST /v1/messages.
  extraBody: Record<string, unknown>
  // Header extra (beta) per POST /v1/messages.
  extraHeaders: Record<string, string>
  // Da sommare al max_tokens del chiamante (0 per i modelli che non ragionano).
  thinkingHeadroom: number
}

/**
 * Risolve la potenza AI scelta nel modello concreto + eventuali parametri extra.
 *
 * - assistant_chat: 3 livelli pieni (Haiku / Sonnet / Opus).
 * - summarize: floor a Sonnet anche per "veloce" (Haiku inaffidabile sulla
 *   sintesi multi-item); "approfondito" → Opus.
 */
export function resolveModel(
  power: Power = DEFAULT_POWER,
  surface: Surface = 'assistant_chat',
): ResolvedModel {
  let model: string

  if (surface === 'summarize') {
    model = power === 'approfondito' ? MODELS.opus : MODELS.sonnet
  } else {
    model =
      power === 'approfondito' ? MODELS.opus
      : power === 'veloce' ? MODELS.haiku
      : MODELS.sonnet
  }

  if (model === MODELS.opus) {
    // Opus 4.8: niente temperature/top_p/top_k/budget_tokens.
    return {
      model,
      extraBody: {
        thinking: { type: 'adaptive' },
        output_config: { effort: OPUS_EFFORT_DEFAULT },
      },
      extraHeaders: {},
      thinkingHeadroom: THINKING_HEADROOM,
    }
  }

  if (model === MODELS.sonnet) {
    // Sonnet 5.5: niente temperature/top_p/top_k/budget_tokens, e
    // thinking.type 'disabled' è un 400. `fallbacks: 'default'`: se i filtri
    // di sicurezza rifiutano la richiesta, Anthropic la riesegue da sola su un
    // altro modello invece di restituire il rifiuto.
    return {
      model,
      extraBody: {
        thinking: { type: 'adaptive' },
        output_config: { effort: SONNET_EFFORT_DEFAULT },
        fallbacks: 'default',
      },
      extraHeaders: { 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      thinkingHeadroom: THINKING_HEADROOM,
    }
  }

  // Haiku: nessun parametro extra (il body base resta valido).
  return { model, extraBody: {}, extraHeaders: {}, thinkingHeadroom: 0 }
}

/**
 * Normalizza un valore `power` ricevuto dal client a un Power valido.
 * Default per scope: ticket→equilibrato (Sonnet 5.5), global→veloce (Haiku, comportamento storico).
 */
export function normalizePower(
  raw: unknown,
  fallback: Power = DEFAULT_POWER,
): Power {
  return raw === 'veloce' || raw === 'equilibrato' || raw === 'approfondito'
    ? raw
    : fallback
}
