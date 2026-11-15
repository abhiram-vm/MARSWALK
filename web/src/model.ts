// Planning model: routing, route analysis, the go or no-go decision and the sun.
// AI-assisted (Claude Code). Mirrors pipeline/routes.py; see docs/PLAN.md section 6.

export interface Grid {
  cols: number
  rows: number
  cell: number
  elev: Float32Array
  slope: Float32Array
}
export interface Params {
  suit: number // multiplier on walking speed for a suited, loaded astronaut (assumed)
  limit: number // steepest ground allowed, degrees (assumed)
  work: number // minutes at the destination (assumed)
  depart: number // departure, minutes after local midnight, Mars local time
}
export interface Pt { x: number; y: number }
export interface Route {
  kind: 'direct' | 'cautious'
  path: Int32Array
  d: Float32Array // distance along route at each cell, m
  t: Float32Array // outbound time at each cell, s
  dist: number
  climb: number
  descent: number
  over10: number
  maxSlope: number
  outMin: number
  backMin: number
  walk: number
  dose: number
}
export interface Leg { k: 0 | 1 | 2 | 3; from: number; to: number; iFrom: number; iTo: number }

export const RATE_MSV_PER_SOL = 0.67 // Curiosity RAD, Hassler et al. 2014 (cited)
export const SOL_HOURS = 24.6597
export const MARS_MIN = 1.0275 // Earth minutes per Mars minute
export const RESERVE_MIN = 60 // daylight reserve before sunset (assumed)

// Tobler's hiking function, km/h, on the slope along the direction of travel.
export function speedMs(tan: number, suit: number) {
  return (6 * Math.exp(-3.5 * Math.abs(tan + 0.05)) * suit) / 3.6
}

// A* on the 2 m grid. Kept free of closures so it can be sent to a worker as text.
export function astar(
  elev: Float32Array, slope: Float32Array, cols: number, rows: number, cell: number,
  s: number, g: number, limit: number, suit: number, cautious: boolean,
): Int32Array | null {
  const n = cols * rows
  const best = new Float32Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const hf: number[] = [], hn: number[] = []
  const gx = g % cols, gy = (g / cols) | 0, vmax = (6 * suit) / 3.6
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
    const cur = pop()
    if (cur === g) {
      const out: number[] = []
      for (let k = g; k !== -1; k = came[k]) out.push(k)
      return Int32Array.from(out.reverse())
    }
    const cx = cur % cols, cy = (cur / cols) | 0, gc = best[cur]
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const ni = ny * cols + nx, sl = slope[ni]
      if (sl > limit) continue
      const dist = k < 4 ? cell : cell * 1.41421356
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

export function analyse(grid: Grid, path: Int32Array | null, kind: Route['kind'], p: Params): Route | null {
  if (!path || path.length < 2) return null
  const { cols, cell, elev, slope } = grid
  const n = path.length, d = new Float32Array(n), t = new Float32Array(n)
  let dist = 0, out = 0, back = 0, climb = 0, descent = 0, over10 = 0, maxSlope = 0
  for (let i = 1; i < n; i++) {
    const a = path[i - 1], b = path[i]
    const diag = a % cols !== b % cols && ((a / cols) | 0) !== ((b / cols) | 0)
    const step = diag ? cell * 1.41421356 : cell, dz = elev[b] - elev[a]
    dist += step
    out += step / speedMs(dz / step, p.suit)
    back += step / speedMs(-dz / step, p.suit)
    if (dz > 0) climb += dz; else descent -= dz
    if (slope[b] > 10) over10 += step
    if (slope[b] > maxSlope) maxSlope = slope[b]
    d[i] = dist; t[i] = out
  }
  const outMin = out / 60, backMin = back / 60, walk = outMin + backMin + p.work
  return { kind, path, d, t, dist, climb, descent, over10: over10 / dist, maxSlope, outMin, backMin, walk, dose: (RATE_MSV_PER_SOL * (walk / 60)) / SOL_HOURS }
}

// Where along the route a given fraction of its length falls.
export function at(grid: Grid, r: Route, frac: number) {
  const target = frac * r.dist
  let lo = 0, hi = r.path.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (r.d[mid] < target) lo = mid + 1; else hi = mid }
  const c = r.path[lo]
  return { i: lo, x: c % grid.cols, y: (c / grid.cols) | 0, dist: r.d[lo], elev: grid.elev[c], slope: grid.slope[c], time: r.t[lo] / 60 }
}

