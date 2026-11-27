// The room builder, in the browser: the walls step and the floor step (a new room is furnished for its type and size
// unless the user unticks it), then the floor plan: an object dropped from the
// catalog lands where it is let go; dragging moves it, its corner handle resizes it, the inspector sizes and colors it;
// overlapping objects are outlined; "Describe an object" (the fake AI) adds one; the plan is saved and comes back after
// a reload; the catalog's sections collapse, and a click opens a dialog to choose an object's type, color and size;
// a furnished room comes dressed (curtains, decorations, materials, things on its walls, a finish for its type); an
// object's material is picked in the inspector; the walls' finish, an accent wall and the time of day redraw the 3D view;
// a P-shaped sofa's parts resize one by one; a window is placed exactly on its wall in the wall view, and a door dropped near a wall lands on it; the 3D
// view draws the room, and clicking a wall turns it to look at that wall; Generate photo asks for a style and extra
// instructions, then (the fake AI) makes the picked views' photos one room and opens its photo page; phone layout.
// Usage: node e2e/builder-pass.mjs [web url]
import { launch, sleep, until, WEB, canvasVariety, dropCatalogObject } from './ff.mjs'

const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const frame = () => sleep(250)
const saved = () => until(page, () => document.querySelector('[data-save-state]')?.textContent.trim() === 'Saved', { timeout: 10000, label: 'saved' })
const stored = () => page.evaluate(async () => (await fetch(`/api/plans/${location.pathname.split('/').at(-1)}`)).json())
/**
 * Clicks a button in a dialog that scrolls: scrolled to the middle of the view first, and after the dialog has settled
 * (opening, or growing to new content), as the mouse's own scrolling left some clicks beside it.
 * @param selector - The button.
 */
const clickInDialog = async (selector) => {
  await page.waitForSelector(selector)
  await sleep(400)
  await page.$eval(selector, (b) => b.scrollIntoView({ block: 'center' }))
  await page.click(selector)
}
/** The saved plan once it passes a check (the builder saves a moment after a change), or as it is after 10 s. */
const storedOnce = async (check) => {
  for (let tries = 0; tries < 40; tries++) {
    const plan = await stored()

    if (check(plan)) {
      return plan
    }

    await sleep(250)
  }

  return await stored()
}
const shown = () => page.evaluate(() => [...document.querySelectorAll('[data-plan-canvas] [data-item]')].length)
/** Clicks a catalog object and adds its first type from the dialog that opens. */
const addFromDialog = async (key) => {
  await page.click(`[data-catalog="${key}"]`)
  await page.waitForSelector('[data-add-object]')
  // A tall dialog scrolls inside: once it has opened, its Add button is scrolled into view (Firefox's click doesn't).
  await page.$eval('[data-add-object-dialog]', (dialog) => Promise.all(dialog.getAnimations({ subtree: true }).map((a) => a.finished)))
  await page.$eval('[data-add-object]', (button) => button.scrollIntoView({ block: 'center' }))
  await page.click('[data-add-object]')
  await page.waitForSelector('[data-add-object-dialog]', { hidden: true })
}

/** The page point of a plan point (centimetres from the back-left corner). */
const toPage = (x, y) => page.evaluate((x, y) => {
  const svg = document.querySelector('[data-plan-canvas]')
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM())

  return { x: p.x, y: p.y }
}, x, y)

