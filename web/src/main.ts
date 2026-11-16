// MARSWALK app: state, panels, timeline, HUD and field guide.
// AI-assisted (Claude Code). Behaviour is described in docs/DESIGN.md.
import './style.css'
import * as THREE from 'three'
import RoutingWorker from './routing.worker?worker&inline'
import { loadSite, type SiteData, type Station } from './data'
import { icon } from './icons'
import {
  analyse, at, astar, bestOrder, clock, compassWord, fmtMin, legs, legOf, lineOfSight, orderMatrix, pairCheck, parseClock, posAtTime,
  retime, round10, sampleTimes, stormNear, sunAt, verdict,
  MARS_MIN, RATE_MSV_PER_DAY, RESERVE_MIN, type Check, type PairCheck, type Params, type Pt, type Route, type SpaceWeather, type Verdict,
} from './model'
import { World } from './world'

type Kind = Route['kind']
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const html = (s: TemplateStringsArray, ...v: unknown[]) => s.reduce((a, b, i) => a + b + (i < v.length ? String(v[i]) : ''), '')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const store = { get(k: string) { try { return localStorage.getItem(k) } catch { return null } }, set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* private mode */ } } }
const MAX_STOPS = 6
const COL = ['#f2662f', '#5fb4ff'] // astronaut A, astronaut B
const WHO = ['A', 'B']

const P: Params = { suit: 0.5, limit: 20, work: 30, depart: 540 }
const S = {
  pts: [] as Pt[], // pts[0] is the start; the rest are stops in order; every walk returns to the start
  who: [] as number[], // in pair mode, which astronaut visits each stop (0 = A, 1 = B); who[0] is unused
  pair: false,
  active: 1, sel: 'direct' as Kind,
  routes: { direct: [], cautious: [] } as Record<Kind, (Route | null)[]>,
  pc: { direct: null, cautious: null } as Record<Kind, PairCheck | null>,
  busy: false, sepLimit: 300, gapLimit: 10,
  tint: true, exag: false, layers: { slope: false, thermal: false, track: false, boundary: true },
  drawer: '' as '' | 'layers' | 'station' | 'sites', station: '', siteFilter: 'all' as 'all' | 'drill' | 'named',
  sw: null as (SpaceWeather & { source: string; live?: boolean }) | null,
}
let D: SiteData, W: World, sunrise = 0, sunset = 0
let worker: Worker | null = null, jobId = 0
const orderJobs = new Map<number, (d: { order: number[]; reachable: boolean }) => void>()

// ---------------------------------------------------------------- shell
document.querySelector('#app')!.innerHTML = html`
  <canvas id="gl" tabindex="0" aria-label="3D view of the boxwork unit on Mount Sharp. Drag to orbit, right-drag or two fingers to pan, scroll to zoom, click the ground to place the selected point, drag a beacon to move it."></canvas>
  <div class="vignette"></div>
  <div class="pins" id="pins"></div>
  <div class="tip" id="tip" hidden></div>
  <div class="loading" id="loading"><b>MARSWALK</b><div class="bar"><i id="load-bar"></i></div><span id="load-msg">Loading terrain and imagery</span></div>
  <div class="title" id="title"><b>MARSWALK</b><span>Boxwork unit, Mount Sharp, Gale crater, Mars</span></div>
`

async function boot() {
  try {
    D = await loadSite((f) => { $('#load-bar').style.width = `${Math.round(f * 80)}%` })
  } catch {
    $('#loading').innerHTML = '<b>MARSWALK</b><span>The site data could not be loaded. Reload the page to try again.</span>'
    return
  }
  $('#load-msg').textContent = 'Shading terrain'
  $('#load-bar').style.width = '90%'
  await new Promise((r) => setTimeout(r, 30))
  try {
    W = new World($('#gl') as HTMLCanvasElement, D)
  } catch {
    $('#loading').innerHTML = '<b>MARSWALK</b><span>This browser could not start 3D graphics (WebGL). Try a current version of Chrome, Edge, Firefox or Safari.</span>'
    return
  }
  sunrise = parseClock(D.conditions.sunrise); sunset = parseClock(D.conditions.sunset)
  S.sw = D.spaceWeather
  buildUI()
  try {
    worker = new RoutingWorker()
    worker.postMessage({ init: true, elev: D.grid.elev, slope: D.grid.slope, cols: D.grid.cols, rows: D.grid.rows, cell: D.grid.cell })
    worker.onmessage = (e) => {
      const d = e.data
      if ('order' in d) { orderJobs.get(d.id)?.(d); orderJobs.delete(d.id) } else onSolved(d)
    }
    worker.onerror = () => { worker = null; if (S.busy) recompute(pendingOpts) }
  } catch { worker = null }
  // Default walk: from the Altadena drill site at the edge of the boxwork to the hollow
  // and the ridge Curiosity drilled as a pair in late 2025, and back.
  setPlan(PRESETS[0], false)
  W.setDepart(P.depart)
  W.onRender = drawOverlay
  W.onPick = onPick
  W.onCine = onWalkFrame
  W.onCineEnd = onWalkEnd
  W.onStopReached = onStopReached
  W.onHover = onHover
  W.onHoverEnd = () => ($('#tip').hidden = true)
  W.dragTest = dragTest
  W.onDrag = onDrag
  W.onUserMove = () => { if (S.drawer === 'station') closeDrawer() }
  W.onContextLost = () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="fatal surface" style="z-index:30;background:var(--bg)"><b>The graphics were reset by the browser.</b><span class="muted">This can happen when a laptop sleeps or the GPU is busy.</span><button class="btn primary" onclick="location.reload()">Reload MARSWALK</button></div>')
  }
  W.setPose({ target: new THREE.Vector3(0, 0, 0), dist: 9200, yaw: 0.25, pitch: 1.18 })
  $('#loading').classList.add('done')
  setTimeout(() => $('#loading').remove(), 700)
  if (!reduce) $('#title').classList.add('show')
  renderAll()
  recompute({ fit: true, delay: reduce ? 0 : 900, ms: reduce ? 0 : 4600, first: true })
  refreshSpaceWeather()
}

// ---------------------------------------------------------------- ready-made plans
interface Preset { name: string; what: string; start: string; stops: string[]; who?: number[] }
const PRESETS: Preset[] = [
  { name: 'Hollow and ridge', what: 'From the Altadena drill site to the hollow and the ridge Curiosity drilled as a pair', start: 'c4560', stops: ['c4687', 'c4711'] },
  { name: 'Pair: split the hollows', what: 'Two astronauts split four sites around Monte Grande, one each side, and stay in reach of each other', start: 'c4680', stops: ['c4813', 'c4741', 'c4823', 'c4655'], who: [0, 1, 0, 1] },
  { name: 'Sulfate drill sites', what: 'Over the southern contact to the Atacama and Campo Marte drill sites', start: 'c4845', stops: ['c4868', 'c4893'] },
  { name: 'Across the boxwork', what: 'A long day: Altadena, the Laguna hollows and the southern contact', start: 'c4560', stops: ['c4673', 'c4845'] },
]
function setPlan(p: Preset, go = true) {
  const pt = (id: string) => { const s = byId(id)!; return snap({ x: s.xy[0], y: s.xy[1] }) ?? { x: s.xy[0], y: s.xy[1] } }
  S.pts = [p.start, ...p.stops].map((id) => { const q = pt(id); return { x: q.x, y: q.y } })
  S.pair = !!p.who
  S.who = [0, ...(p.who ?? p.stops.map(() => 0))]
  S.active = 1
  if (go) { closeDrawer(); dismissCoach(); recompute({ fit: true, note: `${p.name}: ${p.what}.` }) }
}

// ---------------------------------------------------------------- space weather
// The build carries a snapshot from NASA DONKI. When the page is online and hosted,
// it asks DONKI for the latest model runs too. Failure is fine: the snapshot stays.
async function refreshSpaceWeather() {
  if (location.protocol === 'file:' || !navigator.onLine) return
  const end = new Date(), start = new Date(end.getTime() - 10 * 864e5), day = (d: Date) => d.toISOString().slice(0, 10)
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000)
    const res = await fetch(`https://api.nasa.gov/DONKI/WSAEnlilSimulations?startDate=${day(start)}&endDate=${day(end)}&api_key=DEMO_KEY`, { signal: ctl.signal })
    clearTimeout(timer)
    if (!res.ok) return
    const sims = (await res.json()) as { impactList?: { location?: string; arrivalTime?: string; isGlancingBlow?: boolean }[] }[]
    const seen = new Map<string, boolean>()
    for (const s of sims) for (const i of s.impactList ?? []) if (i.location === 'Mars' && i.arrivalTime) seen.set(i.arrivalTime, !!i.isGlancingBlow)
    const fresh = [...seen].map(([time, glancing]) => ({ time, glancing }))
    const old = (S.sw?.marsArrivals ?? []).filter((a) => !seen.has(a.time))
    S.sw = { ...S.sw!, marsArrivals: [...old, ...fresh].sort((a, b) => a.time.localeCompare(b.time)), checked: end.toISOString().slice(0, 16) + 'Z', live: true }
    renderDecision(); renderSpace()
  } catch { /* offline or rate limited: keep the snapshot */ }
}
function spaceSummary() {
  const sw = S.sw
  if (!sw) return { text: 'No space weather data in this build.', state: 'info' as const }
  const now = Date.now(), soon = sw.marsArrivals.map((a) => ({ ...a, ms: Date.parse(a.time) })).filter((a) => a.ms > now - 864e5).sort((a, b) => a.ms - b.ms)[0]
  const last = sw.marsArrivals.map((a) => ({ ...a, ms: Date.parse(a.time) })).filter((a) => a.ms <= now).sort((a, b) => b.ms - a.ms)[0]
  const near = stormNear(sw, new Date().toISOString())
  if (near) return { text: near, state: 'warn' as const }
  if (soon) return { text: `Next modelled solar storm at Mars: ${fmtUtc(soon.time)}${soon.glancing ? ', a glancing blow' : ''}.`, state: 'info' as const }
  return { text: last ? `No solar storm modelled to reach Mars soon. Last modelled arrival ${fmtUtc(last.time)}.` : 'No solar storm modelled to reach Mars in this period.', state: 'ok' as const }
}
const fmtUtc = (iso: string) => iso.replace('T', ' ').replace(/:00Z$|Z$/, '') + ' UTC'

// ---------------------------------------------------------------- walkers
const walkers = () => (S.pair ? [0, 1] : [0])
/** Indices into S.pts of the stops one astronaut visits, in order. */
const stopsOf = (w: number) => S.pts.map((_, i) => i).filter((i) => i > 0 && (!S.pair || S.who[i] === w))
const walkerOf = (i: number) => (S.pair ? S.who[i] ?? 0 : 0)
const cur = () => S.routes[S.sel]
const ready = (k: Kind = S.sel) => S.routes[k].length > 0 && S.routes[k].every(Boolean)
/** Whole-team figures for a profile: the longest walk sets the time; distance is everyone's total. */
function agg(k: Kind) {
  if (!ready(k)) return null
  const rs = S.routes[k] as Route[], dist = rs.reduce((a, r) => a + r.dist, 0)
  return {
    walk: Math.max(...rs.map((r) => r.walk)), dist, climb: Math.max(...rs.map((r) => r.climb)),
    over10: rs.reduce((a, r) => a + r.over10 * r.dist, 0) / Math.max(1, dist), maxSlope: Math.max(...rs.map((r) => r.maxSlope)),
    dose: Math.max(...rs.map((r) => r.dose)), backMin: Math.max(...rs.map((r) => r.backMin)),
  }
}
/** Planned minutes for the leg that ends at stop i, from that astronaut's walk. */
function legTo(i: number) {
  const w = walkerOf(i), r = cur()[w]
  return r ? r.legMin[stopsOf(w).indexOf(i)] : null
}

