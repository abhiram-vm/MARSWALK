// Planning model: routing, route analysis, the go or no-go decision and the sun.
// AI-assisted (Claude Code). Tested in src/model.test.ts. Sources: docs/DATA_SOURCES.md.

export interface Grid {
  cols: number
  rows: number
  cell: number // metres per cell
  elev: Float32Array // metres
  slope: Float32Array // degrees, from the terrain smoothed over 5 m
}
export interface Params {
  suit: number // share of normal walking speed for a suited, loaded astronaut (assumed)
  limit: number // steepest ground allowed, degrees (assumed)
  work: number // minutes at each stop (assumed)
  depart: number // departure, minutes after midnight, local mean solar time (LMST)
  /** the walk ends at the last stop (a rover picks the crew up there) instead of returning to the start */
  oneWay?: boolean
}
export interface Pt { x: number; y: number }
export interface SunModel { ls: number; dec: number; eotMin: number } // dec in degrees; eot = LTST minus LMST

/** A walk: start, one or more stops, and back to the start, as one sampled polyline. */
export interface Route {
  kind: 'direct' | 'cautious'
  xs: Float32Array // sample positions in grid cells, about 1 m apart
  ys: Float32Array
  z: Float32Array // elevation at each sample, m
  path: Int32Array // grid cell under each sample
  d: Float32Array // distance walked at each sample, m
  t: Float32Array // walking time at each sample, s (time at stops excluded)
  stopAt: number[] // sample index where each stop is reached; the last entry is the return to start (zero length on a one-way walk)
  legMin: number[] // walking minutes for each leg
  dist: number
  climb: number
  descent: number
  over10: number // share of distance on ground steeper than 10 degrees
  maxSlope: number
  outMin: number // walking minutes from the start to the last stop
  backMin: number // walking minutes of the return leg
  workMin: number
  walk: number // whole excursion, minutes
  dose: number // mSv
}
export interface Leg { k: 0 | 1 | 2 | 3; from: number; to: number; iFrom: number; iTo: number }

// Curiosity RAD, Aug 2012 to Jun 2013: about 0.67 mSv per Earth day dose equivalent
// (SwRI and NASA releases on Hassler et al. 2014); about 210 microgray per day absorbed (NASA).
export const RATE_MSV_PER_DAY = 0.67
export const MARS_MIN = 1.0274912517 // Earth minutes per Mars (mean solar) minute
export const RESERVE_MIN = 60 // daylight reserve before sunset, Earth minutes (assumed)
export const LAT_DEG = -4.8

// Tobler's hiking function on the slope along the direction of travel, km/h, times the suit factor, in m/s.
// With the default factor of 0.5, flat ground gives 2.5 km/h, matching NASA's Apollo planning
// figure of 2.5 km/h for sustained suited walking (Los Alamos report LA-UR-89-3858).
export function speedMs(tan: number, suit: number) {
  return (6 * Math.exp(-3.5 * Math.abs(tan + 0.05)) * suit) / 3.6
}

/**
 * A* on the grid. 8-connected; a diagonal step is not allowed between two cells that
 * are both over the limit, so routes cannot squeeze through the corner of a ridge.
 * Kept free of closures over module state so it can run inside a worker.
 */
