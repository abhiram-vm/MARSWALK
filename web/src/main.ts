// MARSWALK app: state, panels, timeline, HUD and field guide.
// AI-assisted (Claude Code). Behaviour is described in docs/DESIGN.md.
import './style.css'
import * as THREE from 'three'
import RoutingWorker from './routing.worker?worker&inline'
import { loadSite, type SiteData, type Station } from './data'
import { icon } from './icons'
import {
  analyse, at, clock, compassWord, fmtMin, legs, parseClock, round10, sunAt, verdict, astar,
  MARS_MIN, RATE_MSV_PER_SOL, RESERVE_MIN, type Params, type Pt, type Route, type Verdict,
} from './model'
import { World } from './world'

type Kind = Route['kind']
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const html = (s: TemplateStringsArray, ...v: unknown[]) => s.reduce((a, b, i) => a + b + (i < v.length ? String(v[i]) : ''), '')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const store = { get(k: string) { try { return localStorage.getItem(k) } catch { return null } }, set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* private mode */ } } }

const P: Params = { suit: 0.5, limit: 20, work: 30, depart: 540 }
const S = {
  start: { x: 0, y: 0 } as Pt, dest: { x: 0, y: 0 } as Pt, editing: 'dest' as 'start' | 'dest', sel: 'direct' as Kind,
  routes: { direct: null, cautious: null } as Record<Kind, Route | null>, busy: false,
  tint: true, exag: false, layers: { slope: false, thermal: false, track: false, boundary: true }, drawer: '' as '' | 'layers' | 'station', station: '' as string,
}
let D: SiteData, W: World, sunrise = 0, sunset = 0
let worker: Worker | null = null, jobId = 0

