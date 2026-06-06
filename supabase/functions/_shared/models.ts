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
// Caveat Opus 4.8 (verificato sui doc Anthropic): su Opus 4.8/4.7 NON si possono
// inviare temperature/top_p/top_k né thinking.budget_tokens → 400. La profondità
// si controlla con thinking adaptive + output_config.effort. Su Haiku/Sonnet i
// parametri standard restano ammessi.

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
} as const

export type Power = 'veloce' | 'equilibrato' | 'approfondito'
export type Surface = 'assistant_chat' | 'summarize'

export const DEFAULT_POWER: Power = 'equilibrato'

// Livello di effort di partenza per Opus 4.8. Da tarare col pilota (Fase D).
const OPUS_EFFORT_DEFAULT = 'medium'

export interface ResolvedModel {
  model: string
  // Parametri extra da fondere nel body di POST /v1/messages.
  extraBody: Record<string, unknown>
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
    }
  }

  // Haiku / Sonnet: nessun parametro extra (il body base resta valido).
  return { model, extraBody: {} }
}

/**
 * Normalizza un valore `power` ricevuto dal client a un Power valido.
 * Default per scope: ticket→equilibrato (Sonnet), global→veloce (Haiku, comportamento storico).
 */
export function normalizePower(
  raw: unknown,
  fallback: Power = DEFAULT_POWER,
): Power {
  return raw === 'veloce' || raw === 'equilibrato' || raw === 'approfondito'
    ? raw
    : fallback
}