export function astar(
  elev: Float32Array, slope: Float32Array, cols: number, rows: number, cell: number,
  s: number, g: number, limit: number, suit: number, cautious: boolean,
): Int32Array | null {
  const n = cols * rows
  if (s < 0 || g < 0 || s >= n || g >= n || slope[s] > limit || slope[g] > limit) return null
  const best = new Float64Array(n).fill(Infinity) // full precision: the stale-entry check below compares exactly
  const came = new Int32Array(n).fill(-1)
  const hf: number[] = [], hn: number[] = []
  const gx = g % cols, gy = (g / cols) | 0, vmax = speedMs(-0.05, suit)
  const DX = [0, 0, -1, 1, -1, 1, -1, 1], DY = [-1, 1, 0, 0, -1, -1, 1, 1]
  const push = (f: number, node: number) => {
    let i = hf.length
    hf.push(f); hn.push(node)
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p }
    hf[i] = f; hn[i] = node
  }
  const pop = () => {
    const top = hn[0], lf = hf.pop()!, ln = hn.pop()!, len = hf.length
    if (len) {
      let i = 0
      for (;;) { let c = 2 * i + 1; if (c >= len) break; if (c + 1 < len && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hf[i] = hf[c]; hn[i] = hn[c]; i = c }
      hf[i] = lf; hn[i] = ln
    }
    return top
  }
  best[s] = 0; push(0, s)
  while (hf.length) {
    const f = hf[0], cur = pop()
    if (cur === g) {
      const out: number[] = []
      for (let k = g; k !== -1; k = came[k]) out.push(k)
      return Int32Array.from(out.reverse())
    }
    const cx = cur % cols, cy = (cur / cols) | 0, gc = best[cur]
    const hx0 = cx - gx, hy0 = cy - gy
    if (f > gc + (Math.sqrt(hx0 * hx0 + hy0 * hy0) * cell) / vmax + 1e-6) continue // stale heap entry
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const ni = ny * cols + nx, sl = slope[ni]
      if (sl > limit) continue
      if (k >= 4 && slope[cy * cols + nx] > limit && slope[ny * cols + cx] > limit) continue
      const dist = k < 4 ? cell : cell * Math.SQRT2
      const tan = (elev[ni] - elev[cur]) / dist
      let t = dist / ((6 * Math.exp(-3.5 * Math.abs(tan + 0.05)) * suit) / 3.6)
      if (cautious && sl > 10) t *= 1 + (sl - 10) * 0.6
      const ng = gc + t
      if (ng < best[ni]) {
        best[ni] = ng; came[ni] = cur
        const hx = nx - gx, hy = ny - gy
        push(ng + (Math.sqrt(hx * hx + hy * hy) * cell) / vmax, ni)
      }
    }
  }
  return null
}

// ---------------------------------------------------------------- terrain sampling
export function elevAt(g: Grid, x: number, y: number) {
  const c = Math.max(0, Math.min(g.cols - 1.0001, x)), r = Math.max(0, Math.min(g.rows - 1.0001, y))
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * g.cols + c0
  return (g.elev[i] * (1 - fc) + g.elev[i + 1] * fc) * (1 - fr) + (g.elev[i + g.cols] * (1 - fc) + g.elev[i + g.cols + 1] * fc) * fr
}
const cellOf = (g: Grid, x: number, y: number) => Math.round(y) * g.cols + Math.round(x)

/**
 * Highest slope over every grid cell a straight segment passes through, found by
 * walking the cells exactly (Amanatides and Woo). Cells are centred on whole numbers,
 * so cell borders sit at half values.
 */
export function segmentMaxSlope(g: Grid, ax: number, ay: number, bx: number, by: number) {
  let cx = Math.round(ax), cy = Math.round(ay)
  const ex = Math.round(bx), ey = Math.round(by), dx = bx - ax, dy = by - ay
  const sx = Math.sign(dx), sy = Math.sign(dy)
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity
  let tx = dx ? ((sx > 0 ? cx + 0.5 - ax : ax - (cx - 0.5)) * tdx) : Infinity
  let ty = dy ? ((sy > 0 ? cy + 0.5 - ay : ay - (cy - 0.5)) * tdy) : Infinity
  let m = g.slope[cy * g.cols + cx]
  for (let n = 0; n < 4 * (g.cols + g.rows) && (cx !== ex || cy !== ey); n++) {
    if (Math.abs(tx - ty) < 1e-9) {
      // the line passes exactly through a cell corner: count both side cells
      m = Math.max(m, g.slope[cy * g.cols + cx + sx], g.slope[(cy + sy) * g.cols + cx])
      cx += sx; cy += sy; tx += tdx; ty += tdy
    } else if (tx < ty) { cx += sx; tx += tdx } else { cy += sy; ty += tdy }
    if (tx > 1 + 1e-9 && ty > 1 + 1e-9 && (cx !== ex || cy !== ey)) break
    m = Math.max(m, g.slope[cy * g.cols + cx])
  }
  return m
}

/**
 * Straightens a grid path. From each corner, jump to the farthest later cell that a
 * straight line reaches without meeting ground steeper than the steepest ground on the
 * part of the path it replaces. The route never gets steeper, and the grid's zig-zag
 * (which inflates distance by up to about 8 percent) goes away.
 */
