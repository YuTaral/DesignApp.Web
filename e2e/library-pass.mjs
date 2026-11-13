// The sample houses, in the browser: the home page's strip leads to the library, one card per house with a cover of
// its rooms; a house's card shows its rooms; a guest tries a room, which opens
// Ready at once (no upload, no analysis) with its objects and a "Sample room" badge; recolors, fixes an outline with
// a box and removes an object (the fake eraser); signs up and saves it; then, signed in, saves the whole house as a
// design and opens one of its rooms; phone layout. Usage: node e2e/library-pass.mjs [web url]
import { launch, sleep, until, WEB } from './ff.mjs'

const email = `lib-${Date.now()}@example.com`
const password = 'correct horse battery'
const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log, shot } = await launch()
const posts = []
page.on('request', (r) => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname) })
const hasText = (needle) => page.evaluate((n) => document.body.innerText.includes(n), needle)
const frame = () => sleep(250)
const editorReady = () => until(page, () => !!document.querySelector('canvas[data-label-map]'), { timeout: 30000, label: 'editor' })
const clickButton = (text) => page.evaluate((t) => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === t).click(), text)
const listed = () => page.evaluate(() => [...document.querySelectorAll('aside ul [data-index]')].map((b) => ({ index: Number(b.dataset.index), text: b.textContent.trim() })))
const mapNow = () => page.evaluate(() => document.querySelector('canvas[data-photo-rect]').dataset.labelMap)
const toPage = (u, v) => page.evaluate((u, v) => {
  const c = document.querySelector('canvas[data-photo-rect]'); const r = JSON.parse(c.dataset.photoRect); const b = c.getBoundingClientRect()
  return { x: b.left + r.x + u * r.width, y: b.top + r.y + v * r.height }
}, u, v)