// ---------------------------------------------------------------- routing
function snap(p: Pt): (Pt & { moved?: boolean }) | null {
  const { cols, rows, slope } = D.grid
  const x0 = Math.max(0, Math.min(cols - 1, Math.round(p.x))), y0 = Math.max(0, Math.min(rows - 1, Math.round(p.y)))
  if (slope[y0 * cols + x0] <= P.limit) return { x: x0, y: y0 }
  for (let r = 1; r <= 15; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const x = x0 + dx, y = y0 + dy
    if (x >= 0 && y >= 0 && x < cols && y < rows && slope[y * cols + x] <= P.limit) return { x, y, moved: true }
  }
  return null
}
const idx = (p: Pt) => Math.round(p.y) * D.grid.cols + Math.round(p.x)
const pointColors = () => S.pts.map((_, i) => (i === 0 ? 0xf4f1ec : S.pair && S.who[i] === 1 ? 0x5fb4ff : 0xf2662f))
type Snapshot = { pts: Pt[]; who: number[]; routes: Record<Kind, (Route | null)[]>; pc: Record<Kind, PairCheck | null> }
let pendingOpts: { fit: boolean; delay?: number; ms?: number; first?: boolean; note?: string; was?: number; prev?: Snapshot } = { fit: false }
function recompute(opts: typeof pendingOpts) {
  pendingOpts = opts
  S.busy = true
  renderDecision()
  W.setPoints(S.pts, pointColors())
  const job = { id: ++jobId, walks: walkers().map((w) => [0, ...stopsOf(w), 0].map((i) => idx(S.pts[i]))), limit: P.limit, suit: P.suit }
  if (worker) worker.postMessage(job)
  else setTimeout(() => {
    if (job.id !== jobId) return
    const g = D.grid, solve = (c: boolean) => job.walks.map((pts) => pts.slice(0, -1).map((s, i) => astar(g.elev, g.slope, g.cols, g.rows, g.cell, s, pts[i + 1], job.limit, job.suit, c)))
    onSolved({ id: job.id, direct: solve(false), cautious: solve(true) })
  }, 20)
}
function onSolved(r: { id: number; direct: (Int32Array | null)[][]; cautious: (Int32Array | null)[][] }) {
  if (r.id !== jobId) return
  S.busy = false
  for (const k of ['direct', 'cautious'] as const) S.routes[k] = r[k].map((l) => analyse(D.grid, l, k, P))
  const o = pendingOpts
  // the order search times grid paths; after smoothing a new order can come out a little slower, so keep the old one then
  if (o.prev && o.was !== undefined && (!ready(S.sel) || agg(S.sel)!.walk >= o.was - 0.05)) {
    Object.assign(S, { pts: o.prev.pts, who: o.prev.who, routes: o.prev.routes, pc: o.prev.pc })
    W.setPoints(S.pts, pointColors()); W.setRoutes(S.routes, S.sel, false); renderAll()
    hint('This is already the quickest order.')
    return
  }
  if (!ready(S.sel)) S.sel = 'direct'
  updatePairChecks()
  W.setRoutes(S.routes, S.sel, !o.first)
  renderAll()
  if (!ready('direct')) {
    const w = r.direct.findIndex((legs) => legs.some((l) => !l)), bad = r.direct[w].findIndex((l) => !l)
    hint(`No walkable route for ${legName(w, bad)} under the ${P.limit}° limit. Move that point, or raise the limit under Assumptions.`, true)
  } else if (o.was !== undefined) {
    const now = agg(S.sel)!.walk
    hint(`New order: ${S.pair ? 'longest walk' : 'whole walk'} ${fmtMin(now)}, ${now < o.was - 0.5 ? `${fmtMin(o.was - now)} quicker` : 'slightly quicker'}.`)
  } else hint(o.note ?? `Click the ground to move ${pointName(S.active).toLowerCase()}, or drag any beacon.`)
  if (o.fit) setTimeout(() => W.flyTo(routePose(), o.ms ?? 1300), o.delay ?? 0)
  if (o.first) setTimeout(showCoach, reduce ? 0 : 5200)
}
function updatePairChecks() {
  for (const k of ['direct', 'cautious'] as const) {
    const [a, b] = S.routes[k]
    S.pc[k] = S.pair && a && b ? pairCheck(D.grid, a, b, P, S.sepLimit) : null
  }
}
function routePose() {
  const pts: THREE.Vector3[] = S.pts.map((q) => W.cellToWorld(q))
  for (const r of cur()) if (r) for (let i = 0; i < r.xs.length; i += 12) pts.push(W.cellToWorld({ x: r.xs[i], y: r.ys[i] }))
  return W.frame(pts, innerWidth > 900 ? 400 : 0, innerWidth > 900 ? 0 : innerHeight * 0.5)
}
function reanalyse() {
  for (const k of ['direct', 'cautious'] as const) S.routes[k] = S.routes[k].map((r) => (r ? retime(r, P) : null))
  updatePairChecks()
  renderAll()
}
function onPick(cx: number, cy: number, inside: boolean) {
  if (pickRouteLine()) return
  if (!inside) return hint(cx < 0 ? 'That is beyond the mapped area.' : 'That point is outside the 1.4 km planning area. The land around it is shown for context only.', true)
  const p = snap({ x: cx, y: cy })
  if (!p) return hint(`That ground is steeper than the ${P.limit}° limit, with nothing walkable within 30 m. Pick another point or raise the limit under Assumptions.`, true)
  S.pts[S.active] = { x: p.x, y: p.y }
  dismissCoach()
  recompute({ fit: false, note: p.moved ? 'Moved to the nearest walkable ground.' : undefined })
}
const pointName = (i: number) => (i === 0 ? 'The start' : `Stop ${i}`)
function legName(w: number, leg: number) {
  const st = stopsOf(w), who = S.pair ? `astronaut ${WHO[w]}'s ` : ''
  if (leg >= st.length) return `${who}walk back to the start`
  return leg === 0 ? `${who}leg to stop ${st[0]}` : `${who}leg from stop ${st[leg - 1]} to stop ${st[leg]}`
}

// ---------------------------------------------------------------- planning helpers
function optimiseOrder() {
  const a = agg(S.sel)
  if (!a) return
  const prev: Snapshot = { pts: S.pts.map((p) => ({ ...p })), who: [...S.who], routes: { ...S.routes }, pc: { ...S.pc } }
  const ws = walkers().filter((w) => stopsOf(w).length > 1)
  if (!ws.length) return hint('With one stop per astronaut there is only one order.')
  hint('Finding the quickest order...')
  let left = ws.length
  const results = new Map<number, number[]>()
  const done = () => {
    for (const [w, order] of results) {
      const slots = stopsOf(w), pts = slots.map((i) => S.pts[i])
      order.forEach((o, j) => (S.pts[slots[j]] = pts[o - 1]))
    }
    recompute({ fit: false, was: a.walk, prev })
  }
  for (const w of ws) {
    const pts = [0, ...stopsOf(w)].map((i) => idx(S.pts[i])), id = ++jobId + 1e6
    const cb = (d: { order: number[]; reachable: boolean }) => { results.set(w, d.order); if (--left === 0) done() }
    if (worker) { orderJobs.set(id, cb); worker.postMessage({ id, order: pts, limit: P.limit, suit: P.suit, cautious: S.sel === 'cautious' }) }
    else setTimeout(() => cb({ order: bestOrder(orderMatrix(D.grid, pts, P.limit, P.suit, S.sel === 'cautious')), reachable: true }), 20)
  }
}
function setPair(on: boolean) {
  if (on === S.pair) return
  S.pair = on
  if (on) {
    // each astronaut needs at least one stop: add the nearest science site if there is only one
    if (S.pts.length < 3) {
      const last = S.pts[S.pts.length - 1]
      const near = D.stations.filter((s) => s.kind !== 'stop' && Math.hypot(s.xy[0] - last.x, s.xy[1] - last.y) > 6)
        .sort((a, b) => Math.hypot(a.xy[0] - last.x, a.xy[1] - last.y) - Math.hypot(b.xy[0] - last.x, b.xy[1] - last.y))[0]
      const p = near && snap({ x: near.xy[0], y: near.xy[1] })
      if (p) S.pts.push({ x: p.x, y: p.y })
    }
    S.who = S.pts.map((_, i) => (i === 0 ? 0 : (i - 1) % 2))
  }
  S.active = Math.min(S.active, S.pts.length - 1) || 1
  recompute({ fit: true, note: on ? 'Two astronauts. Stops alternate between A (orange) and B (blue); click A or B next to a stop to swap.' : 'One astronaut visits every stop.' })
}
function toggleWho(i: number) {
  const w = S.who[i], other = 1 - w
  if (stopsOf(w).length <= 1) return hint(`Astronaut ${WHO[w]} needs at least one stop. Add another stop first.`, true)
  S.who[i] = other
  recompute({ fit: false, note: `Stop ${i} now belongs to astronaut ${WHO[other]}.` })
}

