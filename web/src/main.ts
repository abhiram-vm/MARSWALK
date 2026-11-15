// MARSWALK app: state, panels, timeline, HUD and field guide.
// AI-assisted (Claude Code). Behaviour is described in docs/DESIGN.md.
import './style.css'
import * as THREE from 'three'
import RoutingWorker from './routing.worker?worker&inline'
import { loadSite, type SiteData, type Station } from './data'
import { icon } from './icons'
import {
  analyse, at, astar, clock, compassWord, fmtMin, legs, legOf, parseClock, retime, round10, stormNear, sunAt, verdict,
  MARS_MIN, RATE_MSV_PER_DAY, RESERVE_MIN, type Check, type Params, type Pt, type Route, type SpaceWeather, type Verdict,
} from './model'
import { World } from './world'

type Kind = Route['kind']
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const html = (s: TemplateStringsArray, ...v: unknown[]) => s.reduce((a, b, i) => a + b + (i < v.length ? String(v[i]) : ''), '')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const store = { get(k: string) { try { return localStorage.getItem(k) } catch { return null } }, set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* private mode */ } } }
const MAX_STOPS = 4

const P: Params = { suit: 0.5, limit: 20, work: 30, depart: 540 }
const S = {
  pts: [] as Pt[], // pts[0] is the start; the rest are stops in order; the walk returns to the start
  active: 1, sel: 'direct' as Kind,
  routes: { direct: null, cautious: null } as Record<Kind, Route | null>, busy: false,
  tint: true, exag: false, layers: { slope: false, thermal: false, track: false, boundary: true },
  drawer: '' as '' | 'layers' | 'station', station: '', sw: null as (SpaceWeather & { source: string; live?: boolean }) | null,
}
let D: SiteData, W: World, sunrise = 0, sunset = 0
let worker: Worker | null = null, jobId = 0