export function straighten(g: Grid, path: Int32Array): Pt[] {
  const pts: Pt[] = [{ x: path[0] % g.cols, y: (path[0] / g.cols) | 0 }]
  let i = 0
  while (i < path.length - 1) {
    let best = i + 1, runMax = 0
    const ax = path[i] % g.cols, ay = (path[i] / g.cols) | 0
    for (let j = i + 1; j < path.length && j <= i + 120; j++) {
      runMax = Math.max(runMax, g.slope[path[j]])
      const bx = path[j] % g.cols, by = (path[j] / g.cols) | 0
      if (segmentMaxSlope(g, ax, ay, bx, by) <= Math.max(runMax, 5) + 0.01) best = j
    }
    pts.push({ x: path[best] % g.cols, y: (path[best] / g.cols) | 0 })
    i = best
  }
  return pts
}

/** Builds and measures a walk from one grid path per leg (start to stop 1, ..., last stop to start). */
export function analyse(g: Grid, legs: (Int32Array | null)[], kind: Route['kind'], p: Params): Route | null {
  if (!legs.length || legs.some((l) => !l || l.length < 1)) return null
  const xs: number[] = [], ys: number[] = [], z: number[] = [], path: number[] = [], d: number[] = [], t: number[] = [], stopAt: number[] = [], legMin: number[] = []
  let dist = 0, time = 0, climb = 0, descent = 0, over10 = 0, maxSlope = 0
  const add = (x: number, y: number) => {
    const e = elevAt(g, x, y), c = cellOf(g, x, y)
    if (xs.length) {
      const k = xs.length - 1, ds = Math.hypot(x - xs[k], y - ys[k]) * g.cell
      if (ds > 0) {
        const dz = e - z[k]
        dist += ds; time += ds / speedMs(dz / ds, p.suit)
        if (dz > 0) climb += dz; else descent -= dz
        if (g.slope[c] > 10) over10 += ds
      }
    }
    if (g.slope[c] > maxSlope) maxSlope = g.slope[c]
    xs.push(x); ys.push(y); z.push(e); path.push(c); d.push(dist); t.push(time)
  }
  for (const leg of legs as Int32Array[]) {
    const t0 = time
    const pts = leg.length > 1 ? straighten(g, leg) : [{ x: leg[0] % g.cols, y: (leg[0] / g.cols) | 0 }]
    if (!xs.length) add(pts[0].x, pts[0].y)
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) * g.cell) / 1))
      for (let s = 1; s <= n; s++) add(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n)
    }
    stopAt.push(xs.length - 1)
    legMin.push((time - t0) / 60)
  }
  const nStops = legs.length - 1
  const backMin = legMin[legMin.length - 1], outMin = legMin.slice(0, -1).reduce((a, b) => a + b, 0)
  const workMin = p.work * nStops, walk = outMin + backMin + workMin
  return {
    kind, xs: Float32Array.from(xs), ys: Float32Array.from(ys), z: Float32Array.from(z), path: Int32Array.from(path),
    d: Float32Array.from(d), t: Float32Array.from(t), stopAt, legMin,
    dist, climb, descent, over10: dist ? over10 / dist : 0, maxSlope, outMin, backMin, workMin, walk,
    dose: doseFor(walk),
  }
}
/** Dose equivalent for an excursion of the given length, from Curiosity's measured surface rate. */
export const doseFor = (minutes: number) => (RATE_MSV_PER_DAY * minutes) / (24 * 60)

/** Re-times a walk after a change that does not move it (time at stops). */
export function retime(r: Route, p: Params): Route {
  const workMin = p.work * (r.stopAt.length - 1), walk = r.outMin + r.backMin + workMin
  return { ...r, workMin, walk, dose: doseFor(walk) }
}

/** Where the walker is after a fraction of the walking (stops excluded). */
export function at(r: Route, frac: number) {
  const target = frac * r.dist
  let lo = 0, hi = r.d.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (r.d[mid] < target) lo = mid + 1; else hi = mid }
  return { i: lo, x: r.xs[lo], y: r.ys[lo], dist: r.d[lo], elev: r.z[lo], cell: r.path[lo], time: r.t[lo] / 60 }
}
/** Which leg a sample index belongs to. */
export const legOf = (r: Route, i: number) => { let k = 0; while (k < r.stopAt.length - 1 && i > r.stopAt[k]) k++; return k }