// ---------------------------------------------------------------- UI shell
function buildUI() {
  const c = D.conditions
  document.body.insertAdjacentHTML('beforeend', html`
  <header class="topbar">
    <span class="wordmark">MARSWALK</span>
    <div class="place"><b>Boxwork unit, Mount Sharp</b><span>Gale crater, 4.80° S 137.38° E</span></div>
    <div class="right">
      <span class="stamp">Weather: sol ${c.sol}, ${c.terrestrial_date}</span>
      <button class="btn" id="b-sites" aria-pressed="false">${icon.Images}<span>Science sites</span></button>
      <button class="btn" id="b-layers" aria-pressed="false">${icon.Stack}<span>Data layers</span></button>
      <button class="btn" id="b-guide">${icon.FileText}<span>Field guide</span></button>
    </div>
  </header>

  <aside class="rail surface" aria-label="Plan a walk">
    <div class="scroll">
      <section class="sec">
        <div class="sec-h"><h2>Science walk</h2>
          <div class="seg" role="group" aria-label="Who walks">
            <button id="m-solo" aria-pressed="true">${icon.User}<span>Solo</span></button>
            <button id="m-pair" aria-pressed="false">${icon.Users}<span>Pair</span></button>
          </div>
        </div>
        <ol class="itin" id="itin"></ol>
        <p class="edit-hint" id="edit-hint"></p>
        <div class="plans"><span>Ready-made plans</span><div id="plans"></div></div>
      </section>

      <section class="sec" aria-live="polite">
        <div class="decision" id="decision"></div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>Route</h2><span class="aside" id="limit-line"></span></div>
        <div class="options" id="options"></div>
        <p class="compare" id="compare"></p>
      </section>

      <section class="sec pair-sec" id="pair-sec" hidden>
        <div class="sec-h"><h2>Working in pairs</h2><span class="aside" id="pair-line"></span></div>
        <div id="pair"></div>
      </section>

      <section class="sec">
        <div class="actions" id="actions"></div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>Space weather at Mars</h2><span class="aside" id="sw-src"></span></div>
        <div class="space" id="space"></div>
      </section>

      <section class="sec">
        <details class="assume">
          <summary>Assumptions${icon.CaretDown}</summary>
          <div class="field"><label for="in-suit">Suit and load, share of normal walking speed</label><output id="o-suit"></output>
            <input type="range" id="in-suit" min="0.3" max="0.8" step="0.05" value="0.5"></div>
          <div class="field"><label for="in-limit">Steepest ground allowed</label><output id="o-limit"></output>
            <input type="range" id="in-limit" min="12" max="30" step="1" value="20"></div>
          <div class="field"><label for="in-work">Time at each stop</label><output id="o-work"></output>
            <input type="range" id="in-work" min="0" max="120" step="10" value="30"></div>
          <div class="field"><label for="in-sep">Pairs: furthest apart</label><output id="o-sep"></output>
            <input type="range" id="in-sep" min="100" max="800" step="50" value="300"></div>
          <div class="field"><label for="in-gap">Pairs: longest out of sight</label><output id="o-gap"></output>
            <input type="range" id="in-gap" min="0" max="40" step="5" value="10"></div>
          <p class="fine">The team's planning assumptions, not NASA limits. At 50%, flat-ground speed is 2.5 km/h, the figure NASA used for sustained suited walking on the Moon. The pair limits stand in for radio range and the buddy rule of keeping your partner in view. Routes recompute when you change these.</p>
        </details>
      </section>
    </div>
  </aside>

  <section class="day surface" aria-label="Daylight">
    <div class="day-h"><b>Daylight</b><span id="day-sun"></span><span class="r" id="day-note">Drag the walk to change when you leave</span></div>
    <svg id="day" viewBox="0 0 1000 64" preserveAspectRatio="none" role="slider" tabindex="0" aria-label="Departure time" aria-valuemin="346" aria-valuemax="1150"></svg>
  </section>

  <div class="gobar" id="gobar">
    <div class="gobar-in surface">
      <div class="seg route-pick" id="route-pick" role="group" aria-label="Route"></div>
      <div class="go-walk" id="go-walk"></div>
    </div>
  </div>

  <div class="tools surface" role="group" aria-label="View">
    <button class="icon-btn" id="z-in" aria-label="Zoom in" title="Zoom in">${icon.Plus}</button>
    <button class="icon-btn" id="z-out" aria-label="Zoom out" title="Zoom out">${icon.Minus}</button>
    <button class="icon-btn" id="z-fit" aria-label="Frame the route" title="Frame the route">${icon.CornersOut}</button>
    <button class="icon-btn" id="z-north" aria-label="Face north" title="Face north">${icon.NavigationArrow}</button>
  </div>

  <div class="mini surface"><canvas id="mini" width="440" height="476" aria-label="Map of the planning area. Click to look at a point."></canvas><p><span>Planning area</span><span>1.4 × 1.5 km</span></p></div>

  <div class="hint surface" id="hint" role="status" hidden></div>
  <div class="drawer surface" id="drawer" hidden></div>
  <div class="coach surface" id="coach" hidden>
    <h2>Plan a science walk on Mars</h2>
    <ol>
      <li><span><b>Pick the stops.</b> Click the ground, drag a beacon, or add one of ${D.stations.length} places Curiosity worked from <b>Science sites</b>.</span></li>
      <li><span><b>Read the call</b> and compare the two routes. Switch to <b>Pair</b> to split the stops between two astronauts.</span></li>
      <li><span><b>Walk it</b> at eye level, then open the field guide.</span></li>
    </ol>
    <button class="btn primary" id="coach-ok" style="width:100%">Start planning</button>
  </div>

  <div class="hud" id="hud" hidden>
    <div class="helmet" aria-hidden="true"><i class="glass"></i><i class="brim"></i><i class="glare"></i><i class="rim"></i><i class="reticle"></i></div>
    <div class="frame"></div>
    <div class="mode" id="hud-mode"></div>
    <div class="compass" aria-hidden="true"><div class="strip" id="strip"></div></div>
    <div class="ctl">
      <div class="speed">
        <div class="seg speeds" role="group" aria-label="Playback speed">
          <button data-v="0.5">½×</button><button data-v="1" aria-pressed="true">1×</button><button data-v="4">4×</button>
        </div>
        <input type="range" id="h-rate" min="0" max="100" step="1" aria-label="Playback speed, from a quarter to eight times">
        <output id="h-speed"></output>
      </div>
      <button class="btn" id="h-helmet" aria-pressed="false" title="Helmet view (H)">${icon.Eye}<span>Helmet</span></button>
      <button class="btn" id="h-pause">${icon.Pause}<span>Pause</span></button><button class="btn" id="h-exit">${icon.X}<span>Exit</span></button>
    </div>
    <div class="readouts">
      <div class="next" id="h-next"></div>
      <div class="row">
        <div>Next stop<b id="h-stop"></b><small id="h-stop2"></small></div>
        <div>Time left<b id="h-left"></b><small>until back at the start</small></div>
        <div>Back by<b id="h-back"></b><small id="h-clock"></small></div>
        <div>Ground<b id="h-slope"></b><small id="h-slope2"></small></div>
        <div id="h-partner-c" hidden>Partner<b id="h-partner"></b><small id="h-partner2"></small></div>
      </div>
      <svg id="h-prof" viewBox="0 0 1000 46" preserveAspectRatio="none" role="slider" aria-label="Position along the walk. Click to jump."></svg>
    </div>
    <div class="arrive surface" id="arrive" hidden></div>
  </div>
  <div id="guide-root"></div>
  `)
  $('#plans').innerHTML = PRESETS.map((p, i) => `<button class="chip" data-i="${i}" title="${p.what}">${p.who ? icon.Users : icon.Path}<span>${p.name}</span></button>`).join('')
  $('#plans').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('.chip'); if (b) setPlan(PRESETS[Number(b.dataset.i)]) })
  $('#pins').innerHTML = D.stations.map((s) => s.kind === 'stop'
    ? html`<button class="pin dot" data-id="${s.id}" style="visibility:hidden" aria-label="${siteName(s)}" title="${siteName(s)}"></button>`
    : html`<button class="pin" data-id="${s.id}" style="visibility:hidden"><i class="k ${s.kind}"></i>${shortName(s)}</button>`).join('') + '<div id="tags"></div><span class="tag dest ptag" id="ptag" hidden></span>'
  $('#pins').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pin, .tag')
    if (!b) return
    if (b.classList.contains('pin')) return openStation(b.dataset.id!)
    setActive(Number(b.dataset.i))
  })
  $('#itin').addEventListener('click', (e) => {
    const t = e.target as HTMLElement, row = t.closest<HTMLElement>('[data-i]')
    if (t.closest('.rm')) { removeStop(Number(row!.dataset.i)); return }
    if (t.closest('.who')) { toggleWho(Number(row!.dataset.i)); return }
    if (t.closest('#add-stop')) { addStop(); return }
    if (t.closest('#opt')) { optimiseOrder(); return }
    if (t.closest('#rev')) { const st = S.pts[0]; S.pts = [st, ...S.pts.slice(1).reverse()]; S.who = [0, ...S.who.slice(1).reverse()]; recompute({ fit: false }); return }
    if (row) setActive(Number(row.dataset.i))
  })
  $('#m-solo').onclick = () => setPair(false)
  $('#m-pair').onclick = () => setPair(true)
  $('#actions').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!b) return
    if (b.id === 'b-guide2') openGuide()
  })
  $('#b-guide').onclick = openGuide
  $('#b-layers').onclick = () => (S.drawer === 'layers' ? closeDrawer() : openLayers())
  $('#b-sites').onclick = () => (S.drawer === 'sites' ? closeDrawer() : openSites())
  $('#z-in').onclick = () => W.zoom(1 / 1.4)
  $('#z-out').onclick = () => W.zoom(1.4)
  $('#z-fit').onclick = () => W.flyTo(routePose(), 1100)
  $('#z-north').onclick = () => W.faceNorth()
  $('#coach-ok').onclick = dismissCoach
  $('#h-exit').onclick = stopWalk
  $('#h-pause').onclick = () => setPaused(W.pauseWalk())
  $('#hud').querySelector('.speeds')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (b) setSpeed(Number(b.dataset.v))
  })
  // the slider is logarithmic: a quarter speed to eight times
  $('#h-rate').addEventListener('input', (e) => setSpeed(0.25 * Math.pow(2, (Number((e.target as HTMLInputElement).value) / 100) * 5)))
  $('#h-helmet').onclick = () => setHelmet(!helmet)
  $('#gobar').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!b) return
    if (b.dataset.walk) startWalk(Number(b.dataset.walk))
    if (b.dataset.k) selectKind(b.dataset.k as Kind)
  })
  ;($('#gl') as HTMLCanvasElement).addEventListener('pointerdown', (e) => (lastDown = { x: e.clientX, y: e.clientY }))
  $('#h-prof').addEventListener('pointerdown', (e) => {
    const b = $('#h-prof').getBoundingClientRect()
    W.seekWalk(((e.clientX - b.left) / b.width) * walkEnd)
    $('#arrive').hidden = true
  })
  const bind = (id: string, f: (v: number) => void, slow: boolean) => {
    let t = 0
    $(id).addEventListener('input', (e) => { const v = Number((e.target as HTMLInputElement).value); f(v); renderAssumptions(); if (slow) { clearTimeout(t); t = window.setTimeout(() => recompute({ fit: false }), 220) } else reanalyse() })
  }
  bind('#in-suit', (v) => (P.suit = v), true)
  bind('#in-limit', (v) => { P.limit = v; W.paintSlope(v); S.pts = S.pts.map((q) => { const p = snap(q); return p ? { x: p.x, y: p.y } : q }) }, true)
  bind('#in-work', (v) => (P.work = v), false)
  bind('#in-sep', (v) => (S.sepLimit = v), false)
  bind('#in-gap', (v) => (S.gapLimit = v), false)
  bindDay()
  bindMini()
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (W.mode !== 'orbit') stopWalk(); else if ($('#guide-root').firstChild) closeGuide(); else closeDrawer() }
    if (e.key === ' ' && W.mode !== 'orbit') { e.preventDefault(); $('#h-pause').click() }
    const typing = (e.target as HTMLElement).closest('input, textarea, select')
    if (!typing && (e.key === 'h' || e.key === 'H') && W.mode !== 'orbit') setHelmet(!helmet)
    if (!typing && (e.key === 'w' || e.key === 'W') && W.mode === 'orbit' && ready() && !$('#guide-root').firstChild) startWalk(0)
  })
}
const byId = (id: string) => D.stations.find((s) => s.id === id)
const shortName = (s: Station) => (s.kind === 'stop' ? `Sol ${s.sols[0]} stop` : s.name.replace(/ \(.*/, ''))
const siteName = (s: Station) => (s.kind === 'stop' ? `Curiosity's sol ${s.sols[0]} stop` : s.name)
function nearStation(p: Pt) {
  // prefer a named or drill site when several stops are close together
  const d = (s: Station) => Math.hypot(s.xy[0] - p.x, s.xy[1] - p.y)
  const near = D.stations.filter((s) => d(s) < 3.5).sort((a, b) => d(a) - d(b))
  return near.find((s) => s.kind !== 'stop') ?? near[0]
}
function lonlat(p: Pt) {
  const b = D.bounds, lon = b.west + ((p.x + 0.5) / D.grid.cols) * (b.east - b.west), lat = b.north - ((p.y + 0.5) / D.grid.rows) * (b.north - b.south)
  return `${Math.abs(lat).toFixed(4)}° S ${lon.toFixed(4)}° E`
}
const label = (p: Pt) => { const s = nearStation(p); return s ? shortName(s) : lonlat(p) }
function setActive(i: number) { S.active = i; renderItin(); hint(`Click the ground, or a science site, to move ${pointName(i).toLowerCase()}.`) }
function addStop(at?: Pt) {
  if (S.pts.length - 1 >= MAX_STOPS) return hint(`Up to ${MAX_STOPS} stops per walk.`, true)
  const last = S.pts[S.pts.length - 1]
  S.pts.push(at ? { ...at } : { ...last })
  // in pair mode a new stop goes to whoever has fewer
  S.who.push(S.pair ? (stopsOf(0).length > stopsOf(1).length ? 1 : 0) : 0)
  S.active = S.pts.length - 1
  if (at) { recompute({ fit: true }); return }
  renderItin()
  hint(`Click the ground or a science site to place stop ${S.active}.`)
}
function removeStop(i: number) {
  if (S.pts.length <= 2 || i === 0) return
  if (S.pair && stopsOf(S.who[i]).length <= 1) return hint(`That is astronaut ${WHO[S.who[i]]}'s only stop. Give them another first, or switch to Solo.`, true)
  S.pts.splice(i, 1); S.who.splice(i, 1)
  S.active = Math.min(S.active, S.pts.length - 1) || 1
  recompute({ fit: false })
}

// ---------------------------------------------------------------- dragging beacons, hover readout
let dragFrom: Pt | null = null
function dragTest(cx: number, cy: number) {
  const b = ($('#gl') as HTMLCanvasElement).getBoundingClientRect(), x = cx - b.left, y = cy - b.top
  let best = -1, bestD = 18
  S.pts.forEach((p, i) => {
    const a = W.project(W.cellToWorld(p, 0)), t = W.project(W.cellToWorld(p, 40))
    if (!a.on) return
    // distance from the cursor to the beacon's column on screen
    const vx = t.x - a.x, vy = t.y - a.y, L = vx * vx + vy * vy || 1, k = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L))
    const d = Math.hypot(x - a.x - k * vx, y - a.y - k * vy)
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}
function onDrag(i: number, cx: number, cy: number, done: boolean) {
  if (cx === -2) { setActive(i); return } // a tap on a beacon selects it
  if (!dragFrom) dragFrom = { ...S.pts[i] }
  if (cx < 0) { S.pts[i] = dragFrom; dragFrom = null; W.setPoints(S.pts, pointColors()); hint('Dropped outside the planning area, so the point stays where it was.', true); return }
  const p = snap({ x: cx, y: cy })
  if (p) { S.pts[i] = { x: p.x, y: p.y }; W.setPoints(S.pts, pointColors()); S.active = i }
  if (done) { dragFrom = null; dismissCoach(); recompute({ fit: false, note: p?.moved ? 'Moved to the nearest walkable ground.' : undefined }) }
  else { renderTags(); $('#tip').hidden = true }
}
function onHover(cx: number, cy: number, clientX: number, clientY: number, inside: boolean) {
  const tip = $('#tip')
  if (!inside) tip.innerHTML = '<span class="muted">Outside the planning area: shown for context only</span>'
  else {
    const g = D.grid, i = Math.round(cy) * g.cols + Math.round(cx), sl = g.slope[i], dz = g.elev[i] - g.elev[idx(S.pts[0])]
    const st = nearStation({ x: cx, y: cy })
    const state = sl > P.limit ? `<span class="bad">Too steep to walk</span>` : sl > 15 ? '<span class="warn">Steep: slow going</span>' : sl > 10 ? 'Moderate slope' : 'Easy ground'
    tip.innerHTML = `${st ? `<b>${siteName(st)}</b>` : ''}<span>${state}</span><span class="mono">${Math.round(sl)}° slope, ${dz >= 0 ? '+' : ''}${Math.round(dz)} m vs start</span><span class="muted">Click to set ${pointName(S.active).toLowerCase()}</span>`
  }
  tip.hidden = false
  const w = tip.offsetWidth, h = tip.offsetHeight
  tip.style.transform = `translate(${Math.min(innerWidth - w - 8, clientX + 16)}px, ${Math.max(8, clientY - h - 12)}px)`
}

// ---------------------------------------------------------------- rendering the panel
function renderAll() { renderItin(); renderDecision(); renderOptions(); renderPair(); renderActions(); renderAssumptions(); renderDay(); renderSpace(); if (S.drawer === 'layers') openLayers(); if (S.drawer === 'sites') openSites() }
function renderItin() {
  const n = S.pts.length
  $('#m-solo').setAttribute('aria-pressed', String(!S.pair)); $('#m-pair').setAttribute('aria-pressed', String(S.pair))
  const row = (i: number) => {
    const p = S.pts[i], m = i > 0 ? legTo(i) : null, w = walkerOf(i)
    return html`<li class="stop ${S.active === i ? 'on' : ''}" data-i="${i}">
      <i class="${i === 0 ? 's' : `d ${S.pair && w ? 'b' : ''}`}">${i === 0 ? '' : i}</i>
      <button class="end" aria-pressed="${S.active === i}"><small>${i === 0 ? 'Start' : `Stop ${i}`}${m !== null ? ` <span class="mono">${fmtMin(m)} walk</span>` : ''}</small><strong>${label(p)}</strong></button>
      ${S.pair && i > 0 ? `<button class="who ${w ? 'b' : ''}" title="Visited by astronaut ${WHO[w]}. Click to give it to ${WHO[1 - w]}." aria-label="Stop ${i} visited by astronaut ${WHO[w]}; switch">${WHO[w]}</button>` : '<span></span>'}
      ${i > 0 && n > 2 ? `<button class="icon-btn rm" aria-label="Remove stop ${i}" title="Remove stop ${i}">${icon.X}</button>` : '<span></span>'}
    </li>`
  }
  const back = walkers().map((w) => { const r = cur()[w]; return r ? `${S.pair ? `${WHO[w]} ` : ''}${fmtMin(r.backMin)}` : '' }).filter(Boolean).join(', ')
  $('#itin').className = `itin ${S.pair ? 'paired' : ''}`
  $('#itin').innerHTML = S.pts.map((_, i) => row(i)).join('') + html`
    <li class="stop back"><i class="s"></i><span class="end"><small>Back to the start${back ? ` <span class="mono">${back} walk</span>` : ''}</small><strong>${label(S.pts[0])}</strong></span><span></span><span></span></li>
    <li class="itin-actions">${n - 1 < MAX_STOPS ? `<button class="btn" id="add-stop">${icon.Plus}<span>Add a stop</span></button>` : ''}${n > 3 ? `<button class="btn" id="opt" title="Reorder the stops for the least walking">${icon.Shuffle}<span>Quickest order</span></button>` : ''}${n > 2 ? `<button class="btn" id="rev" aria-label="Reverse the stops" title="Reverse the stops">${icon.ArrowsDownUp}</button>` : ''}</li>`
  $('#edit-hint').innerHTML = `${icon.Crosshair}<span>Click the ground to set <b>${pointName(S.active).toLowerCase()}</b>, or drag any beacon. Hover to read the slope.</span>`
  renderTags()
}
function renderTags() {
  $('#tags').innerHTML = S.pts.map((p, i) => { const s = nearStation(p); return `<button class="tag ${i ? 'dest' : ''} ${S.pair && i && S.who[i] ? 'b' : ''}" data-i="${i}">${i ? `${S.pair ? WHO[S.who[i]] : ''}${i}` : 'START'}${s ? ` ${shortName(s)}` : ''}</button>` }).join('')
}
function currentVerdict(): Verdict {
  const pc = S.pc[S.sel]
  return verdict(S.pair ? cur() : cur()[0] ?? null, P, sunrise, sunset, S.sw, new Date().toISOString(), S.pair && pc ? { check: pc, sepLimit: S.sepLimit, gapLimit: S.gapLimit } : undefined)
}
const checkIcon = (c: Check) => (c.state === 'bad' || c.state === 'warn' ? icon.WarningCircle : c.state === 'ok' ? icon.CheckCircle : icon.Info)
function renderDecision() {
  const el = $('#decision')
  if (S.busy) { el.className = 'decision'; el.innerHTML = '<div class="call-row"><span class="call" style="color:var(--ink-3)">...</span><div><strong>Computing routes</strong><span>Searching about 550,000 cells of terrain for each leg</span></div></div>'; return }
  const a = agg(S.sel), v = currentVerdict(), n = S.pts.length - 1
  el.className = `decision ${v.go ? 'go' : 'nogo'}`
  el.innerHTML = html`
    <div class="call-row"><span class="call">${v.go ? 'GO' : 'NO-GO'}</span><div><strong>${v.head}</strong><span>${a ? `Leaving at ${clock(P.depart)} local time, ${n} stop${n > 1 ? 's' : ''}${S.pair ? ', two astronauts' : ''}` : 'Change the points or the limit'}</span></div></div>
    ${a ? html`<div class="figures">
      <div><small>${S.pair ? 'Longest walk' : 'Whole walk'}</small><b>${fmtMin(a.walk)}</b></div>
      <div><small>Back by</small><b>${clock(v.back)}</b></div>
      <div><small>Radiation${S.pair ? ' each' : ''}</small><b>${a.dose.toFixed(2)}<span style="font-size:12px"> mSv</span></b></div>
    </div>` : ''}
    <ul class="checks">${v.checks.map((c) => `<li class="${c.state}">${checkIcon(c)}<span>${c.text}</span></li>`).join('')}</ul>`
}
function renderOptions() {
  $('#limit-line').textContent = `${P.limit}° limit`
  const opt = (k: Kind, name: string) => {
    const a = agg(k)
    return html`
    <button class="option" data-k="${k}" aria-pressed="${S.sel === k}" ${a ? '' : 'disabled'}>
      <i class="sw ${k === 'cautious' ? 'dash' : ''}"></i><span class="nm">${name}</span><span class="tm">${a ? fmtMin(a.walk) : 'None'}</span>
      <span class="meta">${a ? `<span>${round10(a.dist)} m${S.pair ? ' in all' : ''}</span><span>${Math.round(a.over10 * 100)}% steep</span><span>max ${Math.round(a.maxSlope)}°</span>` : '<span>No route under the limit</span>'}</span>
    </button>`
  }
  $('#options').innerHTML = opt('direct', 'Direct') + opt('cautious', 'Cautious')
  $('#options').querySelectorAll<HTMLButtonElement>('.option').forEach((b) => (b.onclick = () => selectKind(b.dataset.k as Kind)))
  const d = agg('direct'), c = agg('cautious')
  let txt = ''
  if (d && c) {
    const extra = round10(c.dist - d.dist), cut = Math.round((d.over10 - c.over10) * 100)
    txt = extra <= 0 || cut <= 2 ? 'Both routes cross nearly the same ground here.' : `Cautious walks about ${extra} m further to cut steep ground by ${cut} percentage points.`
  }
  if (S.pair) txt += `${txt ? ' ' : ''}Orange is astronaut A, blue is astronaut B.`
  $('#compare').textContent = txt
}
function renderPair() {
  $('#pair-sec').hidden = !S.pair
  if (!S.pair) return
  const c = S.pc[S.sel]
  $('#pair-line').textContent = `${S.sepLimit} m, ${S.gapLimit} min`
  if (!c) { $('#pair').innerHTML = '<p class="fine">Needs a route for both astronauts.</p>'; return }
  const dur = c.end || 1, bar = (list: { from: number; to: number }[], cls: string) => list.map((g) => `<i class="${cls}" style="left:${(g.from / dur) * 100}%;width:${Math.max(0.6, ((g.to - g.from + 0.5) / dur) * 100)}%"></i>`).join('')
  $('#pair').innerHTML = html`
    <div class="figures">
      <div><small>Furthest apart</small><b>${round10(c.maxSep)} m</b></div>
      <div><small>In sight</small><b>${Math.round(c.inSight * 100)}%</b></div>
      <div><small>Longest gap</small><b>${fmtMin(c.longestGap)}</b></div>
    </div>
    <div class="sight" aria-hidden="true">${bar(c.gaps, 'gap')}${bar(c.tooFar, 'far')}</div>
    <p class="fine sight-key"><span><i class="gap"></i>out of sight</span><span><i class="far"></i>beyond ${S.sepLimit} m</span><span class="r">${fmtMin(c.end)}</span></p>
    <p class="fine">Line of sight is checked over the terrain at eye height every 30 seconds of the plan. Hills between partners block it; boulders smaller than about 1 m are not in the model.</p>`
}
function selectKind(k: Kind) {
  if (!ready(k) || S.sel === k) return
  S.sel = k; W.styleRibbons(S.sel); renderAll()
  hint(`${k === 'direct' ? 'Direct' : 'Cautious'} route selected.`)
}
let lastDown = { x: -1, y: -1 }
/** Clicking on the other route's line selects it rather than moving a stop. */
function pickRouteLine() {
  if (S.pair) return false
  const other: Kind = S.sel === 'direct' ? 'cautious' : 'direct', r = S.routes[other][0], mine = S.routes[S.sel][0]
  if (!r || !mine) return false
  const near = (q: Route) => {
    let best = Infinity
    for (let i = 0; i < q.xs.length; i += 2) {
      const p = W.project(W.cellToWorld({ x: q.xs[i], y: q.ys[i] }, 1.6))
      if (p.on) best = Math.min(best, Math.hypot(p.x - lastDown.x, p.y - lastDown.y))
    }
    return best
  }
  const d = near(r)
  if (d > 10 || near(mine) < d) return false
  selectKind(other)
  return true
}
function renderActions() {
  const ok = ready()
  $('#actions').innerHTML = `<button class="btn" id="b-guide2" ${ok ? '' : 'disabled'}>${icon.FileText}<span>Open the field guide</span></button>`
  $('#go-walk').innerHTML = S.pair
    ? `<button class="btn primary go" data-walk="0" ${ok ? '' : 'disabled'}>${icon.PersonSimpleWalk}<span>Walk as A</span></button><button class="btn primary go b" data-walk="1" ${ok ? '' : 'disabled'}>${icon.PersonSimpleWalk}<span>Walk as B</span></button>`
    : `<button class="btn primary go" data-walk="0" ${ok ? '' : 'disabled'} title="Walk it at eye level (W)">${icon.PersonSimpleWalk}<span>Walk it at eye level</span><kbd>W</kbd></button>`
  const kinds: [Kind, string][] = [['direct', 'Direct'], ['cautious', 'Cautious']]
  $('#route-pick').innerHTML = kinds.map(([k, n]) => { const a = agg(k); return `<button data-k="${k}" aria-pressed="${S.sel === k}" ${a ? '' : 'disabled'}><i class="sw ${k === 'cautious' ? 'dash' : ''}"></i><span>${n}</span><span class="mono">${a ? fmtMin(a.walk) : 'none'}</span></button>` }).join('')
}
function renderAssumptions() {
  $('#o-suit').textContent = `${Math.round(P.suit * 100)}%`; $('#o-limit').textContent = `${P.limit}°`; $('#o-work').textContent = `${P.work} min`
  $('#o-sep').textContent = `${S.sepLimit} m`; $('#o-gap').textContent = `${S.gapLimit} min`
}
function renderSpace() {
  const sw = S.sw, s = spaceSummary()
  $('#sw-src').textContent = sw?.live ? 'live from NASA' : 'snapshot'
  const arrivals = (sw?.marsArrivals ?? []).slice(-4).reverse()
  $('#space').innerHTML = html`
    <p class="sw-line ${s.state}">${s.state === 'ok' ? icon.CheckCircle : s.state === 'warn' ? icon.WarningCircle : icon.Info}<span>${s.text}</span></p>
    ${arrivals.length ? `<ul class="sw-list">${arrivals.map((a) => `<li><span class="mono">${fmtUtc(a.time)}</span><span>${a.glancing ? 'glancing' : 'direct'}</span></li>`).join('')}</ul>` : ''}
    <p class="fine" style="margin-top:8px">Solar storms (coronal mass ejections) modelled to reach Mars by NASA's WSA-ENLIL runs, via NASA DONKI${sw?.checked ? `, checked ${fmtUtc(sw.checked)}` : ''}. ${sw && sw.sepEvents.length ? `${sw.sepEvents.length} solar particle events recorded in the past 60 days.` : 'No solar particle events recorded in the past 60 days.'}</p>`
}

// ---------------------------------------------------------------- daylight timeline
const T0 = 360, T1 = 1170
const tx = (m: number) => ((m - T0) / (T1 - T0)) * 1000
/** Mars clock (LMST minutes) when the walker has covered the given distance, counting time at stops. */
function clockAt(r: Route, dist: number) {
  let lo = 0, hi = r.d.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (r.d[mid] < dist) lo = mid + 1; else hi = mid }
  const stopsDone = r.stopAt.slice(0, -1).filter((k) => k < lo).length
  return P.depart + (r.t[lo] / 60 + stopsDone * P.work) / MARS_MIN
}
function renderDay() {
  const v = currentVerdict()
  let curve = ''
  for (let m = T0; m <= T1; m += 10) { const el = sunAt(m, D.sun).el; curve += `${m === T0 ? 'M' : 'L'}${tx(m).toFixed(1)} ${(44 - (Math.max(0, el) / 90) * 38).toFixed(1)}` }
  const reserveStart = sunset - RESERVE_MIN / MARS_MIN
  const rows = cur(), segs: string[] = []
  const lane = S.pair ? [{ y: 22, h: 10 }, { y: 35, h: 10 }] : [{ y: 30, h: 12 }]
  rows.forEach((r, w) => {
    if (!r) return
    let t = P.depart
    const { y, h } = lane[w], b = S.pair && w ? ' b' : ''
    r.legMin.forEach((m, i) => {
      const a = t, e = a + m / MARS_MIN
      segs.push(`<rect class="${i === r.legMin.length - 1 ? 'seg-back' : 'seg-out'}${b}" x="${tx(a)}" y="${y}" width="${Math.max(1, tx(e) - tx(a))}" height="${h}" rx="1.5"/>`)
      t = e
      if (i < r.legMin.length - 1) { const c = t + P.work / MARS_MIN; segs.push(`<rect class="seg-work" x="${tx(t)}" y="${y}" width="${Math.max(0, tx(c) - tx(t))}" height="${h}"/>`); t = c }
    })
    if (S.pair) segs.push(`<text class="lane" x="${tx(P.depart) - 4}" y="${y + h - 1.5}" text-anchor="end">${WHO[w]}</text>`)
  })
  const walk = rows.some(Boolean) ? `<g class="walk ${v.go ? '' : 'bad'}">${segs.join('')}<line class="grip" x1="${tx(P.depart)}" x2="${tx(P.depart)}" y1="18" y2="48"/></g>` : ''
  let ticks = ''
  for (let m = 420; m <= 1140; m += 120) ticks += `<line class="tick" x1="${tx(m)}" x2="${tx(m)}" y1="48" y2="51"/><text x="${tx(m)}" y="62" text-anchor="middle">${clock(m)}</text>`
  $('#day').innerHTML = html`
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(240,106,93,0.08)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(240,106,93,0.55)" stroke-width="2"/></pattern></defs>
    <rect class="night" x="0" y="0" width="${tx(sunrise)}" height="48"/><rect class="night" x="${tx(sunset)}" y="0" width="${1000 - tx(sunset)}" height="48"/>
    <rect class="reserve" x="${tx(reserveStart)}" y="0" width="${tx(sunset) - tx(reserveStart)}" height="48"/>
    <path class="suncurve" d="${curve}" vector-effect="non-scaling-stroke"/>
    <text x="${tx(sunrise) + 4}" y="10" text-anchor="start">sunrise ${D.conditions.sunrise}</text>
    <text x="${tx(sunset) - 4}" y="10" text-anchor="end">last ${RESERVE_MIN} min</text>
    ${ticks}${walk}`
  $('#day').setAttribute('aria-valuenow', String(P.depart)); $('#day').setAttribute('aria-valuetext', `Leave at ${clock(P.depart)}`)
  const s = sunAt(P.depart, D.sun)
  $('#day-sun').textContent = ready() ? `Leave ${clock(P.depart)}, back ${clock(v.back)}. Sun ${Math.round(s.el)}° in the ${compassWord(s.az)}.` : ''
}
function setDepart(m: number) {
  P.depart = Math.max(sunrise - 60, Math.min(T1 - 20, Math.round(m / 5) * 5))
  W.setDepart(P.depart)
  renderDecision(); renderDay()
}
function bindDay() {
  const svg = $('#day'), toMin = (e: PointerEvent) => { const b = svg.getBoundingClientRect(); return T0 + ((e.clientX - b.left) / b.width) * (T1 - T0) }
  let grab = 0, on = false
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); on = true
    const m = toMin(e), a = agg(S.sel), end = a ? P.depart + a.walk / MARS_MIN : P.depart
    grab = m >= P.depart && m <= end ? m - P.depart : 0
    setDepart(m - grab)
  })
  svg.addEventListener('pointermove', (e) => { if (on) setDepart(toMin(e) - grab) })
  svg.addEventListener('pointerup', () => (on = false))
  svg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') setDepart(P.depart - 10); if (e.key === 'ArrowRight') setDepart(P.depart + 10) })
}

