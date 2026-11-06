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

/** Where a board card is picked up: its title row (its checklist keeps its own clicks). */
const grip = async (el) => ((await el.locator('.card-head').count()) ? el.locator('.card-head').first() : el)

/** Real pointer drag from the centre of one element (a card: its title row) to the centre of another. */
async function drag(page, from, to) {
  const a = await (await grip(from)).boundingBox()
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

  const doneBar = col('Done')
  const doneToggle = doneBar.getByRole('button', { name: /^Done today \(\d+\)$/ })
  const doneCount = async () => Number(/\((\d+)\)/.exec(await doneToggle.innerText())?.[1])

  // --- Board: Parking lot | To do | Today | Tomorrow, and the Done bar underneath ---
  for (const name of ['Parking lot', 'To do', 'Today', 'Tomorrow']) {
    await col(name).getByRole('heading', { name }).waitFor({ timeout: 5000 })
  }
  await doneToggle.waitFor({ timeout: 5000 })
  // Four columns fit 1280x800 next to the sidebar (no horizontal page scroll); the Done bar spans
  // their width below them and the whole board fits the window height.
  {
    const { scroll, names, widths, bar, columnsBottom, vscroll } = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect()
      const bar = document.querySelector('.done-bar')
      const cols = [...document.querySelectorAll('.column')]
      return {
        scroll: document.documentElement.scrollWidth - window.innerWidth,
        vscroll: document.documentElement.scrollHeight - window.innerHeight,
        names: cols.map((c) => c.querySelector('h2')?.textContent),
        widths: cols.map((c) => Math.round(r(c).width)),
        bar: bar && { top: r(bar).top, bottom: r(bar).bottom, left: r(bar).left, right: r(bar).right },
        columnsBottom: Math.max(...cols.map((c) => r(c).bottom)),
        columnsLeft: Math.min(...cols.map((c) => r(c).left)),
      }
    })
    if (names.join() !== 'Parking lot,To do,Today,Tomorrow') fail(`column order: ${names.join(', ')}`)
    else if (scroll > 0 || vscroll > 0) fail(`board scrolls (${scroll}px across, ${vscroll}px down)`)
    else if (widths.some((w) => w < 220)) fail(`columns too narrow: ${widths.join(', ')}`)
    else if (!bar || bar.top < columnsBottom || bar.bottom > 800) fail('Done bar is not below the columns, inside the window')
    else console.log(`ok: four columns (${widths.join(', ')} px) and the Done bar below them, no page scroll`)
  }
  // --- Card: the checklist is always visible (no chevron, no "Next:" line) ---
  {
    const c = col('Today').locator('li.card', { hasText: 'Build the week view' })
    const steps = await c.locator('ul.steps > li').count()
    const toggles = await c.locator('[aria-expanded]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const next = await c.getByText(/^Next:/).count()
    if (steps < 2) fail(`checklist not visible on the card (${steps} steps)`)
    else if (toggles.some((t) => !t?.startsWith('Plan '))) fail(`card has a toggle besides the plan menu: ${toggles.join(', ')}`)
    else if (next) fail('card still shows a "Next:" line')
    else if (!(await c.getByRole('textbox', { name: 'Add step' }).isVisible())) fail('Add step input not visible')
    else console.log(`ok: card shows its ${steps} steps and Add step, with no chevron`)
  }
  // --- Checklist: drag the first step's handle below the second; the card stays put ---
  {
    const stepCard = col('Today').locator('li.card', { hasText: 'Build the week view' })
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
  }

  const card = col('To do').locator('li.card').first()
  const title = (await card.locator('.card-title').innerText()).trim()
  // Mid-drag: the dragged card must follow the pointer across columns (not be clipped by its column).
  {
    const a = await (await grip(card)).boundingBox()
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

  // --- Done bar: drop a card on it (open, then collapsed); its checkbox reopens a card ---
  {
    await page.waitForTimeout(100) // dnd-kit ignores clicks for 50 ms after a drag
    // Picked up from the empty space beside a step (not its title): the card itself moves.
    const verbs = col('Today').locator('li.card', { hasText: 'Learn the 50 most common verbs' })
    const row = verbs.locator('ul.steps > li').nth(1)
    const text = await row.locator('.step-text').boundingBox()
    const rb = await row.boundingBox()
    const sx = text.x + text.width + (rb.x + rb.width - 24 - (text.x + text.width)) / 2, sy = rb.y + rb.height / 2
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [sx, sy])
    if (hit && /step-(text|del|grip)/.test(hit)) fail(`expected empty row space at the start point, got .${hit}`)
    const bar = await doneBar.boundingBox()
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2, { steps: 12 })
    await page.mouse.up()
    await doneBar.getByText('Learn the 50 most common verbs').waitFor({ timeout: 3000 })
    console.log('ok: a Today card dragged from the space beside a step and dropped on the open Done bar is done')
    const before = await doneCount()
    await page.waitForTimeout(100)
    await doneToggle.click()
    if ((await doneToggle.getAttribute('aria-expanded')) !== 'false' || (await doneBar.locator('li.card').count())) fail('Done bar did not collapse')
    const week = col('Today').locator('li.card', { hasText: 'Build the week view' })
    await drag(page, week, doneBar)
    await page.waitForFunction((n) => /\((\d+)\)/.exec(document.querySelector('.done-bar-toggle')?.textContent ?? '')?.[1] === String(n), before + 1, { timeout: 3000 })
    if (await col('Today').getByText('Build the week view', { exact: true }).count()) fail('card dropped on the collapsed Done bar is still in Today')
    else console.log(`ok: dropped on the collapsed Done bar (count ${before} -> ${before + 1})`)
    await page.waitForTimeout(100)
    await doneToggle.click()
    await doneBar.getByLabel('Done: Build the week view').click()
    await col('Today').getByText('Build the week view', { exact: true }).waitFor({ timeout: 3000 })
    console.log('ok: Done bar toggles open again; unticking there reopens the card in Today')
  }

  // --- Parking lot -> Done: the project picker ("Done in which project?") then Done today ---
  {
    await page.waitForTimeout(100)
    const item = col('Parking lot').locator('li.card', { hasText: 'Buy a new notebook' })
    await drag(page, item, doneBar)
    const picker = page.getByRole('listbox', { name: 'Choose a project' })
    await picker.waitFor({ timeout: 3000 })
    if (!(await page.getByText('Done in which project?').isVisible())) fail('picker label for a Done drop is not "Done in which project?"')
    await page.waitForTimeout(100) // dnd-kit ignores clicks for 50 ms after a drag
    await picker.getByRole('option', { name: '+ New project' }).click()
    await page.getByRole('textbox', { name: 'New project name' }).waitFor({ timeout: 3000 })
    if (process.env.FLOW_PICKER_SHOT) await page.locator('.picker-wrap').screenshot({ path: process.env.FLOW_PICKER_SHOT })
    await page.keyboard.press('Escape') // back to the list
    await picker.getByRole('option').first().click()
    await doneBar.getByText('Buy a new notebook').waitFor({ timeout: 3000 })
    if (await col('Parking lot').getByText('Buy a new notebook').count()) fail('item dropped on Done is still in the Parking lot')
    else console.log('ok: a Parking lot item dropped on the Done bar is done today in the chosen project')
  }

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
  {
    const t = await tray.boundingBox()
    const d = await week.getByRole('region', { name: /^Mon \d+ / }).boundingBox()
    const head = await week.locator('.week-days').boundingBox()
    if (!(t && d && t.y + t.height <= d.y && t.width >= head.width - 1)) fail('Unscheduled drawer is not a full-width row above the days')
    else console.log('ok: Unscheduled drawer sits above the seven days, full width')
  }
  const weekCard = tray.locator('li.week-card').first()
  const weekTitle = (await weekCard.locator('.week-card-title').innerText()).trim()
  await drag(page, weekCard, dayCol)
  await dayCol.getByText(weekTitle).waitFor({ timeout: 3000 })
  await page.waitForTimeout(800)
  await shot(page, 'screenshot-week.png')
  console.log(`ok: "${weekTitle}" scheduled for ${target}${isSunday ? ' (next week, today is Sunday)' : ''}`)
  {
    await page.waitForTimeout(100)
    const toggle = tray.getByRole('button', { name: /^Unscheduled/ })
    await toggle.click()
    const closed = (await toggle.getAttribute('aria-expanded')) === 'false' && (await tray.locator('li.week-card').count()) === 0
    await toggle.click()
    if (!closed || (await toggle.getAttribute('aria-expanded')) !== 'true') fail('Unscheduled drawer does not collapse and reopen')
    else console.log('ok: Unscheduled drawer collapses and reopens')
  }

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

  // --- Week header: the ‹ button stays put for short and long titles; the month/year picker ---
  {
    const weekHead = page.getByRole('group', { name: 'Week navigation' })
    const hb = await weekHead.boundingBox()
    const sb = await page.getByRole('search').boundingBox()
    const inBar = await weekHead.evaluate((el) => !!el.closest('.topbar') && !el.closest('.week-view'))
    if (!inBar || Math.abs((hb.y + hb.height / 2) - (sb.y + sb.height / 2)) > 4 || hb.x + hb.width > sb.x) fail(`week header not on the search row (head ${JSON.stringify(hb)}, search ${JSON.stringify(sb)})`)
    else console.log('ok: week header sits in the top bar, left of the search box on its row')
    const prev = weekHead.getByRole('button', { name: 'Previous week' })
    const next = weekHead.getByRole('button', { name: 'Next week' })
    const titleBtn = weekHead.locator('.week-title-btn')
    await weekHead.getByRole('button', { name: 'This week' }).click()
    const xs = new Map()
    for (let i = 0; i < 60; i++) { // more than a year ahead: every month, one Dec–Jan week with two years
      const t = (await titleBtn.innerText()).trim()
      xs.set(t, (await prev.boundingBox()).x)
      await next.click()
    }
    const titles = [...xs.keys()]
    const longT = titles.find((t) => /\d{4} – .*\d{4}/.test(t))
    const shortT = titles.reduce((a, b) => (b.length < a.length ? b : a))
    const distinct = [...new Set(xs.values())]
    if (!longT) fail('no Dec–Jan week title in the measured weeks')
    else if (distinct.length !== 1) fail(`‹ moves with the title: ${distinct.join(', ')} px`)
    else console.log(`ok: ‹ at x=${distinct[0]} for all ${titles.length} titles ("${shortT}" … "${longT}")`)

    await weekHead.getByRole('button', { name: 'This week' }).click()
    const before = (await titleBtn.innerText()).trim()
    await titleBtn.click()
    const dialog = page.getByRole('dialog', { name: 'Choose month' })
    await dialog.waitFor({ timeout: 3000 })
    const nm = await page.evaluate(() => {
      const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      return { label: `${n.toLocaleDateString('en-US', { month: 'long' })} ${n.getFullYear()}`, nextYear: n.getFullYear() !== d.getFullYear() }
    })
    if (process.env.FLOW_MONTH_SHOT) await page.screenshot({ path: process.env.FLOW_MONTH_SHOT, clip: { x: 0, y: 0, width: 800, height: 380 } })
    if (nm.nextYear) await dialog.getByRole('button', { name: 'Next year' }).click()
    await dialog.getByRole('button', { name: nm.label }).click()
    await dialog.waitFor({ state: 'detached', timeout: 3000 })
    const after = (await titleBtn.innerText()).trim()
    await weekHead.getByRole('button', { name: 'This week' }).click()
    const back = (await titleBtn.innerText()).trim()
    if (after === before || back !== before) fail(`month picker: "${before}" → "${after}" → "${back}"`)
    else console.log(`ok: picked ${nm.label} → "${after}"; This week → "${back}"`)
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

  // --- Settings: hide two board columns; the other two share the width ---
  {
    const group = page.getByRole('group', { name: 'Board columns' })
    for (const name of ['Parking lot', 'Tomorrow']) await group.getByRole('checkbox', { name, exact: true }).uncheck()
    await key(page, 'b')
    await col('Today').getByRole('heading', { name: 'Today' }).waitFor({ timeout: 3000 })
    const { names, widths, scroll, bar } = await page.evaluate(() => ({
      names: [...document.querySelectorAll('.column h2')].map((h) => h.textContent),
      widths: [...document.querySelectorAll('.column')].map((c) => Math.round(c.getBoundingClientRect().width)),
      scroll: document.documentElement.scrollWidth - window.innerWidth,
      bar: !!document.querySelector('.done-bar'),
    }))
    if (names.join() !== 'To do,Today' || !bar) fail(`visible columns: ${names.join(', ')}${bar ? ' + Done bar' : ''}`)
    else if (scroll > 0 || widths.some((w) => w < 400)) fail(`two columns do not share the width: ${widths.join(', ')}`)
    else console.log(`ok: hidden columns; two share the width (${widths.join(', ')} px) above the Done bar`)
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
  if (process.env.FLOW_PICKER_SHOT_DARK) {
    const dcol = (name) => dark.getByRole('region', { name, exact: true })
    await drag(dark, dcol('Parking lot').locator('li.card').first(), dcol('Done'))
    await dark.waitForTimeout(100)
    await dark.getByRole('option', { name: '+ New project' }).click()
    await dark.getByRole('textbox', { name: 'New project name' }).fill('Garden')
    await dark.locator('.picker-wrap').screenshot({ path: process.env.FLOW_PICKER_SHOT_DARK })
    await dark.keyboard.press('Escape')
    await dark.keyboard.press('Escape')
  }

  if (process.env.FLOW_MONTH_SHOT_DARK) {
    await dark.keyboard.press('w')
    await dark.locator('.week-title-btn').click()
    await dark.getByRole('dialog', { name: 'Choose month' }).waitFor({ timeout: 3000 })
    await dark.screenshot({ path: process.env.FLOW_MONTH_SHOT_DARK, clip: { x: 0, y: 0, width: 800, height: 380 } })
    await dark.keyboard.press('Escape')
  }

  console.log('SMOKE OK')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
}
