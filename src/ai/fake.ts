import type { AiClient } from './claude'

/**
 * Canned Claude client for browser dev only (`npm run dev`, then open `/?fakeAi=1`): lets the AI
 * panel be checked by eye without a key or network. Never used in the Tauri app.
 */
const REVIEW = `## What went well

- You **finished the data format** and kept going on Flow every day.
- Short focus sessions worked: 25 minutes at a time is a good rhythm for you.

## What got in the way

Setting up Tauri kept slipping. It is a big, vague task, so starting is hard.

## Next 3 days

1. **Thursday:** Set up Tauri project — first step: run the create command.
2. **Friday:** Sketch the week view on paper.
3. **Saturday:** Rest, or write the README if you feel like it.
`

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
})

export const fakeAiClient: AiClient = {
  async reviewWeek(_prompt, _model, onText, signal) {
    await wait(1500, signal)
    for (const word of REVIEW.split(/(?<=\s)/)) {
      onText(word)
      await wait(15, signal)
    }
    return REVIEW
  },
  async planTomorrow(_prompt, _model, signal) {
    await wait(1500, signal)
    return {
      summary: 'A light day: one setup task and one small sketch, with room to rest.',
      tasks: [
        { ref: 'flow-app/t2', title: 'Set up Tauri project', project: 'Flow app', first_step: 'Run npm create tauri-app in a new folder' },
        { ref: 'flow-app/t3', title: 'Sketch the week view', project: 'Flow app', first_step: 'Draw seven columns on paper' },
        { title: 'Pick a Spanish podcast', project: 'Flow app', first_step: 'Search for "Spanish beginner podcast" and save one' },
      ],
    }
  },
}