// ---------------------------------------------------------------- drawers
function openLayers() {
  S.drawer = 'layers'; pressed()
  const sw = (bg: string) => `style="background:${bg}"`
  const row = (key: keyof typeof S.layers | 'tint' | 'exag', name: string, meta: string, swatch: string, on: boolean, extra = '') => html`
    <div class="layer"><span class="sw" ${swatch}></span><b>${name}</b><small>${meta}</small>
    <button class="switch tog" role="switch" aria-checked="${on}" data-k="${key}" aria-label="${name}"></button>${extra}</div>`
  const fixed = (name: string, meta: string, swatch: string, note: string) => html`<div class="layer fixed"><span class="sw" ${swatch}></span><b>${name}</b><small>${meta}</small><span class="tog">${note}</span></div>`
  const el = $('#drawer'); el.hidden = false; el.className = 'drawer surface'
  el.innerHTML = html`
    <header><h2>Data layers</h2><button class="icon-btn" id="d-close" aria-label="Close data layers">${icon.X}</button></header>
    ${fixed('Orbital image', 'MRO HiRISE, about 0.6 m per pixel', `style="background-image:url(${D.images.site.src})"`, 'Base')}
    ${fixed('Surroundings image', 'MRO CTX, about 8 m per pixel, 8 km', `style="background-image:url(${D.images.ctx.src})"`, 'Base')}
    ${fixed('Terrain', 'USGS 1 m model from MRO HiRISE and CTX and Mars Express HRSC, tied to MGS MOLA', sw('linear-gradient(135deg,#2a2622,#8d7a69)'), '3D')}
    ${row('slope', 'Slope hazard', 'Derived from the terrain, 2 m cells', sw('linear-gradient(90deg,#f6d664 0 33%,#f08c20 33% 66%,#1a120e 66%)'), S.layers.slope)}
    ${row('thermal', 'Night surface temperature', 'Mars Odyssey THEMIS, 100 m per pixel, relative', sw('linear-gradient(90deg,#140b34,#781c6d,#cf4446,#f98e09,#fcee9f)'), S.layers.thermal,
      '<span class="legend-ramp" style="background:linear-gradient(90deg,#140b34,#781c6d,#cf4446,#f98e09,#fcee9f)"></span><small style="grid-column:2/span 2">Cooler at night (dust, sand) to warmer (rock that held the day\'s heat)</small>')}
    ${row('track', 'Curiosity drive path', 'MSL localization, sols 4469 to 4916', sw('#f4f1ec'), S.layers.track)}
    ${row('boundary', 'Planning area edge', '1.4 by 1.5 km where routes are computed', sw('repeating-linear-gradient(90deg,#f4f1ec 0 5px,transparent 5px 9px)'), S.layers.boundary)}
    ${row('tint', 'Mars colour', 'A tint on the greyscale images, not data', sw('#c58c63'), S.tint)}
    ${row('exag', 'Relief ×2', 'Doubles heights to read the shape', sw('linear-gradient(160deg,#5b4334,#d4b296)'), S.exag)}
    <p class="note">Used in the decision, not drawn on the map: radiation dose rate from Curiosity's RAD, weather from its REMS station, and solar storm forecasts from NASA's space weather models.</p>`
  el.querySelectorAll<HTMLButtonElement>('.switch').forEach((b) => (b.onclick = () => {
    const k = b.dataset.k!, on = b.getAttribute('aria-checked') !== 'true'
    b.setAttribute('aria-checked', String(on))
    if (k === 'tint') { S.tint = on; W.setTint(on) }
    else if (k === 'exag') { S.exag = on; W.setExag(on ? 2 : 1) }
    else { S.layers[k as keyof typeof S.layers] = on; W.setLayer(k as never, on) }
  }))
  $('#d-close').onclick = closeDrawer
}
function pressed() {
  $('#b-layers').setAttribute('aria-pressed', String(S.drawer === 'layers'))
  $('#b-sites').setAttribute('aria-pressed', String(S.drawer === 'sites'))
}
const inPlan = (s: Station) => S.pts.findIndex((q) => nearStation(q) === s)
function siteMeta(s: Station) {
  const days = s.stay === 1 ? '1 sol' : `${s.stay} sols`
  return `${days} here${s.mahli ? `, ${s.mahli} close-ups` : ''}${s.chemcam ? `, ${s.chemcam} laser shots` : ''}`
}
/** Every place Curiosity stopped to work in the planning area, as a list to browse and add from. */
function openSites() {
  S.drawer = 'sites'; pressed()
  const el = $('#drawer'); el.hidden = false; el.className = 'drawer surface sites'
  const f = S.siteFilter, list = D.stations.filter((s) => f === 'all' || s.kind === f || (f === 'named' && s.kind === 'drill'))
  const groups: [string, Station[]][] = [['Drill sites', list.filter((s) => s.kind === 'drill')], ['Named sites', list.filter((s) => s.kind === 'named')], ['Other stops', list.filter((s) => s.kind === 'stop')]]
  const count = (k: string) => D.stations.filter((s) => k === 'all' || s.kind === k || (k === 'named' && s.kind === 'drill')).length
  el.innerHTML = html`
    <header><h2>Science sites <span class="muted mono">${D.stations.length}</span></h2><button class="icon-btn" id="d-close" aria-label="Close science sites">${icon.X}</button></header>
    <p class="note top">Every place Curiosity parked for three sols or more in this area, from its waypoint record and raw images. Photos are its own navigation camera views.</p>
    <div class="seg filt" role="group" aria-label="Show">
      ${(['all', 'named', 'drill'] as const).map((k) => `<button data-f="${k}" aria-pressed="${f === k}">${{ all: 'All', named: 'Named', drill: 'Drill' }[k]} <span class="mono">${count(k)}</span></button>`).join('')}
    </div>
    ${groups.filter(([, g]) => g.length).map(([h, g]) => html`<h3 class="grp">${h}</h3><ul class="site-list">${g.map((s) => {
      const k = inPlan(s)
      return html`<li data-id="${s.id}">
        <button class="site" data-open="${s.id}">${s.photo ? `<img src="${s.photo.src}" alt="" loading="lazy">` : '<span class="ph"></span>'}
          <span><b>${shortName(s)}</b><small>Sol ${s.sols[0]}${s.sols[1] > s.sols[0] ? ` to ${s.sols[1]}` : ''}. ${siteMeta(s)}</small></span></button>
        ${k >= 0 ? `<span class="in">${k ? `Stop ${k}` : 'Start'}</span>` : `<button class="btn add" data-add="${s.id}" aria-label="Add ${shortName(s)} as a stop">${icon.Plus}<span>Add</span></button>`}
      </li>`
    }).join('')}</ul>`).join('')}`
  el.querySelectorAll<HTMLButtonElement>('.filt button').forEach((b) => (b.onclick = () => { S.siteFilter = b.dataset.f as typeof S.siteFilter; openSites() }))
  el.onclick = (e) => {
    const t = e.target as HTMLElement, add = t.closest<HTMLElement>('[data-add]'), open = t.closest<HTMLElement>('[data-open]')
    if (add) {
      const s = byId(add.dataset.add!)!, p = snap({ x: s.xy[0], y: s.xy[1] })
      if (!p) return hint('That site is on ground over the slope limit.', true)
      if (S.pts.length - 1 >= MAX_STOPS) return hint(`Up to ${MAX_STOPS} stops per walk. Remove one first.`, true)
      dismissCoach(); addStop({ x: p.x, y: p.y })
      hint(`Added ${shortName(s)} as stop ${S.pts.length - 1}.`)
    } else if (open) openStation(open.dataset.open!)
  }
  $('#d-close').onclick = closeDrawer
}
function openStation(id: string) {
  const s = byId(id)!, ph = s.photo
  S.drawer = 'station'; S.station = id; pressed()
  const el = $('#drawer'); el.hidden = false; el.className = 'drawer surface station-card'; el.onclick = null
  const canAdd = S.pts.length - 1 < MAX_STOPS, k = inPlan(s)
  const kind = { drill: 'Drill site', named: 'Named site', stop: 'Curiosity stop' }[s.kind]
  el.innerHTML = html`
    ${ph ? `<img src="${ph.src}" alt="Curiosity navigation camera view of the ground at ${shortName(s)}">` : ''}
    <div class="body">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><h3><span class="kind ${s.kind}">${kind}</span>${siteName(s)}</h3><button class="icon-btn" id="d-close" aria-label="Close">${icon.X}</button></div>
      <p>${s.note ? s.note + ' ' : ''}Curiosity worked here on sol${s.sols[1] > s.sols[0] ? `s ${s.sols[0]} to ${s.sols[1]}` : ` ${s.sols[0]}`}: ${siteMeta(s)}.${s.source ? ` <a href="${s.source}" target="_blank" rel="noopener">Mission blog</a>` : ''}</p>
      ${ph ? `<span class="cap">${ph.camera}, sol ${ph.sol}, ${ph.date}. NASA/JPL-Caltech.</span>` : ''}
      <div class="row">
        ${k >= 0 ? `<span class="in">Already ${k ? `stop ${k}` : 'the start'}</span>` : canAdd ? `<button class="btn primary" id="st-add">${icon.Plus}<span>Add as stop</span></button>` : `<button class="btn primary" id="st-set">${icon.Flag}<span>Set as ${pointName(S.active).toLowerCase()}</span></button>`}
        ${k === 0 ? '' : `<button class="btn" id="st-start">${icon.MapPin}<span>Start here</span></button>`}
      </div>
    </div>`
  const put = (i: number) => {
    const p = snap({ x: s.xy[0], y: s.xy[1] })
    if (!p) return hint('That site is on ground over the slope limit.', true)
    closeDrawer(); dismissCoach()
    if (i >= S.pts.length) { addStop({ x: p.x, y: p.y }); return }
    S.pts[i] = { x: p.x, y: p.y }; S.active = Math.max(1, Math.min(S.active, S.pts.length - 1))
    recompute({ fit: true })
  }
  el.querySelector<HTMLButtonElement>('#st-set')?.addEventListener('click', () => put(S.active))
  el.querySelector<HTMLButtonElement>('#st-add')?.addEventListener('click', () => put(S.pts.length))
  el.querySelector<HTMLButtonElement>('#st-start')?.addEventListener('click', () => put(0))
  $('#d-close').onclick = closeDrawer
  W.flyTo({ ...W.pose(), target: W.cellToWorld({ x: s.xy[0], y: s.xy[1] }), dist: Math.min(W.pose().dist, 700) }, 900)
}
function closeDrawer() { S.drawer = ''; $('#drawer').hidden = true; $('#drawer').onclick = null; pressed() }

