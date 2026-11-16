// The room builder's room shape mode, in the browser: the "+" on a wall pushes out part of it (an alcove), and the
// windows on that part go with it while the others stay; the photo can look at the alcove's wall, and the wall view
// and the 3D view draw it; dragging a wall pushes it out (the plan moves so its top-left corner stays at 0, 0) and
// dragging a corner moves it; the room's walls are numbered and named by side; Reset to rectangle undoes it all; a wall
// pulled through the room stops at the smallest room.
// Usage: node e2e/shape-pass.mjs [web url]
import { launch, sleep, until, WEB } from './ff.mjs'

const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const frame = () => sleep(300)
const saved = () => until(page, () => document.querySelector('[data-save-state]')?.textContent.trim() === 'Saved', { timeout: 10000, label: 'saved' })
const stored = () => page.evaluate(async () => (await fetch(`/api/plans/${location.pathname.split('/').at(-1)}`)).json())
const corners = (plan) => plan.outline.map((p) => `${p.x},${p.y}`).join(' ')

/** The page point of a plan point (centimetres from the top-left corner). */
const toPage = (x, y) => page.evaluate((x, y) => {
  const p = new DOMPoint(x, y).matrixTransform(document.querySelector('[data-plan-canvas]').getScreenCTM())
  return { x: p.x, y: p.y }
}, x, y)

/** Drags the mouse from one plan point to another (the plan's coordinates as they are when the drag starts). */
const dragPlan = async (from, to, steps = 10) => {
  const [a, b] = [await toPage(from.x, from.y), await toPage(to.x, to.y)]
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps })
  await page.mouse.up()
  await frame()
  await saved()
}

/** How many colors a sample of the 3D view has (a blank canvas has one). */
const variety = () => page.evaluate(() => {
  const canvas = document.querySelector('[data-view-3d]')
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height
  const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  const colors = new Set()
  for (let p = 0; p < data.length; p += 4 * 97) colors.add(`${data[p] >> 4},${data[p + 1] >> 4},${data[p + 2] >> 4}`)
  return colors.size
})

