// Drives the installed Firefox (in a throwaway profile) for the end-to-end passes in this folder.
// They run against the app the AppHost serves (Visual Studio F5), not a separate server.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

export const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe'
export const SHOTS = path.resolve(import.meta.dirname, 'shots')

const args = process.argv.slice(2)
/** The web app: an http(s) argument, else DESIGNAPP_WEB, else the AppHost's fixed port. */
export const WEB = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.DESIGNAPP_WEB ?? 'http://localhost:5173').replace(/\/$/, '')
/** The other arguments (such as photo names), without the URL and the --flags. */
export const ARGS = args.filter((a) => !/^https?:\/\//.test(a) && !a.startsWith('--'))
/** The five sample photos: DESIGNAPP_ROOMS, else the usual folder. */
export const ROOMS = process.env.DESIGNAPP_ROOMS ?? 'C:\\Users\\yutar\\Desktop\\DesignApp\\rooms'

/** The editor's panel sections the passes find open: the app starts them closed. "Light & mood" stays closed. */
export const OPEN_SECTIONS = ['objects', 'ceiling', 'openings', 'mounted', 'settings-room', 'settings-floor', 'settings-walls',
  'settings-ceiling', 'settings-ceiling-lights', 'settings-type', 'settings-look', 'settings-decorations', 'settings-size',
  'settings-place', 'settings-covering', 'settings-light-switch', 'settings-worktop', 'settings-trim']

/**
 * Starts Firefox with one page.
 * @param options.openSections - Whether the editor's sections start open (OPEN_SECTIONS, unless the page has already
 * opened or closed them), as the passes expect; false leaves the app's own default, all closed.
 */
export async function launch({ headless = !process.argv.includes('--show'), openSections = true } = {}) {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: FIREFOX,
    headless,
    slowMo: headless ? 0 : 120, // slow enough to follow on screen
    defaultViewport: { width: 1280, height: 860 },
  })
  const page = await browser.newPage()
  const log = []

  if (openSections) {
    await page.evaluateOnNewDocument((names) => {
      try {
        if (localStorage.getItem('designapp.builder.collapsed') === null) {
          localStorage.setItem('designapp.builder.collapsed', JSON.stringify(Object.fromEntries(names.map((name) => [name, true]))))
        }
      } catch {
        // No storage (about:blank): nothing to seed.
      }
    }, OPEN_SECTIONS)
  }

  // Only warnings and errors: React and Vite log plenty of harmless dev chatter.
  page.on('console', (m) => {
    if (['error', 'warn'].includes(m.type())) {
      log.push(`[console.${m.type()}] ${m.text()}`)
    }
  })
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) {
      log.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`)
    }
  })
  let n = 0
  const shot = async (name) => {
    const file = path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`)

    await page.screenshot({ path: file })

    return file
  }

  return { browser, page, log, shot }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Waits until fn() returns something truthy (polled in the page). */
