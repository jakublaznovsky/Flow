import type Anthropic from '@anthropic-ai/sdk'
import {
  APIConnectionError, APIError, APIUserAbortError, AuthenticationError, BadRequestError, NotFoundError, PermissionDeniedError, RateLimitError,
} from '@anthropic-ai/sdk/error'
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
      // No maxItems: structured outputs reject array-size constraints (400). parsePlan keeps at most 3.
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

let sdk: Promise<typeof Anthropic> | undefined
/** The SDK is loaded on first use, so it stays out of the main bundle. */
const loadSdk = () => (sdk ??= import('@anthropic-ai/sdk').then((m) => m.default))

/** Real SDK client behind a synchronous facade; the SDK module loads with the first request. */
function defaultFactory(apiKey: string): SdkClient {
  let client: Promise<Anthropic> | undefined
  const get = () => (client ??= loadSdk().then((A) => new A({ apiKey, dangerouslyAllowBrowser: true })))
  return {
    beta: {
      messages: {
        create: async (params, options) => (await get()).beta.messages.create(params, options),
        stream(params, options) {
          const stream = get().then((c) => c.beta.messages.stream(params, options))
          return {
            // Listeners attach once the stream exists, before any network event can arrive.
            on(event, listener) { void stream.then((s) => s.on(event, listener), () => {}); return this },
            finalMessage: async () => (await stream).finalMessage(),
          }
        },
      },
    },
  }
}

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
  if (e instanceof APIUserAbortError) return 'Stopped.'
  if (e instanceof AuthenticationError) return "Claude didn't accept the API key — check it in Settings."
  if (e instanceof PermissionDeniedError) return "This API key can't use that model — try another model in Settings."
  if (e instanceof NotFoundError) return "This model isn't available for your key — pick another model in Settings."
  if (e instanceof RateLimitError) return 'Claude is busy or a usage limit was reached — try again in a minute.'
  if (e instanceof BadRequestError) {
    if (/credit balance/i.test(apiMessage(e))) return "Your Anthropic credit balance is too low — top it up at console.anthropic.com."
    return "Claude couldn't process this request — the details are in flow-issues.log."
  }
  if (e instanceof APIConnectionError) return "Couldn't reach Claude — check your internet connection."
  if (e instanceof APIError) return 'Claude had a problem answering — try again in a moment.'
  return 'Something went wrong talking to Claude — try again.'
}

/** One line for Flow/flow-issues.log: HTTP status and the API's own message (never the key). Undefined for a user stop. */
export function aiErrorDetail(e: unknown): string | undefined {
  if (e instanceof APIUserAbortError) return undefined
  if (e instanceof APIError) {
    const body = e.error as { error?: { type?: unknown } } | undefined
    const kind = typeof body?.error?.type === 'string' ? ` (${body.error.type})` : ''
    const id = e.requestID ? ` [request ${e.requestID}]` : ''
    return `Claude API ${e.status ?? 'error'}${kind}: ${clip(apiMessage(e))}${id}`.replace(/\s+/g, ' ')
  }
  return `Claude request failed: ${e instanceof Error ? e.message : String(e)}`.replace(/\s+/g, ' ')
}

/** The API's own explanation from the response body ({ type: 'error', error: { type, message } }), else the SDK message. */
function apiMessage(e: InstanceType<typeof APIError>): string {
  const body = e.error as { error?: { message?: unknown } } | undefined
  return typeof body?.error?.message === 'string' ? body.error.message : e.message
}

const clip = (t: string, max = 300) => (t.length > max ? `${t.slice(0, max)}…` : t)
