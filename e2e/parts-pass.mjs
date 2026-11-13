// The Parts dialog, in the browser, on a sample room: opening it on the brick wall splits the wall by color at once
// (bricks and mortar); painting one color leaves the other, pointing at a color highlights it, and the paint list gives
// each color its share. On the armchair, Recognize parts sends the user's instructions and lists the parts the AI (the
// fake one here) finds; they follow the chair's color until one gets its own. Both are kept after saving and reopening;
// a part merges back; Erase in the dialog gives a part's pixels back to the chair; phone layout.
// Usage: node e2e/parts-pass.mjs [web url]
import { launch, sleep, until, WEB } from './ff.mjs'

const email = `parts-${Date.now()}@example.com`
const password = 'correct horse battery'
const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const frame = () => sleep(300)
const dialog = '[role=dialog]'
const editorReady = () => until(page, () => !!document.querySelector('main canvas[data-label-map]'), { timeout: 30000, label: 'editor' })
const dialogReady = () => until(page, () => !!document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-label-map]'), { timeout: 30000, label: 'dialog canvas' })
const clickText = (scope, label) => page.evaluate((s, t) => [...document.querySelectorAll(`${s} button`)].find((b) => b.textContent.trim() === t).click(), scope, label)
const select = async (index) => {
  await page.waitForSelector(`aside button[data-index="${index}"]`, { timeout: 15000 })
  await page.click(`aside button[data-index="${index}"]`)
  await frame()
}
const openParts = async () => {
  await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => /^(Parts|Parts of the .*)$/.test(b.textContent.trim())).click())
  await dialogReady()
  await sleep(600) // the fade-in and the first frames
}
const closeParts = async () => {
  await clickText(dialog, 'Done')
  await until(page, () => !document.querySelector('[role=dialog]'), { label: 'dialog closed' })
}
// A reload would go back to the address the page was opened at, before the app added ?design=.
const reopen = async () => {
  await page.goto(await page.evaluate(() => location.href), { waitUntil: 'networkidle0' })
  await editorReady()
  await sleep(300)
}
const tones = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog] [data-tone]')].map((b) => ({ center: b.dataset.center, text: b.innerText.replace(/\s+/g, ' ').trim() })))
const partButtons = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog] [data-part]')].map((b) => ({ index: Number(b.dataset.part), text: b.innerText.trim() })))
/** The object at a photo-relative point in the outlines the dialog's canvas shows. */
const labelAt = (u, v) => page.evaluate(async (u, v) => {
  const url = document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-label-map]').dataset.labelMap
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = new OffscreenCanvas(bmp.width, bmp.height); const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(Math.floor(u * bmp.width), Math.floor(v * bmp.height), 1, 1).data[0]
}, u, v)
const swatch = (color) => page.click(`${dialog} [role=radiogroup][aria-label^="Color for"] [aria-label="Color ${color}"]`)

/** The dialog canvas's pixel (RGB) at a photo-relative point. */
const pixel = (u, v) => page.evaluate((u, v) => {
  const canvas = document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-photo-rect]')
  const r = JSON.parse(canvas.dataset.photoRect)
  const ratio = canvas.width / canvas.clientWidth
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height
  const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0)
  const d = ctx.getImageData(Math.round((r.x + u * r.width) * ratio), Math.round((r.y + v * r.height) * ratio), 1, 1).data
  return [d[0], d[1], d[2]]
}, u, v)
const diff = (a, b) => a.reduce((sum, c, i) => sum + Math.abs(c - b[i]), 0)
/** The pixel once it differs from `before` (the canvas redraws on the next frame; in software that can take a while). */
const changed = async (u, v, before) => {
  for (let i = 0; i < 40; i++) {
    const rgb = await pixel(u, v)
    if (diff(rgb, before) > 30) return rgb
    await sleep(150)
  }
  return pixel(u, v)
}
/** The pixel once the dialog's canvas has drawn its first frame (it is clear until then). */
const drawnPixel = async (u, v) => {
  for (let i = 0; i < 40; i++) {
    const rgb = await pixel(u, v)
    if (rgb.some((c) => c > 0)) return rgb
    await sleep(150)
  }
  return pixel(u, v)
}

