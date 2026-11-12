// Runs every end-to-end pass in turn against the running app and prints one summary.
// Usage: npm run e2e [-- <web url>]   (the app must be running: Visual Studio F5 on DesignApp.AppHost)
// Exits with 1 when a pass fails, so a script or an agent can tell.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { WEB } from './ff.mjs'

const PASSES = ['editor-pass', 'designs-ui-pass', 'library-pass', 'focus-check', 'account-check', 'abort-check']

const up = await fetch(`${WEB}/api/status`).then((r) => r.ok).catch(() => false)
if (!up) {
  console.error(`The app isn't answering at ${WEB}. Start it with F5 on DesignApp.AppHost first.`)
  process.exit(1)
}

let failed = 0
for (const pass of PASSES) {
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, `${pass}.mjs`), WEB], { encoding: 'utf8' })
  const out = `${run.stdout}${run.stderr}`
  const passes = (out.match(/^PASS/gm) ?? []).length
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL'))
  const problems = out.split('\n').find((l) => /problems:/.test(l)) ?? ''
  const ok = run.status === 0 && fails.length === 0 && passes > 0
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${pass}: ${passes} passed, ${fails.length} failed${problems ? ` | ${problems.trim()}` : ''}`)
  for (const f of fails) console.log(`     ${f}`)
}
console.log(failed ? `${failed} of ${PASSES.length} passes failed.` : `All ${PASSES.length} passes passed.`)
process.exit(failed ? 1 : 0)
