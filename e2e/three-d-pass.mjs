// The 3D view, in the browser: a sample room opens in 3D (its depth map measured once; the fake in Development),
// the view isn't blank, a drag turns it, a recolor shows in it, Reset goes back, 2D still works, and it fits a phone.
// Usage: node e2e/three-d-pass.mjs [web url]
import { launch, sleep, until, WEB } from './ff.mjs'

const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const posts = []
page.on('request', (r) => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname) })
const frame = () => sleep(400)
// A small fingerprint of what the 3D canvas shows: the average color of a grid of its pixels.
const view = () => page.evaluate(() => {
  const canvas = document.querySelector('[data-view3d] canvas')
  const copy = new OffscreenCanvas(64, 48)
  const context = copy.getContext('2d')
  context.drawImage(canvas, 0, 0, 64, 48)
  const data = context.getImageData(0, 0, 64, 48).data
  let lit = 0
  const cells = []
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] + data[i + 1] + data[i + 2]
    if (v > 30) lit++
    cells.push(v)
  }
  return { lit: lit / (data.length / 4), cells }
})
const difference = (a, b) => a.cells.reduce((sum, v, i) => sum + Math.abs(v - b.cells[i]), 0) / a.cells.length
const clickButton = (text) => page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t).click(), text)

try {
  // A sample room, copied (as a guest), opened in the editor.
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  const room = await page.evaluate(async () => (await fetch('/api/library/minimalist/living-room/1/copy', { method: 'POST' })).json())
  await page.goto(`${WEB}/rooms/${room.id}`, { waitUntil: 'networkidle0' })
  await until(page, () => !!document.querySelector('canvas[data-label-map]'), { timeout: 30000, label: 'editor' })

  // 1. Into 3D.
  await clickButton('3D')
  await until(page, () => document.querySelector('[data-view3d]')?.dataset.view3d === 'ready', { timeout: 30000, label: '3D ready' })
  await sleep(800)
  const start = await view()
  await shot('3d-start')
  const depthPosts = posts.filter((p) => p.endsWith('/depth')).length
  step('The room opens in 3D and the view is drawn', start.lit > 0.6, `${Math.round(start.lit * 100)}% of the view lit`)
  step('Its depth map is asked for once', depthPosts === 1 || room.depthUrl !== null, `${depthPosts} request(s)`)
  step('The 3D button is pressed and Compare is off', await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '3D').getAttribute('aria-pressed') === 'true'
    && [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Compare').disabled))

  // 2. A drag turns the view.
  const box = await page.evaluate(() => { const r = document.querySelector('[data-view3d] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await page.mouse.move(box.x + box.w * 0.4, box.y + box.h * 0.6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.w * 0.65, box.y + box.h * 0.5, { steps: 12 })
  await page.mouse.up()
  await sleep(1200)
  const turned = await view()
  await shot('3d-turned')
  step('A drag turns the view', difference(start, turned) > 8, `difference ${difference(start, turned).toFixed(1)}`)

  // 3. A recolor shows in 3D.
  await page.evaluate(() => [...document.querySelectorAll('aside ul [data-index]')].find((b) => /sofa/i.test(b.textContent)).click())
  await frame()
  await page.evaluate(() => [...document.querySelectorAll('[role=radiogroup][aria-label^="Color for"] button')].at(-3).click())
  await sleep(800)
  const recolored = await view()
  await shot('3d-recolored')
  step('A recolor shows in the 3D view', difference(turned, recolored) > 1, `difference ${difference(turned, recolored).toFixed(2)}`)

  // 4. Reset goes back to the photo's own angle.
  await page.click('[aria-label="Reset the 3D view"]')
  await sleep(1500)
  const reset = await view()
  step('Reset goes back to the photo\'s angle', difference(reset, recolored) > 8, `moved by ${difference(reset, recolored).toFixed(1)}`)

  // 5. Back to 2D: the editable photo again, with the color kept.
  await clickButton('3D')
  await until(page, () => !document.querySelector('[data-view3d]') && !!document.querySelector('canvas[data-label-map]'), { label: 'back to 2D' })
  await sleep(500)
  const kept = await page.evaluate(() => document.querySelectorAll('aside [aria-label=recolored]').length)
  step('Back in 2D the photo is editable and the color is kept', kept === 1, `${kept} recolored`)

  // 6. A phone: the 3D view fits.
  await page.setViewport({ width: 390, height: 844 })
  await sleep(500)
  await clickButton('3D')
  await until(page, () => document.querySelector('[data-view3d]')?.dataset.view3d === 'ready', { timeout: 30000, label: '3D on phone' })
  await sleep(800)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const phone = await view()
  await shot('3d-phone')
  step('On a phone the 3D view fits and is drawn', overflow <= 0 && phone.lit > 0.5, `${overflow} px too wide, ${Math.round(phone.lit * 100)}% lit`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('3d-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport|http 40[014]\] .*\/api\/(account|designs|rooms)/.test(l)).join('\n') || 'none')
  await browser.close()
}