/**
 * Points (photo-relative) of an object shown in the dialog, away from its edge where the selection outline is drawn:
 * one per color when `centers` is given (a pixel clearly nearest that color), else one.
 */
const pointsOf = (index, photoUrl, centers) => page.evaluate(async (index, photoUrl, centers) => {
  const { hexToOklab, rgbToOklab } = await import('/src/features/editor/oklab.ts')
  const canvas = document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-photo-rect]')
  const r = JSON.parse(canvas.dataset.photoRect)
  const bmp = await createImageBitmap(await (await fetch(canvas.dataset.labelMap)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const [w, h] = [bmp.width, bmp.height]
  const lc = new OffscreenCanvas(w, h).getContext('2d'); lc.drawImage(bmp, 0, 0)
  const labels = lc.getImageData(0, 0, w, h).data
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = photoUrl; await img.decode()
  const pc = new OffscreenCanvas(w, h).getContext('2d'); pc.drawImage(img, 0, 0, w, h)
  const rgba = pc.getImageData(0, 0, w, h).data
  const tones = (centers ?? []).map(hexToOklab)
  const dist = (a, b) => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b)
  const toneAt = (p) => {
    const lab = rgbToOklab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2])
    const d = tones.map((t) => dist(lab, t))
    const best = d.indexOf(Math.min(...d))
    return d.every((x, i) => i === best || x > d[best] + 0.12) ? best : -1
  }
  const found = centers ? centers.map(() => null) : [null]
  const margin = 5
  const offsets = Array.from({ length: 2 * margin + 1 }, (_, i) => i - margin)
  for (let y = margin; y < h - margin; y += 2) {
    for (let x = margin; x < w - margin; x += 2) {
      const p = y * w + x
      if (labels[p * 4] !== index) continue
      const [u, v] = [(x + 0.5) / w, (y + 0.5) / h]
      const [sx, sy] = [r.x + u * r.width, r.y + v * r.height]
      if (sx < 10 || sy < 10 || sx > canvas.clientWidth - 60 || sy > canvas.clientHeight - 60) continue
      if (!offsets.every((d) => labels[(p + d) * 4] === index && labels[(p + d * w) * 4] === index)) continue
      const slot = centers ? toneAt(p) : 0
      if (slot < 0 || found[slot]) continue
      const around = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => p + dy * w + dx))
      if (centers && !around.every((q) => toneAt(q) === slot)) continue
      found[slot] = { u, v }
      if (found.every(Boolean)) return found
    }
  }
  return found
}, index, photoUrl, centers)

