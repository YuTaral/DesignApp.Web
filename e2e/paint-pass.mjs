// Real paint colors, in the browser: the paint math; a sample room's wall painted RAL 9010 from the searchable RAL tab
// (its name shows); a quick swatch suggests the closest RAL paint, one click away; the paint list works out a
// 4 × 2.5 m wall (10 m², 2.2 L for 2 coats with 10% spare, one 2.5 L tin) and covers only walls and ceilings; signing up
// and saving keeps the paint and the size after a reload, and the design page shows the list; phone layout.
// Usage: node e2e/paint-pass.mjs [web url]
import { launch, sleep, until, WEB, selectObject, recoloredCount, clickButton } from './ff.mjs'

const email = `paint-${Date.now()}@example.com`
const password = 'correct horse battery'
const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const frame = () => sleep(250)
const editorReady = () => until(page, () => !!document.querySelector('canvas[data-label-map]'), { timeout: 30000, label: 'editor' })
const text = (selector) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, selector)
const clickText = (scope, label) => clickButton(page, scope, label)
const select = async (index) => {
  if (!(await selectObject(page, index))) {
    throw new Error(`Object ${index} can't be clicked on the photo`)
  }

  await frame()
}
const pickRal = async (query, ref) => {
  await clickText('aside', 'RAL colors')
  await page.waitForSelector('aside input[aria-label="Search RAL colors"]')
  await page.type('aside input[aria-label="Search RAL colors"]', query)
  await until(page, new Function(`return document.querySelectorAll('aside [data-paint]').length > 0 && !!document.querySelector('aside [data-paint="${ref}"]')`), { label: 'paint found' })
  const shown = await page.evaluate(() => document.querySelectorAll('aside [data-paint]').length)

  await page.click(`aside [data-paint="${ref}"]`)
  await frame()

  return shown
}
const openList = async () => {
  await clickText('aside', 'Paint list')
  await page.waitForSelector('[role=dialog] [data-paint-row]')
  await sleep(400) // the dialog's fade-in
}