export async function until(page, fn, { timeout = 15000, label = 'condition' } = {}) {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const value = await page.evaluate(fn).catch(() => null)

    if (value) {
      return value
    }

    await sleep(100)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

/**
 * Selects an object the way a user does: by clicking it on the editor's photo. Clicks a pixel well inside the object
 * (all its neighbours its own, away from the zoom buttons) in the outlines the photo shows, then waits a moment.
 * @returns Whether a visible pixel of the object was found and clicked.
 */
export async function selectObject(page, index, canvas = 'main canvas[data-photo-rect]') {
  const point = await page.evaluate(async (index, selector) => {
    const c = document.querySelector(selector)
    const r = JSON.parse(c.dataset.photoRect)
    const b = c.getBoundingClientRect()
    const bmp = await createImageBitmap(await (await fetch(c.dataset.labelMap)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const [w, h] = [bmp.width, bmp.height]
    const ctx = new OffscreenCanvas(w, h).getContext('2d'); ctx.drawImage(bmp, 0, 0)
    const labels = ctx.getImageData(0, 0, w, h).data
    const margin = 4
    const offsets = Array.from({ length: 2 * margin + 1 }, (_, i) => i - margin)
    const inside = []

    for (let y = margin; y < h - margin; y += 2) {
      for (let x = margin; x < w - margin; x += 2) {
        const p = y * w + x

        if (labels[p * 4] !== index) {
          continue
        }

        const [sx, sy] = [r.x + ((x + 0.5) / w) * r.width, r.y + ((y + 0.5) / h) * r.height]

        if (sx < 8 || sy < 8 || sx > c.clientWidth - 8 || sy > c.clientHeight - 8) {
          continue
        }

        if (sx > c.clientWidth - 180 && sy > c.clientHeight - 70) {
          continue // the zoom buttons
        }

        if (offsets.every((d) => labels[(p + d) * 4] === index && labels[(p + d * w) * 4] === index)) {
          inside.push({ x: sx, y: sy })
        }
      }
    }

    if (inside.length === 0) {
      return null
    }

    // The inside point nearest the middle of the others, so the click lands well inside the object.
    const [mx, my] = [inside.reduce((s, q) => s + q.x, 0) / inside.length, inside.reduce((s, q) => s + q.y, 0) / inside.length]
    const best = inside.reduce((a, q) => (Math.hypot(q.x - mx, q.y - my) < Math.hypot(a.x - mx, a.y - my) ? q : a))

    return { x: b.left + best.x, y: b.top + best.y }
  }, index, canvas)

  if (!point) {
    return false
  }

  await page.mouse.click(point.x, point.y)
  await sleep(250)

  return true
}

/** The objects with pixels in the outlines the editor's photo shows. */
export async function shownObjects(page, canvas = 'main canvas[data-photo-rect]') {
  return new Set(await page.evaluate(async (selector) => {
    const c = document.querySelector(selector)
    const bmp = await createImageBitmap(await (await fetch(c.dataset.labelMap)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); ctx.drawImage(bmp, 0, 0)
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const found = new Set()

    for (let p = 0; p < data.length; p += 4) {
      found.add(data[p])
    }

    found.delete(0)

    return [...found]
  }, canvas))
}

/** How many objects are recolored, as the editor's Objects section says. */
export async function recoloredCount(page) {
  return page.evaluate(() => Number(document.querySelector('aside [data-recolored]')?.dataset.recolored ?? 0))
}

/** The RGB of a canvas's pixel at a photo-relative point (the canvas carries the photo's place in `data-photo-rect`). */
export async function canvasPixel(page, canvas, u, v) {
  return page.evaluate((selector, u, v) => {
    const element = document.querySelector(selector)
    const r = JSON.parse(element.dataset.photoRect)
    const ratio = element.width / element.clientWidth
    const c = document.createElement('canvas'); c.width = element.width; c.height = element.height
    const ctx = c.getContext('2d'); ctx.drawImage(element, 0, 0)
    const d = ctx.getImageData(Math.round((r.x + u * r.width) * ratio), Math.round((r.y + v * r.height) * ratio), 1, 1).data

    return [d[0], d[1], d[2]]
  }, canvas, u, v)
}

/** The object index at a photo-relative point in the outlines a canvas shows (its `data-label-map`). */
export async function labelAtPoint(page, canvas, u, v) {
  return page.evaluate(async (selector, u, v) => {
    const url = document.querySelector(selector).dataset.labelMap
    const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const c = new OffscreenCanvas(bmp.width, bmp.height); const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0)

    return ctx.getImageData(Math.floor(u * bmp.width), Math.floor(v * bmp.height), 1, 1).data[0]
  }, canvas, u, v)
}

/** How many colors a sample of a canvas has (a blank one has one). */
export async function canvasVariety(page, canvas) {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector)
    const c = document.createElement('canvas'); c.width = element.width; c.height = element.height
    const ctx = c.getContext('2d'); ctx.drawImage(element, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    const colors = new Set()

    for (let p = 0; p < data.length; p += 4 * 97) {
      colors.add(`${data[p] >> 4},${data[p + 1] >> 4},${data[p + 2] >> 4}`)
    }

    return colors.size
  }, canvas)
}

/** Drops a builder catalog object on an element at a page point, as dragging it from the catalog does. */
export async function dropCatalogObject(page, target, object, point) {
  await page.evaluate((selector, object, point) => {
    const element = document.querySelector(selector)
    const data = new DataTransfer()

    data.setData('application/x-designapp-object', JSON.stringify(object))

    for (const kind of ['dragover', 'drop']) {
      element.dispatchEvent(new DragEvent(kind, { dataTransfer: data, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true }))
    }
  }, target, object, point)
}

/** Clicks the button with this exact text inside a scope. */
export async function clickButton(page, scope, label) {
  await page.evaluate((s, t) => [...document.querySelectorAll(`${s} button`)].find((b) => b.textContent.trim() === t).click(), scope, label)
}

/** From the editor's "Sign in to save": creates an account, then waits until the editor is back. */
export async function signUpFromEditor(page, email, password) {
  await page.click('::-p-text(Sign in to save)')
  await until(page, () => location.pathname === '/sign-in', { label: 'sign-in' })
  await page.click('::-p-text(Create an account)')
  await until(page, () => location.pathname === '/sign-up', { label: 'sign-up' })
  await page.type('input[type=email]', email)
  await page.type('input[autocomplete=new-password]', password)
  await page.click('button[type=submit]')
  await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'back in editor' })
}

/** Saves the open room as a new design with this name, and waits until the editor shows it. */
export async function saveNewDesign(page, name) {
  await page.click('::-p-text(Save design)')
  await page.waitForSelector('[role=dialog] input')
  await page.type('[role=dialog] input', name)
  await page.click('[role=dialog] button[type=submit]')
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'saved design' })
}