// ---------------------------------------------------------------- shell
document.querySelector('#app')!.innerHTML = html`
  <canvas id="gl" tabindex="0" aria-label="3D view of the boxwork unit on Mount Sharp. Drag to orbit, right-drag or two fingers to pan, scroll to zoom, click the ground to place the selected point."></canvas>
  <div class="vignette"></div>
  <div class="pins" id="pins"></div>
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
    worker.onmessage = (e) => onSolved(e.data)
    worker.onerror = () => { worker = null; if (S.busy) recompute(pendingOpts) }
  } catch { worker = null }
  // Default walk: from the edge of the boxwork to the hollow Curiosity drilled, then the ridge beside it, and back.
  S.pts = ['S0', 'S1', 'S2'].map((id) => { const s = byId(id)!; return snap({ x: s.xy[0], y: s.xy[1] })! })
  W.setDepart(P.depart)
  W.setPoints(S.pts)
  W.onRender = drawOverlay
  W.onPick = onPick
  W.onCine = onCineFrame
  W.onCineEnd = onCineEnd
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
let pendingOpts: { fit: boolean; delay?: number; ms?: number; first?: boolean; note?: string } = { fit: false }
function recompute(opts: typeof pendingOpts) {
  pendingOpts = opts
  S.busy = true
  renderDecision()
  W.setPoints(S.pts)
  const idx = (p: Pt) => Math.round(p.y) * D.grid.cols + Math.round(p.x)
  const job = { id: ++jobId, points: [...S.pts, S.pts[0]].map(idx), limit: P.limit, suit: P.suit }
  if (worker) worker.postMessage(job)
  else setTimeout(() => {
    if (job.id !== jobId) return
    const g = D.grid, solve = (c: boolean) => job.points.slice(0, -1).map((s, i) => astar(g.elev, g.slope, g.cols, g.rows, g.cell, s, job.points[i + 1], job.limit, job.suit, c))
    onSolved({ id: job.id, direct: solve(false), cautious: solve(true) })
  }, 20)
}
function onSolved(r: { id: number; direct: (Int32Array | null)[]; cautious: (Int32Array | null)[] }) {
  if (r.id !== jobId) return
  S.busy = false
  S.routes = { direct: analyse(D.grid, r.direct, 'direct', P), cautious: analyse(D.grid, r.cautious, 'cautious', P) }
  if (!S.routes[S.sel]) S.sel = 'direct'
  const o = pendingOpts
  W.setRoutes(S.routes, S.sel, !o.first)
  renderAll()
  if (!S.routes.direct) {
    const bad = r.direct.findIndex((l) => !l)
    hint(`No walkable route for ${legName(bad)} under the ${P.limit}° limit. Move a point, or raise the limit under Assumptions.`, true)
  } else hint(o.note ?? `Click the ground to move ${pointName(S.active).toLowerCase()}.`)
  if (o.fit) setTimeout(() => W.flyTo(routePose(), o.ms ?? 1300), o.delay ?? 0)
  if (o.first) setTimeout(showCoach, reduce ? 0 : 5200)
}
function routePose() {
  const pts: THREE.Vector3[] = S.pts.map((q) => W.cellToWorld(q))
  const r = S.routes[S.sel] ?? S.routes.direct
  if (r) for (let i = 0; i < r.xs.length; i += 12) pts.push(W.cellToWorld({ x: r.xs[i], y: r.ys[i] }))
  return W.frame(pts, innerWidth > 900 ? 400 : 0, innerWidth > 900 ? 0 : innerHeight * 0.5)
}
function reanalyse() {
  for (const k of ['direct', 'cautious'] as const) { const r = S.routes[k]; S.routes[k] = r ? retime(r, P) : null }
  renderAll()
}
function onPick(cx: number, cy: number, inside: boolean) {
  if (!inside) return hint(cx < 0 ? 'That is beyond the mapped area.' : 'That point is outside the 1.4 km planning area. The land around it is shown for context only.', true)
  const p = snap({ x: cx, y: cy })
  if (!p) return hint(`That ground is steeper than the ${P.limit}° limit, with nothing walkable within 30 m. Pick another point or raise the limit under Assumptions.`, true)
  S.pts[S.active] = { x: p.x, y: p.y }
  dismissCoach()
  recompute({ fit: false, note: p.moved ? 'Moved to the nearest walkable ground.' : undefined })
}
const pointName = (i: number) => (i === 0 ? 'The start' : `Stop ${i}`)
const legName = (i: number) => (i === S.pts.length - 1 ? 'the walk back to the start' : i === 0 ? 'the leg to stop 1' : `the leg from stop ${i} to stop ${i + 1}`)

// ---------------------------------------------------------------- UI shell
function buildUI() {
  const c = D.conditions
  document.body.insertAdjacentHTML('beforeend', html`
  <header class="topbar">
    <span class="wordmark">MARSWALK</span>
    <div class="place"><b>Boxwork unit, Mount Sharp</b><span>Gale crater, 4.80° S 137.38° E</span></div>
    <div class="right">
      <span class="stamp">Weather: sol ${c.sol}, ${c.terrestrial_date}</span>
      <button class="btn" id="b-layers" aria-pressed="false">${icon.Stack}<span>Data layers</span></button>
      <button class="btn" id="b-guide">${icon.FileText}<span>Field guide</span></button>
    </div>
  </header>

  <aside class="rail surface" aria-label="Plan a walk">
    <div class="scroll">
      <section class="sec">
        <div class="sec-h"><h2>Science walk</h2><span class="aside" id="dist-line"></span></div>
        <ol class="itin" id="itin"></ol>
        <p class="edit-hint" id="edit-hint"></p>
        <div class="stations" id="stations"></div>
      </section>

      <section class="sec" aria-live="polite">
        <div class="decision" id="decision"></div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>Route</h2><span class="aside" id="limit-line"></span></div>
        <div class="options" id="options"></div>
        <p class="compare" id="compare"></p>
      </section>

      <section class="sec">
        <div class="actions">
          <button class="btn primary" id="b-walk">${icon.PersonSimpleWalk}<span>Walk it at eye level</span></button>
          <button class="btn" id="b-fly">${icon.Airplane}<span>Fly over</span></button>
          <button class="btn" id="b-guide2">${icon.FileText}<span>Field guide</span></button>
        </div>
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
          <p class="fine">The team's planning assumptions, not NASA limits. At 50%, flat-ground speed is 2.5 km/h, the figure NASA used for sustained suited walking on the Moon. Routes recompute when you change these.</p>
        </details>
      </section>
    </div>
  </aside>

  <section class="day surface" aria-label="Daylight">
    <div class="day-h"><b>Daylight</b><span id="day-sun"></span><span class="r" id="day-note">Drag the walk to change when you leave</span></div>
    <svg id="day" viewBox="0 0 1000 64" preserveAspectRatio="none" role="slider" tabindex="0" aria-label="Departure time" aria-valuemin="346" aria-valuemax="1150"></svg>
  </section>

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
      <li><span><b>Pick the stops.</b> Click the ground, or use a station photo. The default visits the hollow and the ridge Curiosity drilled in 2025.</span></li>
      <li><span><b>Read the call</b> and compare the two routes.</span></li>
      <li><span><b>Walk it</b> at eye level, then open the field guide.</span></li>
    </ol>
    <button class="btn primary" id="coach-ok" style="width:100%">Start planning</button>
  </div>

  <div class="cine-bar t"></div><div class="cine-bar b"></div>
  <div class="hud" id="hud" hidden>
    <div class="frame"></div>
    <div class="mode" id="hud-mode"></div>
    <div class="compass" aria-hidden="true"><div class="strip" id="strip"></div></div>
    <div class="ctl"><button class="btn" id="h-pause">${icon.Pause}<span>Pause</span></button><button class="btn" id="h-exit">${icon.X}<span>Exit</span></button></div>
    <div class="readouts">
      <div class="next" id="h-next"></div>
      <div class="row">
        <div>Walked<b id="h-dist"></b></div><div>Elevation<b id="h-elev"></b></div><div>Slope<b id="h-slope"></b></div>
        <div>Mars time<b id="h-clock"></b></div><div>Sun<b id="h-sun"></b></div><div>Dose so far<b id="h-dose"></b></div><div>Playback<b id="h-speed"></b></div>
      </div>
      <svg id="h-prof" viewBox="0 0 1000 46" preserveAspectRatio="none" aria-hidden="true"></svg>
    </div>
    <div class="arrive surface" id="arrive" hidden></div>
  </div>
  <div id="guide-root"></div>
  `)
  $('#stations').innerHTML = D.stations.filter((s) => D.photos[s.id]).map((s) => html`
    <button class="station" data-id="${s.id}" title="${s.note}"><img src="${D.photos[s.id].src}" alt=""><span><b>${s.id}</b>${shortName(s)}</span></button>`).join('')
  $('#stations').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('.station'); if (b) openStation(b.dataset.id!) })
  $('#pins').innerHTML = D.stations.map((s) => html`<button class="pin" data-id="${s.id}" style="visibility:hidden">${D.photos[s.id] ? icon.Camera : icon.MapPin}<b>${s.id}</b>${shortName(s)}</button>`).join('') + '<div id="tags"></div>'
  $('#pins').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pin, .tag')
    if (!b) return
    if (b.classList.contains('pin')) return openStation(b.dataset.id!)
    setActive(Number(b.dataset.i))
  })
  $('#itin').addEventListener('click', (e) => {
    const t = e.target as HTMLElement, row = t.closest<HTMLElement>('[data-i]')
    if (t.closest('.rm')) { removeStop(Number(row!.dataset.i)); return }
    if (t.closest('#add-stop')) { addStop(); return }
    if (t.closest('#rev')) { const st = S.pts[0]; S.pts = [st, ...S.pts.slice(1).reverse()]; recompute({ fit: true }); return }
    if (row) setActive(Number(row.dataset.i))
  })
  $('#b-walk').onclick = () => startCine('walk')
  $('#b-fly').onclick = () => startCine('fly')
  $('#b-guide').onclick = $('#b-guide2').onclick = openGuide
  $('#b-layers').onclick = () => (S.drawer === 'layers' ? closeDrawer() : openLayers())
  $('#z-in').onclick = () => W.zoom(1 / 1.4)
  $('#z-out').onclick = () => W.zoom(1.4)
  $('#z-fit').onclick = () => W.flyTo(routePose(), 1100)
  $('#z-north').onclick = () => W.faceNorth()
  $('#coach-ok').onclick = dismissCoach
  $('#h-exit').onclick = stopCine
  $('#h-pause').onclick = () => { const paused = W.pauseCine(); $('#h-pause').innerHTML = paused ? `${icon.Play}<span>Resume</span>` : `${icon.Pause}<span>Pause</span>` }
  const bind = (id: string, f: (v: number) => void, slow: boolean) => {
    let t = 0
    $(id).addEventListener('input', (e) => { const v = Number((e.target as HTMLInputElement).value); f(v); renderAssumptions(); if (slow) { clearTimeout(t); t = window.setTimeout(() => recompute({ fit: false }), 220) } else reanalyse() })
  }
  bind('#in-suit', (v) => (P.suit = v), true)
  bind('#in-limit', (v) => { P.limit = v; W.paintSlope(v); S.pts = S.pts.map((q) => { const p = snap(q); return p ? { x: p.x, y: p.y } : q }) }, true)
  bind('#in-work', (v) => (P.work = v), false)
  bindDay()
  bindMini()
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (W.mode !== 'orbit') stopCine(); else if ($('#guide-root').firstChild) closeGuide(); else closeDrawer() }
    if (e.key === ' ' && W.mode !== 'orbit') { e.preventDefault(); $('#h-pause').click() }
  })
}
const byId = (id: string) => D.stations.find((s) => s.id === id)
const shortName = (s: Station) => s.name.replace(/ \(.*/, '').replace('Approach waypoint', 'Approach')
function nearStation(p: Pt) { return D.stations.find((s) => Math.hypot(s.xy[0] - p.x, s.xy[1] - p.y) < 3.5) }
function lonlat(p: Pt) {
  const b = D.bounds, lon = b.west + ((p.x + 0.5) / D.grid.cols) * (b.east - b.west), lat = b.north - ((p.y + 0.5) / D.grid.rows) * (b.north - b.south)
  return `${Math.abs(lat).toFixed(4)}° S ${lon.toFixed(4)}° E`
}
const label = (p: Pt) => { const s = nearStation(p); return s ? `${s.id} ${shortName(s)}` : lonlat(p) }
function setActive(i: number) { S.active = i; renderItin(); hint(`Click the ground or a station photo to move ${pointName(i).toLowerCase()}.`) }
function addStop() {
  if (S.pts.length - 1 >= MAX_STOPS) return
  const last = S.pts[S.pts.length - 1]
  S.pts.push({ ...last })
  S.active = S.pts.length - 1
  renderItin()
  hint(`Click the ground or a station photo to place stop ${S.active}.`)
}
function removeStop(i: number) {
  if (S.pts.length <= 2 || i === 0) return
  S.pts.splice(i, 1)
  S.active = Math.min(S.active, S.pts.length - 1) || 1
  recompute({ fit: false })
}

// ---------------------------------------------------------------- rendering the panel
function renderAll() { renderItin(); renderDecision(); renderOptions(); renderAssumptions(); renderDay(); renderSpace(); if (S.drawer === 'layers') openLayers() }
function renderItin() {
  const r = S.routes[S.sel], n = S.pts.length
  const row = (i: number) => {
    const p = S.pts[i], leg = r && i > 0 ? `${fmtMin(r.legMin[i - 1])} walk` : ''
    return html`<li class="stop ${S.active === i ? 'on' : ''}" data-i="${i}">
      <i class="${i === 0 ? 's' : 'd'}">${i === 0 ? '' : i}</i>
      <button class="end" aria-pressed="${S.active === i}"><small>${i === 0 ? 'Start' : `Stop ${i}`}${leg ? ` <span class="mono">${leg}</span>` : ''}</small><strong>${label(p)}</strong></button>
      ${i > 0 && n > 2 ? `<button class="icon-btn rm" aria-label="Remove stop ${i}" title="Remove stop ${i}">${icon.X}</button>` : '<span></span>'}
    </li>`
  }
  $('#itin').innerHTML = S.pts.map((_, i) => row(i)).join('') + html`
    <li class="stop back"><i class="s"></i><span class="end"><small>Back to the start${r ? ` <span class="mono">${fmtMin(r.backMin)} walk</span>` : ''}</small><strong>${label(S.pts[0])}</strong></span><span></span></li>
    <li class="itin-actions">${n - 1 < MAX_STOPS ? `<button class="btn" id="add-stop">${icon.Plus}<span>Add a stop</span></button>` : ''}${n > 2 ? `<button class="btn" id="rev">${icon.ArrowsDownUp}<span>Reverse stops</span></button>` : ''}</li>`
  $('#edit-hint').innerHTML = `${icon.Crosshair}<span>Click the ground or a station photo to set ${pointName(S.active).toLowerCase()}.</span>`
  $('#dist-line').textContent = r ? `${round10(r.dist)} m round trip` : ''
  renderTags()
}
function renderTags() {
  $('#tags').innerHTML = S.pts.map((p, i) => { const s = nearStation(p); return `<button class="tag ${i ? 'dest' : ''}" data-i="${i}">${i ? `STOP ${i}` : 'START'}${s ? ` ${s.id}` : ''}</button>` }).join('')
}
function currentVerdict(): Verdict { return verdict(S.routes[S.sel], P, sunrise, sunset, S.sw, new Date().toISOString()) }
const checkIcon = (c: Check) => (c.state === 'bad' || c.state === 'warn' ? icon.WarningCircle : c.state === 'ok' ? icon.CheckCircle : icon.Info)
function renderDecision() {
  const el = $('#decision')
  if (S.busy) { el.className = 'decision'; el.innerHTML = '<div class="call-row"><span class="call" style="color:var(--ink-3)">...</span><div><strong>Computing routes</strong><span>Searching about 550,000 cells of terrain for each leg</span></div></div>'; return }
  const r = S.routes[S.sel], v = currentVerdict()
  el.className = `decision ${v.go ? 'go' : 'nogo'}`
  el.innerHTML = html`
    <div class="call-row"><span class="call">${v.go ? 'GO' : 'NO-GO'}</span><div><strong>${v.head}</strong><span>${r ? `Leaving at ${clock(P.depart)} local time, ${S.pts.length - 1} stop${S.pts.length > 2 ? 's' : ''}` : 'Change the points or the limit'}</span></div></div>
    ${r ? html`<div class="figures">
      <div><small>Whole walk</small><b>${fmtMin(r.walk)}</b></div>
      <div><small>Back by</small><b>${clock(v.back)}</b></div>
      <div><small>Radiation</small><b>${r.dose.toFixed(2)}<span style="font-size:12px"> mSv</span></b></div>
    </div>` : ''}
    <ul class="checks">${v.checks.map((c) => `<li class="${c.state}">${checkIcon(c)}<span>${c.text}</span></li>`).join('')}</ul>`
}
function renderOptions() {
  const d = S.routes.direct, c = S.routes.cautious
  $('#limit-line').textContent = `${P.limit}° limit`
  const opt = (k: Kind, r: Route | null, name: string) => html`
    <button class="option" data-k="${k}" aria-pressed="${S.sel === k}" ${r ? '' : 'disabled'}>
      <i class="sw ${k === 'cautious' ? 'dash' : ''}"></i><span class="nm">${name}</span><span class="tm">${r ? fmtMin(r.walk) : 'None'}</span>
      <span class="meta">${r ? `<span>${round10(r.dist)} m</span><span>${Math.round(r.over10 * 100)}% steep</span><span>max ${Math.round(r.maxSlope)}°</span>` : '<span>No route under the limit</span>'}</span>
    </button>`
  $('#options').innerHTML = opt('direct', d, 'Direct') + opt('cautious', c, 'Cautious')
  $('#options').querySelectorAll<HTMLButtonElement>('.option').forEach((b) => (b.onclick = () => { S.sel = b.dataset.k as Kind; W.styleRibbons(S.sel); renderAll() }))
  let txt = ''
  if (d && c) {
    const extra = round10(c.dist - d.dist), cut = Math.round((d.over10 - c.over10) * 100)
    txt = extra <= 0 || cut <= 2 ? 'Both routes cross nearly the same ground here.' : `Cautious walks about ${extra} m further to cut steep ground by ${cut} percentage points.`
  }
  $('#compare').textContent = txt
  const ok = !!S.routes[S.sel]
  for (const id of ['#b-walk', '#b-fly', '#b-guide2']) ($(id) as HTMLButtonElement).disabled = !ok
}
function renderAssumptions() {
  $('#o-suit').textContent = `${Math.round(P.suit * 100)}%`; $('#o-limit').textContent = `${P.limit}°`; $('#o-work').textContent = `${P.work} min`
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
  const r = S.routes[S.sel], v = currentVerdict()
  let curve = ''
  for (let m = T0; m <= T1; m += 10) { const el = sunAt(m, D.sun).el; curve += `${m === T0 ? 'M' : 'L'}${tx(m).toFixed(1)} ${(44 - (Math.max(0, el) / 90) * 38).toFixed(1)}` }
  const reserveStart = sunset - RESERVE_MIN / MARS_MIN
  let walk = ''
  if (r) {
    let t = P.depart
    const segs: string[] = []
    r.legMin.forEach((m, i) => {
      const a = t, b = a + m / MARS_MIN
      segs.push(`<rect class="${i === r.legMin.length - 1 ? 'seg-back' : 'seg-out'}" x="${tx(a)}" y="30" width="${Math.max(1, tx(b) - tx(a))}" height="12" rx="1.5"/>`)
      t = b
      if (i < r.legMin.length - 1) { const c = t + P.work / MARS_MIN; segs.push(`<rect class="seg-work" x="${tx(t)}" y="30" width="${Math.max(0, tx(c) - tx(t))}" height="12"/>`); t = c }
    })
    walk = `<g class="walk ${v.go ? '' : 'bad'}">${segs.join('')}<line class="grip" x1="${tx(P.depart)}" x2="${tx(P.depart)}" y1="24" y2="48"/></g>`
  }
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
  $('#day-sun').textContent = r ? `Leave ${clock(P.depart)}, back ${clock(v.back)}. Sun ${Math.round(s.el)}° in the ${compassWord(s.az)}.` : ''
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
    const m = toMin(e), r = S.routes[S.sel], end = r ? P.depart + r.walk / MARS_MIN : P.depart
    grab = m >= P.depart && m <= end ? m - P.depart : 0
    setDepart(m - grab)
  })
  svg.addEventListener('pointermove', (e) => { if (on) setDepart(toMin(e) - grab) })
  svg.addEventListener('pointerup', () => (on = false))
  svg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') setDepart(P.depart - 10); if (e.key === 'ArrowRight') setDepart(P.depart + 10) })
}

// ---------------------------------------------------------------- drawers
function openLayers() {
  S.drawer = 'layers'; $('#b-layers').setAttribute('aria-pressed', 'true')
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
function openStation(id: string) {
  const s = byId(id)!, ph = D.photos[id]
  S.drawer = 'station'; S.station = id; $('#b-layers').setAttribute('aria-pressed', 'false')
  const el = $('#drawer'); el.hidden = false; el.className = 'drawer surface station-card'
  const canAdd = S.pts.length - 1 < MAX_STOPS
  el.innerHTML = html`
    ${ph ? `<img src="${ph.src}" alt="Curiosity navigation camera view of the ground at station ${id}">` : ''}
    <div class="body">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><h3><b>${s.id}</b>${shortName(s)}</h3><button class="icon-btn" id="d-close" aria-label="Close">${icon.X}</button></div>
      <p>${s.note}. Curiosity stood here on sol ${s.sol}.</p>
      ${ph ? `<span class="cap">${ph.camera}, sol ${ph.sol}, ${ph.date}. NASA/JPL-Caltech.</span>` : ''}
      <div class="row">
        <button class="btn primary" id="st-set">${icon.Flag}<span>Set as ${pointName(S.active).toLowerCase()}</span></button>
        ${canAdd ? `<button class="btn" id="st-add">${icon.Plus}<span>Add as stop</span></button>` : `<button class="btn" id="st-start">${icon.MapPin}<span>Start here</span></button>`}
      </div>
    </div>`
  const put = (i: number) => {
    const p = snap({ x: s.xy[0], y: s.xy[1] })
    if (!p) return hint('That station is on ground over the slope limit.', true)
    if (i >= S.pts.length) S.pts.push({ x: p.x, y: p.y }); else S.pts[i] = { x: p.x, y: p.y }
    S.active = Math.min(i, S.pts.length - 1)
    closeDrawer(); dismissCoach(); recompute({ fit: true })
  }
  $('#st-set').onclick = () => put(S.active)
  const add = el.querySelector<HTMLButtonElement>('#st-add'), start = el.querySelector<HTMLButtonElement>('#st-start')
  if (add) add.onclick = () => put(S.pts.length)
  if (start) start.onclick = () => put(0)
  $('#d-close').onclick = closeDrawer
  W.flyTo({ ...W.pose(), target: W.cellToWorld({ x: s.xy[0], y: s.xy[1] }), dist: Math.min(W.pose().dist, 700) }, 900)
}
function closeDrawer() { S.drawer = ''; $('#drawer').hidden = true; $('#b-layers').setAttribute('aria-pressed', 'false') }

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
  for (const b of document.querySelectorAll<HTMLElement>('.pin')) {
    const s = byId(b.dataset.id!)!, p = ground(s.xy[0], s.xy[1], 10)
    const taken = S.pts.some((q) => Math.hypot(q.x - s.xy[0], q.y - s.xy[1]) < 4)
    const hide = !p.on || W.mode !== 'orbit' || taken
    b.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`
  }
  // Stop tags can sit almost on top of each other (S1 and S2 are 10 m apart), so stack
  // any that overlap on screen instead of drawing one over the other.
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const tags = [...document.querySelectorAll<HTMLElement>('.tag')].map((el) => {
    const i = Number(el.dataset.i), pt = S.pts[i]
    const p = pt ? ground(pt.x, pt.y, i === 0 ? 48 : i === S.pts.length - 1 ? 82 : 64) : { x: 0, y: 0, on: false }
    return { el, i, p, hide: !pt || !p.on || (W.mode === 'walk' && i === 0) }
  }).sort((a, b) => b.p.y - a.p.y)
  for (const t of tags) {
    t.el.style.visibility = t.hide ? 'hidden' : 'visible'
    if (t.hide) continue
    const w = t.el.offsetWidth || 90, h = t.el.offsetHeight || 22
    let y = t.p.y
    for (let guard = 0; guard < 6 && placed.some((q) => Math.abs(q.x - t.p.x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < h + 3); guard++) y -= h + 4
    placed.push({ x: t.p.x, y, w, h })
    t.el.style.transform = `translate(${t.p.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
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
  for (const k of (S.sel === 'direct' ? ['cautious', 'direct'] : ['direct', 'cautious']) as Kind[]) {
    const r = S.routes[k]; if (!r) continue
    x.beginPath()
    for (let i = 0; i < r.xs.length; i += 3) { const X = r.xs[i] * sx, Y = r.ys[i] * sy; if (i) x.lineTo(X, Y); else x.moveTo(X, Y) }
    x.strokeStyle = '#0b0d0e'; x.lineWidth = (k === S.sel ? 7 : 5) * u; x.setLineDash([]); x.stroke()
    x.strokeStyle = k === 'direct' ? '#f2662f' : '#f4f1ec'; x.lineWidth = (k === S.sel ? 3.5 : 2.5) * u
    x.setLineDash(k === 'cautious' ? [8 * u, 6 * u] : []); x.globalAlpha = k === S.sel ? 1 : 0.6; x.stroke(); x.globalAlpha = 1; x.setLineDash([])
  }
  for (const s of D.stations) { x.fillStyle = '#f4f1ec'; x.strokeStyle = '#0b0d0e'; x.lineWidth = 2; x.beginPath(); x.rect(s.xy[0] * sx - 4, s.xy[1] * sy - 4, 8, 8); x.fill(); x.stroke() }
  S.pts.forEach((p, i) => {
    x.beginPath(); x.arc(p.x * sx, p.y * sy, 9 * u, 0, 7); x.fillStyle = i ? '#f2662f' : '#f4f1ec'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#0b0d0e'; x.stroke()
    if (i) { x.fillStyle = '#140b06'; x.font = `700 ${Math.round(11 * u)}px "B612 Mono", monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i), p.x * sx, p.y * sy + 0.5) }
  })
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
    const b = (e.target as HTMLElement).getBoundingClientRect(), px = ((e.clientX - b.left) / b.width) * D.grid.cols, py = ((e.clientY - b.top) / b.height) * D.grid.rows
    W.flyTo({ ...W.pose(), target: W.cellToWorld({ x: px, y: py }) }, 900)
  })
}