/**
 * Stretches of similar steepness between two sample indices. Slope is averaged over
 * about 20 m of route so one steep cell does not label a whole stretch; pieces under
 * 15 m join the stretch before them.
 */
export function legs(g: Grid, r: Route, from = 0, to = r.path.length - 1): Leg[] {
  const cls = (s: number): Leg['k'] => (s > 15 ? 3 : s > 10 ? 2 : s > 5 ? 1 : 0)
  const avg = new Float32Array(to - from + 1)
  let lo = from, hi = from, sum = 0
  for (let i = from; i <= to; i++) {
    while (hi <= to && r.d[hi] <= r.d[i] + 10) sum += g.slope[r.path[hi++]]
    while (r.d[lo] < r.d[i] - 10) sum -= g.slope[r.path[lo++]]
    avg[i - from] = sum / (hi - lo)
  }
  const runs: Leg[] = []
  for (let i = from + 1; i <= to; i++) {
    const k = cls(avg[i - from]), last = runs[runs.length - 1]
    if (last && last.k === k) { last.to = r.d[i]; last.iTo = i } else runs.push({ k, from: r.d[i - 1], to: r.d[i], iFrom: i - 1, iTo: i })
  }
  const out: Leg[] = []
  for (const l of runs) {
    const prev = out[out.length - 1]
    if (prev && (l.to - l.from < 15 || prev.k === l.k)) { prev.to = l.to; prev.iTo = l.iTo } else out.push({ ...l })
  }
  if (out.length > 1 && out[0].to - out[0].from < 15) { out[1].from = out[0].from; out[1].iFrom = out[0].iFrom; out.shift() }
  return out
}

// ---------------------------------------------------------------- decision
export interface Check { state: 'ok' | 'bad' | 'info' | 'warn'; text: string }
export interface Verdict { go: boolean; head: string; back: number; margin: number; checks: Check[] }
export interface SpaceWeather { checked: string | null; marsArrivals: { time: string; glancing: boolean }[]; sepEvents: (string | null)[] }

// ---------------------------------------------------------------- time along a walk
/** Minutes after departure at each sample, counting the time spent at each stop. */
export function sampleTimes(r: Route, p: Params): Float32Array {
  const out = new Float32Array(r.t.length), last = r.stopAt.length - 1
  let passed = 0
  for (let i = 0; i < r.t.length; i++) {
    while (passed < last && i > r.stopAt[passed]) passed++
    out[i] = r.t[i] / 60 + passed * p.work
  }
  return out
}
/** Where a walker is, in grid cells, a number of minutes after departure. */
export function posAtTime(r: Route, times: Float32Array, m: number): Pt {
  const n = times.length
  if (m <= 0) return { x: r.xs[0], y: r.ys[0] }
  if (m >= times[n - 1]) return { x: r.xs[n - 1], y: r.ys[n - 1] }
  let lo = 0, hi = n - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] < m) lo = mid; else hi = mid }
  const span = times[hi] - times[lo], walkSpan = (r.t[hi] - r.t[lo]) / 60
  if (span > walkSpan + 1e-6) {
    // the gap includes time at a stop: wait there, then walk the last step
    const leave = times[hi] - walkSpan
    if (m <= leave) return { x: r.xs[lo], y: r.ys[lo] }
    const f = walkSpan > 0 ? (m - leave) / walkSpan : 1
    return { x: r.xs[lo] + (r.xs[hi] - r.xs[lo]) * f, y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * f }
  }
  const f = span > 0 ? (m - times[lo]) / span : 0
  return { x: r.xs[lo] + (r.xs[hi] - r.xs[lo]) * f, y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * f }
}

