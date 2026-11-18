// A room builder run's photos, in the browser: two views make one room and its photo page opens, the arrows and the
// arrow keys switch photos, "Change with AI" (the fake AI) adds a changed photo and shows it, "Analyze this photo" makes
// the shown photo the room's and the editor analyzes it, "All photos" goes back, analyzing another photo asks first
// (and the arrow keys leave the photo asked about alone meanwhile), signing up saves the room into the plan's own
// design, a room without photos to choose from points to its editor, and the page fits a phone.
// Usage: node e2e/photos-pass.mjs [web url]
import { launch, sleep, until, WEB, signUpFromEditor } from './ff.mjs'

const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const email = `photos-${Date.now()}@example.com`
const password = 'correct horse battery'

const { browser, page, log, shot } = await launch()
const caption = () => page.evaluate(() => document.querySelector('[data-photos-page] figcaption')?.textContent.replace(/\s+/g, ' ').trim())
const thumbs = () => page.evaluate(() => document.querySelectorAll('[data-photo-thumb]').length)
const roomOf = (id) => page.evaluate(async (id) => (await fetch(`/api/rooms/${id}`)).json(), id)

try {
  // 1. A furnished room, and two of its views as one run.
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  const plan = await page.evaluate(async () => {
    const r = await fetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Photo pass', roomType: 'LivingRoom', width: 4, length: 5, height: 2.6, wallColor: '#E8E2D6', floorColor: '#B89B7A', floorType: 'Wood', furnish: true }),
    })

    return r.json()
  })

  await page.goto(`${WEB}/build/${plan.id}`, { waitUntil: 'networkidle0' })
  await page.click('::-p-text(Generate photo)')
  await until(page, () => document.querySelectorAll('[data-view-pick]').length === 12, { timeout: 20000, label: 'views' })
  await page.click('[data-view-pick="1:None"]')
  await page.click('[data-generate-confirm]')
  await until(page, () => location.pathname.endsWith('/photos'), { timeout: 60000, label: 'photo page' })
  await page.waitForSelector('[data-photo-shown]')
  const roomId = new URL(page.url()).pathname.split('/').at(-2)
  const opened = { thumbs: await thumbs(), caption: await caption() }

  await shot('photos-page')
  step('Two views make one room, and its photo page opens on the first', opened.thumbs === 2 && opened.caption.startsWith('1 of 2'), JSON.stringify(opened))

  // 2. The arrows and the arrow keys switch photos, round and round.
  await page.click('[data-next-photo]')
  await sleep(200)
  const next = await caption()

  await page.keyboard.press('ArrowRight')
  await sleep(200)
  const wrapped = await caption()

  step('The arrows and the arrow keys switch photos', next.startsWith('2 of 2') && wrapped.startsWith('1 of 2'), `${next} | ${wrapped}`)

  // 3. A change by the fake AI adds a photo, made from the one shown, and shows it.
  await page.click('[data-photo-option=change] button')
  await page.type('#photo-change', 'make the sofa dark green velvet')
  await page.click('[data-make-change]')
  await until(page, () => document.querySelectorAll('[data-photo-thumb]').length === 3, { timeout: 30000, label: 'changed photo' })
  await sleep(300)
  const changed = await caption()
  const takes = await page.evaluate(async (id) => (await fetch(`/api/rooms/${id}/takes`)).json(), roomId)

  step('Change with AI adds a changed photo of the one shown, and shows it',
    changed.startsWith('3 of 3') && changed.includes('make the sofa dark green velvet') && takes[2].changedFrom === takes[0].id, changed)

  // 4. Analyze this photo, with the second shown: it becomes the room's photo, and the editor analyzes it.
  const waiting = (await roomOf(roomId)).status

  await page.waitForSelector('[data-sonner-toast]', { hidden: true, timeout: 10000 }).catch(() => {})
  await page.click('[data-photo-strip] li:nth-child(2) [data-photo-thumb]')
  await sleep(200)
  await page.click('[data-photo-option=analyze] button')
  await until(page, () => /^\/rooms\/[^/]+$/.test(location.pathname), { timeout: 30000, label: 'editor' })
  await until(page, () => !!document.querySelector('main canvas[data-label-map]'), { timeout: 60000, label: 'analyzed' })
  const analyzed = await roomOf(roomId)

  step('Analyze this photo makes the shown photo the room’s, and the editor analyzes it',
    waiting === 'Waiting' && analyzed.chosenTakeId === takes[1].id && analyzed.status === 'Ready', `${waiting} → ${analyzed.status}`)

  // 5. All photos goes back, with the analyzed one shown; analyzing another asks first.
  await page.click('[data-all-photos]')
  await page.waitForSelector('[data-photo-shown]')
  await sleep(300)
  const back = await caption()
  const restyle = await page.$eval('[data-photo-option=analyze] button', (b) => b.textContent)

  await page.click('[data-photo-strip] li:nth-child(1) [data-photo-thumb]')
  await sleep(200)
  await page.click('[data-photo-option=analyze] button')
  await page.waitForSelector('[role=dialog]')
  const asked = await page.$eval('[role=dialog]', (d) => d.textContent)

  // The arrow keys don't switch the photo the question is about.
  await page.keyboard.press('ArrowRight')
  await sleep(200)
  const stillAsked = await caption()

  await page.keyboard.press('Escape')
  await sleep(300)
  step('All photos goes back to the analyzed photo, and analyzing another asks first, the arrow keys leaving it alone',
    back.startsWith('2 of 3') && back.includes('Analyzed') && restyle.includes('Restyle this photo') && asked.includes('Analyze this photo instead?')
      && stillAsked.startsWith('1 of 3'), `${back} | asked about: ${stillAsked}`)

  // 6. Signing up saves the room into the plan's own design, named after the plan.
  await signUpFromEditor(page, email, password)
  await page.waitForSelector('[data-photos-design]', { timeout: 15000 })
  const designName = await page.$eval('[data-photos-design]', (a) => a.textContent.trim())
  const savedPlan = await page.evaluate(async (id) => (await fetch(`/api/plans/${id}`)).json(), plan.id)
  const design = await page.evaluate(async (id) => (await fetch(`/api/designs/${id}`)).json(), savedPlan.designId)

  await shot('photos-in-design')
  step('Signing up saves the room into the plan’s own design', designName === 'Photo pass' && design.rooms.some((r) => r.roomId === roomId), designName)

  // 7. A room with only its own photo (an upload) has nothing to choose from: the page points to its editor.
  const upload = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(800, 600)
    const ctx = canvas.getContext('2d')
    const data = new FormData()

    ctx.fillStyle = '#887766'
    ctx.fillRect(0, 0, 800, 600)
    data.append('photo', await canvas.convertToBlob({ type: 'image/jpeg' }), 'room.jpg')

    return (await fetch('/api/rooms', { method: 'POST', body: data })).json()
  })

  await page.goto(`${WEB}/rooms/${upload.id}/photos`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('::-p-text(No photos to choose from)', { timeout: 10000 })
  await page.click('::-p-text(Open in the editor)')
  await until(page, () => /^\/rooms\/[^/]+$/.test(location.pathname), { label: 'editor of the upload' })
  step('A room without photos to choose from points to its editor', new URL(page.url()).pathname === `/rooms/${upload.id}`)

  // 8. The page fits a phone.
  await page.goto(`${WEB}/rooms/${roomId}/photos`, { waitUntil: 'networkidle0' })
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(page.url(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-photo-shown]')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

  await shot('photos-phone')
  step('The photo page fits a phone screen', overflow <= 0, `${overflow} px too wide`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('photos-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport|http 40[01]\] .*\/api\/account/.test(l)).join('\n') || 'none')
  await browser.close()
}