// ---------------------------------------------------------------- hint, coach
let hintTimer = 0
function hint(text: string, warn = false) {
  const h = $('#hint'); h.hidden = false; h.className = `hint surface ${warn ? 'warn' : ''}`
  h.innerHTML = `${warn ? icon.WarningCircle : icon.Info}<span>${text}</span>`
  clearTimeout(hintTimer); hintTimer = window.setTimeout(() => (h.hidden = true), warn ? 7000 : 4500)
}
function showCoach() { if (store.get('mw-coach') || W.mode !== 'orbit') return; $('#coach').hidden = false }
function dismissCoach() { $('#coach').hidden = true; store.set('mw-coach', '1') }

// ---------------------------------------------------------------- overlay: pins, tags, minimap
function drawOverlay() {
  const ground = (x: number, y: number, lift: number) => W.project(W.cellToWorld({ x, y }, lift))
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const overlaps = (x: number, y: number, w: number, h: number) => placed.some((q) => Math.abs(q.x - x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < (q.h + h) / 2 + 3)
  // stop tags first: they win any overlap
  const tags = [...document.querySelectorAll<HTMLElement>('.tag')].map((el) => {
    const i = Number(el.dataset.i), pt = S.pts[i]
    const p = pt ? ground(pt.x, pt.y, i === 0 ? 48 : 64) : { x: 0, y: 0, on: false }
    return { el, i, p, hide: !pt || !p.on || W.mode !== 'orbit' }
  }).sort((a, b) => b.p.y - a.p.y)
  for (const t of tags) {
    t.el.style.visibility = t.hide ? 'hidden' : 'visible'
    if (t.hide) continue
    const w = t.el.offsetWidth || 90, h = t.el.offsetHeight || 22
    let y = t.p.y - h / 2
    for (let guard = 0; guard < 8 && overlaps(t.p.x, y, w, h); guard++) y -= h + 4
    placed.push({ x: t.p.x, y, w, h })
    t.el.style.transform = `translate(${t.p.x.toFixed(1)}px, ${(y + h / 2).toFixed(1)}px) translate(-50%, -100%)`
  }
  // science site pins: named and drill sites get labels, the rest are dots; labels that would
  // overlap something already placed are hidden rather than stacked, so the map stays readable
  const zoomedIn = W.pose().dist < 2600
  // pins never show through the panels
  const panels = ['.rail', '#drawer', '.mini', '.day', '.tools', '#coach'].map((q) => $(q)).filter((el) => el && !el.hidden).map((el) => el.getBoundingClientRect())
  const covered = (p: { x: number; y: number }) => p.y < 60 || panels.some((r) => p.x > r.left - 6 && p.x < r.right + 6 && p.y > r.top - 6 && p.y < r.bottom + 6)
  const pins = [...document.querySelectorAll<HTMLElement>('.pin')].map((el) => {
    const s = byId(el.dataset.id!)!, p = ground(s.xy[0], s.xy[1], s.kind === 'stop' ? 2 : 6)
    return { el, s, p, hide: !p.on || W.mode !== 'orbit' || inPlan(s) >= 0 || (s.kind === 'stop' && !zoomedIn) || covered(p) }
  }).sort((a, b) => (a.s.kind === 'stop' ? 1 : 0) - (b.s.kind === 'stop' ? 1 : 0) || (a.s.kind === 'drill' ? 0 : 1) - (b.s.kind === 'drill' ? 0 : 1))
  for (const q of pins) {
    let hide = q.hide
    if (!hide) {
      const w = q.el.offsetWidth || 10, h = q.el.offsetHeight || 10, y = q.s.kind === 'stop' ? q.p.y : q.p.y - h / 2
      if (overlaps(q.p.x, y, w, h)) hide = true
      else placed.push({ x: q.p.x, y, w, h })
    }
    q.el.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) q.el.style.transform = `translate(${q.p.x.toFixed(1)}px, ${q.p.y.toFixed(1)}px) translate(-50%, ${q.s.kind === 'stop' ? '-50%' : '-100%'})`
  }
  // in a pair walk, label the partner so they can be found on the horizon
  const pt = $('#ptag')
  pt.hidden = !(W.mode === 'walk' && partnerAt) || $('#h-partner').textContent === 'beside you'
  if (!pt.hidden) {
    const p = ground(partnerAt!.x, partnerAt!.y, 2.6)
    pt.style.visibility = p.on ? 'visible' : 'hidden'
    pt.className = `tag dest ptag ${walkAs === 0 ? 'b' : ''}`
    pt.textContent = `${WHO[1 - walkAs]} ${$('#h-partner').textContent}`
    pt.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`
  }
  drawMini($('#mini') as HTMLCanvasElement, true)
}
let miniBase: HTMLCanvasElement | null = null
// box: the part of the site to show, in grid cells. Defaults to the whole site.
function drawMini(cv: HTMLCanvasElement, withCamera: boolean, box?: { x0: number; y0: number; x1: number; y1: number }) {
  const b0 = box ?? { x0: 0, y0: 0, x1: D.grid.cols, y1: D.grid.rows }
  const x = cv.getContext('2d')!, w = cv.width, h = cv.height, sx = w / (b0.x1 - b0.x0), sy = h / (b0.y1 - b0.y0), u = w / 440
  if (!miniBase) {
    miniBase = document.createElement('canvas'); miniBase.width = 440; miniBase.height = 476
    const b = miniBase.getContext('2d')!
    b.filter = 'contrast(1.1) brightness(0.9)'; b.drawImage(D.images.site, 0, 0, 440, 476)
  }
  if (box) {
    const im = D.images.site, ix = im.naturalWidth / D.grid.cols, iy = im.naturalHeight / D.grid.rows
    x.drawImage(im, b0.x0 * ix, b0.y0 * iy, (b0.x1 - b0.x0) * ix, (b0.y1 - b0.y0) * iy, 0, 0, w, h)
  } else x.drawImage(miniBase, 0, 0, w, h)
  x.save(); x.translate(-b0.x0 * sx, -b0.y0 * sy)
  x.lineJoin = 'round'; x.lineCap = 'round'
  const kinds = (S.pair ? [S.sel] : S.sel === 'direct' ? ['cautious', 'direct'] : ['direct', 'cautious']) as Kind[]
  for (const k of kinds) S.routes[k].forEach((r, wk) => {
    if (!r) return
    x.beginPath()
    for (let i = 0; i < r.xs.length; i += 3) { const X = r.xs[i] * sx, Y = r.ys[i] * sy; if (i) x.lineTo(X, Y); else x.moveTo(X, Y) }
    x.strokeStyle = '#0b0d0e'; x.lineWidth = (k === S.sel ? 7 : 5) * u; x.setLineDash([]); x.stroke()
    x.strokeStyle = S.pair ? COL[wk] : k === 'direct' ? COL[0] : '#f4f1ec'; x.lineWidth = (k === S.sel ? 3.5 : 2.5) * u
    x.setLineDash(k === 'cautious' ? [8 * u, 6 * u] : []); x.globalAlpha = k === S.sel ? 1 : 0.6; x.stroke(); x.globalAlpha = 1; x.setLineDash([])
  })
  for (const s of D.stations) {
    const r = s.kind === 'stop' ? 2.5 : 4.5
    x.fillStyle = s.kind === 'stop' ? 'rgba(244,241,236,0.7)' : '#f4f1ec'; x.strokeStyle = '#0b0d0e'; x.lineWidth = 1.5
    x.beginPath(); x.rect(s.xy[0] * sx - r * u, s.xy[1] * sy - r * u, 2 * r * u, 2 * r * u); x.fill(); x.stroke()
  }
  S.pts.forEach((p, i) => {
    x.beginPath(); x.arc(p.x * sx, p.y * sy, 9 * u, 0, 7); x.fillStyle = i ? COL[walkerOf(i)] : '#f4f1ec'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#0b0d0e'; x.stroke()
    if (i) { x.fillStyle = '#140b06'; x.font = `700 ${Math.round(11 * u)}px "B612 Mono", monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i), p.x * sx, p.y * sy + 0.5) }
  })
  if (partnerAt) { x.beginPath(); x.arc(partnerAt.x * sx, partnerAt.y * sy, 7 * u, 0, 7); x.fillStyle = COL[1 - walkAs]; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke() }
  x.textAlign = 'start'; x.textBaseline = 'alphabetic'
  x.restore()
  if (box) {
    const bar = (100 / D.grid.cell) * sx
    x.fillStyle = 'rgba(11,13,14,0.75)'; x.fillRect(16, h - 44, bar + 24, 30)
    x.strokeStyle = '#f4f1ec'; x.lineWidth = 3; x.beginPath(); x.moveTo(28, h - 22); x.lineTo(28 + bar, h - 22); x.stroke()
    x.fillStyle = '#f4f1ec'; x.font = '700 16px "B612 Mono", monospace'; x.fillText('100 m', 28, h - 28)
  }
  if (withCamera) {
    const c = W.cameraInfo(), cx = Math.max(6, Math.min(w - 6, c.x * sx)), cy = Math.max(6, Math.min(h - 6, c.y * sy)), a = (c.heading * Math.PI) / 180
    x.save(); x.translate(cx, cy); x.rotate(a)
    x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 44, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45); x.closePath()
    x.fillStyle = 'rgba(255,255,255,0.16)'; x.fill()
    x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 7); x.lineTo(0, 3); x.lineTo(-7, 7); x.closePath(); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#0b0d0e'; x.lineWidth = 2; x.stroke()
    x.restore()
  }
}
function bindMini() {
  $('#mini').addEventListener('click', (e) => {
    if (W.mode !== 'orbit') return
    const b = (e.target as HTMLElement).getBoundingClientRect(), px = ((e.clientX - b.left) / b.width) * D.grid.cols, py = ((e.clientY - b.top) / b.height) * D.grid.rows
    W.flyTo({ ...W.pose(), target: W.cellToWorld({ x: px, y: py }) }, 900)
  })
}

