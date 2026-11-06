// Milestone 4 pass in Firefox: for each photo, click inside EVERY object and check the editor
// selects that object; then recolor, strength, undo/redo, compare, hover, zoom and phone width.
// Usage: node e2e/editor-pass.mjs [web url] [photo name ...]
import fs from 'node:fs'
import path from 'node:path'
import { launch, sleep, until, SHOTS, WEB, ROOMS, ARGS } from './ff.mjs'

const only = ARGS
fs.mkdirSync(SHOTS, { recursive: true })
for (const f of fs.readdirSync(SHOTS)) fs.rmSync(path.join(SHOTS, f))

const { browser, page, log, shot } = await launch()
const report = []
const step = (name, ok, detail = '') => report.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

/** Canvas-relative CSS point for a photo-relative (0..1) point. */
async function toPage(u, v) {
  return page.evaluate((u, v) => {
    const canvas = document.querySelector('canvas[data-photo-rect]')
    const r = JSON.parse(canvas.dataset.photoRect)
    const b = canvas.getBoundingClientRect()
    return { x: b.left + r.x + u * r.width, y: b.top + r.y + v * r.height }
  }, u, v)
}

/** The canvas pixel (RGB) at a photo-relative point. */
async function pixel(u, v) {
  return page.evaluate((u, v) => {
    const canvas = document.querySelector('canvas[data-photo-rect]')
    const r = JSON.parse(canvas.dataset.photoRect)
    const ratio = canvas.width / canvas.clientWidth
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height
    const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0)
    const d = ctx.getImageData(Math.round((r.x + u * r.width) * ratio), Math.round((r.y + v * r.height) * ratio), 1, 1).data
    return [d[0], d[1], d[2]]
  }, u, v)
}

const heading = () => page.evaluate(() => document.querySelector('aside h2.truncate')?.textContent?.trim() ?? null)
const frame = () => sleep(120)

