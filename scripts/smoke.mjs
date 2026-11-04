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
  for (const name of ['Parking lot', 'To do', 'Tomorrow', 'Today', 'Done']) {
    await col(name).getByRole('heading', { name }).waitFor({ timeout: 5000 })
  }
  // Five columns fit 1280x800 next to the sidebar: no horizontal page scroll, cards stay readable.
  {
    const { scroll, widths } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth - window.innerWidth,
      widths: [...document.querySelectorAll('.column')].map((c) => Math.round(c.getBoundingClientRect().width)),
    }))
    if (scroll > 0) fail(`board scrolls horizontally by ${scroll}px`)
    else if (widths.some((w) => w < 180)) fail(`columns too narrow: ${widths.join(', ')}`)
    else console.log(`ok: five columns fit without horizontal scroll (${widths.join(', ')} px)`)
  }
  // --- Checklist: drag the first step's handle below the second; the card stays put ---
  {
    const stepCard = col('Today').locator('li.card', { hasText: 'Build the week view' })
    await stepCard.getByRole('button', { name: 'Show steps' }).click()
    const rows = stepCard.locator('ul.steps > li')
    const order = async () => (await rows.locator('.step-text').allInnerTexts()).map((t) => t.trim())
    const before = await order()
    if (before.length < 2) throw new Error(`expected at least 2 steps, got ${before.length}`)
    const h = await rows.nth(0).locator('.step-grip').boundingBox()
    const r1 = await rows.nth(1).boundingBox()
    const sx = h.x + h.width / 2, sy = h.y + h.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx, r1.y + r1.height * 0.9, { steps: 12 })
    await page.waitForTimeout(250)
    if (process.env.FLOW_STEP_SHOT) await stepCard.screenshot({ path: process.env.FLOW_STEP_SHOT })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const after = await order()
    const want = [before[1], before[0], ...before.slice(2)]
    if (after.join('|') !== want.join('|')) fail(`step order after drag: ${after.join(', ')} (wanted ${want.join(', ')})`)
    else if (!(await col('Today').locator('li.card', { hasText: 'Build the week view' }).count())) fail('step drag moved the card out of Today')
    else console.log(`ok: step "${before[0]}" dragged below "${before[1]}"; card stayed in Today`)
    await stepCard.getByRole('button', { name: 'Hide steps' }).click()
  }

  const card = col('To do').locator('li.card').first()
  const title = (await card.locator('.card-title').innerText()).trim()
  // Mid-drag: the dragged card must follow the pointer across columns (not be clipped by its column).
  {
    const a = await card.boundingBox()
    const b = await col('Today').locator('ul.cards').boundingBox()
    const sx = a.x + a.width / 2, sy = a.y + a.height / 2
    const mx = (sx + b.x + b.width / 2) / 2, my = (sy + b.y + 40) / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(mx, my, { steps: 8 })
    // Visible = the card's box, cut by every ancestor that clips overflow, still contains the pointer.
    const visible = await page.evaluate(([x, y, t]) => [...document.querySelectorAll('.card')].some((el) => {
      if (!el.textContent?.includes(t)) return false
      let r = el.getBoundingClientRect()
      let l = r.left, top = r.top, rt = r.right, b = r.bottom
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          const q = p.getBoundingClientRect()
          l = Math.max(l, q.left); top = Math.max(top, q.top); rt = Math.min(rt, q.right); b = Math.min(b, q.bottom)
        }
      }
      return x >= l && x <= rt && y >= top && y <= b
    }), [mx, my, title])
    if (!visible) fail(`mid-drag: dragged card "${title}" is not visible under the pointer`)
    else console.log('ok: dragged card follows the pointer between columns')
    await page.keyboard.press('Escape') // cancel this probe drag
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  await drag(page, card, col('Today').locator('ul.cards'))
  await col('Today').getByText(title).waitFor({ timeout: 3000 })
  // Screenshot while the dragged card sits in Today, so the board looks lived-in.
  await page.waitForTimeout(800) // let the drop animation settle
  await shot(page, 'screenshot.png')
  await page.getByLabel(`Done: ${title}`).check()
  await col('Done').getByText(title).waitFor({ timeout: 3000 })
  console.log(`ok: "${title}" dragged to Today and completed`)

  // --- Tomorrow: drag a To do card into Tomorrow ---
  const todoCard = col('To do').locator('li.card').first()
  const tomorrowTitle = (await todoCard.locator('.card-title').innerText()).trim()
  await drag(page, todoCard, col('Tomorrow').locator('ul.cards'))
  await col('Tomorrow').getByText(tomorrowTitle).waitFor({ timeout: 3000 })
  console.log(`ok: "${tomorrowTitle}" dragged into Tomorrow`)

  // --- Plan menu: opens next to the card, fully on screen; Escape closes it ---
  await col('Tomorrow').getByRole('button', { name: `Plan ${tomorrowTitle}` }).click()
  const menu = page.getByRole('menu', { name: `Plan ${tomorrowTitle}` })
  await menu.waitFor({ timeout: 3000 })
  const mb = await menu.boundingBox()
  if (!mb || mb.x < 0 || mb.y < 0 || mb.x + mb.width > VIEWPORT.width || mb.y + mb.height > VIEWPORT.height) fail('plan menu is off screen')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached', timeout: 3000 })
  console.log('ok: plan menu opens on screen and closes with Escape')

  // --- Park it: drag a task onto the Parking lot ---
  const parkCard = col('Tomorrow').locator('li.card', { hasText: tomorrowTitle })
  await drag(page, parkCard, col('Parking lot').locator('ul.cards'))
  await col('Parking lot').getByText(tomorrowTitle).waitFor({ timeout: 3000 })
  if (await col('Tomorrow').getByText(tomorrowTitle).count()) fail(`"${tomorrowTitle}" is still in Tomorrow after parking`)
  console.log(`ok: "${tomorrowTitle}" parked in the Parking lot`)

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

  // --- Week: a Today item onto a future day, a card onto a past day (done that day) ---
  {
    if (isSunday) await page.getByRole('button', { name: 'This week' }).click()
    const label = (n) => page.evaluate((n) => {
      const d = new Date()
      d.setDate(d.getDate() + n)
      return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`
    }, n)
    const todayCol = week.locator('section.week-col[aria-current="date"]')
    if (isSunday) console.log('skip: Today item to a future day (today is Sunday, no later day this week)')
    else {
      const item = todayCol.locator('li.week-in-today').first()
      const itemTitle = (await item.locator('.week-in-today-title').innerText()).trim()
      const future = week.getByRole('region', { name: await label(1), exact: true })
      await drag(page, item, future)
      await future.locator('li.week-card', { hasText: itemTitle }).waitFor({ timeout: 3000 })
      if (await todayCol.locator('li.week-in-today', { hasText: itemTitle }).count()) fail(`"${itemTitle}" is still In Today after the drop`)
      await key(page, 'b')
      await col('Today').getByRole('heading', { name: 'Today' }).waitFor({ timeout: 3000 })
      if (await col('Today').getByText(itemTitle, { exact: true }).count()) fail(`"${itemTitle}" is still in the board's Today`)
      else console.log(`ok: Today item "${itemTitle}" moved to ${await label(1)} and left the board's Today`)
      await key(page, 'w')
      await week.waitFor({ timeout: 3000 })
    }
    const isMonday = await page.evaluate(() => new Date().getDay() === 1)
    if (isMonday) console.log('skip: drop on a past day (today is Monday, no earlier day this week)')
    else {
      const pastName = await label(-1)
      const past = week.getByRole('region', { name: pastName, exact: true })
      const c = week.locator('li.week-card').first() // any To do card (the seed's tray may be empty by now)
      const t = (await c.locator('.week-card-title').innerText()).trim()
      await drag(page, c, past)
      await past.locator('li.week-done.is-done', { hasText: t }).waitFor({ timeout: 3000 })
      if (await week.locator('li.week-card', { hasText: t }).count()) fail(`"${t}" is still a To do card after the past-day drop`)
      else console.log(`ok: "${t}" dropped on ${pastName} shows as done there`)
    }
  }

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

  // --- Delete a project: create one, delete it via the confirmation dialog ---
  {
    const nav = page.getByRole('navigation', { name: 'Sidebar' })
    const name = 'Smoke test project'
    await nav.getByRole('button', { name: '+ New project' }).click()
    await nav.getByRole('textbox', { name: 'Project name' }).fill(name)
    await page.keyboard.press('Enter')
    await nav.getByRole('button', { name, exact: true }).waitFor({ timeout: 3000 })
    await nav.getByRole('button', { name: `Project menu for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete project?' })
    await dialog.waitFor({ timeout: 3000 })
    if (process.env.FLOW_DELETE_SHOT) await page.screenshot({ path: process.env.FLOW_DELETE_SHOT })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await nav.getByRole('button', { name, exact: true }).waitFor({ state: 'detached', timeout: 3000 })
    if (await dialog.count()) fail('delete dialog still open')
    else console.log(`ok: "${name}" created and deleted via the dialog`)
  }

  // --- Settings: API key field ---
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Claude API key').waitFor({ timeout: 3000 })
  console.log('ok: Settings shows the API key field')

  // --- Settings: hide two board columns; the other three share the width ---
  {
    const group = page.getByRole('group', { name: 'Board columns' })
    for (const name of ['Parking lot', 'Tomorrow']) await group.getByRole('checkbox', { name, exact: true }).uncheck()
    await key(page, 'b')
    await col('Today').getByRole('heading', { name: 'Today' }).waitFor({ timeout: 3000 })
    const { names, widths, scroll } = await page.evaluate(() => ({
      names: [...document.querySelectorAll('.column h2')].map((h) => h.textContent),
      widths: [...document.querySelectorAll('.column')].map((c) => Math.round(c.getBoundingClientRect().width)),
      scroll: document.documentElement.scrollWidth - window.innerWidth,
    }))
    if (names.join() !== 'To do,Today,Done') fail(`visible columns: ${names.join(', ')}`)
    else if (scroll > 0 || widths.some((w) => w < 300)) fail(`three columns do not share the width: ${widths.join(', ')}`)
    else console.log(`ok: hidden columns; three share the width (${widths.join(', ')} px)`)
    if (process.env.FLOW_COLUMNS_SHOT) await page.screenshot({ path: process.env.FLOW_COLUMNS_SHOT })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    for (const name of ['Parking lot', 'Tomorrow']) await group.getByRole('checkbox', { name, exact: true }).check()
  }

  // --- Dark board screenshot ---
  const dark = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' })
  await dark.goto(url)
  await dark.getByRole('region', { name: 'Today', exact: true }).getByRole('heading', { name: 'Today' }).waitFor({ timeout: 5000 })
  await shot(dark, 'screenshot-dark.png')
  if (process.env.FLOW_STEP_SHOT_DARK) {
    const c = dark.getByRole('region', { name: 'Today', exact: true }).locator('li.card', { hasText: 'Build the week view' })
    await c.getByRole('button', { name: 'Show steps' }).click()
    const rows = c.locator('ul.steps > li')
    const h = await rows.nth(0).locator('.step-grip').boundingBox()
    const r1 = await rows.nth(1).boundingBox()
    await dark.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await dark.mouse.down()
    await dark.mouse.move(h.x + h.width / 2, r1.y + r1.height * 0.9, { steps: 12 })
    await dark.waitForTimeout(250)
    await c.screenshot({ path: process.env.FLOW_STEP_SHOT_DARK })
    await dark.keyboard.press('Escape')
    await dark.mouse.up()
  }

  console.log('SMOKE OK')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
}