try {
  // 1. The home page leads to the library.
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  await until(page, () => document.body.innerText.includes('No photo? Try a sample house'), { label: 'sample strip' })
  step('Home shows the sample-house strip and the header link', await hasText('Sample houses'))
  await page.click('::-p-text(No photo? Try a sample house)')
  await until(page, () => location.pathname === '/library', { label: 'library page' })
  const houses = await page.evaluate(() => fetch('/api/library').then((r) => r.json()))
  const house = houses[0]
  // One card per house, each with its cover (a grid of its rooms), all on one screen on a desktop.
  await until(page, () => {
    const covers = [...document.querySelectorAll('main a[data-house] img')]
    return covers.length > 0 && covers.every((i) => i.complete && i.naturalWidth > 0)
  }, { label: 'house covers loaded' })
  const houseCards = await page.evaluate(() => [...document.querySelectorAll('main a[data-house]')].map((a) => ({
    id: a.dataset.house, cover: a.querySelector('img').src.endsWith('/cover'), name: a.querySelector('h2').textContent.trim(),
  })))
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  await shot('library')
  step('Every sample house is a card with its cover', houseCards.map((c) => c.name).join('|') === houses.map((h) => h.name).join('|') && houseCards.every((c) => c.cover),
    `${houseCards.map((c) => c.name).join(', ')}; page ${pageHeight} px tall`)
  await page.click(`main a[data-house="${house.id}"]`)
  await until(page, () => new URL(location.href).searchParams.has('house'), { label: 'house in the address' })
  await until(page, () => {
    const visible = [...document.querySelectorAll('main ul li button[data-room] img')].filter((i) => i.getBoundingClientRect().top < innerHeight)
    return visible.length > 0 && visible.every((i) => i.complete && i.naturalWidth > 0)
  }, { label: 'room photos on screen loaded' })
  const thumbnails = await page.evaluate(() => [...document.querySelectorAll('main ul li button[data-room] img')].every((i) => i.src.endsWith('/thumbnail')))
  const tiles = await page.evaluate((id) => [...document.querySelectorAll(`section[aria-labelledby="house-${id}"] button[data-room]`)].map((b) => b.dataset.room), house.id)
  await shot('library-house-rooms')
  step('A house\'s card opens its rooms, with thumbnails for the tiles', tiles.join() === house.rooms.map((r) => r.id).join() && thumbnails, `${tiles.length} rooms`)
  step('A guest is asked to sign in to save the whole house', await hasText('Sign in to save the whole house'))

  // 2. Try the first room (choosing its last layout when it has several): it opens Ready at once, without an upload
  // or an analysis.
  const room = house.rooms[0]
  const layout = room.layouts.at(-1)
  await page.click(`main button[data-room="${room.id}"]`)
  if (room.layouts.length > 1) {
    await until(page, () => {
      const images = [...document.querySelectorAll('[role=dialog] button[data-layout] img')]
      return images.length > 0 && images.every((i) => i.complete && i.naturalWidth > 0)
    }, { label: 'layout chooser with its photos' })
    await sleep(400) // the dialog's fade-in
    const shown = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button[data-layout]')].map((b) => b.dataset.layout))
    await shot('library-layouts')
    step('A room with several layouts asks which one', shown.join() === room.layouts.map((l) => l.id).join(), `${shown.length} layouts`)
    // Escape closes it without copying anything, and the focus goes back to the room's tile.
    await page.keyboard.press('Escape')
    await until(page, () => !document.querySelector('[role=dialog]'), { label: 'chooser closed' })
    await sleep(400)
    const focused = await page.evaluate(() => document.activeElement?.dataset?.room)
    step('Escape closes the chooser and gives the focus back to the room', focused === room.id && !posts.some((p) => p.endsWith('/copy')), `focus on ${focused}`)
    await page.click(`main button[data-room="${room.id}"]`)
    await until(page, () => document.querySelectorAll('[role=dialog] button[data-layout]').length > 0, { label: 'layout chooser again' })
    await sleep(300)
    await page.click(`[role=dialog] button[data-layout="${layout.id}"]`)
  }
  const started = Date.now()
  await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'editor page' })
  await editorReady()
  const openedIn = Date.now() - started
  await sleep(300)
  const items = await listed()
  const statusText = await page.evaluate(() => [...document.querySelectorAll('[aria-live=polite]')].map((e) => e.textContent.trim()).join(' '))
  await shot('library-room')
  const opened = await page.evaluate((id) => fetch(`/api/rooms/${id}`).then((r) => r.json()), new URL(page.url()).pathname.split('/').at(-1))
  step('The chosen layout opens Ready with all its objects', /Ready/.test(statusText) && items.length === layout.objectCount
    && opened.libraryRoom === `${house.id}/${room.id}/${layout.id}`, `${items.length} objects, ${opened.libraryRoom}, ${openedIn} ms`)
  step('It is marked as a sample room', await hasText('Sample room'))
  step('No photo was uploaded for it', !posts.includes('/api/rooms') && posts.some((p) => p.startsWith('/api/library/')), posts.join(', '))

  // 3. Recolor an object.
  await page.click(`aside button[data-index="${items[0].index}"]`)
  await page.click('[role=radiogroup][aria-label^="Color for"] button')
  await frame()
  const recolored = await page.evaluate(() => document.querySelectorAll('aside [aria-label=recolored]').length)
  step('An object can be recolored', recolored === 1, `${recolored} recolored`)

  // 4. Fix the selected object's outline with a box.
  await clickButton('Add'); await clickButton('Box'); await frame()
  const before = await mapNow()
  const [a, b] = [await toPage(0.45, 0.45), await toPage(0.55, 0.55)]
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up()
  await until(page, new Function(`return document.querySelector('canvas[data-photo-rect]').dataset.labelMap !== ${JSON.stringify(before)}`), { label: 'box saved' })
  step('A box fixes an outline in a sample room', true)
  await clickButton('Done').catch(() => {})
  await page.keyboard.press('Escape'); await frame()

  // 5. Remove the last listed object (the fake eraser in Development).
  const victim = (await listed()).at(-1)
  await page.click(`aside button[data-index="${victim.index}"]`); await frame()
  await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => /^Remove (object|\d+ objects)$/.test(b.textContent.trim())).click())
  await until(page, new Function(`return ![...document.querySelectorAll('aside ul [data-index]')].some((b) => b.dataset.index === '${victim.index}')`), { label: 'object removed', timeout: 30000 })
  step('An object can be removed from a sample room', true, victim.text)
  await page.keyboard.press('Escape'); await frame()

  // 6. Sign up from the editor and save the room as a design.
  const roomId = new URL(page.url()).pathname.split('/').at(-1)
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
  await page.waitForSelector('[role=dialog] input')
  await page.type('[role=dialog] input', 'From a sample')
  await page.click('[role=dialog] button[type=submit]')
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'saved design' })
  step('A sample room is saved as a design after signing up', new URL(page.url()).pathname.endsWith(roomId))

  // 7. Signed in, save the whole house.
  await page.goto(`${WEB}/library?house=${house.id}`, { waitUntil: 'networkidle0' })
  await until(page, () => [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Use the whole house'), { label: 'whole house button' })
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Use the whole house').click())
  await until(page, () => /^\/designs\/[^/]+$/.test(location.pathname), { label: 'design page', timeout: 30000 })
  await until(page, () => document.querySelectorAll('main img').length > 0, { label: 'room cards' })
  // Let every room photo finish before leaving: Firefox reports a photo cut off by navigation as a corrupt image.
  await until(page, () => [...document.querySelectorAll('main img')].every((i) => i.complete), { label: 'room photos loaded', timeout: 30000 })
  await sleep(300)
  const cards = await page.evaluate(() => [...document.querySelectorAll('main a[href*="/rooms/"]')].map((a) => a.getAttribute('href')))
  const distinct = [...new Set(cards.map((h) => h.split('?')[0]))]
  await shot('library-house')
  step('The whole house becomes a design with every room', distinct.length === tiles.length, `${distinct.length} of ${tiles.length} rooms`)
  await page.goto(`${WEB}${distinct.at(-1)}`, { waitUntil: 'networkidle0' })
  await editorReady()
  step('A room of the saved house opens in the editor', await hasText('Sample room'))

  // 8. Phone layout: no sideways scrolling.
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(`${WEB}/library`, { waitUntil: 'networkidle0' })
  await until(page, () => document.querySelectorAll('main a[data-house]').length > 0, { label: 'house cards on phone' })
  const phoneCards = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await page.click(`main a[data-house="${house.id}"]`)
  await until(page, () => document.querySelectorAll('main ul li button[data-room]').length > 0, { label: 'tiles on phone' })
  await page.click('::-p-text(All houses)')
  await until(page, () => !new URL(location.href).searchParams.has('house') && document.querySelectorAll('main a[data-house]').length > 0, { label: 'back to all houses' })
  step('"All houses" goes back to the list', true)
  await page.click(`main a[data-house="${house.id}"]`)
  await until(page, () => document.querySelectorAll('main ul li button[data-room]').length > 0, { label: 'tiles on phone again' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await shot('library-phone')
  step('The library fits a phone screen (houses and rooms)', overflow <= 0 && phoneCards <= 0, `rooms ${overflow} px, houses ${phoneCards} px too wide`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
  await shot('library-stopped').catch(() => {})
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|http 40[014]\] .*\/api\/(account|designs|rooms)|WebSocket failed|Failed to start the transport/.test(l)).join('\n') || 'none')
  await browser.close()
}