// Stretches of similar steepness. Slope is averaged over about 20 m of route so a
// single steep cell does not label a whole stretch, then pieces shorter than
// 15 m join the leg before them, keeping that leg's class.
export function legs(grid: Grid, r: Route): Leg[] {
  const n = r.path.length, cls = (s: number): Leg['k'] => (s > 15 ? 3 : s > 10 ? 2 : s > 5 ? 1 : 0)
  const avg = new Float32Array(n)
  let lo = 0, hi = 0, sum = 0
  for (let i = 0; i < n; i++) {
    while (hi < n && r.d[hi] <= r.d[i] + 10) sum += grid.slope[r.path[hi++]]
    while (r.d[lo] < r.d[i] - 10) sum -= grid.slope[r.path[lo++]]
    avg[i] = sum / (hi - lo)
  }
  const runs: Leg[] = []
  for (let i = 1; i < n; i++) {
    const k = cls(avg[i]), last = runs[runs.length - 1]
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

export interface Check { state: 'ok' | 'bad' | 'info'; text: string }
export interface Verdict { go: boolean; head: string; back: number; margin: number; checks: Check[] }
export function verdict(r: Route | null, p: Params, sunrise: number, sunset: number): Verdict {
  if (!r) return { go: false, head: 'No walkable route', back: 0, margin: 0, checks: [{ state: 'bad', text: `No route between these points stays under the ${p.limit}° limit` }] }
  const back = p.depart + r.walk / MARS_MIN, margin = (sunset - back) * MARS_MIN
  const okDawn = p.depart >= sunrise, okDay = margin >= RESERVE_MIN
  const checks: Check[] = [
    { state: okDawn ? 'ok' : 'bad', text: okDawn ? `Leaves after sunrise (${clock(sunrise)})` : `Leaves before sunrise (${clock(sunrise)})` },
    { state: okDay ? 'ok' : 'bad', text: margin >= 0 ? `Back ${fmtMin(margin)} before sunset, reserve is ${RESERVE_MIN} min` : `Back ${fmtMin(-margin)} after sunset` },
    { state: 'ok', text: `Steepest ground ${Math.round(r.maxSlope)}°, inside the ${p.limit}° limit` },
    { state: 'info', text: `From the far point, the start is ${fmtMin(r.backMin)} away` },
  ]
  const go = okDawn && okDay
  return { go, head: go ? 'Clear to walk' : okDawn ? 'Not enough daylight' : 'Too early to leave', back, margin, checks }
}

// Sun position for Gale crater. Declination from the season (solar longitude);
// local true solar time is taken as the clock time. A planning approximation.
const LAT = (-4.8 * Math.PI) / 180
export function sunAt(minutes: number, ls: number) {
  const dec = Math.asin(Math.sin((25.19 * Math.PI) / 180) * Math.sin((ls * Math.PI) / 180))
  const H = ((minutes / 60 - 12) * 15 * Math.PI) / 180
  const e = -Math.cos(dec) * Math.sin(H)
  const n = Math.cos(LAT) * Math.sin(dec) - Math.sin(LAT) * Math.cos(dec) * Math.cos(H)
  const u = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H)
  return { e, n, u, el: (Math.asin(u) * 180) / Math.PI, az: ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360 }
}

export const fmtMin = (m: number) => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` }
export const clock = (m: number) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
export const parseClock = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export const round10 = (m: number) => Math.round(m / 10) * 10
export const compassWord = (a: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / 45) % 8]