// ---------------------------------------------------------------- shell
document.querySelector('#app')!.innerHTML = html`
  <canvas id="gl" tabindex="0" aria-label="3D view of the boxwork unit on Mount Sharp. Drag to orbit, right-drag or two fingers to pan, scroll to zoom, click the ground to place the active point."></canvas>
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
  buildUI()
  try {
    worker = new RoutingWorker()
    worker.postMessage({ init: true, elev: D.grid.elev, slope: D.grid.slope, cols: D.grid.cols, rows: D.grid.rows, cell: D.grid.cell })
    worker.onmessage = (e) => onSolved(e.data)
    worker.onerror = () => { worker = null; if (S.busy) recompute(pendingOpts) }
  } catch { worker = null }
  const st = byId('S0')!, sd = byId('S1')!
  S.start = snap({ x: st.xy[0], y: st.xy[1] })!; S.dest = snap({ x: sd.xy[0], y: sd.xy[1] })!
  W.setDepart(P.depart)
  W.setEnds(S.start, S.dest)
  W.onRender = drawOverlay
  W.onPick = onPick
  W.onCine = onCineFrame
  W.onCineEnd = onCineEnd
  W.onUserMove = () => { if (S.drawer === 'station') closeDrawer() }
  W.setPose({ target: new THREE.Vector3(0, 0, 0), dist: 9200, yaw: 0.25, pitch: 1.18 })
  $('#loading').classList.add('done')
  setTimeout(() => $('#loading').remove(), 700)
  if (!reduce) $('#title').classList.add('show')
  renderAll()
  recompute({ fit: true, delay: reduce ? 0 : 900, ms: reduce ? 0 : 4600, first: true })
}

// ---------------------------------------------------------------- routing
function snap(p: Pt): Pt | null {
  const { cols, rows, slope } = D.grid
  const x0 = Math.max(0, Math.min(cols - 1, Math.round(p.x))), y0 = Math.max(0, Math.min(rows - 1, Math.round(p.y)))
  if (slope[y0 * cols + x0] <= P.limit) return { x: x0, y: y0 }
  for (let r = 1; r <= 15; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const x = x0 + dx, y = y0 + dy
    if (x >= 0 && y >= 0 && x < cols && y < rows && slope[y * cols + x] <= P.limit) return { x, y, moved: true } as Pt
  }
  return null
}
let pendingOpts: { fit: boolean; delay?: number; ms?: number; first?: boolean; note?: string } = { fit: false }
function recompute(opts: typeof pendingOpts) {
  pendingOpts = opts
  S.busy = true
  renderDecision()
  W.setEnds(S.start, S.dest)
  const job = { id: ++jobId, s: S.start.y * D.grid.cols + S.start.x, g: S.dest.y * D.grid.cols + S.dest.x, limit: P.limit, suit: P.suit }
  if (worker) worker.postMessage(job)
  else setTimeout(() => {
    if (job.id !== jobId) return
    const g = D.grid
    onSolved({ id: job.id, direct: astar(g.elev, g.slope, g.cols, g.rows, g.cell, job.s, job.g, job.limit, job.suit, false), cautious: astar(g.elev, g.slope, g.cols, g.rows, g.cell, job.s, job.g, job.limit, job.suit, true) })
  }, 20)
}
function onSolved(r: { id: number; direct: Int32Array | null; cautious: Int32Array | null }) {
  if (r.id !== jobId) return
  S.busy = false
  S.routes = { direct: analyse(D.grid, r.direct, 'direct', P), cautious: analyse(D.grid, r.cautious, 'cautious', P) }
  if (!S.routes[S.sel]) S.sel = 'direct'
  const o = pendingOpts
  W.setRoutes(S.routes, S.sel, !o.first)
  renderAll()
  if (!S.routes.direct) hint(`No walkable route joins these points under the ${P.limit}° limit. Move a point, or raise the limit under Assumptions.`, true)
  else hint(o.note ?? `Click the ground to move the ${S.editing === 'dest' ? 'destination' : 'start'}.`)
  if (o.fit) setTimeout(() => W.flyTo(routePose(), o.ms ?? 1300), o.delay ?? 0)
  if (o.first) setTimeout(showCoach, reduce ? 0 : 5200)
}
function routePose() {
  const pts: THREE.Vector3[] = []
  const r = S.routes[S.sel] ?? S.routes.direct
  for (const q of [S.start, S.dest]) pts.push(W.cellToWorld(q))
  if (r) for (let i = 0; i < r.path.length; i += 8) pts.push(W.cellToWorld({ x: r.path[i] % D.grid.cols, y: (r.path[i] / D.grid.cols) | 0 }))
  return W.frame(pts, innerWidth > 900 ? 400 : 0, innerWidth > 900 ? 0 : innerHeight * 0.5)
}
function reanalyse() {
  const g = D.grid
  for (const k of ['direct', 'cautious'] as const) { const r = S.routes[k]; S.routes[k] = r ? analyse(g, r.path, k, P) : null }
  renderAll()
}
function onPick(cx: number, cy: number, inside: boolean) {
  if (!inside) return hint(cx < 0 ? 'That is beyond the mapped area.' : 'That point is outside the 1.4 km planning area. The land around it is shown for context only.', true)
  const p = snap({ x: cx, y: cy })
  if (!p) return hint(`That ground is steeper than the ${P.limit}° limit, with nothing walkable within 30 m. Pick another point or raise the limit under Assumptions.`, true)
  S[S.editing] = { x: p.x, y: p.y }
  dismissCoach()
  recompute({ fit: false, note: (p as Pt & { moved?: boolean }).moved ? 'Moved to the nearest walkable ground.' : undefined })
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
      <button class="btn" id="b-layers" aria-pressed="false">${icon.Stack}<span>Data layers</span></button>
      <button class="btn" id="b-guide">${icon.FileText}<span>Field guide</span></button>
    </div>
  </header>

  <aside class="rail surface" aria-label="Plan a walk">
    <div class="scroll">
      <section class="sec">
        <div class="sec-h"><h2>Walk</h2><span class="aside" id="dist-line"></span></div>
        <div class="ends">
          <div class="spine"><i class="s"></i><b></b><i class="d"></i></div>
          <button class="end" id="e-start"><small>Start</small><strong id="l-start"></strong></button>
          <button class="end" id="e-dest"><small>Destination</small><strong id="l-dest"></strong></button>
          <button class="icon-btn swap" id="b-swap" title="Swap start and destination" aria-label="Swap start and destination">${icon.ArrowsDownUp}</button>
        </div>
        <p class="edit-hint" id="edit-hint"></p>
        <div class="stations" id="stations"></div>
      </section>

      <section class="sec" aria-live="polite">
        <div class="decision" id="decision"></div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>Route</h2><span class="aside">${P.limit}° limit</span></div>
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
        <details class="assume">
          <summary>Assumptions${icon.CaretDown}</summary>
          <div class="field"><label for="in-suit">Suit and load, share of normal walking speed</label><output id="o-suit"></output>
            <input type="range" id="in-suit" min="0.3" max="0.8" step="0.05" value="0.5"></div>
          <div class="field"><label for="in-limit">Steepest ground allowed</label><output id="o-limit"></output>
            <input type="range" id="in-limit" min="12" max="30" step="1" value="20"></div>
          <div class="field"><label for="in-work">Time at the destination</label><output id="o-work"></output>
            <input type="range" id="in-work" min="0" max="120" step="10" value="30"></div>
          <p class="fine">These are the team's planning assumptions, not NASA values. Routes recompute when you change them.</p>
        </details>
      </section>
    </div>
  </aside>

  <section class="day surface" aria-label="Daylight">
    <div class="day-h"><b>Daylight</b><span id="day-sun"></span><span class="r" id="day-note">Drag the walk to change when you leave</span></div>
    <svg id="day" viewBox="0 0 1000 64" preserveAspectRatio="none" role="slider" tabindex="0" aria-label="Departure time" aria-valuemin="420" aria-valuemax="1080"></svg>
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
    <h2>Plan a walk on Mars</h2>
    <ol>
      <li><span><b>Click the ground</b> to choose where to go, or pick a science station.</span></li>
      <li><span><b>Read the call</b> and compare the two routes.</span></li>
      <li><span><b>Walk it</b> at eye level before you go, then open the field guide.</span></li>
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
        <div>Time out<b id="h-time"></b></div><div>Mars time<b id="h-clock"></b></div><div>Sun<b id="h-sun"></b></div><div>Playback<b id="h-speed"></b></div>
      </div>
      <svg id="h-prof" viewBox="0 0 1000 46" preserveAspectRatio="none" aria-hidden="true"></svg>
    </div>
    <div class="arrive surface" id="arrive" hidden></div>
  </div>
  <div id="guide-root"></div>
  `)
  // stations strip
  $('#stations').innerHTML = D.stations.filter((s) => D.photos[s.id]).map((s) => html`
    <button class="station" data-id="${s.id}" title="${s.note}"><img src="${D.photos[s.id].src}" alt=""><span><b>${s.id}</b>${shortName(s)}</span></button>`).join('')
  $('#stations').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('.station'); if (b) openStation(b.dataset.id!) })
  // pins in 3D
  $('#pins').innerHTML = D.stations.map((s) => html`<button class="pin" data-id="${s.id}" style="visibility:hidden">${D.photos[s.id] ? icon.Camera : icon.MapPin}<b>${s.id}</b>${shortName(s)}</button>`).join('') +
    '<button class="tag" id="tag-start">START</button><button class="tag dest" id="tag-dest">DEST</button>'
  $('#pins').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pin, .tag')
    if (!b) return
    if (b.classList.contains('pin')) return openStation(b.dataset.id!)
    const s = nearStation(b.id === 'tag-start' ? S.start : S.dest)
    if (s) openStation(s.id); else setEditing(b.id === 'tag-start' ? 'start' : 'dest')
  })
  // controls
  $('#e-start').onclick = () => setEditing('start')
  $('#e-dest').onclick = () => setEditing('dest')
  $('#b-swap').onclick = () => { const t = S.start; S.start = S.dest; S.dest = t; recompute({ fit: true }) }
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
  bind('#in-limit', (v) => { P.limit = v; W.paintSlope(v); for (const k of ['start', 'dest'] as const) { const p = snap(S[k]); if (p) S[k] = { x: p.x, y: p.y } } }, true)
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
function setEditing(k: 'start' | 'dest') { S.editing = k; renderEnds(); hint(`Click the ground to move the ${k === 'dest' ? 'destination' : 'start'}.`) }

