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

export async function launch({ headless = !process.argv.includes('--show') } = {}) {
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
  // Only warnings and errors: React and Vite log plenty of harmless dev chatter.
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) log.push(`[console.${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`)
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
    if (value) return value
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}