try {
  // 1. A guest copies the industrial living room; opening the brick wall's Parts dialog splits it into two colors.
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  const room = await page.evaluate(() => fetch('/api/library/industrial/living-room/1/copy', { method: 'POST' }).then((r) => r.json()))
  const wall = room.objects.find((o) => /brick back wall/.test(o.label))
  const chair = room.objects.find((o) => /armchair/.test(o.label))
  await page.goto(`${WEB}/rooms/${room.id}`, { waitUntil: 'networkidle0' })
  await editorReady()
  await select(wall.index)
  await openParts()
  await page.waitForSelector(`${dialog} [data-tone="1"]`, { timeout: 30000 })
  const zoomed = await page.evaluate(() => {
    const canvas = document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-photo-rect]')
    return JSON.parse(canvas.dataset.photoRect).width / canvas.clientWidth
  })
  const chips = await tones()
  const shares = chips.map((c) => Number(/(\d+)%/.exec(c.text)?.[1] ?? 0))
  step('Opening the brick wall\'s Parts splits it into two colors, zoomed in', zoomed > 1.2 && chips.length === 2 && Math.abs(shares[0] + shares[1] - 100) <= 1,
    `photo ${zoomed.toFixed(2)}× the view, ${JSON.stringify(chips)}`)

  // 2. Painting color 1 changes it and leaves color 2 (the mortar or the bricks) as it was.
  const [one, two] = await pointsOf(wall.index, room.photoUrl, chips.map((c) => c.center))
  const before = [await drawnPixel(one.u, one.v), await pixel(two.u, two.v)]
  await swatch('#2E4057')
  const after = [await changed(one.u, one.v, before[0]), await pixel(two.u, two.v)]
  await shot('parts-tones')
  step('Painting color 1 changes it and leaves color 2 as it was', diff(before[0], after[0]) > 40 && diff(before[1], after[1]) < 15,
    `color 1 ${before[0]} → ${after[0]}, color 2 ${before[1]} → ${after[1]}`)

  // 3. Pointing at color 2 dims the rest of the wall.
  await page.hover(`${dialog} [data-tone="1"]`)
  const dimmed = await changed(one.u, one.v, after[0])
  await page.mouse.move(5, 5)
  await frame()
  step('Pointing at a color dims the wall\'s other color', dimmed.reduce((a, b) => a + b) < after[0].reduce((a, b) => a + b) * 0.6, `${after[0]} → ${dimmed}`)
  await closeParts()

  // 4. The inspector sums the split up; the paint list gives each color its share of the wall.
  const summary = await page.evaluate(() => document.querySelector('aside [data-tone-summary]')?.innerText.trim() ?? null)
  await clickText('aside', 'Paint list')
  await page.waitForSelector(`${dialog} [data-paint-row="${wall.index}"] input`)
  await sleep(400)
  await page.type(`${dialog} [data-paint-row="${wall.index}"] input`, '4')
  await frame()
  const line = await page.evaluate(() => document.querySelector('[role=dialog] [data-tone-line="0"]')?.innerText.replace(/\s+/g, ' ').trim() ?? null)
  const expected = `${shares[0]}% · ${Number((10 * shares[0] / 100).toFixed(1))} m²`
  step('The inspector and the paint list show the colors', /Split into 2 colors/.test(summary ?? '') && line?.endsWith(expected), `"${summary}", "${line}" (expected …${expected})`)
  await page.keyboard.press('Escape')
  await until(page, () => !document.querySelector('[role=dialog]'), { label: 'paint list closed' })

  // 5. The armchair: its colors joined again, Recognize parts lists its parts under it, in the dialog and the editor.
  await select(chair.index)
  await openParts()
  await page.waitForSelector(`${dialog} [data-tone]`, { timeout: 30000 }).catch(() => {})
  await clickText(dialog, 'Join').catch(() => {})
  await frame()
  // The request is recorded in the page (Firefox's protocol doesn't hand request bodies to the test).
  await page.evaluate(() => {
    const send = window.fetch
    window.fetch = (url, init) => {
      if (String(url).endsWith('/parts')) window.sentParts = init?.body
      return send(url, init)
    }
  })
  await page.type('#parts-instructions', 'the seat cushion on its own')
  await clickText(dialog, 'Recognize parts')
  await until(page, () => document.querySelectorAll('[role=dialog] [data-part]').length > 2, { timeout: 30000, label: 'parts recognized' })
  await frame()
  const parts = await partButtons()
  const body = JSON.parse(await page.evaluate(() => window.sentParts ?? '{}'))
  const nested = await page.evaluate(() => [...document.querySelectorAll('aside [data-part-of]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()))
  await shot('parts-found')
  step('Recognize parts sends the instructions and lists the armchair\'s parts under it', body.instructions === 'the seat cushion on its own' && parts.length >= 3 && /^Whole /.test(parts[0].text) && nested.length === parts.length - 1 && nested.every((t) => /Part$/.test(t)),
    `${JSON.stringify(parts.map((p) => p.text))} | ${JSON.stringify(nested)}`)

  // 6. Coloring the whole chair colors its parts; then one part gets its own color and the others keep the chair's.
  const [first, second] = [parts[1], parts[2]]
  const [p1] = await pointsOf(first.index, room.photoUrl, null)
  const [p2] = await pointsOf(second.index, room.photoUrl, null)
  const plain = [await drawnPixel(p1.u, p1.v), await pixel(p2.u, p2.v)]
  await page.click(`${dialog} [data-part="${chair.index}"]`)
  await frame()
  await swatch('#B5543C')
  const red = [await changed(p1.u, p1.v, plain[0]), await changed(p2.u, p2.v, plain[1])]
  await page.click(`${dialog} [data-part="${first.index}"]`)
  await frame()
  await swatch('#4F6B3A')
  const green = [await changed(p1.u, p1.v, red[0]), await pixel(p2.u, p2.v)]
  const redder = ([r, g]) => r > g + 30
  step('The parts follow the chair\'s color until one gets its own', redder(red[0]) && redder(red[1]) && green[0][1] > green[0][0] && diff(green[1], red[1]) < 15,
    `chair red: ${first.text} ${red[0]}, ${second.text} ${red[1]}; ${first.text} green: ${green[0]}, ${second.text} ${green[1]}`)
  await closeParts()

  // 7. Sign up, save, reopen: the wall's colors and the chair's parts are kept.
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
  await page.waitForSelector(`${dialog} input`)
  await page.type(`${dialog} input`, 'Bricks and chair')
  await page.click(`${dialog} button[type=submit]`)
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'saved design' })
  await reopen()
  await select(wall.index)
  await openParts()
  const keptTones = (await tones()).map((t) => t.center)
  const keptWall = await drawnPixel(one.u, one.v)
  await closeParts()
  await select(first.index)
  await openParts()
  const keptParts = await partButtons()
  const keptChair = await drawnPixel(p1.u, p1.v)
  step('After saving and reopening the wall\'s colors and the chair\'s parts are kept',
    keptTones.join() === chips.map((c) => c.center).join() && diff(keptWall, after[0]) < 15 && keptParts.length === parts.length && diff(keptChair, green[0]) < 15,
    `colors ${keptTones.join(', ')} ${keptWall}; ${keptParts.length} part rows ${keptChair}`)

  // 8. Merging a part gives its pixels back to the chair (and its color).
  await page.click(`${dialog} [data-part="${first.index}"]`)
  await frame()
  await clickText(dialog, `Merge ${first.text.toLowerCase()} into the ${chair.label}`)
  await until(page, new Function(`return document.querySelectorAll('[role=dialog] [data-part]').length === ${parts.length - 1}`), { timeout: 15000, label: 'merged' })
  const merged = await changed(p1.u, p1.v, keptChair)
  step('Merging a part makes it the chair\'s again', redder(merged), `${merged}`)

  // 9. Fix outline in the dialog: a box erased over the other part gives its pixels back to the chair.
  await page.click(`${dialog} [data-part="${second.index}"]`)
  await frame()
  await clickText(dialog, 'Erase')
  await clickText(dialog, 'Box')
  const corners = await page.evaluate((p) => {
    const canvas = document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-photo-rect]')
    const r = JSON.parse(canvas.dataset.photoRect)
    const at = canvas.getBoundingClientRect()
    const [x, y] = [at.left + r.x + p.u * r.width, at.top + r.y + p.v * r.height]
    return { from: { x: x - 12, y: y - 12 }, to: { x: x + 12, y: y + 12 } }
  }, p2)
  const mapBefore = await page.evaluate(() => document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-label-map]').dataset.labelMap)
  await page.mouse.move(corners.from.x, corners.from.y)
  await page.mouse.down()
  await page.mouse.move(corners.to.x, corners.to.y, { steps: 6 })
  await page.mouse.up()
  await until(page, new Function(`return document.querySelector('[role=dialog] [data-parts-canvas] canvas[data-label-map]').dataset.labelMap !== ${JSON.stringify(mapBefore)}`), { timeout: 15000, label: 'erased' })
  const erased = await labelAt(p2.u, p2.v)
  await clickText(dialog, 'Brush')
  await clickText(dialog, 'Erase')
  step('Erasing in the dialog gives a part\'s pixels back to the chair', erased === chair.index, `label ${erased}, chair ${chair.index}`)
  await closeParts()

  // 10. Phone layout: the dialog fits.
  await page.setViewport({ width: 390, height: 844 })
  await reopen()
  await select(wall.index)
  await openParts()
  const overflow = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]')
    return Math.max(document.documentElement.scrollWidth - innerWidth, d.scrollWidth - d.clientWidth, d.getBoundingClientRect().right - innerWidth)
  })
  await shot('parts-phone')
  step('The Parts dialog fits a phone screen', overflow <= 0, `${overflow} px too wide`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('parts-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|http 40[014]\] .*\/api\/(account|designs|rooms)|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
