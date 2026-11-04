// Real-browser smoke test: run `npm run dev` first, then `node scripts/smoke.mjs`.
// Uses Playwright (installed globally); drives real pointer drag-and-drop.
// Writes docs/screenshot.png, screenshot-dark.png, screenshot-progress.png, screenshot-week.png.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const url = process.env.FLOW_URL ?? 'http://localhost:1420'
const shot = (page, name) => page.screenshot({ path: new URL(`../docs/${name}`, import.meta.url).pathname })
const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}`); process.exitCode = 1 }
const VIEWPORT = { width: 1280, height: 800 }

/** Real pointer drag from the centre of one element to the centre of another. */
async function drag(page, from, to) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
}

/** Shortcuts only fire when no text field has focus. */
async function key(page, k) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press(k)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'light' })
  await page.goto(url)
  const col = (name) => page.getByRole('region', { name, exact: true })

  // --- Board: drag a card to Today, tick another off ---
  for (const name of ['Parking lot', 'To do', 'Today', 'Done']) {
    await col(name).getByRole('heading', { name }).waitFor({ timeout: 5000 })
  }
  const card = col('To do').locator('li.card').first()
  const title = (await card.locator('.card-title').innerText()).trim()
  await drag(page, card, col('Today').locator('ul.cards'))
  await col('Today').getByText(title).waitFor({ timeout: 3000 })
  // Screenshot while the dragged card sits in Today, so the board looks lived-in.
  await page.waitForTimeout(800) // let the drop animation settle
  await shot(page, 'screenshot.png')
  await page.getByLabel(`Done: ${title}`).check()
  await col('Done').getByText(title).waitFor({ timeout: 3000 })
  console.log(`ok: "${title}" dragged to Today and completed`)

  // --- Week: drag from Unscheduled to a future day (key w) ---
  await key(page, 'w')
  const week = page.getByRole('region', { name: 'Week', exact: true })
  await week.waitFor({ timeout: 3000 })
  const isSunday = await page.evaluate(() => new Date().getDay() === 0)
  if (isSunday) await page.getByRole('button', { name: 'Next week' }).click()
  const target = await page.evaluate((sunday) => {
    const d = new Date()
    d.setDate(d.getDate() + (sunday ? 1 : 2)) // day after tomorrow (Monday of next week when it is Sunday)
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`
  }, isSunday)
  const tray = week.getByRole('region', { name: 'Unscheduled' })
  const dayCol = week.getByRole('region', { name: target, exact: true })
  const weekCard = tray.locator('li.week-card').first()
  const weekTitle = (await weekCard.locator('.week-card-title').innerText()).trim()
  await drag(page, weekCard, dayCol)
  await dayCol.getByText(weekTitle).waitFor({ timeout: 3000 })
  await page.waitForTimeout(800)
  await shot(page, 'screenshot-week.png')
  console.log(`ok: "${weekTitle}" scheduled for ${target}${isSunday ? ' (next week, today is Sunday)' : ''}`)

  // --- Progress (key p): heatmap and "This week" ---
  await key(page, 'p')
  await page.getByRole('heading', { name: 'This week' }).waitFor({ timeout: 3000 })
  await page.getByRole('heading', { name: 'Year' }).waitFor()
  const cells = await page.locator('.heat-cell').count()
  if (cells < 53 * 7) throw new Error(`heatmap has ${cells} cells, expected ${53 * 7}`)
  if ((await page.locator('.heat-cell.level-1, .heat-cell.level-2, .heat-cell.level-3, .heat-cell.level-4').count()) === 0) throw new Error('heatmap shows no activity')
  await shot(page, 'screenshot-progress.png')
  console.log(`ok: Progress shows This week and a heatmap of ${cells} cells`)

  // --- Notes (key o) ---
  await key(page, 'o')
  await page.getByRole('textbox', { name: 'Notes text' }).waitFor({ timeout: 3000 })
  console.log('ok: Notes view')

  // --- Weekly review (key r): click through all four steps ---
  await key(page, 'r')
  const review = page.getByRole('region', { name: 'Weekly review' })
  await review.waitFor({ timeout: 3000 })
  for (const heading of ['Your week', 'Unfinished', "Next week's focus", 'Reflect']) {
    await review.getByRole('heading', { name: heading }).waitFor({ timeout: 3000 })
    if (heading !== 'Reflect') await review.getByRole('button', { name: 'Next', exact: true }).click()
  }
  console.log('ok: Weekly review steps')

  // --- Settings: API key field ---
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Claude API key').waitFor({ timeout: 3000 })
  console.log('ok: Settings shows the API key field')

  // --- Dark board screenshot ---
  const dark = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' })
  await dark.goto(url)
  await dark.getByRole('region', { name: 'Today', exact: true }).getByRole('heading', { name: 'Today' }).waitFor({ timeout: 5000 })
  await shot(dark, 'screenshot-dark.png')

  console.log('SMOKE OK')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
}
