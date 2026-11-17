// Checks accounts in Firefox through the API (the sign-in pages come later): a guest uploads,
// signs up and keeps the room; signing out hides it; signing in brings it back; a second
// browser can't see it. Also lists the cookies' flags. Usage: node e2e/account-check.mjs [web url]
import path from 'node:path'
import { launch, until, WEB, ROOMS } from './ff.mjs'

const email = `ff-${Date.now()}@example.com`
const password = 'correct horse battery'
const results = []
const step = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)

const { browser, page, log } = await launch()

try {
  await page.goto(WEB, { waitUntil: 'networkidle0' })
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('::-p-text(Choose photo)')])

  await chooser.accept([path.join(ROOMS, 'bedroom.png')])
  await until(page, () => location.pathname.startsWith('/rooms/'), { label: 'editor' })
  const roomId = new URL(page.url()).pathname.split('/').at(-1)

  const api = (method, url, body) => page.evaluate(async (method, url, body) => {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()

    return { status: r.status, body: text ? JSON.parse(text) : null }
  }, method, url, body ?? null)
  const room = async () => (await api('GET', `/api/rooms/${roomId}`)).status

  step('Guest can open the room just uploaded', (await room()) === 200)
  step('Not signed in at first', (await api('GET', '/api/account')).body?.signedIn === false)

  const cookies = await page.cookies()
  const guest = cookies.find((c) => c.name === 'designapp.guest')

  step('Guest cookie is HttpOnly, Secure and SameSite=Lax', !!guest && guest.httpOnly && guest.secure && guest.sameSite === 'Lax',
    guest ? `httpOnly=${guest.httpOnly} secure=${guest.secure} sameSite=${guest.sameSite}` : 'missing')
  step('Page scripts cannot read the cookies', !(await page.evaluate(() => document.cookie)).includes('designapp'))

  const signUp = await api('POST', '/api/account/sign-up', { email, password })

  step('Sign up', signUp.status === 200 && signUp.body?.email === email, `status ${signUp.status}`)
  step('Signed in after sign-up', (await api('GET', '/api/account')).body?.signedIn === true)
  step('The guest room now belongs to the account', (await room()) === 200)
  const session = (await page.cookies()).find((c) => c.name === 'designapp.session')

  step('Session cookie is HttpOnly, Secure and SameSite=Lax', !!session && session.httpOnly && session.secure && session.sameSite === 'Lax',
    session ? `httpOnly=${session.httpOnly} secure=${session.secure} sameSite=${session.sameSite}` : 'missing')
  step('Guest cookie removed after sign-up', !(await page.cookies()).some((c) => c.name === 'designapp.guest'))

  await page.reload({ waitUntil: 'networkidle0' })
  step('Still signed in after a reload', (await api('GET', '/api/account')).body?.signedIn === true)
  const reopened = await until(page, () => !!document.querySelector('canvas[data-label-map]'), { timeout: 20000, label: 'editor after reload' }).catch(() => false)

  step('Editor still opens the room after a reload', !!reopened, `${await room()} ${new URL(page.url()).pathname}`)

  if (!reopened) {
    await page.screenshot({ path: 'C:/Users/yutar/AppData/Local/Temp/claude/608d875da057c0f8/ebf04c41-fdae-4095-a322-f39a89fada4e/scratchpad/reload.png' })
  }

  step('Sign out', (await api('POST', '/api/account/sign-out')).status === 204)
  step('Room is hidden after signing out', (await room()) === 404)
  const wrong = await api('POST', '/api/account/sign-in', { email, password: 'wrong password' })

  step('Wrong password is refused', wrong.status === 400 && wrong.body?.detail === 'Wrong email or password.', `${wrong.status} ${wrong.body?.detail}`)
  step('Sign in again', (await api('POST', '/api/account/sign-in', { email, password })).status === 200)
  step('Room is back after signing in', (await room()) === 200)

  const other = await browser.createBrowserContext()
  const stranger = await other.newPage()

  await stranger.goto(WEB, { waitUntil: 'networkidle0' })
  const seen = await stranger.evaluate(async (id) => (await fetch(`/api/rooms/${id}`)).status, roomId)

  step('Another browser cannot open the room', seen === 404, `status ${seen}`)
  await other.close()
} finally {
  await browser.close()
}

console.log(results.join('\n'))
console.log('Browser console/network problems:', log.filter((l) => !/NS_BINDING_ABORTED|http 40[04]\]|sign-in/.test(l)).join('\n') || 'none')
