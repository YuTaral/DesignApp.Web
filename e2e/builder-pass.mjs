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
const shown = () => page.evaluate(() => [...document.querySelectorAll('[data-plan-canvas] [data-item]')].length)
/** Clicks a catalog object and adds its first type from the dialog that opens. */
const addFromDialog = async (key) => {
  await page.click(`[data-catalog="${key}"]`)
  await page.waitForSelector('[data-add-object]')
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
  const catalog = await page.evaluate(() => [...document.querySelectorAll('[data-catalog]')].map((b) => b.dataset.catalog))
  const floorType = (await stored()).floorType
  const hangable = await page.evaluate(() => [...document.querySelectorAll('[data-catalog-section=mounted] [data-catalog]')].map((b) => b.dataset.catalog))

  step('The walls and floor steps open a floor plan with windows, doors, things to hang and the living room\u2019s objects',
    catalog.length === 33 && catalog.includes('sofa') && catalog.includes('window') && catalog.includes('door')
      && hangable.slice(0, 3).join() === 'painting,mirror,wall-shelf' && hangable.includes('radiator') && hangable.includes('wall-tv')
      && outline[1] === '200px' && floorType === 'Tiles',
    `${catalog.length} objects (to hang: ${hangable}), outline ${outline}, floor ${floorType}`)

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
    furnished.items.filter((i) => i.shape === 'Window').every((w) => w.decorations?.includes('sheer curtains')) && bed?.decorations?.includes('decorative pillows')
      && bed?.material === 'linen upholstered' && furnished.items.some((i) => i.label === 'set of three framed prints' && i.wall === 1) && furnished.finish.accentWall === 1,
    `bed ${bed?.material} ${bed?.decorations}, accent wall ${furnished.finish.accentWall}`)

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

  // 6. Describe an object (the fake AI): it is added with the size and color the words give.
  await page.type('#describe-object', 'a round oak coffee table, 90 cm')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add it').click())
  await until(page, () => document.querySelectorAll('[data-plan-canvas] [data-item]').length === 3, { label: 'described object' })
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
  await page.click('[data-catalog-section=openings] [data-section-toggle]')
  const collapsed = await page.evaluate(() => !document.querySelector('[data-catalog="window"]'))

  await page.click('[data-catalog-section=openings] [data-section-toggle]')
  await page.waitForSelector('[data-catalog="window"]')
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

  step('Windows and doors collapse; clicking an object offers its types, a color, a material and a size, and adds the chosen one',
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

  // 7c. On the plan, windows, doors and hung things can't be added (they go on a wall seen straight on): their buttons
  //     are off and say how to open a wall. Clicking the back wall on the plan opens it in the Wall tab, and they work.
  await page.click('[role=tab]::-p-text(Plan)')
  await page.waitForSelector('[data-plan-canvas]')
  const offOnPlan = await page.evaluate(() => ({
    window: document.querySelector('[data-catalog="window"]')?.disabled,
    painting: document.querySelector('[data-catalog="painting"]')?.disabled,
    sofa: document.querySelector('[data-catalog="sofa"]')?.disabled,
    hints: document.querySelectorAll('[data-open-wall-hint]').length,
  }))

  await page.click('[data-plan-wall="0"]')
  await page.waitForSelector('[data-wall-view="0"]')
  const onInWall = await page.evaluate(() => ({ window: document.querySelector('[data-catalog="window"]')?.disabled, hints: document.querySelectorAll('[data-open-wall-hint]').length }))

  step('On the plan, windows, doors and hung things are off with a hint; clicking a wall opens it in the Wall tab, where they work',
    offOnPlan.window === true && offOnPlan.painting === true && offOnPlan.sofa === false && offOnPlan.hints === 2 && onInWall.window === false && onInWall.hints === 0
      && (await stored()).view === 0,
    JSON.stringify({ offOnPlan, onInWall }))

  // 8. A window: clicking it puts it on the wall shown (the back wall), straight on; dragging it there moves it along
  //    the wall and up, and the inspector places it exactly from the wall's left corner.
  await addFromDialog('window')
  await page.waitForSelector('[data-wall-view="0"] [data-opening=Window]')
  await saved()
  const added = (await stored()).items[3]
  /** The page point of a wall point: along the wall from its left corner, and up from the floor (centimetres). */
  const onWall = (along, up) => page.evaluate((along, up) => {
    const svg = document.querySelector('[data-wall-view] svg')
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
    const kids = [...document.querySelector('[data-wall-view] svg').children]
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
  const farAway = await page.$eval('[data-wall-view] svg', (e) => { const r = e.getBoundingClientRect(); return { x: r.right - 3, y: r.top + 3 } })

  await page.mouse.move(sizeHandle.x, sizeHandle.y); await page.mouse.down()
  await page.mouse.move(farAway.x, farAway.y, { steps: 12 })
  const heldAt = []

  for (let i = 0; i < 4; i++) {
    await page.mouse.move(farAway.x - i, farAway.y + i)
    heldAt.push(await page.$eval('[data-wall-view] [data-opening=Window] rect', (e) => `${e.getAttribute('x')},${e.getAttribute('y')}`))
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

  await dropCatalogObject(page, '[data-wall-view] svg', door, nearLeft)
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
    const kids = [...document.querySelector('[data-wall-view] svg').children]

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

  // 10c. The room's finish: brick walls redraw the 3D view, a plaster accent on the wall in view too, and the evening
  //     darkens it; all saved. The sections start closed, their headings saying what is chosen.
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-finish-toggle=walls]')
  const closedHeading = await page.$eval('[data-finish-toggle=walls]', (b) => b.textContent.trim())

  await page.click('[data-finish-toggle=walls]')
  await page.click('[data-wall-finish=Brick]')
  await saved()
  await sleep(600)
  const brickPicture = await picture()

  await page.click('[data-accent-wall="3"]')
  await page.click('[data-accent-finish=Plaster]')
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
  step('Brick walls, an accent wall and the evening each redraw the 3D view, and are saved',
    closedHeading === 'Walls & ceiling: Paint' && new Set([backPicture, brickPicture, accentPicture, eveningPicture]).size === 4
      && finish.walls === 'Brick' && finish.accentWall === 3 && finish.accentFinish === 'Plaster' && finish.timeOfDay === 'Evening',
    `${closedHeading} | ${JSON.stringify(finish)}`)

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
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('builder-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
