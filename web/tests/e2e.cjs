// End-to-end check of the built app in a real browser. AI-assisted (Claude Code).
// Run after `npm run build`:  npm run e2e   (needs Playwright with Chromium installed)
// Set SHOTS=<folder> to save screenshots.
const { chromium } = require('playwright')
const path = require('path')

const url = 'file://' + path.resolve(__dirname, '../dist/index.html')
const shots = process.env.SHOTS
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`) }

;(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 880 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  const shot = async (n) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png') }) }
  const state = () => page.evaluate(() => {
    const S = window.__mw.S, r = S.routes[S.sel]
    return { busy: S.busy, stops: S.pts.length - 1, dist: r && Math.round(r.dist), legs: r && r.legMin.length, call: document.querySelector('.call')?.textContent, walk: r && r.walk }
  })
  const idle = () => page.waitForFunction(() => !window.__mw.S.busy, null, { timeout: 30000 })

  const t0 = Date.now()
  await page.goto(url)
  await page.waitForSelector('#loading', { state: 'detached', timeout: 60000 })
  check('loads', true, `${Date.now() - t0} ms`)
  await idle(); await page.waitForTimeout(6000)
  let s = await state()
  check('default walk has two stops and a computed return', s.stops === 2 && s.legs === 3, JSON.stringify(s))
  check('default walk is a plausible length', s.dist > 600 && s.dist < 2000, `${s.dist} m`)
  check('default call is GO at 09:00', s.call === 'GO')
  const lim = await page.evaluate(() => { const S = window.__mw.S; return ['direct', 'cautious'].map((k) => S.routes[k] && S.routes[k].maxSlope) })
  check('both routes stay inside the slope limit', lim.every((m) => m === null || m <= 20), lim.map((m) => m && m.toFixed(1)).join(', '))
  await page.evaluate(() => document.getElementById('coach-ok')?.click())
  await shot('01-overview')

  // the itinerary lists start, two stops and the way back
  const rows = await page.$$eval('#itin .stop', (els) => els.length)
  check('itinerary shows start, stops and return', rows === 4, `${rows} rows`)

  // add a stop by clicking the ground
  await page.click('#add-stop')
  const t1 = Date.now(); await page.mouse.click(1010, 470); await page.waitForTimeout(100); await idle()
  s = await state()
  check('clicking the ground places a new stop and routes it', s.stops === 3 && s.legs === 4, `${Date.now() - t1} ms, ${JSON.stringify(s)}`)
  await page.waitForTimeout(800); await shot('02-three-stops')
  await page.click('#itin .stop[data-i="3"] .rm'); await idle()
  check('removing a stop works', (await state()).stops === 2)

  // late departure turns the call to NO-GO
  const box = await page.locator('#day').boundingBox()
  await page.mouse.move(box.x + box.width * 0.29, box.y + box.height * 0.6); await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6, { steps: 5 }); await page.mouse.up()
  await page.waitForTimeout(400)
  check('a late departure is NO-GO', (await state()).call === 'NO-GO')
  await shot('03-late')
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6); await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.6, { steps: 5 }); await page.mouse.up()

  // layers
  await page.click('#b-layers')
  for (const k of ['slope', 'thermal', 'track']) await page.click(`.switch[data-k="${k}"]`)
  await page.waitForTimeout(600); await shot('04-layers')
  for (const k of ['slope', 'thermal', 'track']) await page.click(`.switch[data-k="${k}"]`)
  await page.click('#d-close')
  check('space weather card shows a status', (await page.textContent('#space')).length > 40)

  // a station card
  await page.click('.station[data-id="S2"]'); await page.waitForTimeout(1200)
  check('station card shows Curiosity photo', await page.isVisible('.station-card img'))
  await shot('05-station'); await page.click('#d-close')

  // walk mode to the end
  await page.click('#b-walk'); await page.waitForTimeout(5000); await shot('06-walk')
  const hud = await page.textContent('#h-next')
  check('walk HUD gives the next stop or hazard', /Stop|steep/i.test(hud), hud)
  await page.waitForFunction(() => /Arrived/.test(document.getElementById('h-next').textContent), null, { timeout: 150000 })
  check('walk reaches the last stop', true)
  await shot('07-arrived')
  await page.keyboard.press('Escape'); await page.waitForTimeout(800)
  check('escape leaves the walk', await page.evaluate(() => window.__mw.world.mode === 'orbit'))

  // field guide
  await page.evaluate(() => document.getElementById('b-guide').click()); await page.waitForTimeout(600)
  const guide = await page.textContent('.guide')
  check('guide has timeline, turn-back times and per-leg plan', /Turn back if/.test(guide) && /Back to the start/.test(guide) && /stop 2 by/.test(guide))
  await shot('08-guide')
  await page.evaluate(() => document.getElementById('g-close').click())

  // copy rules
  const text = await page.evaluate(() => document.body.innerText)
  check('no em or en dashes in visible text', !/[–—]/.test(text))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

  // phone and reduced motion
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const perr = []; phone.on('pageerror', (e) => perr.push(e.message))
  await phone.goto(url); await phone.waitForSelector('#loading', { state: 'detached', timeout: 60000 }); await phone.waitForTimeout(3000)
  check('phone: no horizontal scroll', (await phone.evaluate(() => document.documentElement.scrollWidth)) <= 390)
  check('reduced motion: no title animation', !(await phone.evaluate(() => document.getElementById('title')?.classList.contains('show'))))
  check('phone: routes computed', await phone.evaluate(() => !!window.__mw.S.routes.direct))
  if (shots) { await phone.evaluate(() => document.getElementById('coach-ok')?.click()); await phone.screenshot({ path: path.join(shots, '09-phone.png') }) }
  check('phone: no page errors', perr.length === 0, perr.join(' | '))

  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