// ---------------------------------------------------------------- walk and flyover
let cineKind: 'walk' | 'fly' = 'walk', cineLegs: ReturnType<typeof legs> = [], cineEnd = 0, lastStop = -1
function startCine(kind: 'walk' | 'fly') {
  const r = S.routes[S.sel]
  if (!r) return
  closeDrawer(); dismissCoach(); closeGuide()
  // Walk to the last stop; the way back is the same kind of ground and would double the rehearsal.
  cineKind = kind; cineEnd = r.d[r.stopAt[r.stopAt.length - 2]]; lastStop = -1
  cineLegs = legs(D.grid, r, 0, r.stopAt[r.stopAt.length - 2])
  const outSec = r.outMin * 60, dur = kind === 'walk' ? Math.max(32, Math.min(90, outSec / 20)) : Math.max(16, Math.min(30, cineEnd / 30))
  document.body.classList.add('cine'); $('#hud').hidden = false; $('#arrive').hidden = true
  $('#hud-mode').textContent = kind === 'walk' ? 'WALK. EYE HEIGHT 1.8 M. TRUE SCALE.' : 'FLYOVER. 75 M ABOVE THE ROUTE.'
  $('#h-speed').textContent = `×${Math.round(outSec / dur)}`
  $('#h-pause').innerHTML = `${icon.Pause}<span>Pause</span>`
  const iEnd = r.stopAt[r.stopAt.length - 2]
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i <= iEnd; i += 2) { lo = Math.min(lo, r.z[i]); hi = Math.max(hi, r.z[i]) }
  if (hi - lo < 6) { hi += 3; lo -= 3 }
  let d = ''
  for (let i = 0; i <= iEnd; i += 2) d += `${i ? 'L' : 'M'}${((r.d[i] / cineEnd) * 1000).toFixed(1)} ${(4 + ((hi - r.z[i]) / (hi - lo)) * 38).toFixed(1)}`
  const ticks = r.stopAt.slice(0, -2).map((k) => { const xx = ((r.d[k] / cineEnd) * 1000).toFixed(1); return `<line class="cur" style="opacity:.45" vector-effect="non-scaling-stroke" x1="${xx}" x2="${xx}" y1="0" y2="46"/>` }).join('')
  $('#h-prof').innerHTML = `<path class="pf" vector-effect="non-scaling-stroke" d="${d}L1000 46L0 46Z"/>${ticks}<line class="cur" id="h-cur" vector-effect="non-scaling-stroke" x1="0" x2="0" y1="0" y2="46"/>`
  if (!$('#strip').childElementCount) {
    let s = ''
    for (let i = -2; i < 27; i++) { const deg = (((i * 15) % 360) + 360) % 360, c = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[deg]; s += `<span${c ? ' class="c"' : ''}>${c ?? deg}</span>` }
    $('#strip').innerHTML = s
  }
  W.startCine(kind, r, dur, cineEnd, (dist) => clockAt(r, dist))
}
function onCineFrame(f: { dist: number; heading: number }) {
  const r = S.routes[S.sel]!, a = at(r, f.dist / r.dist), sim = clockAt(r, f.dist), sun = sunAt(sim, D.sun), slope = D.grid.slope[a.cell]
  $('#strip').style.transform = `translateX(${(-((f.heading / 15 + 2) * 40 + 20)).toFixed(1)}px)`
  $('#h-dist').textContent = `${Math.round(f.dist)} / ${round10(cineEnd)} m`
  $('#h-elev').textContent = `${Math.round(a.elev)} m`
  const sl = $('#h-slope'); sl.textContent = `${Math.round(slope)}°`; sl.className = slope > 15 ? 'alarm' : slope > 10 ? 'warn' : ''
  $('#h-clock').textContent = clock(sim)
  $('#h-sun').textContent = `${Math.round(sun.el)}°`
  $('#h-dose').textContent = `${(((sim - P.depart) * MARS_MIN) / 1440 * RATE_MSV_PER_DAY).toFixed(3)} mSv`
  const leg = legOf(r, a.i), stopDist = r.d[r.stopAt[leg]]
  if (leg > lastStop && leg > 0 && f.dist >= r.d[r.stopAt[leg - 1]]) lastStop = leg
  let next = '', warn = false
  for (const l of cineLegs) if (l.from > f.dist + 2 && l.from < stopDist && l.k >= 2) { next = `${l.k === 3 ? 'Very steep ground' : 'Steep ground'} in ${Math.max(5, round10(l.from - f.dist))} m. Slow down and check footing.`; warn = true; break }
  if (!next) {
    const left = stopDist - f.dist, st = nearStation(S.pts[leg + 1] ?? S.pts[0])
    next = left > 15 ? `Stop ${leg + 1}${st ? `, ${shortName(st)},` : ''} in ${round10(left)} m. Follow the beacon.` : `At stop ${leg + 1}. ${P.work} min of science planned here.`
  }
  const n = $('#h-next'); n.textContent = next; n.className = `next ${warn ? 'warn' : ''}`
  const cur = $('#h-cur')
  if (cur) { const xx = ((f.dist / cineEnd) * 1000).toFixed(1); cur.setAttribute('x1', xx); cur.setAttribute('x2', xx) }
}
function onCineEnd() {
  if (cineKind === 'fly') { setTimeout(stopCine, reduce ? 0 : 900); return }
  const k = S.pts.length - 1, st = nearStation(S.pts[k]), ph = st && D.photos[st.id]
  $('#h-next').textContent = `Arrived at stop ${k}. The walk back is ${fmtMin(S.routes[S.sel]!.backMin)}. Press Exit to return to the map.`
  if (ph && st) {
    const el = $('#arrive'); el.hidden = false
    el.innerHTML = `<img src="${ph.src}" alt="The ground at ${st.id} seen by Curiosity"><div><b>${st.id} ${shortName(st)}</b><br>${st.note}.<small>What Curiosity saw here. ${ph.camera}, sol ${ph.sol}. NASA/JPL-Caltech.</small></div>`
  }
}
function stopCine() {
  if (W.mode === 'orbit') return
  W.stopCine(S.exag ? 2 : 1)
  document.body.classList.remove('cine'); $('#hud').hidden = true
  W.flyTo(routePose(), 1400)
}

