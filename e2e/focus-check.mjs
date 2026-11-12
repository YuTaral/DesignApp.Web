// Every dialog in the app, by keyboard: open it, close it (Escape, ✕ or Cancel), and check the focus goes back to what
// opened it (a menu's button for the ones opened from a menu). Ends by saving a design through the dialog.
// Usage: node e2e/focus-check.mjs [web url]
import { launch, sleep, until, WEB } from './ff.mjs'

const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const { browser, page, log } = await launch()
const active = () => page.evaluate(() => {
  const a = document.activeElement
  return a === document.body ? 'BODY' : `${a.tagName}:${a.getAttribute('aria-label') ?? a.textContent.trim().slice(0, 24)}`
})
const dialogOpen = () => until(page, () => !!document.querySelector('[role=dialog]'), { label: 'dialog open' })
const dialogClosed = async () => { await until(page, () => !document.querySelector('[role=dialog]'), { label: 'dialog closed' }); await sleep(400) }
const pressOn = async (selectorOrText, key = 'Enter') => {
  if (selectorOrText.startsWith('text=')) {
    await page.evaluate((t) => [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === t).focus(), selectorOrText.slice(5))
  } else await page.focus(selectorOrText)
  const before = await active()
  await page.keyboard.press(key)
  return before
}
const closeWith = async (how) => {
  await dialogOpen(); await sleep(300)
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))
  if (how === 'Escape') await page.keyboard.press('Escape')
  else if (how === 'X') await page.click('[role=dialog] button:has(> .sr-only)')
  else await page.evaluate((t) => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === t).click(), how)
  await dialogClosed()
  return inside
}

try {
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  const ids = await page.evaluate(async () => {
    await fetch('/api/account/sign-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `fa-${Date.now()}@example.com`, password: 'correct horse battery' }) })
    const design = await (await fetch('/api/library/minimalist/copy', { method: 'POST' })).json()
    const room = await (await fetch('/api/library/minimalist/kitchen/2/copy', { method: 'POST' })).json()
    return { design: design.id, room: room.id, name: design.name }
  })

  // My designs: the card menu's Edit details and Delete.
  await page.goto(`${WEB}/designs`, { waitUntil: 'networkidle0' })
  await until(page, () => !!document.querySelector('main [aria-haspopup=menu]'), { label: 'card menu' })
  for (const [item, how] of [['Edit details', 'Escape'], ['Delete', 'Cancel']]) {
    const opener = await pressOn('main [aria-haspopup=menu]')
    await until(page, () => !!document.querySelector('[role=menu]'), { label: 'menu' })
    await page.evaluate((t) => [...document.querySelectorAll('[role=menuitem]')].find((m) => m.textContent.trim() === t).click(), item)
    const inside = await closeWith(how)
    const after = await active()
    step(`My designs › ${item}, closed with ${how}: focus goes back to the menu button`, inside && after === opener, `${opener} → ${after}`)
  }

  // A design's page: Edit details and Delete design buttons, and a room's Remove.
  await page.goto(`${WEB}/designs/${ids.design}`, { waitUntil: 'networkidle0' })
  await until(page, () => [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Edit details'), { label: 'design page' })
  for (const [text, how] of [['Edit details', 'X'], ['Delete', 'Escape']]) {
    const opener = await pressOn(`text=${text}`)
    const inside = await closeWith(how)
    const after = await active()
    step(`Design page › ${text}, closed with ${how}: focus goes back to the button`, inside && after === opener, `${opener} → ${after}`)
  }
  const removeLabel = await page.evaluate(() => [...document.querySelectorAll('main button[aria-label^="Remove"]')][0]?.getAttribute('aria-label'))
  const removeOpener = await pressOn(`main button[aria-label="${removeLabel}"]`)
  const removeInside = await closeWith('Cancel')
  const removeAfter = await active()
  step('Design page › Remove room, closed with Cancel: focus goes back to its button', removeInside && removeAfter === removeOpener, `${removeOpener} → ${removeAfter}`)

  // The editor's Save design dialog.
  await page.goto(`${WEB}/rooms/${ids.room}`, { waitUntil: 'networkidle0' })
  await until(page, () => !!document.querySelector('canvas[data-label-map]'), { label: 'editor', timeout: 30000 })
  const saveOpener = await pressOn('text=Save design')
  const saveInside = await closeWith('Escape')
  const saveAfter = await active()
  step('Editor › Save design, closed with Escape: focus goes back to the button', saveInside && saveAfter === saveOpener, `${saveOpener} → ${saveAfter}`)

  // The library's layout chooser, by mouse and by keyboard.
  await page.goto(`${WEB}/library`, { waitUntil: 'networkidle0' })
  await until(page, () => document.querySelectorAll('main button[data-room]').length > 0, { label: 'tiles' })
  const chooserOpener = await pressOn('main button[data-room="bedroom"]')
  await closeWith('X')
  const chooserAfter = await active()
  step('Library › layout chooser, closed with ✕: focus goes back to the room', chooserAfter === chooserOpener, `${chooserOpener} → ${chooserAfter}`)

  // Saving still works after the change: the Save design dialog saves a new design and closes.
  const opener2 = await pressOn('main button[data-room="kitchen"]')
  await dialogOpen()
  await page.click('[role=dialog] button[data-layout="1"]')
  await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'editor' })
  await until(page, () => !!document.querySelector('canvas[data-label-map]'), { label: 'editor ready', timeout: 30000 })
  await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Save design').click())
  await dialogOpen()
  await page.type('[role=dialog] input', 'Focus test')
  await page.click('[role=dialog] button[type=submit]')
  await until(page, () => !!new URL(location.href).searchParams.get('design'), { label: 'saved' })
  await dialogClosed()
  const afterSave = await active()
  step('Saving a design through the dialog still works', !!opener2, `focus after save: ${afterSave} (the Save button is replaced by the saved view)`)
} catch (error) {
  step('Unexpected stop', false, String(error.message ?? error).split('\n')[0])
} finally {
  console.log(results.join('\n'))
  console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|WebSocket failed|Failed to start the transport|http 40[014]\] .*\/api\/(account|designs|rooms)/.test(l)).join('\n') || 'none')
  await browser.close()
}
