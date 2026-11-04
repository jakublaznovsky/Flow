import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { aiErrorMessage, createAiClient, PLAN_SCHEMA, type SdkClient } from './claude'

type Msg = { stop_reason: string | null; content: { type: string; text?: string }[] }
const text = (t: string, stop = 'end_turn'): Msg => ({ stop_reason: stop, content: [{ type: 'thinking' }, { type: 'text', text: t }] })

function fakeSdk(opts: { create?: Msg; stream?: { deltas: string[]; final: Msg } } = {}) {
  const create = vi.fn(async (_p: unknown, _o?: unknown) => opts.create ?? text('{}'))
  const stream = vi.fn((_p: unknown, _o?: unknown) => {
    const listeners: ((d: string) => void)[] = []
    return {
      on(_ev: 'text', fn: (d: string) => void) { listeners.push(fn); return this },
      async finalMessage() {
        for (const d of opts.stream?.deltas ?? []) listeners.forEach((l) => l(d))
        return opts.stream?.final ?? text('')
      },
    }
  })
  const keys: string[] = []
  const factory = (key: string) => { keys.push(key); return { beta: { messages: { create, stream } } } as unknown as SdkClient }
  return { create, stream, factory, keys }
}

const PLAN = { summary: 'A calm day.', tasks: [
  { ref: 'flow-app/t2', title: 'Set up Tauri', project: 'Flow app', first_step: 'Run the init command' },
  { ref: '', title: 'Buy stamps', project: 'Home', first_step: 'Find the wallet' },
] }

describe('reviewWeek', () => {
  it('streams with the right params and returns the full text', async () => {
    const sdk = fakeSdk({ stream: { deltas: ['Hel', 'lo'], final: text('Hello') } })
    const client = createAiClient('sk-test', sdk.factory)
    const seen: string[] = []
    const signal = new AbortController().signal
    const out = await client.reviewWeek('PROMPT', 'claude-opus-5-5', (t) => seen.push(t), signal)
    expect(out).toBe('Hello')
    expect(seen).toEqual(['Hel', 'lo'])
    expect(sdk.keys).toEqual(['sk-test'])
    const [params, options] = sdk.stream.mock.calls[0]
    expect(params).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: 'PROMPT' }],
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    expect(options).toEqual({ signal })
  })

  it('sends fallbacks for Sonnet 5.5 but not for Haiku 5.5', async () => {
    const sdk = fakeSdk({ stream: { deltas: [], final: text('x') } })
    const client = createAiClient('k', sdk.factory)
    await client.reviewWeek('P', 'claude-sonnet-5-5', () => {})
    await client.reviewWeek('P', 'claude-haiku-5-5', () => {})
    const sonnet = sdk.stream.mock.calls[0][0] as Record<string, unknown>
    const haiku = sdk.stream.mock.calls[1][0] as Record<string, unknown>
    expect(sonnet.model).toBe('claude-sonnet-5-5')
    expect(sonnet.fallbacks).toBe('default')
    expect(haiku.model).toBe('claude-haiku-5-5')
    expect(haiku).not.toHaveProperty('fallbacks')
    expect(haiku).not.toHaveProperty('betas')
    for (const p of [sonnet, haiku]) {
      for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) expect(p).not.toHaveProperty(k)
    }
  })

  it('maps a refusal to a calm message', async () => {
    const sdk = fakeSdk({ stream: { deltas: ['partial'], final: text('partial', 'refusal') } })
    const client = createAiClient('k', sdk.factory)
    const err = await client.reviewWeek('P', 'claude-opus-5-5', () => {}).catch((e: unknown) => e)
    expect(aiErrorMessage(err)).toBe('Claude declined this request.')
  })
})