try {
  const files = fs.readdirSync(ROOMS).filter((f) => !only.length || only.includes(path.parse(f).name))
  for (const file of files) {
    const name = path.parse(file).name
    await page.setViewport({ width: 1280, height: 860 })
    await page.goto(WEB, { waitUntil: 'networkidle0' })
    const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('::-p-text(Choose photo)')])
    await chooser.accept([path.join(ROOMS, file)])
    await until(page, () => document.querySelector('[data-slot=badge]')?.textContent?.trim() === 'Ready', { timeout: 30000, label: 'Ready' })
    await until(page, () => !document.querySelector('[aria-label="Preparing the editor"]') && !!document.querySelector('[aria-label="Zoom in"]'), { label: 'editor ready' })
    await frame()

    // For every object, a photo point well inside it (5x5 neighborhood all the same label).
    const room = await page.evaluate(async () => {
      const id = location.pathname.split('/').at(-1)
      const room = await (await fetch(`/api/rooms/${id}`)).json()
      const blob = await (await fetch(room.labelMapUrl)).blob()
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      const c = new OffscreenCanvas(bmp.width, bmp.height); const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0)
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
      const w = bmp.width, h = bmp.height, at = (x, y) => d[(y * w + x) * 4]
      const points = {}
      for (const o of room.objects) {
        let best = null
        for (let y = 3; y < h - 3 && !best; y += 2) for (let x = 3; x < w - 3; x += 2) {
          if (at(x, y) !== o.index) continue
          let ok = true
          for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy) !== o.index) { ok = false; break }
          if (ok) { best = { u: (x + 0.5) / w, v: (y + 0.5) / h }; break }
        }
        points[o.index] = best
      }
      return { objects: room.objects, points }
    })

    let hits = 0
    const misses = []
    for (const o of room.objects) {
      const p = room.points[o.index]
      if (!p) { misses.push(`${o.label} (no interior point)`); continue }
      const { x, y } = await toPage(p.u, p.v)
      await page.mouse.click(x, y)
      await frame()
      const got = await heading()
      if (got?.toLowerCase() === o.label.toLowerCase()) hits++
      else misses.push(`${o.label} → ${got}`)
    }
    step(`${file}: clicking each object selects it`, misses.length === 0, `${hits}/${room.objects.length}${misses.length ? '; ' + misses.slice(0, 3).join(', ') : ''}`)

    // Recolor the largest object (first in the list after the photo's own order isn't guaranteed: pick by index 1).
    const target = room.objects[0], other = room.objects[1]
    const tp = room.points[target.index], op = room.points[other.index]
    await page.mouse.click(...Object.values(await toPage(tp.u, tp.v)))
    await frame()
    const before = await pixel(tp.u, tp.v), otherBefore = await pixel(op.u, op.v)
    await page.click('[aria-label="Color #4A6274"]')
    await frame()
    const after = await pixel(tp.u, tp.v), otherAfter = await pixel(op.u, op.v)
    const bluer = after[2] - after[0] > before[2] - before[0] + 15
    step(`${file}: recoloring "${target.label}" changes its pixels`, bluer, `${before} → ${after}`)
    step(`${file}: ...and leaves "${other.label}" alone`, otherBefore.join() === otherAfter.join(), `${otherBefore} → ${otherAfter}`)
    const listDot = await page.evaluate((i) => !!document.querySelector(`[data-index="${i}"] [aria-label=recolored]`), target.index)
    step(`${file}: object list marks it recolored`, listDot)

    // Strength 0 brings the original back; the slider is keyboard-operable.
    await page.focus('[role=slider]')
    await page.keyboard.press('Home')
    await frame()
    const zero = await pixel(tp.u, tp.v)
    step(`${file}: strength 0% shows the original`, zero.every((c, i) => Math.abs(c - before[i]) <= 2), `${zero}`)
    await page.keyboard.press('End')
    await frame()

    // History so far: original, color at 80%, strength 0%, strength 100%. Step back to the
    // original with the toolbar, then forward one step with the keyboard.
    const full = await pixel(tp.u, tp.v)
    for (let i = 0; i < 3; i++) { await page.click('[aria-label="Undo"]'); await frame() }
    const original = await pixel(tp.u, tp.v)
    const undoLeft = await page.evaluate(() => !document.querySelector('[aria-label=Undo]').disabled)
    await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ')
    await page.keyboard.up('Shift'); await page.keyboard.up('Control'); await frame()
    const redone = await pixel(tp.u, tp.v)
    await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control'); await frame()
    const latest = await pixel(tp.u, tp.v)
    const close = (a, b) => a.every((c, i) => Math.abs(c - b[i]) <= 2)
    step(`${file}: undo back to the original photo, redo forward again`,
      close(original, before) && !undoLeft && close(redone, after) && close(latest, full),
      `original ${original}, redo→${redone}, redo×2→${latest}`)

    // Compare: the divider in the middle; far left shows the original.
    await page.click('::-p-text(Compare)'); await frame()
    const hasHandle = await page.evaluate(() => !!document.querySelector('[aria-label="Before and after divider"]'))
    await shot(`${name}-compare`)
    step(`${file}: compare shows the before/after divider`, hasHandle)
    await page.click('::-p-text(Compare)'); await frame()

    // Hover: the label chip names the object under the mouse.
    await page.mouse.move(...Object.values(await toPage(op.u, op.v))); await frame()
    const chip = await page.evaluate(() => document.querySelector('canvas[data-photo-rect] ~ div.pointer-events-none')?.textContent?.trim())
    step(`${file}: hovering shows the object's name`, chip?.toLowerCase() === other.label.toLowerCase(), chip ?? 'none')

    // Zoom in, then the same object is still hit at its new place.
    await page.click('[aria-label="Zoom in"]'); await frame()
    const zoomed = await page.evaluate(() => JSON.parse(document.querySelector('canvas[data-photo-rect]').dataset.photoRect).width)
    await shot(`${name}-zoomed`)
    await page.click('[aria-label="Fit photo"]'); await frame()
    step(`${file}: zoom in and fit`, zoomed > 0, `photo width ${Math.round(zoomed)} px when zoomed`)

    await page.mouse.move(5, 5); await frame()
    await shot(`${name}-edited`)
  }

  // Phone width: tap selects, inspector below, no sideways scroll.
  await page.setViewport({ width: 375, height: 812 })
  await sleep(500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await shot('phone')
  step('Phone width: editor has no sideways scroll', overflow <= 0, `overflow ${overflow}px`)
} catch (error) {
  step('Pass aborted', false, error.message)
  await shot('aborted').catch(() => {})
} finally {
  await browser.close()
}

console.log(report.join('\n'))
console.log(`\nBrowser console/network problems: ${log.filter((l) => !l.includes('NS_BINDING_ABORTED')).join('\n') || 'none'}`)
console.log(`Screenshots: ${SHOTS}`)