// ---------------------------------------------------------------- working in pairs
/** Whether two people standing at a and b (grid cells) can see each other over the terrain, eyes 1.8 m up. */
export function lineOfSight(g: Grid, a: Pt, b: Pt, eye = 1.8) {
  const za = elevAt(g, a.x, a.y) + eye, zb = elevAt(g, b.x, b.y) + eye
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2)
  for (let s = 1; s < n; s++) {
    const t = s / n
    if (elevAt(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) > za + (zb - za) * t) return false
  }
  return true
}
export interface PairCheck {
  maxSep: number // m
  maxSepAt: number // minutes after departure
  inSight: number // share of the walk with the partner in view
  gaps: { from: number; to: number }[] // minutes out of sight
  longestGap: number
  tooFar: { from: number; to: number }[] // minutes beyond the separation limit
  end: number // minutes until both are back
}
/** Separation and line of sight between two walkers who leave together, checked every half minute. */
export function pairCheck(g: Grid, a: Route, b: Route, p: Params, sepLimit: number): PairCheck {
  const ta = sampleTimes(a, p), tb = sampleTimes(b, p), end = Math.max(ta[ta.length - 1], tb[tb.length - 1])
  let maxSep = 0, maxSepAt = 0, seen = 0, total = 0
  const gaps: { from: number; to: number }[] = [], tooFar: { from: number; to: number }[] = []
  const step = 0.5
  for (let m = 0; m <= end + 1e-9; m += step) {
    const pa = posAtTime(a, ta, m), pb = posAtTime(b, tb, m), sep = Math.hypot(pa.x - pb.x, pa.y - pb.y) * g.cell
    if (sep > maxSep) { maxSep = sep; maxSepAt = m }
    const vis = sep < 1 || lineOfSight(g, pa, pb)
    total++; if (vis) seen++
    const mark = (list: { from: number; to: number }[], on: boolean) => {
      const last = list[list.length - 1]
      if (on) { if (last && last.to >= m - step - 1e-9) last.to = m; else list.push({ from: m, to: m }) }
    }
    mark(gaps, !vis); mark(tooFar, sep > sepLimit)
  }
  const longestGap = gaps.reduce((x, q) => Math.max(x, q.to - q.from + step), 0)
  return { maxSep, maxSepAt, inSight: total ? seen / total : 1, gaps, longestGap, tooFar, end }
}

// ---------------------------------------------------------------- stop order
/**
 * The visiting order with the least walking time, given a matrix of leg times between
 * points (index 0 is the start; the walk returns to it). Tries every order, which is
 * quick for the six stops the app allows (720 orders).
 */
/** Walking seconds along a grid path from astar, at the given suit factor. */
export function pathTime(g: Grid, path: Int32Array | null, suit: number) {
  if (!path) return Infinity
  let t = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], diag = a % g.cols !== b % g.cols && ((a / g.cols) | 0) !== ((b / g.cols) | 0)
    const d = diag ? g.cell * Math.SQRT2 : g.cell
    t += d / speedMs((g.elev[b] - g.elev[a]) / d, suit)
  }
  return t
}
/** Time matrix between points (grid indices) for bestOrder. */
export function orderMatrix(g: Grid, pts: number[], limit: number, suit: number, cautious: boolean) {
  return pts.map((a, i) => pts.map((b, j) => (i === j ? 0 : pathTime(g, astar(g.elev, g.slope, g.cols, g.rows, g.cell, a, b, limit, suit, cautious), suit))))
}
export function bestOrder(times: number[][]): number[] {
  const n = times.length - 1
  const stops = Array.from({ length: n }, (_, i) => i + 1)
  let best: number[] = stops.slice(), bestT = Infinity
  const permute = (arr: number[], k: number) => {
    if (k === arr.length) {
      let t = times[0][arr[0]] + times[arr[arr.length - 1]][0]
      for (let i = 1; i < arr.length; i++) t += times[arr[i - 1]][arr[i]]
      if (t < bestT) { bestT = t; best = arr.slice() }
      return
    }
    for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; permute(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]] }
  }
  if (n > 0) permute(stops, 0)
  return best
}

// ---------------------------------------------------------------- decision
export interface PairInput { check: PairCheck; sepLimit: number; gapLimit: number }
/**
 * Clock times are local mean solar time in minutes; durations are Earth minutes.
 * Takes one route (solo) or two (a pair, who leave together); the later return counts.
 */