// ---------------------------------------------------------------- walk at eye level
let walkAs = 0, walkEnd = 0, walkRate = 1, walkSpeed = 1, walkLegs: ReturnType<typeof legs> = [], arrivedAt = -1, walkTimes: Float32Array = new Float32Array(0)
let helmet = store.get('mw-helmet') === '1', partnerStride = 0, partnerLast: Pt | null = null
function setHelmet(on: boolean) {
  helmet = on; store.set('mw-helmet', on ? '1' : '0')
  $('#hud').classList.toggle('visor', on); $('#h-helmet').setAttribute('aria-pressed', String(on))
  document.body.classList.toggle('visor-on', on && W.mode !== 'orbit')
}
function setSpeed(m: number) {
  walkSpeed = Math.max(0.25, Math.min(8, m)); W.setWalkSpeed(walkSpeed); showSpeed()
}
let partner: { r: Route; times: Float32Array } | null = null, partnerAt: Pt | null = null
function startWalk(w: number) {
  const r = cur()[w]
  if (!r) return
  closeDrawer(); dismissCoach(); closeGuide(); $('#tip').hidden = true
  walkAs = w; arrivedAt = -1; walkTimes = sampleTimes(r, P); partnerStride = 0; partnerLast = null
  // Walk to the last stop; the way back is the same kind of ground and would double the rehearsal.
  const iEnd = r.stopAt[r.stopAt.length - 2]
  walkEnd = r.d[iEnd]
  walkLegs = legs(D.grid, r, 0, iEnd)
  const other = S.pair ? cur()[1 - w] : null
  partner = other ? { r: other, times: sampleTimes(other, P) } : null
  // about 45 to 100 seconds of playback at 1×, whatever the length
  const dur = Math.max(45, Math.min(100, walkEnd / 9))
  walkRate = walkEnd / dur; walkSpeed = 1
  document.body.classList.add('cine'); $('#hud').hidden = false; $('#arrive').hidden = true
  $('#hud-mode').innerHTML = `${S.pair ? `ASTRONAUT ${WHO[w]}. ` : ''}EYE HEIGHT 1.8 M. TRUE SCALE.<small>Drag or use the arrow keys to look around</small>`
  $('#h-partner-c').hidden = !partner
  setPaused(false)
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i <= iEnd; i += 2) { lo = Math.min(lo, r.z[i]); hi = Math.max(hi, r.z[i]) }
  if (hi - lo < 6) { hi += 3; lo -= 3 }
  let d = ''
  for (let i = 0; i <= iEnd; i += 2) d += `${i ? 'L' : 'M'}${((r.d[i] / walkEnd) * 1000).toFixed(1)} ${(4 + ((hi - r.z[i]) / (hi - lo)) * 38).toFixed(1)}`
  const ticks = r.stopAt.slice(0, -2).map((k) => { const xx = ((r.d[k] / walkEnd) * 1000).toFixed(1); return `<line class="cur" style="opacity:.45" vector-effect="non-scaling-stroke" x1="${xx}" x2="${xx}" y1="0" y2="46"/>` }).join('')
  $('#h-prof').innerHTML = `<path class="pf ${S.pair && w ? 'b' : ''}" vector-effect="non-scaling-stroke" d="${d}L1000 46L0 46Z"/>${ticks}<line class="cur" id="h-cur" vector-effect="non-scaling-stroke" x1="0" x2="0" y1="0" y2="46"/>`
  if (!$('#strip').childElementCount) {
    let s = ''
    for (let i = -2; i < 27; i++) { const deg = (((i * 15) % 360) + 360) % 360, c = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[deg]; s += `<span${c ? ' class="c"' : ''}>${c ?? deg}</span>` }
    $('#strip').innerHTML = s
  }
  W.startWalk(r, w, walkRate, walkEnd, r.stopAt.slice(0, -1).map((k) => r.d[k]), (dist) => clockAt(r, dist))
  setHelmet(helmet)
  showSpeed()
  ;($('#gl') as HTMLCanvasElement).focus({ preventScroll: true })
}
function setPaused(p: boolean) { $('#h-pause').innerHTML = p ? `${icon.Play}<span>Resume</span>` : `${icon.Pause}<span>Pause</span>` }
function showSpeed() {
  const r = cur()[walkAs]
  if (!r) return
  // how much faster than real time: real walking covers walkEnd metres in the time to the last stop
  const real = walkEnd / (r.t[r.stopAt[r.stopAt.length - 2]] || 1), x = (walkRate * walkSpeed) / real
  $('#h-speed').textContent = `${walkSpeed < 1 ? walkSpeed.toFixed(2).replace(/0$/, '') : walkSpeed.toFixed(walkSpeed % 1 ? 1 : 0)}×`
  $('#h-speed').title = `About ${Math.round(x)} times faster than walking`
  ;($('#h-rate') as HTMLInputElement).value = String(Math.round((Math.log2(walkSpeed / 0.25) / 5) * 100))
  $('#hud').querySelectorAll('.speeds button').forEach((b) => b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.v) === walkSpeed)))
}
function onWalkFrame(f: { dist: number; heading: number; holding: boolean }) {
  const r = cur()[walkAs]!, a = at(r, f.dist / r.dist), sim = clockAt(r, f.dist), slope = D.grid.slope[a.cell]
  const elapsed = (sim - P.depart) * MARS_MIN
  $('#strip').style.transform = `translateX(${(-((f.heading / 15 + 2) * 40 + 20)).toFixed(1)}px)`
  // time left until back at the start, counting the stops still to come and the walk back
  $('#h-left').textContent = fmtMin(Math.max(0, r.walk - elapsed))
  $('#h-back').textContent = clock(P.depart + r.walk / MARS_MIN)
  $('#h-clock').textContent = `Mars time now ${clock(sim)}`
  const sl = $('#h-slope'); sl.textContent = `${Math.round(slope)}°`; sl.className = slope > 15 ? 'alarm' : slope > 10 ? 'warn' : ''
  $('#h-slope2').textContent = slope > 15 ? 'steep, slow down' : slope > 10 ? 'moderate' : 'easy'
  if (partner) {
    const m = elapsed, here = { x: a.x, y: a.y }, there = posAtTime(partner.r, partner.times, m), next = posAtTime(partner.r, partner.times, m + 0.3)
    const sep = Math.hypot(there.x - here.x, there.y - here.y) * D.grid.cell, seen = sep < 1 || lineOfSight(D.grid, here, there)
    // on a shared stretch the partner walks just ahead and to the right, in view, not inside the camera
    const beside = sep < 6, h = (f.heading * Math.PI) / 180, c = 1 / D.grid.cell
    const shown = beside ? { x: here.x + (Math.sin(h) * 4 + Math.cos(h) * 1.8) * c, y: here.y + (-Math.cos(h) * 4 + Math.sin(h) * 1.8) * c } : there
    const step = partnerLast ? Math.hypot(shown.x - partnerLast.x, shown.y - partnerLast.y) * D.grid.cell : 0
    partnerStride += Math.min(step, 3); partnerLast = shown
    const moving = Math.hypot(next.x - there.x, next.y - there.y) > 0.05 || (beside && !f.holding)
    W.setPartner(shown, beside ? f.heading : (Math.atan2(next.x - there.x, -(next.y - there.y)) * 180) / Math.PI, walkAs === 0 ? 0x5fb4ff : 0xf2662f, partnerStride, moving)
    partnerAt = there
    const p = $('#h-partner'); p.textContent = beside ? 'beside you' : `${round10(sep)} m`
    p.className = !seen || sep > S.sepLimit ? 'warn' : ''
    $('#h-partner2').textContent = beside ? `astronaut ${WHO[1 - walkAs]}` : `${WHO[1 - walkAs]}, ${seen ? 'in sight' : 'out of sight'}`
  } else partnerAt = null
  const stops = stopsOf(walkAs), leg = legOf(r, a.i), stopDist = r.d[r.stopAt[leg]], stopNo = stops[leg]
  const st = stopNo ? nearStation(S.pts[stopNo]) : undefined, left = Math.max(0, stopDist - f.dist)
  $('#h-stop').textContent = stopNo ? `${stopNo}${st ? ` ${shortName(st)}` : ''}` : 'start'
  const eta = walkTimes[r.stopAt[leg]] - elapsed
  $('#h-stop2').textContent = left > 3 ? `${round10(left) || Math.round(left)} m, ${fmtMin(Math.max(1, eta))}` : `here, ${P.work} min of science`
  let next = '', warn = false
  for (const l of walkLegs) if (l.from > f.dist + 2 && l.from < stopDist && l.k >= 2) { next = `${l.k === 3 ? 'Very steep ground' : 'Steep ground'} in ${Math.max(5, round10(l.from - f.dist))} m. Slow down and check footing.`; warn = true; break }
  if (!next) next = left > 15 ? `Follow the beacon to stop ${stopNo}.` : `At stop ${stopNo}. ${P.work} min of science planned here.`
  const n = $('#h-next'); n.textContent = next; n.className = `next ${warn ? 'warn' : ''}`
  const cur_ = $('#h-cur')
  if (cur_) { const xx = ((f.dist / walkEnd) * 1000).toFixed(1); cur_.setAttribute('x1', xx); cur_.setAttribute('x2', xx) }
  // the arrival card stays while the walker waits at a stop, then gets out of the way
  if (!f.holding && arrivedAt >= 0 && arrivedAt < stops.length - 1 && !W.walkPaused) { $('#arrive').hidden = true; arrivedAt = -1 }
}
function arrivalCard(j: number) {
  const i = stopsOf(walkAs)[j], st = i ? nearStation(S.pts[i]) : undefined, ph = st?.photo, el = $('#arrive')
  el.hidden = false
  el.innerHTML = ph && st
    ? `<img src="${ph.src}" alt="The ground at ${shortName(st)} seen by Curiosity"><div><b>Stop ${i}: ${siteName(st)}</b><br>${st.note ?? `Curiosity worked here for ${st.stay} sols.`}<small>What Curiosity saw here. ${ph.camera}, sol ${ph.sol}. NASA/JPL-Caltech.</small></div>`
    : `<div><b>Stop ${i}</b><br>${P.work} min of science planned here. No rover photo: Curiosity did not stop at this spot.</div>`
}
function onStopReached(j: number) { arrivedAt = j; arrivalCard(j) }
function onWalkEnd() {
  const r = cur()[walkAs]!
  setPaused(true)
  $('#h-next').textContent = `Arrived at the last stop. The walk back is ${fmtMin(r.backMin)}. Press Exit to return to the map, or click the profile to replay part of it.`
}
function stopWalk() {
  if (W.mode === 'orbit') return
  W.stopWalk(S.exag ? 2 : 1)
  partner = null; partnerAt = null
  document.body.classList.remove('cine', 'visor-on'); $('#hud').hidden = true
  W.flyTo(routePose(), 1400)
}

