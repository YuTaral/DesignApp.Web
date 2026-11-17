// Abandons requests mid-flight, the way the editor does when the photo is replaced by the canvas
// and the way a visitor does by leaving a page, then checks the API still answers (it can't if
// Visual Studio paused the app on the cancellation). Usage: node e2e/abort-check.mjs [web url]
import path from 'node:path'
import { launch, sleep, until, WEB, ROOMS } from './ff.mjs'

const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const alive = async () => {
  const started = Date.now()

  try {
    const r = await fetch(`${WEB}/api/account`, { signal: AbortSignal.timeout(8000) })

    return { ok: r.ok, ms: Date.now() - started }
  } catch {
    return { ok: false, ms: Date.now() - started }
  }
}

const { browser, page, log } = await launch()

try {
  // 1. Upload and leave the editor straight away, five times: requests in flight get cancelled.
  const ids = []

  for (let i = 0; i < 5; i++) {
    await page.goto(WEB, { waitUntil: 'networkidle0' })
    const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('::-p-text(Choose photo)')])

    await chooser.accept([path.join(ROOMS, i % 2 ? 'kitchen.jpg' : 'bathroom.png')])
    await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'editor' })
    ids.push(await page.evaluate(() => location.pathname.split('/')[2]))
    await sleep(150 + i * 120)
    await page.goto(`${WEB}/designs`, { waitUntil: 'domcontentloaded' })
  }

  const a = await alive()

  step('API answers after leaving the editor mid-load 5 times', a.ok, `${a.ms} ms`)

  // 2. Fire 60 requests for photos, rooms and the account, each abandoned after 0–40 ms.
  const outcome = await page.evaluate(async (ids) => {
    const rooms = ids.map((id) => ({ id }))
    const urls = rooms.flatMap((r) => [`/api/rooms/${r.id}/photo?n=${Math.random()}`, `/api/rooms/${r.id}`]).concat(['/api/ai', '/api/account'])
    let aborted = 0

    await Promise.all(Array.from({ length: 60 }, async (_, i) => {
      const controller = new AbortController()

      setTimeout(() => controller.abort(), i % 41)

      try { await fetch(urls[i % urls.length], { signal: controller.signal, cache: 'no-store' }) } catch { aborted++ }
    }))

    return { rooms: rooms.length, aborted }
  }, ids)

  step('Abandoned requests were really cut off', outcome.aborted > 10, `${outcome.aborted} of 60 abandoned, ${outcome.rooms} rooms`)
  await sleep(1000)
  const b = await alive()

  step('API answers after 60 abandoned requests', b.ok, `${b.ms} ms`)

  // 3. The app still works normally afterwards.
  const statuses = await page.evaluate(async (ids) => Promise.all(ids.map(async (id) => (await fetch(`/api/rooms/${id}`)).status)), ids)

  step('Every upload still loads', statuses.every((s) => s === 200), statuses.join(' '))
  await page.goto(`${WEB}/rooms/${ids[0]}`, { waitUntil: 'networkidle0' })
  const opened = await until(page, () => !!document.querySelector('canvas[data-label-map]'), { timeout: 20000, label: 'editor' }).catch(() => false)

  step('A room still opens in the editor', !!opened)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
} finally {
  console.log(results.join('\n'))
  console.log('Browser console problems:', log.filter((l) => !/NS_BINDING_ABORTED|NS_ERROR_ABORT|requestfailed|AbortError|aborted/i.test(l)).join('\n') || 'none')
  await browser.close()
}
