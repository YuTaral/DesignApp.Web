// A room builder run's photos, in the browser: two views make one room and its photo page opens, the arrows and the
// arrow keys switch photos, "Change with AI" (the fake AI) adds a changed photo and shows it, "Analyze this photo" makes
// the shown photo the room's and the editor analyzes it, "All photos" goes back, analyzing another photo asks first
// (and the arrow keys leave the photo asked about alone meanwhile), signing up saves the room into the plan's own
// design, whose page shows all the room's photos, with the same arrows, without a click, a room without photos (whose
// editor's Build in 3D reads it into a plan beside its photo) to choose from points to its editor, and the page fits a phone.
// Usage: node e2e/photos-pass.mjs [web url]
import path from 'node:path'
import { launch, sleep, until, WEB, ROOMS, signUpFromEditor } from './ff.mjs'

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

  // 2. The arrows and the arrow keys switch photos, round and round. Clicked like a person: near the arrow's top edge,
  // held down briefly (its press effect must not move it from under the pointer), at the same spot each time, in a
  // window short enough that the small photos are below the fold (switching must not scroll the arrows away).
  await page.setViewport({ width: 1366, height: 640 })
  await sleep(300)
  const arrow = await page.$eval('[data-next-photo]', (b) => {
    const box = b.getBoundingClientRect()

    return { x: box.left + box.width / 2, y: box.top + 4 }
  })

  await page.mouse.click(arrow.x, arrow.y, { delay: 250 })
  await sleep(200)
  const next = await caption()

  await page.mouse.click(arrow.x, arrow.y, { delay: 250 })
  await sleep(200)
  const clickedTwice = await caption()

  await page.keyboard.press('ArrowLeft')
  await sleep(200)
  const wrapped = await caption()

  await page.keyboard.press('ArrowRight')
  await sleep(200)
  const round = await caption()

  await page.setViewport({ width: 1366, height: 900 })
  step('The arrows (clicked twice at one spot) and the arrow keys switch photos',
    next.startsWith('2 of 2') && clickedTwice.startsWith('1 of 2') && wrapped.startsWith('2 of 2') && round.startsWith('1 of 2'),
    `${next} | ${clickedTwice} | ${wrapped} | ${round}`)

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

  // 7. The design's page shows all the room's photos without a click: its own photo first, the arrows and (with the
  // focus on them) the arrow keys switching them, and a way back to the photo page.
  await page.goto(`${WEB}/designs/${design.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-room-photos] [data-photo-shown]')
  await sleep(300)
  const roomCaption = () => page.evaluate(() => document.querySelector('[data-room-photos] figcaption')?.textContent.replace(/\s+/g, ' ').trim())
  const onDesign = { thumbs: await page.evaluate(() => document.querySelectorAll('[data-room-photos] [data-photo-thumb]').length), caption: await roomCaption() }

  await shot('design-room-photos')
  await page.click('[data-room-photos] [data-next-photo]')
  await sleep(200)
  const designNext = await roomCaption()

  await page.keyboard.press('ArrowRight')
  await sleep(200)
  const designKey = await roomCaption()

  await page.click('[data-room-photos-page]')
  await until(page, () => location.pathname.endsWith('/photos'), { label: 'photo page from the design' })
  step('The design’s page shows all the room’s photos, switched by the arrows and the arrow keys',
    onDesign.thumbs === 3 && onDesign.caption.startsWith('2 of 3') && onDesign.caption.includes("Room's photo") && designNext.startsWith('3 of 3')
      && designKey.startsWith('1 of 3'), `${onDesign.thumbs} photos | ${onDesign.caption} | ${designNext} | ${designKey}`)

  // 8. A room with only its own photo (an upload) has nothing to choose from: the page points to its editor.
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

  // 8b. Build a room starts with two choices, each described. Start from a photo reads an uploaded photo into a plan
  //     (the fake AI) without analyzing it, and opens it in the builder, tidied (nothing overlapping), with the photo
  //     beside the 3D view. The editor no longer offers it.
  const editorOffers = await page.$('[data-build-from-photo]')

  await page.goto(`${WEB}/build`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-build-choice]')
  const choices = await page.$$eval('[data-build-choice]', (e) => e.map((c) => c.dataset.buildChoice + ': ' + c.innerText.replace(/\s+/g, ' ').trim()))

  await shot('photos-build-choices')
  step('Build a room offers both ways to start, each with what it does, and the editor no longer has Build in 3D',
    choices.length === 2 && choices.every((c) => c.length > 60) && editorOffers === null, choices.join(' | '))
  // A signed-in user picks the design the room goes into first: the choices wait for it.
  const lockedFirst = await page.$eval('[data-build-choice=photo]', (e) => e.disabled)
  const pick = await page.$eval('[data-design-select]', (e) => [...e.options].find((o) => o.value && o.value !== 'new' && !o.disabled)?.value)

  await page.select('[data-design-select]', pick)
  await until(page, () => !document.querySelector('[data-build-choice=photo]').disabled, { label: 'choices on' })
  step('A signed-in user must choose the design first: the choices are off until one is picked', lockedFirst && Boolean(pick))
  await page.click('[data-build-choice=photo]')
  await page.waitForSelector('[data-photo-start]')
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('::-p-text(Choose photo)')])

  await chooser.accept([path.join(ROOMS, 'minimalist_living_room.jpg')])
  await until(page, () => /^\/build\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 30000, label: 'builder from the photo' })
  await page.waitForSelector('[data-plan-canvas] [data-item]')
  await sleep(500)
  const fromPhoto = await page.evaluate(async () => (await fetch(`/api/plans/${location.pathname.split('/').pop()}`)).json())
  const overlapping = await page.$$eval('[data-plan-canvas] [data-clash]', (e) => e.length)
  const readRoom = await page.evaluate(async (id) => (await fetch(`/api/rooms/${id}`)).json(), fromPhoto.fromRoomId)

  await page.click('[role=tab]::-p-text(3D view)')
  await page.waitForSelector('[data-photo-reference] img')
  await shot('photos-build-in-3d')
  step('Build in 3D reads the photo into a tidied plan, linked to the photo, which shows beside the 3D view',
    fromPhoto.fromRoomId != null && fromPhoto.items.length >= 6 && overlapping === 0 && readRoom.status === 'Waiting',
    `${fromPhoto.items.length} objects, ${overlapping} overlapping, photo's room ${readRoom.status}`)
  const spotPicked = await page.$eval('[data-corner-choice=Spot]', (e) => e.getAttribute('aria-checked'))

  step('The 3D view looks from where the photo was taken (its spot is kept with the plan and picked)',
    fromPhoto.corner === 'Spot' && fromPhoto.cameraSpot != null && spotPicked === 'true', `corner ${fromPhoto.corner}, spot ${JSON.stringify(fromPhoto.cameraSpot)}`)

  // 9. The pages fit a phone: the builder with its four camera places, the photo page and the design's room photos.
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(page.url(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-plan-canvas]')
  await page.click('[role=tab]::-p-text(3D view)')
  await page.waitForSelector('[data-corner-choice=Spot]')
  await sleep(500)
  const builderOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

  await shot('photos-build-in-3d-phone')
  await page.goto(`${WEB}/rooms/${roomId}/photos`, { waitUntil: 'networkidle0' })
  await page.goto(page.url(), { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-photo-shown]')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

  await shot('photos-phone')
  await page.goto(`${WEB}/designs/${design.id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-room-photos] [data-photo-shown]')
  await sleep(300)
  const designOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

  await shot('room-photos-phone')
  step('The builder, the photo page and the design’s room photos fit a phone screen', builderOverflow <= 0 && overflow <= 0 && designOverflow <= 0,
    `builder ${builderOverflow} px, photo page ${overflow} px, design page ${designOverflow} px too wide`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('photos-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport|negotiation with the server|Error from HTTP request\. TypeError: NetworkError|http 40[01]\] .*\/api\/account/.test(l)).join('\n') || 'none')
  await browser.close()
}