describe('planTomorrow', () => {
  it('asks for JSON with the plan schema and parses the answer', async () => {
    const sdk = fakeSdk({ create: text(JSON.stringify(PLAN)) })
    const client = createAiClient('k', sdk.factory)
    const plan = await client.planTomorrow('PLAN PROMPT', 'claude-opus-5-5')
    expect(plan).toEqual({ summary: 'A calm day.', tasks: [
      { ref: 'flow-app/t2', title: 'Set up Tauri', project: 'Flow app', first_step: 'Run the init command' },
      { title: 'Buy stamps', project: 'Home', first_step: 'Find the wallet' },
    ] })
    const [params] = sdk.create.mock.calls[0]
    expect(params).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: 'PLAN PROMPT' }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  })

  it('has a strict schema with at most 3 tasks', () => {
    expect(PLAN_SCHEMA.additionalProperties).toBe(false)
    expect(PLAN_SCHEMA.required).toEqual(['summary', 'tasks'])
    expect(PLAN_SCHEMA.properties.tasks.maxItems).toBe(3)
    expect(PLAN_SCHEMA.properties.tasks.items.additionalProperties).toBe(false)
    expect(PLAN_SCHEMA.properties.tasks.items.required).toEqual(['ref', 'title', 'project', 'first_step'])
  })

  it('drops malformed items and keeps at most 3', async () => {
    const tasks = [
      { ref: '', title: 'A', project: 'P', first_step: 's' },
      { ref: '', title: 7, project: 'P', first_step: 's' },
      'nope',
      { ref: '', title: 'B', project: 'P', first_step: 's' },
      { ref: '', title: '  ', project: 'P', first_step: 's' },
      { ref: '', title: 'C', project: 'P', first_step: 's' },
      { ref: '', title: 'D', project: 'P', first_step: 's' },
    ]
    const sdk = fakeSdk({ create: text(JSON.stringify({ summary: 'S', tasks })) })
    const plan = await createAiClient('k', sdk.factory).planTomorrow('P', 'claude-haiku-5-5')
    expect(plan.tasks.map((t) => t.title)).toEqual(['A', 'B', 'C'])
    const haiku = sdk.create.mock.calls[0][0] as Record<string, unknown>
    expect(haiku.model).toBe('claude-haiku-5-5')
    expect(haiku).not.toHaveProperty('fallbacks')
    expect(haiku).not.toHaveProperty('betas')
  })

  it('rejects an answer that is not the expected JSON', async () => {
    for (const body of ['not json', JSON.stringify({ summary: 3, tasks: [] }), JSON.stringify({ summary: 'x' })]) {
      const sdk = fakeSdk({ create: text(body) })
      const err = await createAiClient('k', sdk.factory).planTomorrow('P', 'claude-opus-5-5').catch((e: unknown) => e)
      expect(aiErrorMessage(err)).toBe("Claude's answer couldn't be read — try again.")
    }
  })

  it('maps a refusal before reading content', async () => {
    const sdk = fakeSdk({ create: { stop_reason: 'refusal', content: [] } })
    const err = await createAiClient('k', sdk.factory).planTomorrow('P', 'claude-opus-5-5').catch((e: unknown) => e)
    expect(aiErrorMessage(err)).toBe('Claude declined this request.')
  })
})

describe('aiErrorMessage', () => {
  const h = new Headers()
  it('maps SDK errors to one calm sentence each', () => {
    expect(aiErrorMessage(new Anthropic.AuthenticationError(401, {}, 'bad', h))).toBe("Claude didn't accept the API key — check it in Settings.")
    expect(aiErrorMessage(new Anthropic.PermissionDeniedError(403, {}, 'no', h))).toBe("This API key can't use that model — try another model in Settings.")
    expect(aiErrorMessage(new Anthropic.RateLimitError(429, {}, 'slow', h))).toBe('Claude is busy or a usage limit was reached — try again in a minute.')
    expect(aiErrorMessage(new Anthropic.BadRequestError(400, {}, 'bad', h))).toBe("Claude couldn't take this request — check your Anthropic account, for example its credit balance.")
    expect(aiErrorMessage(new Anthropic.APIConnectionError({ message: 'down' }))).toBe("Couldn't reach Claude — check your internet connection.")
    expect(aiErrorMessage(new Anthropic.APIConnectionTimeoutError())).toBe("Couldn't reach Claude — check your internet connection.")
    expect(aiErrorMessage(new Anthropic.InternalServerError(500, {}, 'oops', h))).toBe('Claude had a problem answering — try again in a moment.')
    expect(aiErrorMessage(new Anthropic.APIUserAbortError())).toBe('Stopped.')
    expect(aiErrorMessage(new Error('weird'))).toBe('Something went wrong talking to Claude — try again.')
  })
})


describe('default SDK client', () => {
  it('loads the SDK on the first request and maps an abort (no network)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const ctrl = new AbortController()
    ctrl.abort()
    const client = createAiClient('sk-test')
    const review = await client.reviewWeek('P', 'claude-opus-5-5', () => {}, ctrl.signal).catch((e: unknown) => e)
    const plan = await client.planTomorrow('P', 'claude-haiku-5-5', ctrl.signal).catch((e: unknown) => e)
    expect(aiErrorMessage(review)).toBe('Stopped.')
    expect(aiErrorMessage(plan)).toBe('Stopped.')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