try {
  // 1. The walls step: a 4 × 5 m living room by default; the floor step: tiles; Next opens the floor plan with the
  //    windows and doors and the room's common objects.
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${WEB}/build`, { waitUntil: 'networkidle0' })
  await page.click('[data-build-choice=walls]')
  await page.waitForSelector('form[data-build-step=walls]')
  // The step is in the address, so the browser's Back goes back to the two ways to start.
  const wallsStep = new URL(page.url()).search

  await page.goBack()
  await page.waitForSelector('[data-build-choice=walls]')
  const backToStart = new URL(page.url()).pathname + new URL(page.url()).search

  await page.click('[data-build-choice=walls]')
  await page.waitForSelector('form[data-build-step=walls]')
  step('Build a room’s steps are in the address, so Back goes back a step', wallsStep === '?step=walls' && backToStart === '/build', `${wallsStep} then ${backToStart}`)
  await page.click('[role=radiogroup][aria-label="Room type"] [role=radio]:nth-child(2)') // Bedroom
  await page.click('[role=radiogroup][aria-label="Room type"] [role=radio]:nth-child(1)') // back to Living room
  const outline = await page.$eval('[data-room-outline]', (e) => [e.style.width, e.style.height])

  await page.click('form[aria-label="New room"] button[type=submit]')
  await page.waitForSelector('form[data-build-step=floor] [data-floor-type=Tiles]')
  await page.click('[data-floor-type=Tiles]')
  await page.click('[data-furnish] input') // this pass starts with an empty room
  await page.click('form[aria-label="New room"] button[type=submit]')
  await until(page, () => /^\/build\/[0-9a-f-]{36}$/.test(location.pathname), { label: 'plan page' })
  await page.waitForSelector('[data-plan-canvas]')
  await page.waitForSelector('[data-catalog]')
  const listed = () => page.evaluate(() => [...document.querySelectorAll('[data-catalog]')].map((b) => b.dataset.catalog))
  const sections = () => page.evaluate(() => [...document.querySelectorAll('[data-catalog-section]')].map((s) => s.dataset.catalogSection).join())
  const firstPage = await listed()
  const planSections = await sections()
  const floorType = (await stored()).floorType

  await page.click('[data-show-more=objects]')
  const secondPage = await listed()
  const moreLeft = await page.$('[data-show-more]')

  await page.type('[data-catalog-search]', 'lamp')
  const lamps = await listed()

  // The × clears the search; a search that empties a list says so, with a button that clears it.
  await page.click('[data-search-clear]')
  const cleared = await page.$eval('[data-catalog-search]', (e) => e.value)

  await page.type('[data-catalog-search]', 'zzz')
  const emptyText = await page.$eval('[data-list-empty=objects]', (e) => e.textContent.trim())

  await page.click('[data-list-empty=objects] [data-clear-search]')
  const afterClear = await listed()

  // The room's objects ten at a time, then the five ceiling lights.
  step('The plan opens with the living room\u2019s objects (no windows or things to hang), ten at a time, then the ceiling lights, and a search',
    planSections === 'objects,ceiling' && firstPage.length === 15 && firstPage.includes('sofa') && !firstPage.includes('window') && firstPage.includes('pendant-light')
      && secondPage.length === 24 && moreLeft === null && lamps.join() === 'floor-lamp,ceiling-lamp' && outline[1] === '200px' && floorType === 'Tiles',
    `${planSections}: ${firstPage.length} then ${secondPage.length}, lamps ${lamps}, outline ${outline}, floor ${floorType}`)
  step('A search that empties a list says so and clears with one click (or the box’s ×)',
    cleared === '' && emptyText.startsWith('No objects match “zzz”') && afterClear.length === 15, `${emptyText} | ${afterClear.length} after clearing`)

  // 1b. A furnished room (the default): a 4 × 4 m bedroom gets a door, windows on the back wall and a bed with two
  //     nightstands, all inside the walls.
  const furnished = await page.evaluate(async () => {
    const plan = await (await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomType: 'Bedroom', width: 4, length: 4, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A', floorType: 'Wood' }) })).json()

    return { id: plan.id, items: plan.items, finish: plan.finish }
  })
  const kinds = furnished.items.map((i) => i.label)
  const bed = furnished.items.find((i) => i.shape === 'Bed')

  step('A new room starts furnished for its type and size', furnished.items.some((i) => i.shape === 'Door') && furnished.items.some((i) => i.wall === 0 && i.shape === 'Window')
    && furnished.items.some((i) => i.shape === 'Bed') && kinds.filter((k) => k === 'nightstand').length === 2, kinds.join(', '))
  step('It comes dressed: curtains, decorations, materials, art above the bed, and the wall behind the bed in its own color',
    furnished.items.filter((i) => i.shape === 'Window').every((w) => w.covering?.kind === 'Sheers') && bed?.decorations?.includes('decorative pillows')
      && bed?.material === 'linen upholstered' && furnished.items.some((i) => i.label === 'set of three framed prints' && i.wall === 1)
      && furnished.finish.ownWalls.length === 1 && furnished.finish.ownWalls[0].wall === 1,
    `bed ${bed?.material} ${bed?.decorations}, own walls ${JSON.stringify(furnished.finish.ownWalls)}`)

  // 2. Dropping the sofa from the catalog onto the plan puts it where it is let go (on the 10 cm grid).
  const sofa = await page.evaluate(() => fetch('/api/builder/catalog/LivingRoom').then((r) => r.json()).then((list) => list.find((o) => o.key === 'sofa')))
  const target = await toPage(200, 80)

  await dropCatalogObject(page, '[data-plan-canvas]', sofa, target)
  await frame()
  await saved()
  const afterDrop = (await stored()).items[0]

  step('A sofa dropped on the plan lands where it is let go', (await shown()) === 1 && afterDrop?.label === 'three-seat sofa'
    && afterDrop.x === 200 && afterDrop.y === 80, JSON.stringify(afterDrop))

  // 3. Dragging moves it; the corner handle makes it wider.
  const from = await toPage(200, 80)
  const to = await toPage(250, 200)

  await page.mouse.move(from.x, from.y); await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up()
  await frame()
  // The sofa (220 × 95 at 250, 200) spans 140 to 360 across. Its bottom-right handle, dragged to 400, grows it to the
  // right only; then its top-left handle, dragged to 100, grows it to the left only.
  const cornerOf = (name) => page.$eval(`[data-plan-canvas] [data-resize=${name}]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const dragTo = async (from, to) => {
    await page.mouse.move(from.x, from.y); await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up()
    await frame()
    await saved()
  }

  await dragTo(await cornerOf('se'), await toPage(400, 247.5))
  const grownRight = (await stored()).items[0]

  await dragTo(await cornerOf('nw'), await toPage(100, 152.5))
  const moved = (await stored()).items[0]
  const edges = (item) => `${Math.round(item.x - item.width / 2)}–${Math.round(item.x + item.width / 2)}`

  step('Dragging moves the sofa, and each corner handle grows it towards the pointer only',
    edges(grownRight) === '140–400' && moved.x === 250 && Math.abs(moved.y - 200) <= 2 && Math.abs(moved.width - 300) <= 2 && Math.abs(moved.depth - 95) <= 3,
    `after the right handle ${edges(grownRight)}, after the left handle ${edges(moved)}, ${moved.width} × ${moved.depth} at ${moved.x}, ${moved.y}`)

  // 3b. Ctrl+C and Ctrl+V add a copy 30 cm right and down (kept inside the walls), selected; Delete removes it again,
  // and clicking the sofa selects it for the next step.
  const countBefore = (await stored()).items.length

  await page.keyboard.down('Control'); await page.keyboard.press('c'); await page.keyboard.press('v'); await page.keyboard.up('Control')
  await frame()
  await saved()
  const pasted = await stored()
  const copyItem = pasted.items[pasted.items.length - 1]
  const copySelected = await page.evaluate(() => !!document.querySelector('[data-plan-canvas] [data-resize]')?.closest(`[data-item="${document.querySelectorAll('[data-plan-canvas] [data-item]').length - 1}"]`))

  await page.keyboard.press('Delete')
  await frame()
  await saved()
  const afterDelete = (await stored()).items.length
  const roomWidth = pasted.width * 100
  const sofaAt = await toPage(moved.x, moved.y)

  await page.mouse.click(sofaAt.x, sofaAt.y)
  await frame()
  step('Ctrl+C and Ctrl+V paste a copy 30 cm away, selected, and Delete removes it',
    pasted.items.length === countBefore + 1 && copyItem.label === moved.label && copyItem.x === Math.min(moved.x + 30, roomWidth - moved.width / 2) && copyItem.y === moved.y + 30 && copySelected && afterDelete === countBefore,
    `${countBefore} → ${pasted.items.length} → ${afterDelete}; copy at ${copyItem.x}, ${copyItem.y}; selected ${copySelected}`)

  // 3c. The same keys on a Cyrillic keyboard (where C types "с" and V "м") copy and paste too; Delete removes the copy.
  await page.evaluate(() => {
    for (const [code, key] of [['KeyC', 'с'], ['KeyV', 'м']]) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key, ctrlKey: true, bubbles: true }))
    }
  })
  const cyrillic = await storedOnce((plan) => plan.items.length === countBefore + 1)

  await page.keyboard.press('Delete')
  await storedOnce((plan) => plan.items.length === countBefore)
  await page.mouse.click(sofaAt.x, sofaAt.y)
  await frame()
  step('Ctrl+C and Ctrl+V work on a Cyrillic keyboard too', cyrillic.items.length === countBefore + 1, `${countBefore} → ${cyrillic.items.length}`)

  // 4. The inspector sets its height and color; turning swaps its footprint.
  await page.click('[data-inspector-item] input[aria-label=Height]', { count: 3 })
  await page.type('[data-inspector-item] input[aria-label=Height]', '90')
  await page.click('[data-inspector-item] [aria-label="Color #4A6274"]')
  await page.evaluate(() => [...document.querySelectorAll('[data-inspector-item] button')].find((b) => b.textContent.startsWith('Turn')).click())
  await frame()
  await saved()
  const styled = (await stored()).items[0]

  step('The inspector sets the height and color, and turns it', styled.height === 90 && styled.color === '#4A6274' && styled.rotation === 90, JSON.stringify(styled))
  // Turned a quarter, its front (F) faces the left wall and its back (B) the right wall.
  const marks = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-plan-canvas] [data-item="0"] [data-facing-mark]')]
    .map((m) => [m.dataset.facingMark, m.getBoundingClientRect().x])))

  step('Each object shows its front and back, and they turn with it', marks.F < marks.B, JSON.stringify(marks))

  // 5. A second object put on top of the first is outlined as overlapping.
  await addFromDialog('armchair')
  await page.evaluate(() => document.querySelector('[data-plan-canvas]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
  await frame()
  const clashes = await page.evaluate(() => document.querySelectorAll('[data-plan-canvas] [data-clash]').length)

  step('Overlapping objects are outlined', clashes === 2, `${clashes} outlined`)

  // 6. Describe an object (the fake AI), at the bottom of the Other dialog: it is added with the size and color the
  //    words give, and the dialog closes.
  await page.click('[data-other-objects]')
  await page.waitForSelector('[data-other-objects-dialog] #describe-object')
  await page.type('#describe-object', 'a round oak coffee table, 90 cm')
  await page.evaluate(() => [...document.querySelectorAll('[data-other-objects-dialog] button')].find((b) => b.textContent.trim() === 'Add it').click())
  await until(page, () => document.querySelectorAll('[data-plan-canvas] [data-item]').length === 3 && !document.querySelector('[data-other-objects-dialog]'), {
    label: 'described object',
  })
  await saved()
  const described = (await stored()).items[2]

  step('Describing an object adds it with its size and color', described.width === 90 && described.color === '#B8864B' && /coffee table/.test(described.label),
    JSON.stringify(described))

  // 7. A reload brings the room back as it was.
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas] [data-item]')
  step('After a reload the objects are all there', (await shown()) === 3)

  // 7b. The catalog: its sections collapse and expand. Clicking the sofa opens a dialog with its three types, a color
  //     and a size; the P-shaped one is added in the chosen color, drawn as a P. Its parts resize one by one: the back
  //     run by its handle on the plan, the chaise in the inspector. Choosing its first type in the inspector makes it a
  //     three-seat sofa where it stands. Then it is deleted, so the room is as before.
  await page.click('[data-catalog-section=objects] [data-section-toggle]')
  // It slides shut, then its objects leave the page.
  const collapsed = await page.waitForFunction(() => !document.querySelector('[data-catalog="sofa"]'), { timeout: 3000 }).then(() => true, () => false)

  await page.click('[data-catalog-section=objects] [data-section-toggle]')
  await page.waitForSelector('[data-catalog="sofa"]')
  await page.click('[data-catalog="sofa"]')
  await page.waitForSelector('[data-add-object-dialog] [data-object-type]')
  const types = await page.evaluate(() => [...document.querySelectorAll('[data-add-object-dialog] [data-object-type]')].map((t) => t.dataset.objectType))

  await page.click('[data-object-type="p-shaped"]')
  await page.click('[data-add-object-dialog] [aria-label="Color #4A6274"]')
  const firstMaterial = await page.$eval('[data-add-object-dialog] [data-material][aria-checked=true]', (b) => b.dataset.material)

  await page.click('[data-add-object-dialog] [data-material=wool]')
  const offered = await page.evaluate(() => [...document.querySelectorAll('[data-add-object-dialog] [data-decoration]')].map((d) => d.dataset.decoration))

  await page.click('[data-add-object-dialog] [data-decoration="cushions"]')
  await page.click('[data-add-object-dialog] [data-decoration="throw blanket"]')
  await page.click('[data-add-object-dialog] [data-decoration="throw blanket"]')
  await page.type('[data-add-object-dialog] [data-decoration-other]', 'candles, Cushions, knitted pouf')
  await page.keyboard.press('Enter')
  await shot('builder-add-dialog')
  await page.click('[data-add-object]')
  await frame()
  await saved()
  const corner = (await stored()).items[3]
  const drawnP = await page.evaluate(() => !!document.querySelector('[data-plan-canvas] [data-item="3"] polygon[data-form=PShaped]'))

  step('The room’s objects collapse; clicking an object offers its types, a color, a material and a size, and adds the chosen one',
    collapsed && types.join() === 'standard,corner,p-shaped' && corner.form === 'PShaped' && corner.width === 300 && corner.color === '#4A6274' && drawnP && !!corner.parts
      && firstMaterial === 'linen' && corner.material === 'wool',
    `collapsed ${collapsed}; types ${types}; ${corner.label} ${corner.width}×${corner.depth} ${corner.color} ${firstMaterial} → ${corner.material} ${JSON.stringify(corner.parts)}`)
  const inInspector = await page.evaluate(() => [...document.querySelectorAll('[data-inspector-item] [data-decoration][aria-checked=true]')].map((d) => d.dataset.decoration))

  step('The dialog offers five decorations and Other; the chosen ones are saved and shown in the inspector',
    offered.length === 5 && offered.includes('cushions') && JSON.stringify(corner.decorations) === '["cushions","candles","knitted pouf"]' && inInspector.join() === 'cushions,candles,knitted pouf',
    `offered ${offered}; saved ${JSON.stringify(corner.decorations)}; inspector ${inInspector}`)

  const runHandle = await (await page.$('[data-part-handle=run]')).boundingBox()

  await page.mouse.move(runHandle.x + runHandle.width / 2, runHandle.y + runHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(runHandle.x + runHandle.width / 2, runHandle.y + runHandle.height / 2 + 25, { steps: 5 })
  await page.mouse.up()
  await frame()
  await page.click('[data-part-fields] input[aria-label="Chaise width"]', { count: 3 })
  await page.type('[data-part-fields] input[aria-label="Chaise width"]', '200')
  await page.keyboard.press('Tab')
  await frame()
  await saved()
  const resized = (await stored()).items[3]

  await shot('builder-parts')
  step('A P-shaped sofa\'s parts resize one by one: the back run by its handle, the chaise in the inspector',
    resized.parts.runDepth > corner.parts.runDepth && resized.parts.chaiseWidth === 200 && resized.parts.legWidth === corner.parts.legWidth && resized.width === 300,
    `${JSON.stringify(corner.parts)} → ${JSON.stringify(resized.parts)}`)

  await page.click('[data-inspector-item] [data-variation=standard]')
  await frame()
  await saved()
  const straight = (await stored()).items[3]

  step('Choosing another type in the inspector changes it where it stands',
    straight.label === 'three-seat sofa' && straight.form === 'Standard' && !straight.parts && straight.width === 220 && straight.x === resized.x,
    `${straight.label} ${straight.width}×${straight.depth}, parts ${JSON.stringify(straight.parts)}`)

  // 7b. Its material: the sofa's offered ones (wool, picked in the dialog), then velvet, then None.
  const materials = await page.$$eval('[data-inspector-item] [data-material]', (b) => b.map((x) => x.dataset.material))
  const startedIn = straight.material

  await page.click('[data-inspector-item] [data-material=velvet]')
  await frame()
  await saved()
  const velvet = (await stored()).items[3].material

  await page.click('[data-inspector-item] [data-material=none]')
  await frame()
  await saved()
  const plainSofa = (await stored()).items[3].material

  step('The inspector offers the sofa\u2019s materials and saves the one picked, or none',
    startedIn === 'wool' && materials.includes('velvet') && materials.at(-1) === 'none' && velvet === 'velvet' && plainSofa === '',
    `${materials.join(' ')}: ${startedIn} → ${velvet} → "${plainSofa}"`)
  await page.evaluate(() => [...document.querySelectorAll('[data-inspector-item] button')].find((b) => b.textContent.trim() === 'Delete').click())
  await frame()
  await saved()

  // 7c. On the plan, windows, doors and hung things aren't listed (they go on a wall seen straight on). Clicking the back wall on the plan opens it in the Wall tab, which lists them (and not the room's
  //     objects), and they work.
  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-plan-canvas]')
  const offOnPlan = await page.evaluate(() => ({
    window: document.querySelector('[data-catalog="window"]')?.disabled,
    painting: document.querySelector('[data-catalog="painting"]')?.disabled,
    sofa: document.querySelector('[data-catalog="sofa"]')?.disabled,
  }))

  await page.click('[data-plan-wall="0"]')
  await page.waitForSelector('[data-wall-view="0"]')
  const onInWall = await page.evaluate(() => ({
    window: document.querySelector('[data-catalog="window"]')?.disabled,
    sofa: document.querySelector('[data-catalog="sofa"]')?.disabled,
    hangable: [...document.querySelectorAll('[data-catalog-section=mounted] [data-catalog]')].map((b) => b.dataset.catalog),
  }))

  step('On the plan, windows, doors and hung things aren\u2019t listed; clicking a wall opens it in the Wall tab, which lists them only',
    offOnPlan.window === undefined && offOnPlan.painting === undefined && offOnPlan.sofa === false
      && onInWall.window === false && onInWall.sofa === undefined
      && onInWall.hangable.slice(0, 3).join() === 'painting,mirror,wall-shelf' && onInWall.hangable.includes('radiator') && (await stored()).view === 0,
    JSON.stringify({ offOnPlan, onInWall }))

  // 8. A window: clicking it puts it on the wall shown (the back wall), straight on; dragging it there moves it along
  //    the wall and up, and the inspector places it exactly from the wall's left corner.
  await addFromDialog('window')
  await page.waitForSelector('[data-wall-view="0"] [data-opening=Window]')
  await saved()
  const added = (await stored()).items[3]
  /** The page point of a wall point: along the wall from its left corner, and up from the floor (centimetres). */
  const onWall = (along, up) => page.evaluate((along, up) => {
    const svg = document.querySelector('[data-wall-view] svg[role=application]')
    const height = svg.viewBox.baseVal.height - 120
    const p = new DOMPoint(along, height - up).matrixTransform(svg.getScreenCTM())

    return { x: p.x, y: p.y }
  }, along, up)
  const grab = await onWall(200, 160)
  const drop = await onWall(250, 170)

  await page.mouse.move(grab.x, grab.y); await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 8 }); await page.mouse.up()
  await frame()
  await saved()
  const dragged = (await stored()).items[3]

  await page.click('[data-inspector-opening] input[aria-label="From left corner"]', { count: 3 })
  await page.type('[data-inspector-opening] input[aria-label="From left corner"]', '30')
  await frame()
  await saved()
  const exact = (await stored()).items[3]

  await shot('builder-wall')
  // The room's objects are drawn after (in front of) the windows and doors, and the chosen one's handle after them.
  const order = await page.evaluate(() => {
    const kids = [...document.querySelector('[data-wall-view] svg[role=application]').children]
    const last = (selector) => kids.reduce((at, kid, i) => (kid.matches(selector) ? i : at), -1)
    const first = (selector) => kids.findIndex((kid) => kid.matches(selector))

    return { opening: last('[data-opening]'), object: first('[data-wall-object]'), objects: kids.filter((kid) => kid.matches('[data-wall-object]')).length, handle: first('[data-item-chosen]') }
  })

  step('In the wall view, the objects in the room stand in front of the windows and doors',
    order.objects > 0 && order.opening < order.object && order.handle > order.object, JSON.stringify(order))
  step('A window goes on the wall in view, drags into place, and sits exactly where the inspector says',
    added.wall === 0 && added.elevation === 90 && added.x === 200 && Math.abs(dragged.x - 250) <= 2 && Math.abs(dragged.elevation - 100) <= 2
      && exact.x === 90 && !!(await page.$('[data-wall-view] [data-measurements]')),
    `added ${added.wall} x ${added.x} at ${added.elevation}; dragged x ${dragged.x} at ${dragged.elevation}; exact x ${exact.x}`)

  // A second window from the dialog goes beside the first rather than on it; moved onto it, both are outlined in red.
  await addFromDialog('window')
  await saved()
  const twin = (await stored()).items.at(-1)
  const apart = await page.evaluate(() => document.querySelectorAll('[data-wall-view] [data-clash]').length)

  await page.click('[data-inspector-opening] input[aria-label="From left corner"]', { count: 3 })
  await page.type('[data-inspector-opening] input[aria-label="From left corner"]', '30')
  await frame()
  await saved()
  const together = await page.evaluate(() => ({ wall: document.querySelectorAll('[data-wall-view] [data-clash]').length }))

  await page.evaluate(() => [...document.querySelectorAll('[data-inspector-opening] button')].find((b) => b.textContent.trim() === 'Delete').click())
  await saved()
  // The first window chosen again, for the steps below.
  await page.click('[data-wall-view] [data-item="3"]')
  await frame()
  step('A second window goes beside the first, not on it; moved onto it, both are outlined in red',
    twin.wall === 0 && Math.abs(twin.x - exact.x) * 2 >= twin.width + exact.width - 1 && apart === 0 && together.wall === 2,
    `first x ${exact.x} w ${exact.width}; second x ${twin.x} w ${twin.width}; outlined apart ${apart}, together ${together.wall}`)

  // 8b. Resizing a window from its top-right corner far past the wall's end and the ceiling: its left side and bottom
  //     stay, and it stops at the wall and the ceiling, holding still (it used to shake as each move measured from a
  //     window the wall had moved). Then its top-left corner grows it to the left only.
  const startWindow = (await stored()).items[3]
  const sizeHandle = await page.$eval('[data-wall-view] [data-resize=ne]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  // The drawing's top-right corner: past the wall's end and above the ceiling (its margin), yet on screen.
  const farAway = await page.$eval('[data-wall-view] svg[role=application]', (e) => { const r = e.getBoundingClientRect(); return { x: r.right - 3, y: r.top + 3 } })

  await page.mouse.move(sizeHandle.x, sizeHandle.y); await page.mouse.down()
  await page.mouse.move(farAway.x, farAway.y, { steps: 12 })
  const heldAt = []

  for (let i = 0; i < 4; i++) {
    await page.mouse.move(farAway.x - i, farAway.y + i)
    // The window's outline (a path, so an arched one is drawn arched).
    heldAt.push(await page.$eval('[data-wall-view] [data-opening=Window] path:not([data-casing])', (e) => e.getAttribute('d')))
  }

  await page.mouse.up()
  await frame()
  await saved()
  const capped = (await stored()).items[3]
  const room = await stored()
  const [roomTop, wallEnd] = [room.height * 100, room.width * 100]
  const leftOf = (item) => Math.round(item.x - item.width / 2)
  const rightOf = (item) => Math.round(item.x + item.width / 2)
  // Then the top-left handle, 20 cm to the left.
  const leftHandle = await page.$eval('[data-wall-view] [data-resize=nw]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const leftward = await onWall(leftOf(capped) - 20, capped.elevation + capped.height)

  await page.mouse.move(leftHandle.x, leftHandle.y); await page.mouse.down()
  await page.mouse.move(leftward.x, leftward.y, { steps: 8 }); await page.mouse.up()
  await frame()
  await saved()
  const leftward2 = (await stored()).items[3]

  step('A window grows from the corner dragged: past the wall it stops at the wall and the ceiling and holds still, and leftwards its right side stays',
    leftOf(capped) === leftOf(startWindow) && capped.elevation === startWindow.elevation && rightOf(capped) <= wallEnd && capped.elevation + capped.height <= roomTop
      && new Set(heldAt).size === 1 && Math.abs(leftOf(leftward2) - (leftOf(capped) - 20)) <= 2 && rightOf(leftward2) === rightOf(capped),
    `${leftOf(startWindow)}–${rightOf(startWindow)} → ${leftOf(capped)}–${rightOf(capped)} (bottom ${capped.elevation}, top ${capped.elevation + capped.height}) → ${leftOf(leftward2)}–${rightOf(leftward2)}; positions ${heldAt.join(' ')}`)
  await page.click('[data-inspector-opening] input[aria-label="Width"]', { count: 3 })
  await page.type('[data-inspector-opening] input[aria-label="Width"]', String(startWindow.width))
  await page.click('[data-inspector-opening] input[aria-label="Height"]', { count: 3 })
  await page.type('[data-inspector-opening] input[aria-label="Height"]', String(startWindow.height))
  await page.click('[data-inspector-opening] input[aria-label="From left corner"]', { count: 3 })
  await page.type('[data-inspector-opening] input[aria-label="From left corner"]', String(leftOf(startWindow)))
  await frame()
  await saved()

  // 9. A door dropped on the left wall in the Wall tab goes where it is let go, standing on the floor.
  await page.click('[data-wall-view] [data-wall-choice="3"]')
  await page.waitForSelector('[data-wall-view="3"]')
  const door = await page.evaluate(() => fetch('/api/builder/catalog/LivingRoom').then((r) => r.json()).then((list) => list.find((o) => o.key === 'door')))
  const nearLeft = await onWall(250, 100)

  await dropCatalogObject(page, '[data-wall-view] svg[role=application]', door, nearLeft)
  await page.waitForSelector('[data-wall-view="3"] [data-opening=Door]')
  await saved()
  const placedDoor = (await stored()).items[4]

  step('A door dropped on a wall in the Wall tab lands there, on the floor', placedDoor.wall === 3 && placedDoor.elevation === 0 && Math.abs(placedDoor.x - 250) <= 1,
    `${placedDoor.wall} x ${placedDoor.x} at ${placedDoor.elevation}`)

  // 9b. A painting from "On the walls" hangs on the wall shown (the back wall again) at its usual height, in front of the
  //     room's objects in the wall view; dragging it there raises it, and Ctrl+C / Ctrl+V hangs a copy beside it on the
  //     same wall.
  await page.click('[data-wall-view] [data-wall-choice="0"]')
  await page.waitForSelector('[data-wall-view="0"]')
  await addFromDialog('painting')
  await page.waitForSelector('[data-wall-view] [data-hung=Picture]')
  await saved()
  const hungAdded = (await stored()).items.at(-1)
  const view = (await stored()).view
  const hungOrder = await page.evaluate(() => {
    const kids = [...document.querySelector('[data-wall-view] svg[role=application]').children]

    return { hung: kids.findIndex((kid) => kid.matches('[data-hung]')), object: kids.reduce((at, kid, i) => (kid.matches('[data-wall-object]') ? i : at), -1) }
  })
  const paintingAt = await onWall(hungAdded.x, hungAdded.elevation + 30)
  const paintingTo = await onWall(hungAdded.x, hungAdded.elevation + 50)

  await page.mouse.move(paintingAt.x, paintingAt.y); await page.mouse.down()
  await page.mouse.move(paintingTo.x, paintingTo.y, { steps: 8 }); await page.mouse.up()
  await frame()
  await saved()
  const raised = (await stored()).items.at(-1)

  await page.keyboard.down('Control'); await page.keyboard.press('c'); await page.keyboard.press('v'); await page.keyboard.up('Control')
  await frame()
  await saved()
  const hungCopy = (await stored()).items.at(-1)

  await shot('builder-hung')
  step('A painting hangs on the wall shown at its height, in front of the objects, drags up, and copies beside itself',
    hungAdded.shape === 'Picture' && hungAdded.wall === view && hungAdded.elevation === 130 && hungOrder.hung > hungOrder.object
      && Math.abs(raised.elevation - 150) <= 2 && hungCopy.wall === raised.wall && hungCopy.x === raised.x + raised.width + 10 && hungCopy.elevation === raised.elevation,
    `added ${JSON.stringify({ wall: hungAdded.wall, x: hungAdded.x, up: hungAdded.elevation })}, order ${JSON.stringify(hungOrder)}, raised to ${raised.elevation}, copy at ${hungCopy.x} on ${hungCopy.wall}`)

  // 10. The 3D view draws the room (the canvas isn't blank), and clicking the left wall turns it to look at that wall.
  await page.click('::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(800)
  const variety = await canvasVariety(page, '[data-view-3d]')

  await shot('builder-3d')
  step('The 3D view draws the room', variety > 20, `${variety} colors`)
  const leftWall = await page.$eval('[data-view-3d]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width * 0.03, y: r.y + r.height * 0.35 } })

  await page.mouse.click(leftWall.x, leftWall.y)
  await until(page, () => document.querySelector('[data-view-3d]')?.dataset.view === '3', { label: 'left wall in view' })
  await saved()
  await sleep(500)
  await shot('builder-3d-left')
  step('Clicking a wall in 3D looks at it', (await stored()).view === 3)

  // 10b. From the left corner the camera stands in the near left corner, turned 45° towards the room: the 3D view
  //    redraws, every corner choice on the page shows it, the plan's camera marker moves and turns, and it is saved.
  //    Straight on puts it back.
  const picture = () => page.evaluate(() => {
    const canvas = document.querySelector('[data-view-3d]')
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height
    const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    let hash = 0

    for (let p = 0; p < data.length; p += 4 * 31) {
      hash = (hash * 31 + data[p] + data[p + 1] * 7 + data[p + 2] * 13) % 1000000007
    }

    return hash
  })
  const pickCorner = (corner) => page.evaluate((c) => [...document.querySelectorAll(`[data-corner-choice=${c}]`)].find((b) => b.offsetParent)?.click(), corner)
  const marker = async () => {
    await page.click('[role=tab]::-p-text(Plan)')
    await page.waitForSelector('[data-camera]')
    const at = await page.$eval('[data-camera]', (e) => ({ corner: e.dataset.corner, transform: e.getAttribute('transform') }))

    await page.click('[role=tab]::-p-text(3D view)')
    await page.waitForSelector('[data-view-3d]')
    await sleep(600)
    const [, x, y, turn] = at.transform.match(/translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/).map(Number)

    return { corner: at.corner, x: Math.round(x), y: Math.round(y), turn: Math.round(((turn % 360) + 360) % 360) }
  }
  const straightPicture = await picture()
  const straightMarker = await marker()

  await pickCorner('Left')
  await until(page, () => document.querySelector('[data-view-3d]')?.dataset.corner === 'Left', { label: 'left corner in view' })
  await saved()
  await sleep(600)
  await shot('builder-3d-corner')
  const cornerPicture = await picture()
  const checked = await page.evaluate(() => [...document.querySelectorAll('[data-corner-choice][aria-checked=true]')].map((b) => b.dataset.cornerChoice))
  const cornerMarker = await marker()
  const cornerSaved = (await stored()).corner

  step('The left corner view redraws the 3D view, shows in every corner choice, moves and turns the camera on the plan by 45°, and is saved',
    cornerPicture !== straightPicture && checked.length > 0 && checked.every((c) => c === 'Left') && cornerMarker.corner === 'Left'
      && cornerMarker.turn % 90 === 45 && straightMarker.turn % 90 === 0 && (cornerMarker.x !== straightMarker.x || cornerMarker.y !== straightMarker.y) && cornerSaved === 'Left',
    JSON.stringify({ checked, straightMarker, cornerMarker, cornerSaved }))
  await pickCorner('None')
  await until(page, () => document.querySelector('[data-view-3d]')?.dataset.corner === 'None', { label: 'straight on again' })
  await saved()
  await sleep(600)
  const backPicture = await picture()
  const backMarker = await marker()

  step('Straight on puts the camera back', backPicture === straightPicture && backMarker.turn === straightMarker.turn && (await stored()).corner === 'None',
    JSON.stringify(backMarker))

  // 10c. The room's finish in the 3D view: brick on all walls redraws it, plaster on one wall of its own too, and the
  //     evening darkens it; all saved. The wall list starts on All here (no wall is shown), and the light's section
  //     starts closed, its heading saying what is chosen.
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-finish-section=walls]')
  const startsOn = await page.$eval('[data-finish-wall][aria-checked=true]', (b) => b.dataset.finishWall)
  const closedHeading = await page.$eval('[data-finish-toggle=light]', (b) => b.textContent.trim())

  await page.click('[data-wall-finish=Brick]')
  await saved()
  await sleep(600)
  const brickPicture = await picture()

  await page.click('[data-finish-wall="3"]')
  await page.click('[data-wall-finish=Plaster]')
  await saved()
  await sleep(600)
  const accentPicture = await picture()

  await page.click('[data-finish-toggle=light]')
  await page.click('[data-time-of-day=Evening]')
  await saved()
  await sleep(600)
  const eveningPicture = await picture()
  const finish = (await stored()).finish

  await shot('builder-finish')
  step('Brick on all walls, plaster on one of its own and the evening each redraw the 3D view, and are saved',
    startsOn === 'all' && closedHeading === 'Light & mood: Midday, warm light' && new Set([backPicture, brickPicture, accentPicture, eveningPicture]).size === 4
      && finish.walls === 'Brick' && finish.ownWalls.length === 1 && finish.ownWalls[0].wall === 3 && finish.ownWalls[0].finish === 'Plaster'
      && finish.timeOfDay === 'Evening',
    `starts on ${startsOn}, ${closedHeading} | ${JSON.stringify(finish)}`)

  // 10d. The floor's colors are its type's own, each swatch drawn in its pattern: carpet offers carpet colors, and one
  //     picked is saved.
  await page.click('[data-floor-type=Carpet]')
  await saved()
  const carpetColors = await page.$$eval('[aria-label="Floor color color"] [role=radio]', (b) => b.map((x) => x.getAttribute('aria-label')))
  const drawnSwatches = await page.$$eval('[aria-label="Floor color color"] canvas', (c) => c.length)

  await page.click('[aria-label="Floor color color"] [aria-label="Color #7A2E3A"]')
  await saved()
  const carpeted = await stored()

  step('The floor offers its own type’s colors, drawn in its pattern, and the one picked is saved',
    carpetColors.length === 16 && drawnSwatches === 16 && carpeted.floorType === 'Carpet' && carpeted.floorColor === '#7A2E3A',
    `${carpetColors.length} colors, ${drawnSwatches} drawn, ${carpeted.floorType} ${carpeted.floorColor}`)

  // 10e. Other: every room type's objects in a dialog, in a list per room that opens (the room's own open first, then
  //     "Every room"... in order), searchable; the bathroom's glass shower shows the same choices as the room's own
  //     objects in the dialog, and Add puts it in.
  await page.click('[data-other-objects]')
  await page.waitForSelector('[data-other-objects-dialog] [data-catalog]')
  const groups = await page.$$eval('[data-other-group]', (g) => g.map((x) => `${x.dataset.otherGroup}${x.querySelector('[data-catalog]') ? '+' : ''}`))

  await page.click('[data-other-toggle=Bathroom]')
  const bathroom = await page.$$eval('[data-other-group=Bathroom] [data-catalog]', (b) => b.length)

  await page.type('[data-other-search]', 'glass shower')
  await until(page, () => document.querySelectorAll('[data-other-objects-dialog] [data-catalog]').length === 1, { label: 'searched' })
  await page.click('[data-other-objects-dialog] [data-catalog=glass-shower]')
  await page.waitForSelector('[data-other-objects-dialog] [data-add-object]')
  const showerTypes = await page.$$eval('[data-other-objects-dialog] [data-object-type]', (b) => b.map((x) => x.dataset.objectType))
  const before = (await stored()).items.length

  await shot('builder-other-choices')
  await clickInDialog('[data-other-objects-dialog] [data-add-object]')
  await until(page, () => !document.querySelector('[data-other-objects-dialog]'), { label: 'other dialog closed' })
  const withShower = await storedOnce((plan) => plan.items.length === before + 1)
  const shower = withShower.items.find((i) => i.label === 'glass shower screen')

  step('Other lists every room type\u2019s objects by room in lists that open (the room\u2019s own open), with search, and adds a bathroom\u2019s glass shower with its choices',
    groups.join() === 'Every room,LivingRoom+,Bedroom,Kitchen,Bathroom,DiningRoom,HomeOffice,KidsRoom' && bathroom > 5
      && showerTypes.join() === 'screen,cubicle,large' && withShower.items.length === before + 1 && shower?.form === 'GlassScreen',
    `groups ${groups.join()}, bathroom ${bathroom}, types ${showerTypes.join()}, form ${shower?.form}`)

  // 10f. A P-shaped corner sofa's leg and chaise move to the back's other end: the plan draws it mirrored, and it is saved.
  await page.click('[role=tab]::-p-text(Plan)')
  await page.click('[data-catalog=sofa]')
  await page.waitForSelector('[data-add-object-dialog] [data-object-type=p-shaped]')
  await clickInDialog('[data-add-object-dialog] [data-object-type=p-shaped]')
  await clickInDialog('[data-add-object-dialog] [data-add-object]')
  await until(page, () => !document.querySelector('[data-add-object-dialog]'), { label: 'sofa added' })
  await page.waitForSelector('[data-leg-side=Left]')
  await page.click('[data-leg-side=Left]')
  const withSofa = await storedOnce((plan) => plan.items.some((i) => i.parts?.legLeft))
  const pIndex = withSofa.items.findIndex((i) => i.form === 'PShaped')
  const mirrored = await page.evaluate((i) => !!document.querySelector(`[data-plan-canvas] [data-item="${i}"] g[transform*="scale(-1"]`), pIndex)

  await shot('builder-leg-left')
  step('A corner sofa’s leg and chaise can go on the left: drawn mirrored and saved', mirrored && withSofa.items[pIndex]?.parts?.legLeft === true,
    `mirrored ${mirrored}, parts ${JSON.stringify(withSofa.items[pIndex]?.parts)}`)

  // 10g. With the sofa selected, Delete inside a dialog doesn't remove it (the shortcuts wait for the dialog to close).
  await page.click('[data-catalog=sofa]')
  await page.waitForSelector('[data-add-object-dialog] [data-object-type]')
  await sleep(400)
  await page.keyboard.press('Delete')
  await sleep(1200)
  const keptBehind = (await stored()).items.length

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-add-object-dialog]', { hidden: true })
  step('Delete inside a dialog leaves the object selected behind it', keptBehind === withSofa.items.length, `${withSofa.items.length} → ${keptBehind}`)

  // 10h. A double-click on Add (as a browser sends it: the second click counted as such) adds one object, not two; the
  //     buttons that send a request ignore a double-click's second click the same way.
  await page.click('[data-catalog=sofa]')
  await page.waitForSelector('[data-add-object-dialog] [data-add-object]')
  await sleep(400)
  const addAt = await page.$eval('[data-add-object-dialog] [data-add-object]', (b) => {
    b.scrollIntoView({ block: 'center' })
    const r = b.getBoundingClientRect()

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })

  await page.mouse.click(addAt.x, addAt.y)
  await sleep(40)
  await page.mouse.click(addAt.x, addAt.y, { clickCount: 2 })
  const doubled = await storedOnce((plan) => plan.items.length > keptBehind)

  await sleep(1500)
  const afterDouble = (await stored()).items.length

  step('A double-click on Add adds one object', doubled.items.length === keptBehind + 1 && afterDouble === keptBehind + 1, `${keptBehind} → ${afterDouble}`)
  await page.keyboard.press('Escape')

  // 10i. Areas in their own material: a floor area from the room's settings (tiles, drawn under everything on the plan),
  //     and a wall area from the Wall tab, made wood panelling. Both are saved, and neither is an object the photo's
  //     boxes name. Then both are deleted again.
  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-add-floor-zone]')
  await page.click('[data-add-floor-zone]')
  await page.waitForSelector('[data-zone-look=floor]')
  const floorOnPlan = Boolean(await page.$('[data-plan-canvas] [data-zone]'))

  await page.click('[role=tab]::-p-text(Wall)')
  await page.waitForSelector('[data-add-wall-zone]')
  await page.click('[data-add-wall-zone]')
  await page.waitForSelector('[data-zone-look=wall]')
  await page.click('[data-zone-look=wall] ::-p-text(Wood panels)')
  const zoned = await storedOnce((plan) => plan.items.some((i) => i.shape === 'WallZone' && i.material === 'WoodPanelling'))
  const zones = zoned.items.filter((i) => i.shape.endsWith('Zone')).map((i) => `${i.shape} ${i.material}`)
  const boxed = await page.evaluate(async () => {
    const { objectBoxes } = await import('/src/features/builder/scene-3d.ts')
    const plan = await (await fetch(`/api/plans/${location.pathname.split('/').at(-1)}`)).json()

    return objectBoxes(plan).map((b) => plan.items[b.item].shape)
  })

  await shot('builder-wall-zone')
  await page.click('[data-inspector-item] ::-p-text(Delete)')
  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-plan-canvas] [data-zone]')
  await page.click('[data-plan-canvas] [data-zone]')
  await page.click('[data-inspector-item] ::-p-text(Delete)')
  const unzoned = await storedOnce((plan) => !plan.items.some((i) => i.shape.endsWith('Zone')))

  step('A floor area and a wall area in their own materials are saved, and the photo’s boxes leave them out',
    floorOnPlan && zones.join() === 'FloorZone Tiles,WallZone WoodPanelling' && !boxed.some((shape) => shape.endsWith('Zone')) && unzoned.items.length === keptBehind + 1,
    `${zones.join(', ')} | boxes ${[...new Set(boxed)].join(', ')}`)

  // 11. Generate photo (the fake AI) shows a small picture of every view (each wall from the middle and both near
  //    corners), the room's own picked, and the style closed at "As planned"; with one more picked it makes two photos,
  //    each sent with its view, the style, the instructions, every object box and its note, the second into the
  //    first's room, and the room keeps its own view. The photo page opens with both; the room isn't analyzed until
  //    the user clicks Analyze this photo (with the real AI the analysis costs money), and then the editor analyzes it.
  const builderUrl = page.url()

  await page.click('::-p-text(Generate photo)')
  // The views are drawn one by one, each in its place as it is ready.
  await until(page, () => document.querySelectorAll('[data-generate-dialog] [data-view-pick]').length === 12, { timeout: 20000, label: 'every view drawn' })
  const picks = await page.evaluate(() => ({
    all: document.querySelectorAll('[data-generate-dialog] [data-view-pick]').length,
    on: [...document.querySelectorAll('[data-generate-dialog] [data-view-pick][aria-checked=true]')].map((b) => b.dataset.viewPick),
  }))

  const styleShut = await page.evaluate(() => ({
    heading: document.querySelector('[data-style-toggle]')?.textContent.trim(),
    cards: document.querySelectorAll('[data-photo-style]').length,
  }))

  await page.click('[data-view-pick="0:Left"]')
  await page.click('[data-style-toggle]')
  await page.waitForSelector('[data-photo-style=Boho]')
  await sleep(300) // the list slides open (its cards move until then)
  await page.click('[data-photo-style=Boho]')
  const noDecorateChoice = await page.evaluate(() => !document.querySelector('[data-generate-dialog] [data-decorate]'))

  await page.type('#photo-instructions', 'warm evening light')
  const confirmText = await page.$eval('[data-generate-confirm]', (b) => b.textContent.trim())

  await shot('builder-generate-dialog')
  await page.evaluate(() => {
    // Records what each photo request sends.
    window.__sent = []
    const original = window.fetch

    window.fetch = (input, init) => {
      if (String(input).endsWith('/generate') && init?.body instanceof FormData) {
        const b = init.body

        window.__sent.push({
          view: b.get('view'), corner: b.get('corner'), style: b.get('style'), instructions: b.get('instructions'), decorate: b.get('decorate'),
          boxes: JSON.parse(b.get('boxes') ?? '[]').length, roomId: b.get('roomId'), note: b.get('note'),
        })
      }

      return original(input, init)
    }
  })
  await page.click('[data-generate-confirm]')
  await until(page, () => location.pathname.endsWith('/photos'), { timeout: 30000, label: 'photo page' })
  await page.waitForSelector('[data-photo-shown]')
  await shot('builder-generate-photos')
  const sent = await page.evaluate(() => window.__sent)
  const forms = [...sent].sort((a, b) => a.view.localeCompare(b.view))
  // The plan, read by its own id (the page is the photo page now).
  const keptView = await page.evaluate(async (id) => (await fetch(`/api/plans/${id}`)).json(), builderUrl.split('/').at(-1))
  const roomId = new URL(page.url()).pathname.split('/').at(-2)
  const thumbs = await page.evaluate(() => document.querySelectorAll('[data-photo-thumb]').length)

  step('Generate photo offers every view, the room\u2019s own picked and the style closed at As planned, and makes one room of a photo of each picked one with its view, style, instructions, boxes and note',
    picks.all === 12 && picks.on.join() === '3:None' && styleShut.heading === 'Style: As planned' && styleShut.cards === 0
      && confirmText === 'Generate 2 photos' && forms.length === 2
      && forms[0].view === '0' && forms[0].corner === 'Left' && forms[1].view === '3' && forms[1].corner === 'None'
      && forms.every((f) => f.style === 'Boho' && f.instructions === 'warm evening light' && f.decorate === null && f.boxes > 0 && /wall/.test(f.note)) && noDecorateChoice
      && sent[0].roomId === null && sent[1].roomId === roomId && thumbs === 2
      && keptView.view === 3 && keptView.corner === 'None',
    JSON.stringify({ picks, styleShut, confirmText, forms, roomId, thumbs }))
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const stillWaiting = await page.evaluate(async (id) => (await (await fetch(`/api/rooms/${id}`)).json()).status === 'Waiting', roomId)

  await page.click('[data-photo-option=analyze] button')
  await until(page, () => /^\/rooms\/[^/]+$/.test(location.pathname), { timeout: 30000, label: 'editor' })
  await until(page, () => !!document.querySelector('main canvas[data-label-map]'), { timeout: 60000, label: 'analyzed room' })
  step('The photos wait unanalyzed, and Analyze this photo opens the editor, which analyzes it', stillWaiting, page.url())

  // 12. Phone layout: the builder fits.
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(builderUrl, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas], [data-view-3d]')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

  await shot('builder-phone')
  step('The builder fits a phone screen', overflow <= 0, `${overflow} px too wide`)

  // The furnished bedroom, for a look at its suggested layout.
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${WEB}/build/${furnished.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas] [data-item]')
  await shot('builder-furnished-plan')
  await page.click('::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(800)
  await shot('builder-furnished-3d')

  // 13. Zoom: the wheel zooms the plan around the pointer; an object dragged while zoomed moves by what the pointer
  //     covers there, a drag on the floor pans, a tap on it lets the selection go, and Fit shows the room whole again.
  //     The 3D view zooms too, and dragging it pans without turning the view.
  const viewBoxNow = () => page.$eval('[data-plan-canvas]', (s) => s.getAttribute('viewBox'))
  const zoomNow = () => page.$eval('main [data-zoom-buttons]', (b) => Number(b.dataset.zoom))
  const middleOf = (selector) => page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect()

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  /** A point of the plan where the pointer lands on what `hit` says (another object can lie over part of one). */
  const pointOn = (hit) => page.$eval('[data-plan-canvas]', (svg, hit) => {
    const r = svg.getBoundingClientRect()

    for (let fy = 0.1; fy < 1; fy += 0.05) {
      for (let fx = 0.1; fx < 1; fx += 0.05) {
        const [x, y] = [r.x + r.width * fx, r.y + r.height * fy]

        if (document.elementFromPoint(x, y)?.matches(hit)) {
          return { x, y }
        }
      }
    }

    return null
  }, hit)

  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-plan-canvas] [data-item]')
  const wholeBox = await viewBoxNow()
  const zoomed = (await stored()).items.findIndex((item) => item.wall === null && item.shape !== 'Rug')
  const zoomPoint = await middleOf(`[data-plan-canvas] [data-item="${zoomed}"]`)

  await page.mouse.move(zoomPoint.x, zoomPoint.y)

  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel({ deltaY: -200 })
    await sleep(60)
  }

  await sleep(300)
  const zoomedIn = await zoomNow()
  const zoomedBox = await viewBoxNow()
  const beforeZoomDrag = (await stored()).items[zoomed]
  const cmPerPx = await page.$eval('[data-plan-canvas]', (s) => 1 / s.getScreenCTM().a)
  const grabZoomed = await page.$eval(`[data-plan-canvas] [data-item="${zoomed}"]`, (el) => {
    const r = el.getBoundingClientRect()

    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.8], [0.3, 0.6], [0.7, 0.6], [0.5, 0.25]]) {
      const [x, y] = [r.x + r.width * fx, r.y + r.height * fy]

      if (document.elementFromPoint(x, y)?.closest('[data-item]') === el) {
        return { x, y }
      }
    }

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })

  // Towards the room's middle, as it may stand against a wall.
  await page.mouse.move(grabZoomed.x, grabZoomed.y)
  await page.mouse.down()
  await page.mouse.move(grabZoomed.x - 80, grabZoomed.y, { steps: 8 })
  await page.mouse.up()
  const afterZoomDrag = (await storedOnce((plan) => plan.items[zoomed].x !== beforeZoomDrag.x)).items[zoomed]
  const floorEdge = await pointOn('[data-plan-floor], [data-plan-canvas] > polygon')

  await page.mouse.move(floorEdge.x, floorEdge.y)
  await page.mouse.down()
  await page.mouse.move(floorEdge.x + 100, floorEdge.y - 60, { steps: 6 })
  await page.mouse.up()
  const pannedBox = await viewBoxNow()

  await page.mouse.click(floorEdge.x, floorEdge.y)
  await sleep(200)
  const letGo = (await page.$('[data-plan-canvas] [data-resize]')) === null

  await page.click('main [data-zoom-fit]')
  await sleep(200)
  const fitBox = await viewBoxNow()

  step('The plan zooms around the pointer; dragging an object there moves it by what the pointer covers, a drag on the floor pans, a tap lets go, Fit shows it whole',
    zoomedIn > 1.5 && zoomedBox !== wholeBox && Math.abs(beforeZoomDrag.x - afterZoomDrag.x - 80 * cmPerPx) <= 10 && pannedBox !== zoomedBox && letGo && fitBox === wholeBox,
    JSON.stringify({ label: beforeZoomDrag.label, zoomedIn, wholeBox, zoomedBox, moved: beforeZoomDrag.x - afterZoomDrag.x, expected: Math.round(80 * cmPerPx), pannedBox, letGo, fitBox }))

  await page.click('[role=tab]::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(600)
  const view3d = await middleOf('[data-view-3d]')
  const viewBefore = (await stored()).view

  await page.mouse.move(view3d.x, view3d.y)

  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel({ deltaY: -200 })
    await sleep(60)
  }

  await sleep(300)
  const zoomed3d = await zoomNow()

  await page.mouse.down()
  await page.mouse.move(view3d.x - 120, view3d.y, { steps: 6 })
  await page.mouse.up()
  await sleep(400)
  const viewAfter = (await stored()).view

  await shot('builder-3d-zoomed')
  await page.click('main [data-zoom-fit]')
  await sleep(200)
  step('The 3D view zooms with the wheel, and dragging it pans without turning the view; Fit shows it whole',
    zoomed3d > 3 && viewAfter === viewBefore && (await zoomNow()) === 1, JSON.stringify({ zoomed3d, viewBefore, viewAfter }))

  // 14. A new kitchen in the Wall tab: its windows' blinds, its units' worktops and their upstands on the wall are
  //     drawn. On the plan the upper cabinets lie over a base cabinet, which takes the click; with "Hung things only"
  //     the upper cabinets do, and open on their wall.
  const kitchenId = await page.evaluate(async () => {
    const created = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Wall tab kitchen', roomType: 'Kitchen', width: 4, length: 5, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A', furnish: true }),
    })

    return (await created.json()).id
  })

  await page.goto(`${WEB}/build/${kitchenId}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas] [data-item]')
  const kitchenPlan = await stored()
  const upper = kitchenPlan.items.findIndex((item) => item.shape === 'WallBox' && item.wall === 0)
  const upperMiddle = await middleOf(`[data-plan-canvas] [data-item="${upper}"]`)
  const underUpper = (p) => page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y)

    return el?.dataset.hungHit ?? el?.closest('[data-item]')?.dataset.item ?? null
  }, p)
  const beforeKitchen = await underUpper(upperMiddle)

  await page.click('[data-plan-hung-only]')
  await sleep(200)
  const withToggle = await underUpper(upperMiddle)

  await page.mouse.click(upperMiddle.x, upperMiddle.y)
  await page.waitForSelector('[data-wall-view="0"]')
  await sleep(400)
  const drawn = await page.evaluate(() => ({
    coverings: [...document.querySelectorAll('[data-wall-covering]')].map((g) => g.dataset.wallCovering),
    worktops: document.querySelectorAll('[data-wall-worktop]').length,
    backsplashes: [...document.querySelectorAll('[data-wall-backsplash]')].map((g) => g.dataset.wallBacksplash),
  }))
  const backWindows = kitchenPlan.items.filter((item) => item.shape === 'Window' && item.wall === 0).length

  await shot('builder-wall-kitchen')
  step('The Wall tab draws the windows’ blinds and the units’ worktops and upstands; "Hung things only" lets the upper cabinets over a base cabinet be picked on the plan',
    drawn.coverings.length === backWindows && drawn.coverings.every((kind) => kind === 'RollerBlind') && drawn.worktops > 0 && drawn.backsplashes.includes('Upstand')
      && beforeKitchen !== String(upper) && withToggle === String(upper),
    JSON.stringify({ drawn, backWindows, upper, beforeKitchen, withToggle }))

  // 15. Lighting: the kitchen starts with spotlights and two pendants over its island, marked on the plan. The Ceiling
  //     tab adds a light (its panel: its drop and an On switch, kept when switched); in the evening the lights that are
  //     on light the 3D view, which is darker with them off.
  const ceilingShapes = ['PendantLight', 'Spotlight', 'Chandelier', 'CeilingLamp', 'TrackLight']
  const startingLights = kitchenPlan.items.filter((item) => ceilingShapes.includes(item.shape)).map((item) => item.shape)

  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-light-mark]')
  const lightMarks = await page.$$eval('[data-light-mark]', (marks) => marks.length)

  await page.click('[role=tab]::-p-text(Ceiling)')
  await page.waitForSelector('[data-ceiling-lights]')
  await page.click('[data-add-ceiling-light="Chandelier"]')
  await page.waitForSelector('[data-light-switch]')
  const lightPanel = await page.evaluate(() => ({
    drop: !!document.querySelector('input[aria-label="Drop"]'),
    switch: document.querySelector('[data-light-switch]')?.dataset.lightSwitch,
    decorations: !!document.querySelector('[data-inspector-item] [data-decoration]'),
  }))

  await page.click('[data-light="on"]')
  const switchedOn = await storedOnce((plan) => plan.items.some((item) => item.shape === 'Chandelier' && item.lit === true))
  const brightness = () => page.$eval('[data-view-3d]', (canvas) => {
    const copy = document.createElement('canvas')

    copy.width = canvas.width
    copy.height = canvas.height
    const g = copy.getContext('2d')

    g.drawImage(canvas, 0, 0)
    const { data } = g.getImageData(0, 0, copy.width, copy.height)
    let sum = 0

    for (let i = 0; i < data.length; i += 4 * 61) {
      sum += data[i] + data[i + 1] + data[i + 2]
    }

    return sum / (data.length / (4 * 61)) / 3
  })
  const evening = async (lit) => {
    const plan = await stored()

    await page.evaluate(async (plan) => {
      await fetch(`/api/plans/${plan.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) })
    }, { ...plan, finish: { ...plan.finish, timeOfDay: 'Evening' }, items: plan.items.map((item) => (ceilingShapes.includes(item.shape) ? { ...item, lit } : item)) })
    await page.goto(`${WEB}/build/${kitchenId}`, { waitUntil: 'networkidle0' })
    await page.click('[role=tab]::-p-text(3D view)')
    await page.waitForSelector('[data-view-3d]')
    await sleep(900)

    return brightness()
  }
  const lightsOn = await evening(true)

  await shot('builder-evening-lights')
  const lightsOff = await evening(false)

  step('A new kitchen starts with spotlights and pendants over its island; the Ceiling tab adds a light with a drop and an On switch; lit, the lights brighten the evening',
    startingLights.includes('Spotlight') && startingLights.filter((shape) => shape === 'PendantLight').length === 2 && lightMarks === startingLights.length
      && lightPanel.drop && lightPanel.switch === 'off' && !lightPanel.decorations && switchedOn.items.some((item) => item.shape === 'Chandelier') && lightsOn > lightsOff + 15,
    JSON.stringify({ startingLights, lightMarks, lightPanel, lightsOn: Math.round(lightsOn), lightsOff: Math.round(lightsOff) }))

  // 16. A first visit: every section on the left and right starts closed. The blue "i" by the tabs says how the view
  //     shown works, on hover and on a tap.
  const seeded = await page.evaluate(() => {
    const value = localStorage.getItem('designapp.builder.collapsed')

    // Nothing opened or closed yet (an empty record, which the launcher's seeding leaves alone).
    localStorage.setItem('designapp.builder.collapsed', '{}')

    return value
  })
  const hintText = async () => {
    await page.waitForSelector('[data-view-hint-text]', { timeout: 5000 })

    return page.$eval('[data-view-hint-text]', (el) => el.textContent.trim())
  }

  await page.goto(`${WEB}/build/${kitchenId}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas]')
  const toggles = await page.$$eval('[data-section-toggle]', (all) => all.map((el) => el.getAttribute('aria-expanded')))
  const roomHintGone = await page.evaluate(() => !document.querySelector('[data-inspector-room]')?.textContent.includes('Drag objects from the left'))

  await page.click('[role=tab]::-p-text(Wall)')
  await page.waitForSelector('[data-view-hint=wall]')
  await page.hover('[data-view-hint]')
  const wallHint = await hintText()
  const hintColor = await page.$eval('[data-view-hint]', (el) => getComputedStyle(el).color)

  await shot('builder-view-hint')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-view-hint-text]'), { timeout: 5000 })
  await page.click('[role=tab]::-p-text(3D view)')
  await page.click('[data-view-hint]')
  const tappedHint = await hintText()

  await page.evaluate((value) => {
    localStorage.setItem('designapp.builder.collapsed', value)
  }, seeded)
  step('On a first visit every section starts closed; the blue "i" by the tabs tells how the view shown works, on hover and on a tap',
    toggles.length > 3 && toggles.every((open) => open === 'false') && roomHintGone && wallHint.startsWith('Click a window, door or hung thing')
      && /oklch\([\d.]+ [\d.]+ 2[56]\d/.test(hintColor) && tappedHint.startsWith('The room as the photo sees it'),
    JSON.stringify({ toggles: toggles.length, closed: toggles.every((open) => open === 'false'), roomHintGone, wallHint: wallHint.slice(0, 30), hintColor, tappedHint: tappedHint.slice(0, 30) }))

  // 17. Architecture: in a 2.4 m high living room a column is added as tall as the room, an archway and a niche go on
  //     the wall shown. Crown and picture rail, raised-panel wainscoting and ornate casings are chosen with the walls,
  //     a tray ceiling with the ceiling; they are saved, and the Wall tab draws the rails, the casings, the archway and
  //     the niche.
  const archId = await page.evaluate(async () => {
    const created = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Architecture', roomType: 'LivingRoom', width: 4, length: 5, height: 2.4, wallColor: '#E8E2D6', floorColor: '#B89B7A' }),
    })

    return (await created.json()).id
  })

  await page.goto(`${WEB}/build/${archId}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas]')
  await addFromDialog('column')
  const columnAdded = await storedOnce((plan) => plan.items.some((item) => /column/.test(item.label)))
  const column = columnAdded.items.find((item) => /column/.test(item.label))

  await page.click('[role=tab]::-p-text(Wall)')
  await page.waitForSelector('[data-wall-view]')
  await addFromDialog('archway')
  await addFromDialog('niche')
  // The niche added is chosen: letting it go shows the room's settings again.
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-moulding=Crown]')
  await page.click('[data-moulding=Crown]')
  await page.click('[data-moulding=PictureRail]')
  await page.click('[data-wainscot=RaisedPanels]')
  await page.click('[data-casing=Ornate]')
  const trimHeading = await page.$eval('[data-panel-section=settings-trim] [data-section-toggle]', (b) => b.innerText.trim())
  const wallMarks = await page.evaluate(() => ({
    bands: [...new Set([...document.querySelectorAll('[data-band]')].map((b) => b.dataset.band))].sort().join(),
    wainscot: document.querySelectorAll('[data-wainscot=RaisedPanels]').length,
    casings: document.querySelectorAll('[data-casing=Ornate]').length,
    archways: document.querySelectorAll('[data-archway]').length,
    niches: document.querySelectorAll('[data-niche]').length,
  }))

  await shot('builder-architecture-wall')
  await page.click('[role=tab]::-p-text(Ceiling)')
  await page.waitForSelector('[data-ceiling-style=Tray]')
  await page.click('[data-ceiling-style=Tray]')
  const detailed = await storedOnce((plan) => plan.finish.details.ceiling === 'Tray' && plan.finish.details.casing === 'Ornate')

  await page.click('[role=tab]::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(900)
  await shot('builder-architecture-3d')
  step('A column is as tall as the room; an archway and a niche go on the wall; mouldings, wainscoting, casings and a tray ceiling are saved and drawn on the wall',
    column?.height === 240 && detailed.items.some((item) => item.shape === 'Archway') && detailed.items.some((item) => item.shape === 'Niche')
      && JSON.stringify(detailed.finish.details.mouldings) === '["Crown","PictureRail"]' && detailed.finish.details.wainscot === 'RaisedPanels'
      && wallMarks.bands === 'Crown,PictureRail,wainscot-cap' && wallMarks.wainscot > 0 && wallMarks.casings > 0 && wallMarks.archways === 1 && wallMarks.niches === 1
      && trimHeading === 'Trim & mouldings: crown, picture rail, raised panels',
    JSON.stringify({ column: column?.height, details: detailed.finish.details, wallMarks, trimHeading }))

  // 18. Kitchen and bathroom fittings: a new kitchen with tiled backsplashes is fitted with shaker fronts, knobs, brass,
  //     a farmhouse sink with a bridge tap and herringbone tiles; they are saved, and the Wall tab draws the fronts
  //     and the tiles' pattern. A bathroom offers its vanity's basin; a living room with neither has no such section.
  const newPlan = (body) => page.evaluate(async (body) => (await (await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()), body)
  const fitted = await newPlan({ name: 'Fitted kitchen', roomType: 'Kitchen', width: 4, length: 4.5, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A' })

  await page.evaluate(async (plan) => {
    const items = plan.items.map((item) => (item.worktop ? { ...item, worktop: { ...item.worktop, backsplash: 'Tiles', backsplashColor: '#F4F1EA' } } : item))

    await fetch(`/api/plans/${plan.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...plan, items }) })
  }, fitted)
  await page.goto(`${WEB}/build/${fitted.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-fronts=Shaker]')
  for (const chip of ['[data-fronts=Shaker]', '[data-handles=Knob]', '[data-hardware=BrushedBrass]', '[data-sink=Farmhouse]', '[data-tap=Bridge]', '[data-tile-pattern=Herringbone]']) {
    await page.click(chip)
  }

  const fittedHeading = await page.$eval('[data-panel-section=settings-fittings] [data-section-toggle]', (b) => b.innerText.trim())
  const fittedPlan = await storedOnce((plan) => plan.finish.fittings.tiles === 'Herringbone')

  await page.click('[role=tab]::-p-text(Wall)')
  await page.waitForSelector('[data-unit-front]')
  const fittedWall = await page.evaluate(() => ({
    fronts: [...new Set([...document.querySelectorAll('[data-unit-front]')].map((e) => `${e.dataset.unitFront} ${e.dataset.handles}`))].join(),
    splashes: [...new Set([...document.querySelectorAll('[data-tile-pattern]')].map((e) => e.dataset.tilePattern))].join(),
  }))

  await shot('builder-fitted-kitchen-wall')
  await page.click('[role=tab]::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(900)
  await shot('builder-fitted-kitchen-3d')
  const fittedBath = await newPlan({ name: 'Fitted bathroom', roomType: 'Bathroom', width: 2.6, length: 3, height: 2.5, wallColor: '#E8E2D6', floorColor: '#D8D2C6', floorType: 'Tiles' })

  await page.goto(`${WEB}/build/${fittedBath.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-basin=Vessel]')
  await page.click('[data-basin=Vessel]')
  const vessel = await page.waitForFunction(async (id) => (await (await fetch(`/api/plans/${id}`)).json()).finish.fittings.basin === 'Vessel', { timeout: 10000 }, fittedBath.id).then(() => true, () => false)
  const noMirrorGlass = await page.evaluate(() => !document.querySelector('[data-glass-uppers]'))
  const lounge = await newPlan({ name: 'Plain lounge', roomType: 'LivingRoom', width: 4, length: 5, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A' })

  await page.goto(`${WEB}/build/${lounge.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas]')
  const loungeFittings = await page.evaluate(() => !!document.querySelector('[data-panel-section=settings-fittings]'))

  step('A kitchen is fitted with shaker fronts, knobs, brass, a farmhouse sink, a bridge tap and herringbone tiles, saved and drawn; a bathroom picks its basin; a plain living room has no fittings',
    JSON.stringify(fittedPlan.finish.fittings) === JSON.stringify({ fronts: 'Shaker', glassUppers: false, handles: 'Knob', hardware: 'BrushedBrass', sink: 'Farmhouse', tap: 'Bridge', basin: 'Integrated', tiles: 'Herringbone' })
      && fittedHeading === 'Cabinets & fittings: Shaker, brass · herringbone tiles' && fittedWall.fronts === 'Shaker Knob' && fittedWall.splashes === 'Herringbone'
      && vessel && noMirrorGlass && !loungeFittings,
    JSON.stringify({ fittings: fittedPlan.finish.fittings, fittedHeading, fittedWall, vessel, noMirrorGlass, loungeFittings }))

  // 19. Materials: in a furnished living room the coffee table is made walnut (taking walnut's color) and glossy; the
  //     floor becomes Calacatta marble stone (taking its color), the painted walls eggshell; all are saved. A wooden
  //     floor again has no material.
  const materialRoom = await newPlan({ name: 'Materials', roomType: 'LivingRoom', width: 4, length: 5, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A' })
  const table = materialRoom.items.findIndex((item) => item.label === 'coffee table')

  await page.goto(`${WEB}/build/${materialRoom.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector(`[data-plan-canvas] [data-item="${table}"]`)
  const tableAt = await page.$eval(`[data-plan-canvas] [data-item="${table}"]`, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })

  await page.mouse.click(tableAt.x, tableAt.y)
  await page.waitForSelector('[data-material=walnut]')
  await page.click('[data-material=walnut]')
  await page.click('[data-sheen=Gloss]')
  const glossy = await storedOnce((plan) => plan.items[table].sheen === 'Gloss' && plan.items[table].material === 'walnut')

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-floor-type=Stone]')
  await page.click('[data-floor-type=Stone]')
  await page.waitForSelector('[data-floor-material="Calacatta marble"]')
  await page.click('[data-floor-material="Calacatta marble"]')
  const marble = await storedOnce((plan) => plan.finish.floorMaterial === 'Calacatta marble')

  await page.click('[role=tab]::-p-text(Wall)')
  await page.waitForSelector('[data-paint-sheen=Eggshell]')
  await page.click('[data-paint-sheen=Eggshell]')
  const eggshell = await storedOnce((plan) => plan.finish.wallSheen === 'Eggshell')

  await page.click('[role=tab]::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(900)
  await shot('builder-materials-3d')
  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-floor-type=Wood]')
  await page.click('[data-floor-type=Wood]')
  const wooden = await storedOnce((plan) => plan.floorType === 'Wood')

  step('A walnut coffee table takes walnut\u2019s color and a gloss; a Calacatta marble floor takes its color; eggshell walls are saved; a new floor type drops the material',
    glossy.items[table].color === '#5C4033' && marble.floorType === 'Stone' && marble.floorColor === '#F2EFE8' && eggshell.finish.wallSheen === 'Eggshell'
      && wooden.finish.floorMaterial === '',
    JSON.stringify({ table: glossy.items[table], floor: [marble.floorType, marble.finish.floorMaterial, marble.floorColor], sheen: eggshell.finish.wallSheen, wooden: wooden.finish.floorMaterial }))
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('builder-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
