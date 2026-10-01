// supabase/functions/_shared/models.ts
//
// Resolver centralizzato dei modelli Anthropic per ManuTech.
// Mappa la "Potenza AI" (vocabolario user-facing: veloce/equilibrato/approfondito)
// sul modello concreto, per superficie. Vedi:
//   docs/decisions/ADR-010-ai-strategy-vision.md → sezione "Politica modelli" (6/6/2026)
//
// Lo usano:
//   - assistant-chat
//   - summarize
//   - extract-ticket-fields (vocale)
//
// Caveat Opus 5.5 e Sonnet 5.5 (verificato sui doc Anthropic): NON si possono
// inviare temperature/top_p/top_k né thinking.budget_tokens → 400, e nemmeno
// thinking.type 'disabled'. La profondità si controlla con thinking adaptive +
// output_config.effort. Su Haiku i parametri standard restano ammessi.
//
// Dal 1/10/2026 Sonnet 5.5 (prima Sonnet 4.6) e Opus 5.5 (prima Opus 4.8).
// Entrambi ragionano sempre e il ragionamento conta dentro max_tokens, quindi
// i chiamanti aggiungono `thinkingHeadroom` al loro tetto. Il loro tokenizer
// conta più token a parità di testo (~30% rispetto a Sonnet 4.6).

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
} as const

export type Power = 'veloce' | 'equilibrato' | 'approfondito'
export type Surface = 'assistant_chat' | 'summarize' | 'voice_extract'

export const DEFAULT_POWER: Power = 'equilibrato'

// Livello di effort di partenza per Opus 5.5, esplicito: il default dell'API
// è 'medium' su Opus 5.5 ma 'high' sugli Opus precedenti, quindi non va
// lasciato implicito. A parità di livello ragiona più di Opus 5, e nei test
// Anthropic Opus 5.5 a 'medium' supera Opus 5 a 'high': si parte da qui.
// Da tarare col pilota.
const OPUS_EFFORT_DEFAULT = 'medium'

// Sonnet 5.5: 'low' è il punto di partenza consigliato per chat, riassunti e
// ricerca — ragiona poco e salta il ragionamento sulle richieste semplici, la
// cosa più vicina a Sonnet 4.6 che non ragionava. Se le risposte risultano
// superficiali si alza a 'medium' qui, non con istruzioni nel prompt.
const SONNET_EFFORT_DEFAULT = 'low'

// Token in più oltre al tetto della risposta per i modelli che ragionano: il
// thinking conta dentro max_tokens e, senza margine, la risposta si tronca.
// Opus ne ha di più: effort più alto, e in "approfondito" riceve tutto lo
// storico. È un tetto, non un consumo.
const SONNET_THINKING_HEADROOM = 6000
const OPUS_THINKING_HEADROOM = 10000

// Se i filtri di sicurezza rifiutano la richiesta, Anthropic la riesegue da
// sola sul modello di ripiego che consiglia per quel tipo di rifiuto, invece
// di restituire il rifiuto (Opus 5.5 → Opus 5/4.8, Sonnet 5.5 → Sonnet 5).
const FALLBACK_BODY = { fallbacks: 'default' }
const FALLBACK_HEADERS = { 'anthropic-beta': 'server-side-fallback-2026-07-01' }

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
 * - voice_extract: sempre Sonnet, la potenza non conta. Il tecnico non ha
 *   un selettore e il vocale deve capire bene nomi di macchine e componenti
 *   (fino a v5.27 era Haiku 4.5); Opus sarebbe troppo lento per chi aspetta
 *   davanti alla macchina.
 */
export function resolveModel(
  power: Power = DEFAULT_POWER,
  surface: Surface = 'assistant_chat',
): ResolvedModel {
  let model: string

  if (surface === 'voice_extract') {
    model = MODELS.sonnet
  } else if (surface === 'summarize') {
    model = power === 'approfondito' ? MODELS.opus : MODELS.sonnet
  } else {
    model =
      power === 'approfondito' ? MODELS.opus
      : power === 'veloce' ? MODELS.haiku
      : MODELS.sonnet
  }

  if (model === MODELS.opus) {
    return {
      model,
      extraBody: {
        thinking: { type: 'adaptive' },
        output_config: { effort: OPUS_EFFORT_DEFAULT },
        ...FALLBACK_BODY,
      },
      extraHeaders: { ...FALLBACK_HEADERS },
      thinkingHeadroom: OPUS_THINKING_HEADROOM,
    }
  }

  if (model === MODELS.sonnet) {
    return {
      model,
      extraBody: {
        thinking: { type: 'adaptive' },
        output_config: { effort: SONNET_EFFORT_DEFAULT },
        ...FALLBACK_BODY,
      },
      extraHeaders: { ...FALLBACK_HEADERS },
      thinkingHeadroom: SONNET_THINKING_HEADROOM,
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