try {
  // 1. The paint math, straight from the app's module (the Vite dev server serves it).
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  const math = await page.evaluate(async () => {
    const m = await import('/src/features/paints/paint-math.ts')
    const tins = (litres) => m.formatTins(m.tinsFor(litres))

    return {
      litres: m.formatNumber(m.litresFor(10, { coats: 2, coverage: 10 })),
      tins: [tins(2.2), tins(0.4), tins(7), tins(11), tins(19.6)],
      closest: m.closestPaint('#F6F8EE', [{ ref: 'a', color: '#000000' }, { ref: 'b', color: '#F7F9EF' }])?.ref,
      search: [m.matchesPaint({ code: 'RAL 9010', name: 'Pure white' }, 'white 9010'), m.matchesPaint({ code: 'RAL 9010', name: 'Pure white' }, 'red')],
    }
  })

  step('Paint math: litres, tins and the closest paint', math.litres === '2.2' && math.tins.join('|') === '1 × 2.5 L|1 × 1 L|1 × 5 L + 2 × 1 L|1 × 10 L + 1 × 1 L|2 × 10 L'
    && math.closest === 'b' && math.search.join() === 'true,false', JSON.stringify(math))

  // 2. A guest opens a sample living room and paints a wall RAL 9010 from the RAL tab.
  const room = await page.evaluate(() => fetch('/api/library/minimalist/living-room/1/copy', { method: 'POST' }).then((r) => r.json()))
  const wall = room.objects.find((o) => o.category === 'Wall')
  const furniture = room.objects.find((o) => !['Wall', 'Floor', 'Ceiling', 'Opening'].includes(o.category))

  await page.goto(`${WEB}/rooms/${room.id}`, { waitUntil: 'networkidle0' })
  await editorReady()
  await select(wall.index)
  const found = await pickRal('9010', 'ral-classic/9010')
  const label = await text('aside [data-paint-label]')
  const recolored = await recoloredCount(page)

  await shot('paint-ral')
  step('Searching "9010" finds RAL 9010 and paints the wall with it', found === 1 && recolored === 1 && label === 'RAL 9010 · Pure white', `${found} found, label "${label}"`)

  // 3. A quick swatch has no paint name, but suggests the closest RAL color; "Use it" switches to it.
  await clickText('aside', 'Quick colors')
  await page.click('aside [role=radiogroup][aria-label^="Color for"] button:nth-child(5)')
  await frame()
  const suggestion = await text('aside [data-closest-paint]')
  const labelGone = !(await page.$('aside [data-paint-label]'))

  await clickText('aside [data-closest-paint]', 'Use it')
  await frame()
  const switched = await text('aside [data-paint-label]')

  step('A quick swatch suggests the closest RAL color, and one click uses it', labelGone && /Closest paint: RAL \d{4}/.test(suggestion ?? '') && /^RAL \d{4} · /.test(switched ?? ''),
    `"${suggestion}" → "${switched}"`)
  // Back to RAL 9010 for the amounts below, and a piece of furniture in a quick color: furniture has no paint list.
  await pickRal('pure white', 'ral-classic/9010')
  await select(furniture.index)
  await clickText('aside', 'Quick colors')
  await page.click('aside [role=radiogroup][aria-label^="Color for"] button')
  await frame()
  const furnitureButton = await page.evaluate(() => [...document.querySelectorAll('aside button')].some((b) => b.textContent.trim() === 'Paint list'))

  await select(wall.index)

  // 4. The paint list: the wall's height starts at 2.5 m; a 4 m width makes 10 m², 2.2 L, one 2.5 L tin.
  await openList()
  const wallRow = `[role=dialog] [data-paint-row="${wall.index}"]`
  const inputs = await page.$$(`${wallRow} input`)
  const prefilled = await inputs[1].evaluate((i) => i.value)

  await inputs[0].type('4')
  await frame()
  const area = await text(`${wallRow} [data-area]`)
  const total = await text('[role=dialog] [data-paint-total="ral-classic/9010"] [data-litres]')
  const tins = await text('[role=dialog] [data-paint-total="ral-classic/9010"] [data-tins]')
  const shop = await text(`[role=dialog] [data-paint-row="${furniture.index}"]`)

  await shot('paint-list')
  step('A 4 × 2.5 m wall needs 2.2 L for two coats: one 2.5 L tin', prefilled === '2.5' && area === '10 m²' && total === '10 m² · 2.2 L' && tins === '1 × 2.5 L',
    `height ${prefilled}, ${area}, ${total}, ${tins}`)
  step('The paint list is for walls and ceilings only: furniture has no button and no row', !furnitureButton && shop === null,
    `button ${furnitureButton}, row "${shop}"`)
  // Three coats: 3.3 L, which a 2.5 L and a 1 L tin cover.
  const coats = await page.$('[role=dialog] input[max="4"]')

  await coats.click({ count: 3 })
  await coats.type('3')
  await frame()
  const threeCoats = await text('[role=dialog] [data-paint-total="ral-classic/9010"]')

  step('Changing the coats changes the amount', /3\.3 L/.test(threeCoats ?? '') && /1 × 2\.5 L \+ 1 × 1 L/.test(threeCoats ?? ''), threeCoats)
  await page.keyboard.press('Escape')
  await until(page, () => !document.querySelector('[role=dialog]'), { label: 'list closed' })

  // 5. Sign up, save the design, reload: the paint and the size come back.
  await page.click('::-p-text(Sign in to save)')
  await until(page, () => location.pathname === '/sign-in', { label: 'sign-in' })
  await page.click('::-p-text(Create an account)')
  await until(page, () => location.pathname === '/sign-up', { label: 'sign-up' })
  await page.type('input[type=email]', email)
  await page.type('input[autocomplete=new-password]', password)
  await page.click('button[type=submit]')
  await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'back in editor' })
  await editorReady()
  await page.click('::-p-text(Save design)')
  await page.waitForSelector('[role=dialog] input')
  await page.type('[role=dialog] input', 'Painted living room')
  await page.click('[role=dialog] button[type=submit]')
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'saved design' })
  const designId = new URL(page.url()).searchParams.get('design')

  await page.reload({ waitUntil: 'networkidle0' })
  await editorReady()
  await sleep(300)
  await select(wall.index)
  const keptLabel = await text('aside [data-paint-label]')

  await openList()
  const keptWidth = await page.$eval(`${wallRow} input`, (i) => i.value)
  const keptTotal = await text('[role=dialog] [data-paint-total="ral-classic/9010"] [data-litres]')

  step('After saving and a reload the paint and the wall size are kept', keptLabel === 'RAL 9010 · Pure white' && keptWidth === '4' && keptTotal === '10 m² · 2.2 L',
    `"${keptLabel}", width ${keptWidth}, ${keptTotal}`)
  await page.keyboard.press('Escape')
  await until(page, () => !document.querySelector('[role=dialog]'), { label: 'list closed again' })

  // 6. The design page lists the room's paints too (sizes shown, not edited).
  await page.goto(`${WEB}/designs/${designId}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('main button[aria-label^="Paint list for"]')
  await until(page, () => [...document.querySelectorAll('main img')].every((i) => i.complete), { label: 'room photos loaded' })
  await page.click('main button[aria-label^="Paint list for"]')
  await page.waitForSelector('[role=dialog] [data-paint-row]')
  await sleep(400)
  const pageList = await text('[role=dialog]')

  await shot('paint-design-page')
  step('The design page shows the room\'s paint list', /RAL 9010 Pure white/.test(pageList ?? '') && /4 × 2\.5 m/.test(pageList ?? '') && /1 × 2\.5 L/.test(pageList ?? ''))
  await page.keyboard.press('Escape')

  // 7. Phone layout: the RAL tab and the paint list fit.
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(`${WEB}/rooms/${room.id}?design=${designId}`, { waitUntil: 'networkidle0' })
  await editorReady()
  await sleep(300)
  await select(wall.index)
  await clickText('aside', 'RAL colors')
  await page.waitForSelector('aside [data-paint]')
  const tabOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

  await openList()
  const listOverflow = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]')

    return Math.max(document.documentElement.scrollWidth - innerWidth, dialog.scrollWidth - dialog.clientWidth)
  })

  await shot('paint-phone')
  step('The RAL colors and the paint list fit a phone screen', tabOverflow <= 0 && listOverflow <= 0, `tab ${tabOverflow} px, list ${listOverflow} px too wide`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('paint-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|http 40[014]\] .*\/api\/(account|designs|rooms)|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