try {
  // 1. An empty 4 × 5 m living room with two windows on its right wall (wall 1): one 200 cm along it, one 400 cm.
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${WEB}/build`, { waitUntil: 'networkidle0' })
  const id = await page.evaluate(async () => {
    const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    const plan = await send('POST', '/api/plans', { name: 'Shape pass', roomType: 'LivingRoom', width: 4, length: 5, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A', floorType: 'Wood', furnish: false })
    const window = (x) => ({ label: 'window', shape: 'Window', x, y: 0, width: 80, depth: 10, height: 120, rotation: 0, color: '#F4F1EA', wall: 1, elevation: 90, form: 'Standard' })
    const sofa = { label: 'sofa', shape: 'Sofa', x: 200, y: 80, width: 200, depth: 90, height: 85, rotation: 0, color: '#8A8580', wall: null, elevation: 0, form: 'Standard' }
    await send('PUT', `/api/plans/${plan.id}`, { ...plan, items: [window(200), window(400), sofa] })
    return plan.id
  })
  await page.goto(`${WEB}/build/${id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas] [data-opening=Window]')
  const names = await page.$$eval('[data-inspector-room] [data-wall-choice]', (buttons) => buttons.map((b) => b.textContent))
  step('A new room is a rectangle with four walls, Back, Right, Front and Left', names.join() === 'Back,Right,Front,Left' && (await stored()).outline.length === 4, names.join())

  // 2. Room shape mode: the objects fade, the walls show their lengths and the corners their handles.
  await page.click('[data-shape-toggle]')
  await page.waitForSelector('[data-plan-canvas][data-shaping] [data-shape-corner]')
  const lengths = await page.$$eval('[data-wall-length]', (texts) => texts.map((t) => t.textContent))
  step('Room shape shows each wall\'s length and a handle on each corner', lengths.join() === '400 cm,500 cm,400 cm,500 cm' && (await page.$$('[data-shape-corner]')).length === 4, lengths.join())

  // 3. The "+" on the right wall at 200 cm, dragged out 100 cm, pushes out an alcove 100 cm wide around it.
  const over = await toPage(407, 200)
  await page.mouse.move(over.x, over.y, { steps: 3 })
  await page.waitForSelector('[data-shape-plus="1"]')
  // The "+" sits just outside the wall; drag it 100 cm further out.
  const plus = await page.$eval('[data-shape-plus="1"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const centimetre = (await toPage(1, 0)).x - (await toPage(0, 0)).x
  await page.mouse.move(plus.x, plus.y)
  await page.mouse.down()
  await page.mouse.move(plus.x + 100 * centimetre, plus.y, { steps: 10 })
  await page.mouse.up()
  await frame()
  await saved()
  const alcove = await stored()
  const windows = alcove.items.filter((i) => i.shape === 'Window').map((i) => `${i.wall}@${i.x}`)
  await shot('shape-alcove')
  step('The + pushes out an alcove: 8 corners, the room 5 m wide', corners(alcove) === '0,0 400,0 400,150 500,150 500,250 400,250 400,500 0,500' && alcove.width === 5,
    corners(alcove))
  step('The window on the pushed part goes with it, the other stays', windows.join() === '3@50,5@150', windows.join())

  // 4. The photo can look at the alcove's wall (wall 3, the second right wall); the wall view and 3D view draw it.
  await page.click('[data-shape-toggle]')
  const alcoveNames = await page.$$eval('[data-inspector-room] [data-wall-choice]', (buttons) => buttons.map((b) => b.textContent))
  await page.click('[data-inspector-room] [data-wall-choice="3"]')
  await frame()
  await saved()
  await page.click('::-p-text(Wall)')
  await page.waitForSelector('[data-wall-view]')
  await page.click('[data-wall-view] [data-wall-choice="3"]')
  await page.waitForSelector('[data-wall-view="3"] [data-opening=Window]')
  const wallTitle = await page.$eval('[data-wall-view="3"] .font-medium', (e) => e.textContent)
  await page.click('::-p-text(3D view)')
  await page.waitForSelector('[data-view-3d]')
  await sleep(800)
  const colors = await variety()
  await shot('shape-3d-alcove')
  step('The alcove\'s wall is "Right wall 2": the photo looks at it, the wall view shows its window, the 3D view draws it',
    (await stored()).view === 3 && alcoveNames.join() === 'Back 1,Right 1,Back 2,Right 2,Front 1,Right 3,Front 2,Left' && wallTitle === 'Right wall 2' && colors > 20,
    `${alcoveNames.join()}; wall view "${wallTitle}"; ${colors} colors`)

  // 5. Dragging the left wall out by 50 cm: the plan moves 50 cm right so its corner stays at 0, 0; the sofa and the
  //    windows move with the room, and the view stays on the alcove.
  await page.click('::-p-text(Plan)')
  await page.waitForSelector('[data-plan-canvas]')
  await page.click('[data-shape-toggle]')
  await page.waitForSelector('[data-plan-canvas][data-shaping]')
  await dragPlan({ x: -7, y: 300 }, { x: -57, y: 300 })
  const wider = await stored()
  const sofaX = wider.items.find((i) => i.shape === 'Sofa').x
  step('Dragging the left wall out widens the room and moves everything with it', wider.width === 5.5 && corners(wider).startsWith('0,0 450,0 450,150 550,150') && sofaX === 250 && wider.view === 3,
    `${corners(wider)}; sofa at ${sofaX}; view ${wider.view}`)

  // 6. Dragging the bottom-right corner (450, 500) in by 100 cm moves the walls meeting there.
  await dragPlan({ x: 450, y: 500 }, { x: 350, y: 500 })
  const cornered = await stored()
  step('Dragging a corner moves the two walls that meet there', corners(cornered) === '0,0 450,0 450,150 550,150 550,250 350,250 350,500 0,500', corners(cornered))

  // 7. Reset to rectangle: four walls again at the room's overall size; the windows are still on walls.
  await page.click('[data-shape-toggle]')
  await page.click('[data-reset-shape]')
  await frame()
  await saved()
  const reset = await stored()
  step('Reset to rectangle gives four walls of the overall size', reset.outline.length === 4 && reset.width === 5.5 && reset.length === 5 && reset.items.every((i) => i.shape !== 'Window' || i.wall !== null),
    `${corners(reset)}; windows ${reset.items.filter((i) => i.shape === 'Window').map((i) => `${i.wall}@${i.x}`).join()}`)

  // 8. Pulling the back wall right through the room stops where the room is at its smallest (1 m): a drag keeps the
  //    last shape that is a room.
  await page.click('[data-shape-toggle]')
  await page.waitForSelector('[data-plan-canvas][data-shaping]')
  await dragPlan({ x: 225, y: -7 }, { x: 225, y: 495 }, 60)
  const smallest = await stored()
  step('Pulling a wall through the room stops at the smallest room', smallest.length === 1 && smallest.outline.length === 4, `${corners(smallest)}, ${smallest.length} m long`)
  await page.click('[data-shape-toggle]')
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('shape-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