// ---------------------------------------------------------------- field guide
function closeGuide() { $('#guide-root').innerHTML = '' }
function openGuide() {
  const r = S.routes[S.sel]
  if (!r) return
  const c = D.conditions, v = currentVerdict(), sun = sunAt(P.depart, D.sun), sw = spaceSummary()
  const words = ['Gentle ground', 'Moderate slope', 'Steep, slow down', 'Very steep, take care']
  const li = (m: string, w: string, t: string) => `<li><span class="mk mk-${m}" role="img" aria-label="${w}"></span><span>${t}</span></li>`
  const V = (t: string | number) => `<span class="v">${t}</span>`
  // planned arrival at each stop, and the turn-back time: 1.5 times the planned elapsed time
  let elapsed = 0
  const stops = S.pts.slice(1).map((p, i) => {
    elapsed += r.legMin[i]
    const arrive = P.depart + elapsed / MARS_MIN, turn = P.depart + (elapsed * 1.5) / MARS_MIN
    elapsed += P.work
    return { p, i: i + 1, arrive, turn, st: nearStation(p) }
  })
  const legBlocks = r.legMin.map((m, i) => {
    const from = i ? r.stopAt[i - 1] : 0, to = r.stopAt[i], dist = r.d[to] - r.d[from]
    const title = i === r.legMin.length - 1 ? `Back to the start` : `To stop ${i + 1}`
    const rows = legs(D.grid, r, from, to).map((l) => {
      const dz = r.z[l.iTo] - r.z[l.iFrom]
      return `<div class="leg"><i class="g${l.k}"></i><span class="mono">${Math.round(l.from - r.d[from])} to ${Math.round(l.to - r.d[from])} m</span><span>${words[l.k]}</span><span class="mono">${Math.abs(dz) < 1 ? 'level' : `${dz > 0 ? 'up' : 'down'} ${Math.abs(Math.round(dz))} m`}</span></div>`
    }).join('')
    return `<h4 class="leg-h">${title} <span class="mono">${round10(dist)} m, ${fmtMin(m)}</span></h4>${rows}`
  }).join('')
  $('#guide-root').innerHTML = html`
  <div class="guide-wrap" id="gw">
    <article class="guide" role="dialog" aria-modal="true" aria-label="Field guide">
      <header><div><b>FIELD GUIDE</b><span>${S.sel === 'direct' ? 'Direct' : 'Cautious'} route, ${S.pts.length - 1} stop${S.pts.length > 2 ? 's' : ''} from ${label(S.pts[0])}</span></div><button class="icon-btn" id="g-close" aria-label="Close field guide">${icon.X}</button></header>
      <div class="content">
        <div class="key"><span><i class="mk mk-m"></i> measured</span><span><i class="mk mk-d"></i> derived</span><span><i class="mk mk-a"></i> assumed</span><span><i class="mk mk-s"></i> simulated</span></div>
        <div class="verdict ${v.go ? 'go' : 'nogo'}"><b>${v.go ? 'GO' : 'NO-GO'}</b><span>${v.head}. Leave ${clock(P.depart)}, back by ${clock(v.back)} local time.</span></div>
        <h3>Objective</h3>
        <ul><li class="plain">Sample boxwork hollows and the ridges beside them, to learn why the ridges resisted erosion while the hollows did not. Curiosity drilled one such pair in late 2025; a crew on foot can sample several in one walk and choose each next sample from what the last one showed.</li></ul>
        <h3>Route map</h3>
        <figure><img id="g-map" alt="Map of the route over the orbital image"><figcaption>North up. HiRISE image, NASA/JPL-Caltech/University of Arizona. Orange solid: Direct. White dashed: Cautious. Numbered: stops.</figcaption></figure>
        <h3>Timeline</h3>
        <ul>
          ${li('s', 'Simulated', `Leave ${V(label(S.pts[0]))} at ${V(clock(P.depart))}, from a notional rover park`)}
          ${stops.map((s) => li('a', 'Assumed', `Stop ${s.i}${s.st ? `, ${s.st.id} ${shortName(s.st)}` : ''}: arrive about ${V(clock(s.arrive))}, ${V(P.work + ' min')} of science`)).join('')}
          ${li('a', 'Assumed', `Back at the start about ${V(clock(v.back))}. Whole walk ${V(fmtMin(r.walk))}, ${V(round10(r.dist) + ' m')}, climb ${V(Math.round(r.climb) + ' m')}`)}
        </ul>
        <h3>Turn back if</h3>
        <ul>
          ${stops.map((s) => li('a', 'Assumed', `You have not reached stop ${s.i} by ${V(clock(s.turn))}, one and a half times the planned time.`)).join('')}
          ${li('d', 'Derived', `The walk back from the last stop takes ${V(fmtMin(r.backMin))}.`)}
          ${li('d', 'Derived', `You would return after ${V(clock(sunset - RESERVE_MIN / MARS_MIN))}, when the last hour of daylight begins.`)}
          ${li('a', 'Assumed', 'A solar particle alert is issued while you are out. Return to the rover, which is the nearest shelter.')}
        </ul>
        <h3>Leg by leg</h3><div>${legBlocks}</div>
        <h3>Light</h3>
        <ul>${li('d', 'Derived', `At departure the sun is ${V(Math.round(sun.el) + '°')} high in the ${compassWord(sun.az)}. The 3D view shows which ground is in shadow.`)}
          ${li('m', 'Measured', `Sunrise ${V(c.sunrise)}, sunset ${V(c.sunset)} local mean solar time`)}</ul>
        <h3>Conditions</h3>
        <ul>${li('m', 'Measured', `Air ${V(c.min_temp + ' to ' + c.max_temp + ' °C')}, ground ${V(c.min_gts_temp + ' to ' + c.max_gts_temp + ' °C')}, pressure ${V(c.pressure + ' Pa')}`)}
          ${li('m', 'Measured', `Sky ${c.atmo_opacity.toLowerCase()}, UV ${c.local_uv_irradiance_index.toLowerCase()}`)}</ul>
        <h3>Radiation and space weather</h3>
        <ul>${li('m', 'Measured', `${V(RATE_MSV_PER_DAY + ' mSv')} per day on the surface at Gale crater (Curiosity RAD, 2012 to 2013)`)}
          ${li('d', 'Derived', `About ${V(r.dose.toFixed(2) + ' mSv')} for this walk. No route-scale radiation data exists, so the route does not change it.`)}
          ${li('m', 'Measured', sw.text)}</ul>
        ${stops.filter((s) => s.st && D.photos[s.st.id]).map((s) => { const ph = D.photos[s.st!.id]; return `<h3>Stop ${s.i}: ${s.st!.id} ${shortName(s.st!)}</h3><ul><li class="plain">${s.st!.note}. Curiosity stood here on sol ${s.st!.sol}.</li></ul><figure><img src="${ph.src}" alt="The ground at stop ${s.i}, seen by Curiosity"><figcaption>${ph.camera}, sol ${ph.sol} (${ph.date}). NASA/JPL-Caltech.</figcaption></figure>` }).join('')}
        <div class="limits"><h3>Limits</h3><ul>
          <li class="plain">Rocks smaller than about 1 m are not in the terrain model. Watch your footing.</li>
          <li class="plain">Walking speed is an Earth hiking model (Tobler) scaled to ${Math.round(P.suit * 100)}%. At 50% it matches NASA's Apollo planning figure of 2.5 km/h on flat ground, but that was the Moon, at a sixth of Earth's gravity; Mars has about two fifths.</li>
          <li class="plain">The ${P.limit}° slope limit and the ${RESERVE_MIN} minute daylight reserve are assumptions, not NASA limits.</li>
          <li class="plain">Sand, dust, wind and how the ground bears weight are not modelled.</li>
          <li class="plain">Sun position uses NASA's Mars24 method for the date of the weather record (${c.terrestrial_date}). Weather is from sol ${c.sol}, not today.</li>
          <li class="plain">Solar storm arrivals are model forecasts, not measurements at Mars.</li>
          <li class="plain">Ground colour in the 3D view is a tint. The orbital images are greyscale.</li>
        </ul></div>
        <h3>Sources</h3><ul>
          <li class="plain">Orbital images: HiRISE and CTX on Mars Reconnaissance Orbiter, NASA/JPL-Caltech/University of Arizona and MSSS, via <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener">NASA Mars Trek</a></li>
          <li class="plain">Terrain: <a href="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" target="_blank" rel="noopener">USGS Mars MSL Gale Merged DEM 1m</a> (Parker and Calef, 2016)</li>
          <li class="plain">Night temperature: THEMIS on Mars Odyssey, NASA/JPL-Caltech/Arizona State University</li>
          <li class="plain">Weather, radiation, drive path and photos: Curiosity (REMS, RAD, localization, Navcam), NASA/JPL-Caltech</li>
          <li class="plain">Space weather: <a href="https://kauai.ccmc.gsfc.nasa.gov/DONKI/" target="_blank" rel="noopener">NASA DONKI</a>, Community Coordinated Modeling Center</li>
          <li class="plain">Sun: Allison and McEwen (2000), the Mars24 algorithm. Walking: Tobler (1993) and Los Alamos report LA-UR-89-3858 on Apollo surface operations.</li>
        </ul>
      </div>
    </article>
  </div>`
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const k of ['direct', 'cautious'] as const) { const q = S.routes[k]; if (q) for (let i = 0; i < q.xs.length; i += 4) { x0 = Math.min(x0, q.xs[i]); x1 = Math.max(x1, q.xs[i]); y0 = Math.min(y0, q.ys[i]); y1 = Math.max(y1, q.ys[i]) } }
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
