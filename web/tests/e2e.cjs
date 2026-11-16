// End-to-end check of the built app in a real browser. AI-assisted (Claude Code).
// Run after `npm run build`:  npm run e2e   (needs Playwright with Chromium installed)
// Set SHOTS=<folder> to save screenshots.
const { chromium } = require('playwright')
const path = require('path')

const url = 'file://' + path.resolve(__dirname, '../dist/index.html') + '#plan'
const shots = process.env.SHOTS
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`) }

;(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 880 } })
  page.setDefaultTimeout(180000) // the software renderer used in CI can stall for many seconds the first time it draws a new view
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  const shot = async (n) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png') }) }
  const state = () => page.evaluate(() => {
    const S = window.__mw.S, rs = S.routes[S.sel], r = rs[0]
    return { busy: S.busy, pair: S.pair, walkers: rs.length, stops: S.pts.length - 1, dist: r && Math.round(r.dist), legs: r && r.legMin.length, call: document.querySelector('.call')?.textContent, walk: r && Math.max(...rs.map((q) => q ? q.walk : 0)) }
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
  const lim = await page.evaluate(() => { const S = window.__mw.S; return ['direct', 'cautious'].map((k) => S.routes[k][0] && S.routes[k][0].maxSlope) })
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
  // hovering the ground reads out the slope
  await page.mouse.move(900, 430); await page.waitForTimeout(300)
  check('hover shows slope and height', await page.isVisible('#tip') && /slope/.test(await page.textContent('#tip')))
  // drag stop 3's beacon somewhere else
  const before = await page.evaluate(() => ({ ...window.__mw.S.pts[3] }))
  const sp = await page.evaluate(() => { const W = window.__mw.world, p = window.__mw.S.pts[3]; return W.project(W.cellToWorld(p, 0)) })
  await page.mouse.move(sp.x, sp.y); await page.mouse.down(); await page.mouse.move(sp.x - 60, sp.y + 30, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(100); await idle()
  const after = await page.evaluate(() => ({ ...window.__mw.S.pts[3] }))
  check('dragging a beacon moves the stop', Math.hypot(after.x - before.x, after.y - before.y) > 5, `${JSON.stringify(before)} to ${JSON.stringify(after)}`)
  // quickest order never makes the walk longer
  const w0 = (await state()).walk
  await page.click('#opt'); await page.waitForTimeout(200); await idle()
  const w1 = (await state()).walk
  check('quickest order is no slower', w1 <= w0 + 0.01, `${w0.toFixed(1)} to ${w1.toFixed(1)} min`)
  await page.click('#itin .stop[data-i="3"] .rm'); await idle()
  check('removing a stop works', (await state()).stops === 2)

  // one-way: end at the last stop
  const round = (await state()).walk
  await page.click('#end-last'); await page.waitForTimeout(100); await idle()
  const one = await state()
  check('one-way walk ends at the last stop and is shorter', one.walk < round && /End of the walk/.test(await page.textContent('#itin')), `${round.toFixed(0)} to ${one.walk.toFixed(0)} min`)
  await page.click('#end-back'); await page.waitForTimeout(100); await idle()
  check('round trip restored', Math.abs((await state()).walk - round) < 0.5)

  // working in pairs
  await page.click('#m-pair'); await page.waitForTimeout(100); await idle()
  s = await state()
  check('pair mode routes two astronauts', s.pair && s.walkers === 2, JSON.stringify(s))
  const pc = await page.evaluate(() => window.__mw.S.pc[window.__mw.S.sel])
  check('pair check reports separation and line of sight', pc && pc.maxSep > 0 && pc.inSight >= 0 && pc.inSight <= 1, pc && `${Math.round(pc.maxSep)} m, ${Math.round(pc.inSight * 100)}% in sight`)
  check('pair section and two walk buttons show', await page.isVisible('#pair-sec') && (await page.$$('[data-walk]')).length === 2)
  await page.waitForTimeout(600); await shot('03-pair')
  await page.click('#m-solo'); await idle()

  // ready-made plans and the site list
  await page.click('#plans .chip[data-i="1"]'); await page.waitForTimeout(100); await idle()
  s = await state()
  check('pair plan loads four stops for two astronauts', s.pair && s.stops === 4 && s.walkers === 2, JSON.stringify(s))
  await page.waitForTimeout(1500); await shot('03b-pair-plan')
  await page.click('#plans .chip[data-i="0"]'); await page.waitForTimeout(100); await idle()
  await page.click('#b-sites'); await page.waitForTimeout(300)
  const n = await page.$$eval('.site-list li', (els) => els.length)
  check('science sites lists every stop', n >= 40, `${n} sites`)
  await shot('04-sites')
  await page.click('.site-list .add'); await page.waitForTimeout(100); await idle()
  check('adding a site from the list adds a stop', (await state()).stops === 3)
  await page.click('#d-close')
  await page.click('#itin .stop[data-i="3"] .rm'); await idle()

  // late departure turns the call to NO-GO
  const box = await page.locator('#day').boundingBox()
  await page.mouse.move(box.x + box.width * 0.29, box.y + box.height * 0.6); await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6, { steps: 5 }); await page.mouse.up()
  await page.waitForTimeout(400)
  check('a late departure is NO-GO', (await state()).call === 'NO-GO')
  await shot('05-late')
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6); await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.6, { steps: 5 }); await page.mouse.up()

  // layers
  await page.click('#b-layers')
  for (const k of ['slope', 'thermal', 'track']) await page.click(`.switch[data-k="${k}"]`)
  await page.waitForTimeout(600); await shot('06-layers')
  for (const k of ['slope', 'thermal', 'track']) await page.click(`.switch[data-k="${k}"]`)
  await page.click('#d-close')
  check('space weather card shows a status', (await page.textContent('#space')).length > 40)

  // a station card
  await page.evaluate(() => document.querySelector('.pin[data-id="c4673"]').click()); await page.waitForTimeout(1200)
  check('site card shows Curiosity photo and the blog source', await page.isVisible('.station-card img') && /Mission blog/.test(await page.textContent('.station-card')))
  await shot('07-station'); await page.click('#d-close')
  check('no flyover button', (await page.$$('#b-fly')).length === 0)

  // walk mode to the end
  await page.click('[data-walk="0"]'); await page.waitForTimeout(5000); await shot('08-walk')
  check('walk shows time left and back-by time', /\d/.test(await page.textContent('#h-left')) && /\d\d:\d\d/.test(await page.textContent('#h-back')), `${await page.textContent('#h-left')}, back ${await page.textContent('#h-back')}`)
  await page.click('#h-helmet'); await page.waitForTimeout(600); await shot('08b-helmet')
  check('helmet view toggles', await page.evaluate(() => document.getElementById('hud').classList.contains('visor')))
  await page.click('#h-helmet')
  await page.fill('#h-rate', '50'); await page.dispatchEvent('#h-rate', 'input')
  check('speed slider sets a free speed', /×/.test(await page.textContent('#h-speed')) && (await page.textContent('#h-speed')) !== '1×', await page.textContent('#h-speed'))
  await page.click('.speeds button[data-v="4"]')
  const hud = await page.textContent('#h-next')
  check('walk HUD gives the next stop or hazard', /Stop|steep/i.test(hud), hud)
  // jump to just before the last stop (the profile click does the same), then let it arrive
  await page.evaluate(() => { const W = window.__mw.world; W.seekWalk(W.walkLength - 15) })
  await page.waitForFunction(() => /Arrived/.test(document.getElementById('h-next').textContent), null, { timeout: 150000 })
  check('walk reaches the last stop', true)
  await shot('09-arrived')
  await page.keyboard.press('Escape'); await page.waitForTimeout(800)
  check('escape leaves the walk', await page.evaluate(() => window.__mw.world.mode === 'orbit'))

  // field guide
  await page.evaluate(() => document.getElementById('b-guide').click()); await page.waitForTimeout(600)
  const guide = await page.textContent('.guide')
  check('guide has timeline, turn-back times and per-leg plan', /Turn back if/.test(guide) && /Back to the start/.test(guide) && /stop 2 by/.test(guide))
  await shot('10-guide')
  await page.evaluate(() => document.getElementById('g-close').click())

  // copy rules
  const text = await page.evaluate(() => document.body.innerText)
  check('no em or en dashes in visible text', !/[–—]/.test(text))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

  // the story: opens on a first visit, draws the globe, and hands over to the planner
  {
    const sp = await browser.newPage({ viewport: { width: 1440, height: 880 } }); sp.setDefaultTimeout(180000)
    const serr = []; sp.on('pageerror', (e) => serr.push(e.message))
    await sp.goto(url.replace('#plan', ''))
    await sp.waitForSelector('#loading', { state: 'detached', timeout: 120000 })
    await sp.waitForSelector('#story', { timeout: 30000 })
    check('first visit opens the story with the globe', await sp.evaluate(() => document.body.classList.contains('story') && !!window.__mw.world.external))
    await sp.evaluate(() => { const s = document.getElementById('st-scroll'); s.scrollTop = s.scrollHeight })
    await sp.waitForTimeout(6000)
    check('the story reaches the terrain and the last chapter', await sp.evaluate(() => !window.__mw.world.external && document.querySelector('.st-rail button[aria-current="true"]')?.dataset.i === '8'))
    await sp.click('#st-go'); await sp.waitForTimeout(1500)
    check('Plan a walk hands over to the planner', await sp.evaluate(() => !document.body.classList.contains('story') && location.hash === '#plan' && !!window.__mw.S.routes.direct[0]))
    await sp.click('#b-story'); await sp.waitForTimeout(800)
    check('the Story button reopens it', await sp.evaluate(() => document.body.classList.contains('story')))
    await sp.keyboard.press('Escape'); await sp.waitForTimeout(800)
    check('Escape leaves the story', await sp.evaluate(() => !document.body.classList.contains('story')))
    check('story: no page errors', serr.length === 0, serr.join(' | '))
    await sp.close()
  }

  // phone and reduced motion
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  phone.setDefaultTimeout(180000)
  const perr = []; phone.on('pageerror', (e) => perr.push(e.message))
  await phone.goto(url); await phone.waitForSelector('#loading', { state: 'detached', timeout: 60000 }); await phone.waitForTimeout(3000)
  check('phone: no horizontal scroll', (await phone.evaluate(() => document.documentElement.scrollWidth)) <= 390)
  check('reduced motion: no title animation', !(await phone.evaluate(() => document.getElementById('title')?.classList.contains('show'))))
  check('phone: routes computed', await phone.evaluate(() => !!window.__mw.S.routes.direct[0]))
  if (shots) { await phone.evaluate(() => document.getElementById('coach-ok')?.click()); await phone.screenshot({ path: path.join(shots, '11-phone.png') }) }
  check('phone: no page errors', perr.length === 0, perr.join(' | '))

  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