// ---------------------------------------------------------------- rendering the panel
function renderAll() { renderEnds(); renderDecision(); renderOptions(); renderAssumptions(); renderDay(); if (S.drawer === 'layers') openLayers() }
function renderTags() {
  for (const [id, p, word] of [['#tag-start', S.start, 'START'], ['#tag-dest', S.dest, 'DEST']] as const) { const s = nearStation(p); $(id).textContent = s ? `${word} ${s.id}` : word }
}
function renderEnds() {
  renderTags()
  $('#l-start').textContent = label(S.start); $('#l-dest').textContent = label(S.dest)
  $('#e-start').setAttribute('aria-pressed', String(S.editing === 'start')); $('#e-dest').setAttribute('aria-pressed', String(S.editing === 'dest'))
  $('#edit-hint').innerHTML = `${icon.Crosshair}<span>Click the ground or a station photo to set the ${S.editing === 'dest' ? 'destination' : 'start'}.</span>`
  const r = S.routes[S.sel]
  $('#dist-line').textContent = r ? `${round10(r.dist)} m on foot` : ''
}
function currentVerdict(): Verdict { return verdict(S.routes[S.sel], P, sunrise, sunset) }
function renderDecision() {
  const el = $('#decision')
  if (S.busy) { el.className = 'decision'; el.innerHTML = '<div class="call-row"><span class="call" style="color:var(--ink-3)">...</span><div><strong>Computing routes</strong><span>Searching about 550,000 cells of terrain</span></div></div>'; return }
  const r = S.routes[S.sel], v = currentVerdict()
  el.className = `decision ${v.go ? 'go' : 'nogo'}`
  el.innerHTML = html`
    <div class="call-row"><span class="call">${v.go ? 'GO' : 'NO-GO'}</span><div><strong>${v.head}</strong><span>${r ? `Leaving at ${clock(P.depart)} local time` : 'Change the points or the limit'}</span></div></div>
    ${r ? html`<div class="figures">
      <div><small>Whole walk</small><b>${fmtMin(r.walk)}</b></div>
      <div><small>Back by</small><b>${clock(v.back)}</b></div>
      <div><small>Radiation</small><b>${r.dose.toFixed(2)}<span style="font-size:12px"> mSv</span></b></div>
    </div>` : ''}
    <ul class="checks">${v.checks.map((c) => `<li class="${c.state}">${c.state === 'bad' ? icon.WarningCircle : c.state === 'ok' ? icon.CheckCircle : icon.Info}<span>${c.text}</span></li>`).join('')}</ul>`
}
function renderOptions() {
  const d = S.routes.direct, c = S.routes.cautious
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

// ---------------------------------------------------------------- daylight timeline
const T0 = 360, T1 = 1170
const tx = (m: number) => ((m - T0) / (T1 - T0)) * 1000
function renderDay() {
  const r = S.routes[S.sel], v = currentVerdict(), ls = Number(D.conditions.ls)
  let curve = ''
  for (let m = T0; m <= T1; m += 10) { const el = sunAt(m, ls).el; curve += `${m === T0 ? 'M' : 'L'}${tx(m).toFixed(1)} ${(44 - Math.max(0, el) / 90 * 38).toFixed(1)}` }
  const reserveStart = sunset - RESERVE_MIN / MARS_MIN
  let walk = ''
  if (r) {
    const a = P.depart, b = a + r.outMin / MARS_MIN, c = b + P.work / MARS_MIN, d = c + r.backMin / MARS_MIN
    walk = html`<g class="walk ${v.go ? '' : 'bad'}">
      <rect class="seg-out" x="${tx(a)}" y="30" width="${Math.max(1, tx(b) - tx(a))}" height="12" rx="1.5"/>
      <rect class="seg-work" x="${tx(b)}" y="30" width="${Math.max(0, tx(c) - tx(b))}" height="12"/>
      <rect class="seg-back" x="${tx(c)}" y="30" width="${Math.max(1, tx(d) - tx(c))}" height="12" rx="1.5"/>
      <line class="grip" x1="${tx(a)}" x2="${tx(a)}" y1="24" y2="48"/></g>`
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
  const s = sunAt(P.depart, ls)
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
    ${fixed('Orbital image', 'MRO HiRISE, about 0.6 m per pixel', `style="background-image:url(${D.photos.S1 ? (D.images.site.src) : ''})"`, 'Base')}
    ${fixed('Surroundings image', 'MRO CTX, about 8 m per pixel, 8 km', `style="background-image:url(${D.images.ctx.src})"`, 'Base')}
    ${fixed('Terrain', 'USGS 1 m model from MRO HiRISE and CTX and Mars Express HRSC, tied to MGS MOLA', sw('linear-gradient(135deg,#2a2622,#8d7a69)'), '3D')}
    ${row('slope', 'Slope hazard', 'Derived from the terrain, 2 m cells', sw('linear-gradient(90deg,#f6d664 0 33%,#f08c20 33% 66%,#1a120e 66%)'), S.layers.slope)}
    ${row('thermal', 'Night surface temperature', 'Mars Odyssey THEMIS, 100 m per pixel, relative', sw('linear-gradient(90deg,#140b34,#781c6d,#cf4446,#f98e09,#fcee9f)'), S.layers.thermal,
      '<span class="legend-ramp" style="background:linear-gradient(90deg,#140b34,#781c6d,#cf4446,#f98e09,#fcee9f)"></span><small style="grid-column:2/span 2">Cooler at night (dust, sand) to warmer (rock that held the day\'s heat)</small>')}
    ${row('track', 'Curiosity drive path', 'MSL localization, sols 4469 to 4916', sw('#f4f1ec'), S.layers.track)}
    ${row('boundary', 'Planning area edge', '1.4 by 1.5 km where routes are computed', sw('repeating-linear-gradient(90deg,#f4f1ec 0 5px,transparent 5px 9px)'), S.layers.boundary)}
    ${row('tint', 'Mars colour', 'A tint on the greyscale images, not data', sw('#c58c63'), S.tint)}
    ${row('exag', 'Relief ×2', 'Doubles heights to read the shape', sw('linear-gradient(160deg,#5b4334,#d4b296)'), S.exag)}
    <p class="note">Used in the decision, not drawn on the map: radiation dose rate from Curiosity's RAD and weather from its REMS station. Six instruments on four NASA missions, plus ESA's Mars Express in the terrain model.</p>`
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
  el.innerHTML = html`
    ${ph ? `<img src="${ph.src}" alt="Curiosity navigation camera view of the ground at station ${id}">` : ''}
    <div class="body">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><h3><b>${s.id}</b>${shortName(s)}</h3><button class="icon-btn" id="d-close" aria-label="Close">${icon.X}</button></div>
      <p>${s.note}. Curiosity stood here on sol ${s.sol}.</p>
      ${ph ? `<span class="cap">${ph.camera}, sol ${ph.sol}, ${ph.date}. NASA/JPL-Caltech.</span>` : ''}
      <div class="row"><button class="btn primary" id="st-dest">${icon.Flag}<span>Go here</span></button><button class="btn" id="st-start">${icon.MapPin}<span>Start here</span></button></div>
    </div>`
  const set = (k: 'start' | 'dest') => { const p = snap({ x: s.xy[0], y: s.xy[1] }); if (!p) return hint('That station is on ground over the slope limit.', true); S[k] = { x: p.x, y: p.y }; closeDrawer(); dismissCoach(); recompute({ fit: true }) }
  $('#st-dest').onclick = () => set('dest'); $('#st-start').onclick = () => set('start'); $('#d-close').onclick = closeDrawer
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
    const taken = Math.hypot(S.start.x - s.xy[0], S.start.y - s.xy[1]) < 4 || Math.hypot(S.dest.x - s.xy[0], S.dest.y - s.xy[1]) < 4
    const hide = !p.on || W.mode !== 'orbit' || taken
    b.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`
  }
  for (const [id, pt, lift] of [['#tag-start', S.start, 48], ['#tag-dest', S.dest, 76]] as const) {
    const el = $(id), p = ground(pt.x, pt.y, lift)
    const hide = !p.on || (W.mode === 'walk' && id === '#tag-start')
    el.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`
  }
  drawMini($('#mini') as HTMLCanvasElement, true)
}
let miniBase: HTMLCanvasElement | null = null
// box: the part of the site to show, in grid cells. Defaults to the whole site.
function drawMini(cv: HTMLCanvasElement, withCamera: boolean, box?: { x0: number; y0: number; x1: number; y1: number }) {
  const b0 = box ?? { x0: 0, y0: 0, x1: D.grid.cols, y1: D.grid.rows }
  const x = cv.getContext('2d')!, w = cv.width, h = cv.height, k = w / (b0.x1 - b0.x0), sx = k, sy = h / (b0.y1 - b0.y0)
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
    for (let i = 0; i < r.path.length; i += 3) { const c = r.path[i]; const X = (c % D.grid.cols) * sx, Y = ((c / D.grid.cols) | 0) * sy; if (i) x.lineTo(X, Y); else x.moveTo(X, Y) }
    x.strokeStyle = '#0b0d0e'; x.lineWidth = (k === S.sel ? 7 : 5) * (w / 440); x.setLineDash([]); x.stroke()
    x.strokeStyle = k === 'direct' ? '#f2662f' : '#f4f1ec'; x.lineWidth = (k === S.sel ? 3.5 : 2.5) * (w / 440)
    x.setLineDash(k === 'cautious' ? [8 * (w / 440), 6 * (w / 440)] : []); x.globalAlpha = k === S.sel ? 1 : 0.6; x.stroke(); x.globalAlpha = 1; x.setLineDash([])
  }
  for (const s of D.stations) { x.fillStyle = '#f4f1ec'; x.strokeStyle = '#0b0d0e'; x.lineWidth = 2; x.beginPath(); x.rect(s.xy[0] * sx - 4, s.xy[1] * sy - 4, 8, 8); x.fill(); x.stroke() }
  for (const [p, col] of [[S.start, '#f4f1ec'], [S.dest, '#f2662f']] as const) { x.beginPath(); x.arc(p.x * sx, p.y * sy, 7 * (w / 440), 0, 7); x.fillStyle = col; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#0b0d0e'; x.stroke() }
  x.restore()
  if (box) {
    // scale bar: 100 m
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
let cineKind: 'walk' | 'fly' = 'walk', cineLegs: ReturnType<typeof legs> = []
function startCine(kind: 'walk' | 'fly') {
  const r = S.routes[S.sel]
  if (!r) return
  closeDrawer(); dismissCoach(); closeGuide()
  cineKind = kind; cineLegs = legs(D.grid, r)
  const outSec = r.outMin * 60, dur = kind === 'walk' ? Math.max(30, Math.min(75, outSec / 20)) : Math.max(16, Math.min(28, r.dist / 30))
  document.body.classList.add('cine'); $('#hud').hidden = false; $('#arrive').hidden = true
  $('#hud-mode').textContent = kind === 'walk' ? 'WALK. EYE HEIGHT 1.8 M. TRUE SCALE.' : 'FLYOVER. 75 M ABOVE THE ROUTE.'
  $('#h-speed').textContent = `×${Math.round(outSec / dur)}`
  $('#h-pause').innerHTML = `${icon.Pause}<span>Pause</span>`
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < r.path.length; i += 2) { const z = D.grid.elev[r.path[i]]; lo = Math.min(lo, z); hi = Math.max(hi, z) }
  if (hi - lo < 6) { hi += 3; lo -= 3 }
  let d = ''
  for (let i = 0; i < r.path.length; i += 2) d += `${i ? 'L' : 'M'}${((r.d[i] / r.dist) * 1000).toFixed(1)} ${(4 + ((hi - D.grid.elev[r.path[i]]) / (hi - lo)) * 38).toFixed(1)}`
  $('#h-prof').innerHTML = `<path class="pf" vector-effect="non-scaling-stroke" d="${d}L1000 46L0 46Z"/><line class="cur" vector-effect="non-scaling-stroke" x1="0" x2="0" y1="0" y2="46"/>`
  if (!$('#strip').childElementCount) {
    let s = ''
    for (let i = -2; i < 27; i++) { const deg = (((i * 15) % 360) + 360) % 360, c = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[deg]; s += `<span${c ? ' class="c"' : ''}>${c ?? deg}</span>` }
    $('#strip').innerHTML = s
  }
  W.startCine(kind, r, dur)
}
function onCineFrame(f: { frac: number; heading: number }) {
  const r = S.routes[S.sel]!, a = at(D.grid, r, f.frac), sim = P.depart + a.time / MARS_MIN, sun = sunAt(sim, Number(D.conditions.ls))
  $('#strip').style.transform = `translateX(${(-((f.heading / 15 + 2) * 40 + 20)).toFixed(1)}px)`
  $('#h-dist').textContent = `${Math.round(a.dist)} / ${round10(r.dist)} m`
  $('#h-elev').textContent = `${Math.round(a.elev)} m`
  const sl = $('#h-slope'); sl.textContent = `${Math.round(a.slope)}°`; sl.className = a.slope > 15 ? 'alarm' : a.slope > 10 ? 'warn' : ''
  $('#h-time').textContent = `${Math.round(a.time)} / ${Math.round(r.outMin)} min`
  $('#h-clock').textContent = clock(sim)
  $('#h-sun').textContent = `${Math.round(sun.el)}°`
  let next = '', warn = false
  for (const l of cineLegs) if (l.from > a.dist + 2 && l.k >= 2) { next = `${l.k === 3 ? 'Very steep ground' : 'Steep ground'} in ${Math.max(5, round10(l.from - a.dist))} m. Slow down and check footing.`; warn = true; break }
  if (!next) { const left = r.dist - a.dist; next = left > 15 ? `Destination in ${round10(left)} m. Follow the beacon.` : 'At the destination.' }
  const n = $('#h-next'); n.textContent = next; n.className = `next ${warn ? 'warn' : ''}`
  const cur = $('#h-prof').querySelector('.cur')
  if (cur) { const x = (f.frac * 1000).toFixed(1); cur.setAttribute('x1', x); cur.setAttribute('x2', x) }
}
function onCineEnd() {
  if (cineKind === 'fly') { setTimeout(stopCine, reduce ? 0 : 900); return }
  const st = nearStation(S.dest), ph = st && D.photos[st.id]
  $('#h-next').textContent = 'Arrived. Press Exit or Escape to return to the map.'
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
  const c = D.conditions, v = currentVerdict(), sun = sunAt(P.depart, Number(c.ls)), st = nearStation(S.dest), ph = st && D.photos[st.id]
  const words = ['Gentle ground', 'Moderate slope', 'Steep, slow down', 'Very steep, take care']
  const li = (m: string, w: string, t: string) => `<li><span class="mk mk-${m}" role="img" aria-label="${w}"></span><span>${t}</span></li>`
  const V = (t: string | number) => `<span class="v">${t}</span>`
  const L = legs(D.grid, r).map((l) => {
    const dz = D.grid.elev[r.path[l.iTo]] - D.grid.elev[r.path[l.iFrom]]
    return `<div class="leg"><i class="g${l.k}"></i><span class="mono">${Math.round(l.from)} to ${Math.round(l.to)} m</span><span>${words[l.k]}</span><span class="mono">${Math.abs(dz) < 1 ? 'level' : `${dz > 0 ? 'up' : 'down'} ${Math.abs(Math.round(dz))} m`}</span></div>`
  }).join('')
  $('#guide-root').innerHTML = html`
  <div class="guide-wrap" id="gw">
    <article class="guide" role="dialog" aria-modal="true" aria-label="Field guide">
      <header><div><b>FIELD GUIDE</b><span>${S.sel === 'direct' ? 'Direct' : 'Cautious'} route, ${label(S.start)} to ${label(S.dest)}</span></div><button class="icon-btn" id="g-close" aria-label="Close field guide">${icon.X}</button></header>
      <div class="content">
        <div class="key"><span><i class="mk mk-m"></i> measured</span><span><i class="mk mk-d"></i> derived</span><span><i class="mk mk-a"></i> assumed</span><span><i class="mk mk-s"></i> simulated</span></div>
        <div class="verdict ${v.go ? 'go' : 'nogo'}"><b>${v.go ? 'GO' : 'NO-GO'}</b><span>${v.head}. Leave ${clock(P.depart)}, back by ${clock(v.back)}.</span></div>
        <h3>Objective</h3>
        <ul><li class="plain">Sample one hollow and one adjacent ridge of the boxwork unit, to learn why the ridges resisted erosion while the hollows did not.</li></ul>
        <h3>Route map</h3>
        <figure><img id="g-map" alt="Map of the route over the orbital image"><figcaption>North up. HiRISE image, NASA/JPL-Caltech/University of Arizona. Orange solid: Direct. White dashed: Cautious.</figcaption></figure>
        <h3>Route</h3>
        <ul>
          ${li('s', 'Simulated', `Start at ${V(label(S.start))}, a notional rover park`)}
          ${li('d', 'Derived', `Distance ${V(round10(r.dist) + ' m')}, climb ${V(Math.round(r.climb) + ' m')}, ${V(Math.round(r.over10 * 100) + '%')} of it on ground over 10°`)}
          ${li('a', 'Assumed', `Out ${V(Math.round(r.outMin) + ' min')}, at the destination ${V(P.work + ' min')}, back ${V(Math.round(r.backMin) + ' min')}`)}
          ${li('a', 'Assumed', `Whole walk about ${V(fmtMin(r.walk))} at ${V(Math.round(P.suit * 100) + '%')} of normal walking speed`)}
        </ul>
        <h3>Leg by leg</h3><div>${L}</div>
        <h3>Turn back if</h3>
        <ul>
          ${li('a', 'Assumed', `You are not at the destination ${V(fmtMin(r.outMin * 1.5))} after leaving, one and a half times the planned time out.`)}
          ${li('d', 'Derived', `From the far point the start is ${V(fmtMin(r.backMin))} away.`)}
          ${li('d', 'Derived', `You would be back after ${V(clock(sunset - RESERVE_MIN / MARS_MIN))}, when the last hour of daylight begins.`)}
        </ul>
        <h3>Light</h3>
        <ul>${li('d', 'Derived', `At departure the sun is ${V(Math.round(sun.el) + '°')} high in the ${compassWord(sun.az)}. The 3D view shows which ground is in shadow at that time.`)}
          ${li('m', 'Measured', `Sunrise ${V(c.sunrise)}, sunset ${V(c.sunset)} local time`)}</ul>
        <h3>Conditions</h3>
        <ul>${li('m', 'Measured', `Air ${V(c.min_temp + ' to ' + c.max_temp + ' °C')}, ground ${V(c.min_gts_temp + ' to ' + c.max_gts_temp + ' °C')}, pressure ${V(c.pressure + ' Pa')}`)}
          ${li('m', 'Measured', `Sky ${c.atmo_opacity.toLowerCase()}, UV ${c.local_uv_irradiance_index.toLowerCase()}`)}</ul>
        <h3>Radiation</h3>
        <ul>${li('m', 'Measured', `${V(RATE_MSV_PER_SOL + ' mSv')} per Mars day on the surface at Gale crater (Curiosity RAD, 2012 to 2013)`)}
          ${li('d', 'Derived', `About ${V(r.dose.toFixed(2) + ' mSv')} for this walk. No route-scale radiation data exists, so the route does not change it. A solar particle event would; check space weather before leaving.`)}</ul>
        ${st ? `<h3>At the destination</h3><ul><li class="plain">${st.note}. Curiosity stood here on sol ${st.sol}.</li></ul>` : ''}
        ${ph ? `<figure><img src="${ph.src}" alt="The ground at the destination, seen by Curiosity"><figcaption>${ph.camera}, sol ${ph.sol} (${ph.date}). NASA/JPL-Caltech.</figcaption></figure>` : ''}
        <div class="limits"><h3>Limits</h3><ul>
          <li class="plain">Rocks smaller than about 1 m are not in the terrain model. Watch your footing.</li>
          <li class="plain">Walking speed is an Earth hiking model (Tobler) scaled by the suit factor, which is an assumption.</li>
          <li class="plain">The ${P.limit}° slope limit and the ${RESERVE_MIN} minute daylight reserve are assumptions, not NASA limits.</li>
          <li class="plain">Sand, dust, wind and how the ground bears weight are not modelled.</li>
          <li class="plain">Sun position is a simple calculation for latitude and season. Conditions are from sol ${c.sol} (${c.terrestrial_date}), not today.</li>
          <li class="plain">Ground colour in the 3D view is a tint. The orbital images are greyscale.</li>
        </ul></div>
        <h3>Sources</h3><ul>
          <li class="plain">Orbital image: HiRISE and CTX on Mars Reconnaissance Orbiter, NASA/JPL-Caltech/University of Arizona and MSSS, via <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener">NASA Mars Trek</a></li>
          <li class="plain">Terrain: <a href="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" target="_blank" rel="noopener">USGS Mars MSL Gale Merged DEM 1m</a> (Parker and Calef, 2016)</li>
          <li class="plain">Night temperature: THEMIS on Mars Odyssey, NASA/JPL-Caltech/Arizona State University</li>
          <li class="plain">Weather, radiation, drive path and photos: Curiosity (REMS, RAD, localization, Navcam), NASA/JPL-Caltech</li>
          <li class="plain">Radiation rate: Hassler et al. (2014), Science 343. Walking model: Tobler (1993).</li>
        </ul>
      </div>
    </article>
  </div>`
  // frame the route with a margin, keeping the canvas's aspect
  let x0 = Math.min(S.start.x, S.dest.x), x1 = Math.max(S.start.x, S.dest.x), y0 = Math.min(S.start.y, S.dest.y), y1 = Math.max(S.start.y, S.dest.y)
  for (const k of ['direct', 'cautious'] as const) { const q = S.routes[k]; if (q) for (let i = 0; i < q.path.length; i += 4) { const cx = q.path[i] % D.grid.cols, cy = (q.path[i] / D.grid.cols) | 0; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy) } }
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
