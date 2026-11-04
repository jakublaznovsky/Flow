import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaMessage, BetaMessageStreamParams, MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'
export const AI_MODELS: { id: AiModel; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (default)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
]
export const DEFAULT_MODEL: AiModel = 'claude-opus-5-5'
export const isAiModel = (v: unknown): v is AiModel => AI_MODELS.some((m) => m.id === v)

export interface PlanSuggestion { ref?: string; title: string; project: string; first_step: string }
export interface Plan { summary: string; tasks: PlanSuggestion[] }

export interface AiClient {
  reviewWeek(prompt: string, model: AiModel, onText: (t: string) => void, signal?: AbortSignal): Promise<string>
  planTomorrow(prompt: string, model: AiModel, signal?: AbortSignal): Promise<Plan>
}

/** The part of the SDK client Flow uses (lets tests pass a fake). */
export interface SdkClient {
  beta: {
    messages: {
      create(params: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): PromiseLike<BetaMessage>
      stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): {
        on(event: 'text', listener: (delta: string) => void): unknown
        finalMessage(): Promise<BetaMessage>
      }
    }
  }
}

/** JSON schema for "Plan tomorrow". `ref` is an empty string for a new task. */
export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'tasks'],
  properties: {
    summary: { type: 'string' },
    tasks: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'title', 'project', 'first_step'],
        properties: {
          ref: { type: 'string' },
          title: { type: 'string' },
          project: { type: 'string' },
          first_step: { type: 'string' },
        },
      },
    },
  },
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const MAX_TOKENS = 16000

class RefusalError extends Error {}
class FormatError extends Error {}

/** Shared request fields; server-side refusal fallbacks exist for Opus 5.5 and Sonnet 5.5 only. */
function base(prompt: string, model: AiModel) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user' as const, content: prompt }],
    ...(model === 'claude-haiku-5-5' ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
  }
}

function textOf(msg: BetaMessage): string {
  if (msg.stop_reason === 'refusal') throw new RefusalError('refusal')
  return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

const str = (v: unknown): v is string => typeof v === 'string'

/** Validate the plan JSON: summary string, up to 3 well-formed tasks (malformed ones dropped). */
export function parsePlan(json: string): Plan {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { throw new FormatError('not json') }
  if (typeof raw !== 'object' || raw === null) throw new FormatError('not an object')
  const { summary, tasks } = raw as { summary?: unknown; tasks?: unknown }
  if (!str(summary) || !Array.isArray(tasks)) throw new FormatError('bad shape')
  const out: PlanSuggestion[] = []
  for (const t of tasks) {
    if (out.length === 3) break
    if (typeof t !== 'object' || t === null) continue
    const { ref, title, project, first_step } = t as Record<string, unknown>
    if (!str(title) || !title.trim() || !str(project) || !str(first_step)) continue
    const s: PlanSuggestion = { title: title.trim(), project: project.trim(), first_step: first_step.trim() }
    if (str(ref) && ref.trim()) s.ref = ref.trim()
    out.push(s)
  }
  return { summary: summary.trim(), tasks: out }
}

const defaultFactory = (apiKey: string): SdkClient => new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

/** Claude client for the owner's own API key (the SDK runs in the webview). */
export function createAiClient(apiKey: string, factory: (apiKey: string) => SdkClient = defaultFactory): AiClient {
  const client = factory(apiKey)
  return {
    async reviewWeek(prompt, model, onText, signal) {
      const params: BetaMessageStreamParams = { ...base(prompt, model), output_config: { effort: 'medium' } }
      const stream = client.beta.messages.stream(params, { signal })
      stream.on('text', onText)
      return textOf(await stream.finalMessage())
    },
    async planTomorrow(prompt, model, signal) {
      const params: MessageCreateParamsNonStreaming = {
        ...base(prompt, model),
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      }
      return parsePlan(textOf(await client.beta.messages.create(params, { signal })))
    },
  }
}

/** One calm sentence for anything that went wrong (most specific first). */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof RefusalError) return 'Claude declined this request.'
  if (e instanceof FormatError) return "Claude's answer couldn't be read — try again."
  if (e instanceof Anthropic.APIUserAbortError) return 'Stopped.'
  if (e instanceof Anthropic.AuthenticationError) return "Claude didn't accept the API key — check it in Settings."
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key can't use that model — try another model in Settings."
  if (e instanceof Anthropic.RateLimitError) return 'Claude is busy or a usage limit was reached — try again in a minute.'
  if (e instanceof Anthropic.BadRequestError) return "Claude couldn't take this request — check your Anthropic account, for example its credit balance."
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude — check your internet connection."
  if (e instanceof Anthropic.APIError) return 'Claude had a problem answering — try again in a moment.'
  return 'Something went wrong talking to Claude — try again.'
}