export function verdict(routes: Route | null | (Route | null)[], p: Params, sunrise: number, sunset: number, sw?: SpaceWeather | null, nowIso?: string, pair?: PairInput): Verdict {
  const list = Array.isArray(routes) ? routes : [routes]
  if (!list.length || list.some((r) => !r)) return { go: false, head: 'No walkable route', back: 0, margin: 0, checks: [{ state: 'bad', text: `No route joins these points on ground under the ${p.limit}° limit` }] }
  const rs = list as Route[]
  const walk = Math.max(...rs.map((r) => r.walk)), maxSlope = Math.max(...rs.map((r) => r.maxSlope)), backMin = Math.max(...rs.map((r) => r.backMin))
  const back = p.depart + walk / MARS_MIN, margin = (sunset - back) * MARS_MIN
  const okDawn = p.depart >= sunrise, okDay = margin >= RESERVE_MIN, okSlope = maxSlope <= p.limit
  const checks: Check[] = [
    { state: okDawn ? 'ok' : 'bad', text: okDawn ? `Leaves after sunrise (${clock(sunrise)})` : `Leaves before sunrise (${clock(sunrise)})` },
    { state: okDay ? 'ok' : 'bad', text: margin >= 0 ? `${p.oneWay ? (rs.length > 1 ? 'Both finish' : 'Finishes') : rs.length > 1 ? 'Both back' : 'Back'} ${fmtMin(margin)} before sunset; the reserve is ${RESERVE_MIN} min` : `${p.oneWay ? 'Finishes' : 'Back'} ${fmtMin(-margin)} after sunset` },
    okSlope
      ? { state: 'ok', text: `Steepest ground ${maxSlope.toFixed(1)}°, inside the ${p.limit}° limit` }
      : { state: 'bad', text: `Steepest ground ${maxSlope.toFixed(1)}° is over the ${p.limit}° limit` },
  ]
  let okPair = true
  if (pair) {
    const c = pair.check, okSep = c.maxSep <= pair.sepLimit, okSight = c.longestGap <= pair.gapLimit
    okPair = okSep && okSight
    checks.push(okSep
      ? { state: 'ok', text: `Partners stay within ${pair.sepLimit} m of each other (at most ${round10(c.maxSep)} m)` }
      : { state: 'bad', text: `Partners get ${round10(c.maxSep)} m apart, over the ${pair.sepLimit} m limit` })
    checks.push(okSight
      ? { state: 'ok', text: `In sight of each other ${Math.round(c.inSight * 100)}% of the time; longest gap ${fmtMin(c.longestGap)}` }
      : { state: 'bad', text: `Out of sight for ${fmtMin(c.longestGap)} at a stretch, over the ${pair.gapLimit} min limit` })
  } else checks.push({ state: 'info', text: p.oneWay ? 'Ends at the last stop; a rover picks the crew up there' : `The walk back from the last stop takes ${fmtMin(backMin)}` })
  const storm = sw && nowIso ? stormNear(sw, nowIso) : null
  if (storm) checks.push({ state: 'warn', text: storm })
  const go = okDawn && okDay && okSlope && okPair
  const head = go ? 'Clear to walk' : !okSlope ? 'Route too steep' : !okPair ? 'Partners too far apart' : okDawn ? 'Not enough daylight' : 'Too early to leave'
  return { go, head, back, margin, checks }
}
/** A caution if NASA's model has a solar storm reaching Mars within a day of now. */
export function stormNear(sw: SpaceWeather, nowIso: string) {
  const now = Date.parse(nowIso), day = 864e5
  const hit = sw.marsArrivals.map((a) => ({ ...a, ms: Date.parse(a.time) })).filter((a) => a.ms > now - day && a.ms < now + day).sort((a, b) => a.ms - b.ms)[0]
  if (!hit) return null
  return `NASA's model has a solar storm ${hit.glancing ? 'glancing' : 'reaching'} Mars around ${hit.time.replace('T', ' ').replace('Z', ' UTC')}. Check particle levels before leaving.`
}

// ---------------------------------------------------------------- sun
/**
 * Sun position at Gale crater for a local mean solar time. True solar time is mean time
 * plus the equation of time, and declination comes from the season; both are computed
 * with NASA's Mars24 algorithm in the data pipeline for the date of the weather record.
 */
export function sunAt(lmstMin: number, sun: SunModel) {
  const lat = (LAT_DEG * Math.PI) / 180, dec = (sun.dec * Math.PI) / 180
  const ltst = lmstMin + sun.eotMin
  const H = ((ltst / 60 - 12) * 15 * Math.PI) / 180
  const e = -Math.cos(dec) * Math.sin(H)
  const n = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H)
  const u = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)
  return { e, n, u, el: (Math.asin(u) * 180) / Math.PI, az: ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360 }
}

export const fmtMin = (m: number) => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` }
export const clock = (m: number) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
export const parseClock = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export const round10 = (m: number) => Math.round(m / 10) * 10
export const compassWord = (a: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / 45) % 8]