// ---------------------------------------------------------------- field guide
function closeGuide() { $('#guide-root').innerHTML = '' }
function openGuide() {
  const rs = cur(), a = agg(S.sel)
  if (!a) return
  const c = D.conditions, v = currentVerdict(), sun = sunAt(P.depart, D.sun), sw = spaceSummary(), pc = S.pc[S.sel]
  const words = ['Gentle ground', 'Moderate slope', 'Steep, slow down', 'Very steep, take care']
  const li = (m: string, w: string, t: string) => `<li><span class="mk mk-${m}" role="img" aria-label="${w}"></span><span>${t}</span></li>`
  const V = (t: string | number) => `<span class="v">${t}</span>`
  const who = (w: number) => (S.pair ? `${WHO[w]}: ` : '')
  // planned arrival at each stop, and the turn-back time: 1.5 times the planned elapsed time
  const stops = walkers().flatMap((w) => {
    const r = rs[w]!
    let elapsed = 0
    return stopsOf(w).map((i, j) => {
      elapsed += r.legMin[j]
      const arrive = P.depart + elapsed / MARS_MIN, turn = P.depart + (elapsed * 1.5) / MARS_MIN
      elapsed += P.work
      const k = r.stopAt[j]
      return { w, i, arrive, turn, st: nearStation(S.pts[i]), sun: sunAt(arrive, D.sun).el, dose: ((elapsed - P.work) / 1440) * RATE_MSV_PER_DAY, dz: r.z[k] - r.z[0] }
    })
  }).sort((x, y) => x.i - y.i)
  const legBlocks = walkers().map((w) => {
    const r = rs[w]!, st = stopsOf(w)
    return (S.pair ? `<h4 class="who-h">Astronaut ${WHO[w]}</h4>` : '') + r.legMin.map((m, i) => {
      const from = i ? r.stopAt[i - 1] : 0, to = r.stopAt[i], dist = r.d[to] - r.d[from]
      const title = i === r.legMin.length - 1 ? `Back to the start` : `To stop ${st[i]}`
      const rows = legs(D.grid, r, from, to).map((l) => {
        const dz = r.z[l.iTo] - r.z[l.iFrom]
        return `<div class="leg"><i class="g${l.k}"></i><span class="mono">${Math.round(l.from - r.d[from])} to ${Math.round(l.to - r.d[from])} m</span><span>${words[l.k]}</span><span class="mono">${Math.abs(dz) < 1 ? 'level' : `${dz > 0 ? 'up' : 'down'} ${Math.abs(Math.round(dz))} m`}</span></div>`
      }).join('')
      return `<h4 class="leg-h">${title} <span class="mono">${round10(dist)} m, ${fmtMin(m)}</span></h4>${rows}`
    }).join('')
  }).join('')
  const startElev = D.grid.elev[idx(S.pts[0])]
  $('#guide-root').innerHTML = html`
  <div class="guide-wrap" id="gw">
    <article class="guide" role="dialog" aria-modal="true" aria-label="Field guide">
      <header><div><b>FIELD GUIDE</b><span>${S.sel === 'direct' ? 'Direct' : 'Cautious'} route, ${S.pts.length - 1} stop${S.pts.length > 2 ? 's' : ''}${S.pair ? ', two astronauts' : ''} from ${label(S.pts[0])}</span></div><button class="icon-btn" id="g-close" aria-label="Close field guide">${icon.X}</button></header>
      <div class="content">
        <div class="key"><span><i class="mk mk-m"></i> measured</span><span><i class="mk mk-d"></i> derived</span><span><i class="mk mk-a"></i> assumed</span><span><i class="mk mk-s"></i> simulated</span></div>
        <div class="verdict ${v.go ? 'go' : 'nogo'}"><b>${v.go ? 'GO' : 'NO-GO'}</b><span>${v.head}. Leave ${clock(P.depart)}, back by ${clock(v.back)} local time.</span></div>
        <h3>Objective</h3>
        <ul><li class="plain">Sample boxwork hollows and the ridges beside them, to learn why the ridges resisted erosion while the hollows did not. Curiosity drilled one such pair in late 2025; a crew on foot can sample several in one walk and choose each next sample from what the last one showed.</li></ul>
        <h3>Route map</h3>
        <figure><img id="g-map" alt="Map of the route over the orbital image"><figcaption>North up. HiRISE image, NASA/JPL-Caltech/University of Arizona. ${S.pair ? 'Orange: astronaut A. Blue: astronaut B.' : 'Orange solid: Direct. White dashed: Cautious.'} Numbered: stops.</figcaption></figure>
        <h3>Timeline</h3>
        <ul>
          ${li('s', 'Simulated', `Leave ${V(label(S.pts[0]))} at ${V(clock(P.depart))}, from a notional rover park`)}
          ${stops.map((s) => li('a', 'Assumed', `${who(s.w)}Stop ${s.i}${s.st ? `, ${shortName(s.st)}` : ''}: arrive about ${V(clock(s.arrive))}, ${V(P.work + ' min')} of science. Sun ${V(Math.round(s.sun) + '°')} high, ${V(s.dose.toFixed(3) + ' mSv')} so far, ${V(`${s.dz >= 0 ? '+' : ''}${Math.round(s.dz)} m`)} against the start.`)).join('')}
          ${li('a', 'Assumed', `${S.pair ? 'Both back' : 'Back'} at the start about ${V(clock(v.back))}. ${S.pair ? 'Longest walk' : 'Whole walk'} ${V(fmtMin(a.walk))}, ${V(round10(a.dist) + ' m')}${S.pair ? ' walked in all' : ''}, climb ${V(Math.round(a.climb) + ' m')}`)}
        </ul>
        ${S.pair && pc ? html`<h3>Working as a pair</h3><ul>
          ${li('d', 'Derived', `Furthest apart ${V(round10(pc.maxSep) + ' m')}, about ${V(fmtMin(pc.maxSepAt))} after leaving. The limit is ${V(S.sepLimit + ' m')}.`)}
          ${li('d', 'Derived', `In line of sight ${V(Math.round(pc.inSight * 100) + '%')} of the time. Longest stretch out of sight ${V(fmtMin(pc.longestGap))}, limit ${V(S.gapLimit + ' min')}.`)}
          ${li('a', 'Assumed', 'Check in by radio at every stop. If either of you misses a check-in, both stop and walk towards each other along the planned routes.')}
        </ul>` : ''}
        <h3>Turn back if</h3>
        <ul>
          ${stops.map((s) => li('a', 'Assumed', `${who(s.w)}You have not reached stop ${s.i} by ${V(clock(s.turn))}, one and a half times the planned time.`)).join('')}
          ${li('d', 'Derived', `The walk back from the last stop takes ${V(walkers().map((w) => who(w) + fmtMin(rs[w]!.backMin)).join(', '))}.`)}
          ${li('d', 'Derived', `You would return after ${V(clock(sunset - RESERVE_MIN / MARS_MIN))}, when the last hour of daylight begins.`)}
          ${li('a', 'Assumed', 'A solar particle alert is issued while you are out. Return to the rover, which is the nearest shelter.')}
        </ul>
        <h3>Leg by leg</h3><div>${legBlocks}</div>
        <h3>Light</h3>
        <ul>${li('d', 'Derived', `At departure the sun is ${V(Math.round(sun.el) + '°')} high in the ${compassWord(sun.az)}. The 3D view shows which ground is in shadow.`)}
          ${li('m', 'Measured', `Sunrise ${V(c.sunrise)}, sunset ${V(c.sunset)} local mean solar time`)}</ul>
        <h3>Conditions</h3>
        <ul>${li('m', 'Measured', `Air ${V(c.min_temp + ' to ' + c.max_temp + ' °C')}, ground ${V(c.min_gts_temp + ' to ' + c.max_gts_temp + ' °C')}, pressure ${V(c.pressure + ' Pa')}`)}
          ${li('m', 'Measured', `Sky ${c.atmo_opacity.toLowerCase()}, UV ${c.local_uv_irradiance_index.toLowerCase()}`)}
          ${li('m', 'Measured', `The start is ${V(Math.round(startElev) + ' m')} on the Mars reference surface (the MOLA areoid; Mars has no sea level). Gale crater is one of the lowest places on the planet. Heights in this guide are differences along the route.`)}</ul>
        <h3>Radiation and space weather</h3>
        <ul>${li('m', 'Measured', `${V(RATE_MSV_PER_DAY + ' mSv')} per day on the surface at Gale crater (Curiosity RAD, 2012 to 2013)`)}
          ${li('d', 'Derived', `About ${V(a.dose.toFixed(2) + ' mSv')} ${S.pair ? 'each ' : ''}for this walk. No route-scale radiation data exists, so the route does not change it.`)}
          ${li('m', 'Measured', sw.text)}</ul>
        ${stops.filter((s) => s.st?.photo).map((s) => { const st = s.st!, ph = st.photo!; return `<h3>Stop ${s.i}: ${siteName(st)}</h3><ul><li class="plain">${st.note ? st.note + ' ' : ''}Curiosity worked here on sol ${st.sols[0]}${st.sols[1] > st.sols[0] ? ` to ${st.sols[1]}` : ''}: ${siteMeta(st)}.</li></ul><figure><img src="${ph.src}" alt="The ground at stop ${s.i}, seen by Curiosity"><figcaption>${ph.camera}, sol ${ph.sol} (${ph.date}). NASA/JPL-Caltech.</figcaption></figure>` }).join('')}
        <div class="limits"><h3>Limits</h3><ul>
          <li class="plain">Rocks smaller than about 1 m are not in the terrain model. Watch your footing.</li>
          <li class="plain">Walking speed is an Earth hiking model (Tobler) scaled to ${Math.round(P.suit * 100)}%. At 50% it matches NASA's Apollo planning figure of 2.5 km/h on flat ground, but that was the Moon, at a sixth of Earth's gravity; Mars has about two fifths.</li>
          <li class="plain">The ${P.limit}° slope limit, the ${RESERVE_MIN} minute daylight reserve${S.pair ? ' and the pair limits' : ''} are assumptions, not NASA limits.</li>
          <li class="plain">Sand, dust, wind and how the ground bears weight are not modelled.</li>
          <li class="plain">Sun position uses NASA's Mars24 method for the date of the weather record (${c.terrestrial_date}). Weather is from sol ${c.sol}, not today.</li>
          <li class="plain">Solar storm arrivals are model forecasts, not measurements at Mars.</li>
          <li class="plain">Ground colour in the 3D view is a tint. The orbital images are greyscale.</li>
        </ul></div>
        <h3>Sources</h3><ul>
          <li class="plain">Orbital images: HiRISE and CTX on Mars Reconnaissance Orbiter, NASA/JPL-Caltech/University of Arizona and MSSS, via <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener">NASA Mars Trek</a></li>
          <li class="plain">Terrain: <a href="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" target="_blank" rel="noopener">USGS Mars MSL Gale Merged DEM 1m</a> (Parker and Calef, 2016)</li>
          <li class="plain">Night temperature: THEMIS on Mars Odyssey, NASA/JPL-Caltech/Arizona State University</li>
          <li class="plain">Weather, radiation, drive path, stops and photos: Curiosity (REMS, RAD, localization, Navcam, raw image archive), NASA/JPL-Caltech. Site names and notes: <a href="https://science.nasa.gov/mission/msl-curiosity/" target="_blank" rel="noopener">Curiosity mission blog</a></li>
          <li class="plain">Space weather: <a href="https://kauai.ccmc.gsfc.nasa.gov/DONKI/" target="_blank" rel="noopener">NASA DONKI</a>, Community Coordinated Modeling Center</li>
          <li class="plain">Sun: Allison and McEwen (2000), the Mars24 algorithm. Walking: Tobler (1993) and Los Alamos report LA-UR-89-3858 on Apollo surface operations.</li>
        </ul>
      </div>
    </article>
  </div>`
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const k of ['direct', 'cautious'] as const) for (const q of S.routes[k]) if (q) for (let i = 0; i < q.xs.length; i += 4) { x0 = Math.min(x0, q.xs[i]); x1 = Math.max(x1, q.xs[i]); y0 = Math.min(y0, q.ys[i]); y1 = Math.max(y1, q.ys[i]) }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, half = Math.min(D.grid.cols / 2, Math.max(60, (x1 - x0) * 0.75, (y1 - y0) * 0.75 * (880 / 640)))
  const bx0 = Math.max(0, Math.min(D.grid.cols - 2 * half, mx - half)), byh = half * (640 / 880), by0 = Math.max(0, Math.min(D.grid.rows - 2 * byh, my - byh))
  const big = document.createElement('canvas'); big.width = 880; big.height = 640
  drawMini(big, false, { x0: bx0, y0: by0, x1: bx0 + 2 * half, y1: by0 + 2 * byh })
  ;($('#g-map') as HTMLImageElement).src = big.toDataURL('image/jpeg', 0.85)
  $('#g-close').onclick = closeGuide
  $('#gw').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGuide() })
  $('#g-close').focus()
}

boot()
declare global { interface Window { __mw: unknown } }
window.__mw = { S, P, get world() { return W } }
