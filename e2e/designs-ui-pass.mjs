// Designs with several rooms, in the browser: a guest recolors a room, signs up from the editor,
// saves it as a new design (name + description), adds a second room from the design's page and a
// third from the editor ("Add to a design"), edits the details, removes a room, reopens a room
// with its colors, finds the design in My designs, deletes it, signs out; no My rooms anywhere;
// phone layouts. Usage: node e2e/designs-ui-pass.mjs [web url]
import path from 'node:path'
import { launch, sleep, until, WEB, ROOMS, selectObject, recoloredCount, signUpFromEditor } from './ff.mjs'

const email = `dz-${Date.now()}@example.com`
const password = 'correct horse battery'
const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const hasText = (needle) => page.evaluate((n) => document.body.innerText.includes(n), needle)
const recolored = () => recoloredCount(page)
const saveText = () => page.evaluate(() => [...document.querySelectorAll('aside button, aside a')].map((b) => b.textContent.trim()).find((t) => /^(save|sign in)/i.test(t)) ?? null)
const noDialog = () => until(page, () => !document.querySelector('[role=dialog]'), { label: 'dialog closed' })
const editorReady = () => until(page, () => !!document.querySelector('canvas[data-label-map]'), { timeout: 30000, label: 'editor' })
// Waits for the element first: a dialog's buttons can appear a moment after the dialog does.
const clickText = async (selector, text) => {
  const find = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim() === ${JSON.stringify(text)})`

  await until(page, new Function(`return !!${find}`), { timeout: 5000, label: `"${text}"` })
  await page.evaluate(new Function(`${find}.click()`))
}
const typeInto = async (selector, value) => {
  await page.click(selector)
  await page.keyboard.down('Control')
  await page.keyboard.press('a')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}
const upload = async (file) => {
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('::-p-text(Choose photo)')])

  await chooser.accept([path.join(ROOMS, file)])
  await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'editor page' })
  await editorReady()
  await sleep(300)
}
// Recolors `count` objects, clicked on the photo in index order after skipping the first `offset` that can be clicked.
const recolor = async (count, offset = 0) => {
  const room = await page.evaluate(() => fetch(`/api/rooms/${location.pathname.split('/').at(-1)}`).then((r) => r.json()))
  let [seen, done] = [0, 0]

  for (const object of room.objects) {
    if (done === count) {
      break
    }

    if (!(await selectObject(page, object.index))) {
      continue
    }

    if (seen++ < offset) {
      continue
    }

    await page.click('[role=radiogroup][aria-label^="Color for"] button')
    await sleep(120)
    done++
  }

  await page.keyboard.press('Escape')
}
const designId = () => new URL(page.url()).searchParams.get('design')
const roomOf = () => new URL(page.url()).pathname.split('/').at(-1)

try {
  // 1. A guest recolors a room and signs up from the editor.
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  step('Header has no My rooms', !(await hasText('My rooms')))
  await upload('kitchen_with_table.png')
  await recolor(2)
  step('Guest sees "Sign in to save" and the one-day note', (await saveText()) === 'Sign in to save' && (await hasText('deleted after a day')))
  const firstRoom = roomOf()

  await signUpFromEditor(page, email, password)
  await editorReady()
  await sleep(300)
  step('Back in the room with both colors after signing up', roomOf() === firstRoom && (await recolored()) === 2, `${await recolored()} colors`)

  // 2. Save it as a new design with a description.
  await page.click('::-p-text(Save design)')
  await page.waitForSelector('[role=dialog] input')
  await page.type('[role=dialog] input', 'Whole flat')
  await page.type('[role=dialog] textarea', 'Calm greens')
  await page.click('[role=dialog] button[type=submit]')
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'design in address' })
  await noDialog()
  await until(page, () => [...document.querySelectorAll('aside button')].some((b) => b.textContent.trim() === 'Saved'), { label: 'Saved' })
  const design = designId()

  step('New design saved: in the address, "Saved", name in the header', !!design && (await hasText('Whole flat')))

  // 3. Change a color, save the change.
  await recolor(1, 2)
  step('A new color makes it "Save changes"', (await saveText()) === 'Save changes', `${await saveText()}`)
  await page.click('::-p-text(Save changes)')
  await until(page, () => [...document.querySelectorAll('aside button')].some((b) => b.textContent.trim() === 'Saved'), { label: 'Saved again' })
  step('Saving the change shows "Saved" again', true)

  // 4. Back goes to the design's page.
  await page.click('main a[href^="/designs/"]')
  await until(page, () => location.pathname === `/designs/${new URLSearchParams(location.search).get('x') ?? ''}` || location.pathname.startsWith('/designs/'), { label: 'design page' })
  await until(page, () => document.body.innerText.includes('Calm greens'), { label: 'design details' })
  const onlyRemove = await page.evaluate(() => document.querySelector('[aria-label="Remove Room 1"]')?.disabled)

  step('Design page shows name, description, 1 room; its only room can\'t be removed', (await hasText('Whole flat')) && (await hasText('1 room')) && onlyRemove === true)
  await shot('designs-page-1')

  // 5. "Upload a photo to restyle" under Add room on the design's page: the upload goes straight into the design.
  await page.click('[data-upload-room]')
  await until(page, () => location.pathname === '/' && document.body.innerText.includes('will be added to'), { label: 'add-room banner' })
  step('Home shows which design the photo goes into', await hasText('The photo will be added to Whole flat.'))
  await upload('bedroom.png')
  step('The new room opens in the design', designId() === design)
  await recolor(1)
  step('Its first color makes it "Save changes"', (await saveText()) === 'Save changes', `${await saveText()}`)
  await page.click('::-p-text(Save changes)')
  await until(page, () => [...document.querySelectorAll('aside button')].some((b) => b.textContent.trim() === 'Saved'), { label: 'Saved room 2' })
  const secondRoom = roomOf()

  // 6. A third room from the editor, added to the existing design.
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  await upload('bathroom.png')
  await recolor(1)
  const thirdRoom = roomOf()

  await page.click('::-p-text(Save design)')
  await page.waitForSelector('[role=dialog]')
  await clickText('[role=dialog] [role=radio]', 'Add to a design')
  await until(page, () => [...document.querySelectorAll('[role=dialog] [role=radiogroup][aria-label=Design] [role=radio]')].some((b) => b.textContent.includes('Whole flat')), { label: 'the design list in the dialog' })
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] [role=radiogroup][aria-label=Design] [role=radio]')].find((b) => b.textContent.includes('Whole flat')).click())
  await page.click('[role=dialog] button[type=submit]')
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'added to design' })
  await noDialog()
  step('"Add to a design" puts the room in the existing design', designId() === design)

  // 7. The design page lists 3 rooms with their colors; edit the details.
  await page.goto(`${WEB}/designs/${design}`, { waitUntil: 'networkidle0' })
  await until(page, () => document.body.innerText.includes('3 rooms'), { label: '3 rooms' })
  const dots = await page.evaluate(() => [...document.querySelectorAll('main li [aria-label$="recolored objects"], main li [aria-label$="recolored object"]')].map((e) => e.getAttribute('aria-label')))

  step('Design page shows 3 rooms with their own colors', dots.length === 3, dots.join(' | '))
  await page.click('::-p-text(Edit details)')
  await page.waitForSelector('[role=dialog] input')
  await typeInto('[role=dialog] input', 'Flat, final')
  await typeInto('[role=dialog] textarea', 'Greens and oak')
  await page.click('[role=dialog] button[type=submit]')
  await noDialog()
  await until(page, () => document.body.innerText.includes('Flat, final') && document.body.innerText.includes('Greens and oak'), { label: 'details saved' })
  const saved = await page.evaluate(async (id) => (await (await fetch(`/api/designs/${id}`)).json()), design)

  step('Edit details saves the name and description exactly', saved.name === 'Flat, final' && saved.description === 'Greens and oak', `${saved.name} / ${saved.description}`)

  // 8. Remove the third room: it's gone, the rest stays.
  await page.click('[aria-label="Remove Room 3"]')
  await page.waitForSelector('[role=dialog]')
  await clickText('[role=dialog] button', 'Remove room')
  await noDialog()
  await until(page, () => document.body.innerText.includes('2 rooms'), { label: '2 rooms' })
  const gone = await page.evaluate(async (id) => (await fetch(`/api/rooms/${id}`)).status, thirdRoom)

  step('Removing a room deletes it; the design keeps the others', gone === 404, `room answers ${gone}`)
  await shot('designs-page-2')

  // 9. Opening a room shows its saved colors.
  await page.goto(`${WEB}/designs/${design}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[aria-label="Open Room 1"]')
  await page.click('[aria-label="Open Room 1"]')
  await editorReady()
  await until(page, () => document.querySelector('aside [data-recolored]')?.dataset.recolored === '3', { timeout: 10000, label: '3 colors' }).catch(() => {})
  step('Room 1 opens with its 3 saved colors, counted as saved', (await recolored()) === 3 && (await saveText()) === 'Saved', `${await recolored()} colors, ${await saveText()}`)

  // 9b. Add room at the top of the design's page builds a room in 3D for it: Build a room says where its photos go
  //     (through its steps), and the room made from its first photo is in the design.
  await page.goto(`${WEB}/designs/${design}`, { waitUntil: 'networkidle0' })
  await page.click('[data-add-room]')
  await until(page, `location.pathname === '/build' && document.querySelector('[data-design-select]')?.value === '${design}'`, { label: 'design chosen' })
  const buildBanner = await page.$eval('[data-design-select]', (e) => e.selectedOptions[0].textContent.startsWith('Flat, final'))

  await page.click('[data-build-choice=walls]')
  await page.waitForSelector('form[data-build-step=walls]')
  const stepsBanner = await hasText('will be added to Flat, final')

  await page.click('form[aria-label="New room"] button[type=submit]')
  await page.waitForSelector('form[data-build-step=floor]')
  await page.click('form[aria-label="New room"] button[type=submit]')
  await until(page, () => /^\/build\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 20000, label: 'builder' })
  const builtPlan = await page.evaluate(async () => (await fetch(`/api/plans/${location.pathname.split('/').at(-1)}`)).json())

  await page.click('::-p-text(Generate photo)')
  await page.waitForSelector('[data-generate-confirm]')
  await sleep(800)
  await page.click('[data-generate-confirm]')
  await until(page, () => location.pathname.endsWith('/photos'), { timeout: 60000, label: 'photo page' })
  const builtRoom = new URL(page.url()).pathname.split('/').at(-2)
  const withBuilt = await page.evaluate(async (id) => (await (await fetch(`/api/designs/${id}`)).json()), design)

  step('Add room at the top builds a room for the design: Build a room has it chosen, and its photo’s room is in the design',
    buildBanner && stepsBanner && builtPlan.designId === design && withBuilt.rooms.some((r) => r.roomId === builtRoom) && withBuilt.rooms.length === 3,
    `banner ${buildBanner}/${stepsBanner}, plan design ${builtPlan.designId === design}, ${withBuilt.rooms.length} rooms`)
  await page.goto(`${WEB}/designs/${design}`, { waitUntil: 'networkidle0' })
  await until(page, () => document.body.innerText.includes('3 rooms'), { label: '3 rooms again' })
  await shot('designs-add-room')

  // 9c. Edit in 3D on that room asks what new photos do; Replace opens the builder saying so, and the photo made there
  //     is a new room in the old one's place (the old one is gone from the design).
  await page.click('[data-room-photos] [data-room-view="3d"]')
  await page.waitForSelector('[data-edit-in-3d]')
  await page.click('[data-edit-in-3d]')
  await page.waitForSelector('[data-edit-plan-dialog]')
  const openWaits = await page.$eval('[data-open-builder]', (b) => b.disabled)

  await page.click('[data-new-photos=replace]')
  await page.click('[data-open-builder]')
  await page.waitForSelector('[data-replace-banner]')
  await page.waitForSelector('[data-plan-canvas]')
  await page.click('::-p-text(Generate photo)')
  await page.waitForSelector('[data-generate-confirm]')
  await sleep(800)
  await page.click('[data-generate-confirm]')
  await until(page, () => location.pathname.endsWith('/photos'), { timeout: 60000, label: 'photo page after replacing' })
  const replacedBy = new URL(page.url()).pathname.split('/').at(-2)
  const afterReplace = await page.evaluate(async (id) => (await (await fetch(`/api/designs/${id}`)).json()).rooms.map((r) => r.roomId), design)

  step('Edit in 3D with Replace makes the next photo a new room in the old one’s place',
    openWaits && replacedBy !== builtRoom && afterReplace.length === 3 && afterReplace[withBuilt.rooms.findIndex((r) => r.roomId === builtRoom)] === replacedBy
      && !afterReplace.includes(builtRoom), `${afterReplace.length} rooms`)

  // 10. My designs: the card; phone layouts.
  await page.goto(`${WEB}/designs`, { waitUntil: 'networkidle0' })
  await until(page, () => document.body.innerText.includes('Flat, final'), { label: 'card' })
  step('My designs shows the card with description and room count', (await hasText('Greens and oak')) && (await hasText('3 rooms')))
  await shot('designs-list')
  await page.setViewport({ width: 390, height: 844 })

  for (const p of ['/designs', `/designs/${design}`]) {
    await page.goto(`${WEB}${p}`, { waitUntil: 'networkidle0' })
    await sleep(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

    step(`Phone width: ${p.replace(design, '$id')} has no sideways scroll`, overflow <= 0, `overflow ${overflow}px`)
  }

  await shot('designs-phone')
  await page.setViewport({ width: 1280, height: 860 })

  // 11. Delete the design: its rooms go too.
  await page.goto(`${WEB}/designs`, { waitUntil: 'networkidle0' })
  await page.click('[aria-label="More for Flat, final"]')
  await page.click('::-p-text(Delete)')
  await page.waitForSelector('[role=dialog]')
  await clickText('[role=dialog] button', 'Delete design')
  await noDialog()
  await until(page, () => document.body.innerText.includes('No designs yet'), { label: 'deleted' })
  const roomsGone = await page.evaluate(async (ids) => Promise.all(ids.map(async (id) => (await fetch(`/api/rooms/${id}`)).status)), [firstRoom, secondRoom])

  step('Deleting the design deletes its rooms', roomsGone.every((s) => s === 404), roomsGone.join(', '))

  // 12. Sign out.
  await page.click('[aria-label=Account]')
  await page.click('::-p-text(Sign out)')
  await until(page, () => location.pathname === '/', { label: 'home' })
  await page.goto(`${WEB}/designs`, { waitUntil: 'networkidle0' })
  step('Signed out, My designs asks to sign in', await hasText('Sign in to see your designs'))
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('designs-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|http 40[014]\] .*\/api\/(account|designs|rooms)|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
