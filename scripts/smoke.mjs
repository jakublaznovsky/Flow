// Real-browser smoke test: run `npm run dev` first, then `node scripts/smoke.mjs`.
// Uses Playwright (installed globally); drives real pointer drag-and-drop.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const url = process.env.FLOW_URL ?? 'http://localhost:1420'
const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}`); process.exitCode = 1 }

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  await page.goto(url)
  const col = (name) => page.getByRole('region', { name, exact: true })

  for (const name of ['Parking lot', 'To do', 'Today', 'Done']) {
    await col(name).getByRole('heading', { name }).waitFor({ timeout: 5000 })
  }

  const card = col('To do').locator('li.card').first()
  const title = (await card.locator('.card-title').innerText()).trim()
  const from = await card.boundingBox()
  const to = await col('Today').locator('ul.cards').boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
  await col('Today').getByText(title).waitFor({ timeout: 3000 })

  // Screenshot while the dragged card sits in Today, so the board looks lived-in.
  await page.screenshot({ path: new URL('../docs/screenshot.png', import.meta.url).pathname })

  await page.getByLabel(`Done: ${title}`).check()
  await col('Done').getByText(title).waitFor({ timeout: 3000 })

  console.log(`SMOKE OK: "${title}" dragged to Today and completed`)
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
}
