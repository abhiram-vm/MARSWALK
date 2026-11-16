// Tests for the planning model. AI-assisted (Claude Code). Run: npm test
import { describe, expect, it } from 'vitest'
import siteJson from './data/site.json'
import {
  analyse, astar, bestOrder, doseFor, legs, lineOfSight, MARS_MIN, pairCheck, parseClock, posAtTime, RESERVE_MIN, sampleTimes, segmentMaxSlope, speedMs, straighten, stormNear, sunAt, verdict,
  type Grid, type Params,
} from './model'

const P: Params = { suit: 0.5, limit: 20, work: 30, depart: 540 }

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) }
function randomGrid(cols: number, rows: number, seed: number, blockedShare = 0.2): Grid {
  const r = rng(seed), elev = new Float32Array(cols * rows), slope = new Float32Array(cols * rows)
  for (let i = 0; i < elev.length; i++) { elev[i] = r() * 3; slope[i] = r() < blockedShare ? 40 : r() * 18 }
  return { cols, rows, cell: 2, elev, slope }
}
function flatGrid(cols: number, rows: number): Grid {
  return { cols, rows, cell: 2, elev: new Float32Array(cols * rows), slope: new Float32Array(cols * rows) }
}
// Plain Dijkstra with the same step costs and rules, as a reference.
function dijkstraCost(g: Grid, s: number, t: number, limit: number, suit: number, cautious: boolean) {
  const n = g.cols * g.rows, best = new Float64Array(n).fill(Infinity), done = new Uint8Array(n)
  best[s] = 0
  for (;;) {
    let u = -1, bu = Infinity
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < bu) { bu = best[i]; u = i }
    if (u < 0) return Infinity
    if (u === t) return bu
    done[u] = 1
    const cx = u % g.cols, cy = (u / g.cols) | 0
    for (let k = 0; k < 8; k++) {
      const dx = [0, 0, -1, 1, -1, 1, -1, 1][k], dy = [-1, 1, 0, 0, -1, -1, 1, 1][k], nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue
      const v = ny * g.cols + nx
      if (g.slope[v] > limit) continue
      if (k >= 4 && g.slope[cy * g.cols + nx] > limit && g.slope[ny * g.cols + cx] > limit) continue
      const dist = k < 4 ? g.cell : g.cell * Math.SQRT2
      let c = dist / speedMs((g.elev[v] - g.elev[u]) / dist, suit)
      if (cautious && g.slope[v] > 10) c *= 1 + (g.slope[v] - 10) * 0.6
      if (bu + c < best[v]) best[v] = bu + c
    }
  }
}
function pathCost(g: Grid, path: Int32Array, suit: number, cautious: boolean) {
  let c = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], diag = a % g.cols !== b % g.cols && ((a / g.cols) | 0) !== ((b / g.cols) | 0)
    const dist = diag ? g.cell * Math.SQRT2 : g.cell
    let t = dist / speedMs((g.elev[b] - g.elev[a]) / dist, suit)
    if (cautious && g.slope[b] > 10) t *= 1 + (g.slope[b] - 10) * 0.6
    c += t
  }
  return c
}

describe('routing', () => {
  it('finds the same optimum as Dijkstra on random terrain', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = randomGrid(24, 20, seed), s = 0, t = g.cols * g.rows - 1
      g.slope[s] = 0; g.slope[t] = 0
      for (const cautious of [false, true]) {
        const p = astar(g.elev, g.slope, g.cols, g.rows, g.cell, s, t, 20, 0.5, cautious)
        const ref = dijkstraCost(g, s, t, 20, 0.5, cautious)
        if (!Number.isFinite(ref)) { expect(p).toBeNull(); continue }
        expect(p).not.toBeNull()
        expect(pathCost(g, p!, 0.5, cautious)).toBeCloseTo(ref, 3)
      }
    }
  })
  it('never steps onto ground over the limit', () => {
    const g = randomGrid(40, 40, 7, 0.3)
    g.slope[0] = 0; g.slope[1599] = 0
    const p = astar(g.elev, g.slope, 40, 40, 2, 0, 1599, 20, 0.5, false)
    if (p) for (const c of p) expect(g.slope[c]).toBeLessThanOrEqual(20)
  })
  it('does not cut between two blocked cells on a diagonal', () => {
    const g = flatGrid(3, 3)
    g.slope[1] = 40; g.slope[3] = 40 // cells (1,0) and (0,1) block the corner
    g.slope[5] = 40; g.slope[7] = 40 // and the long way round
    expect(astar(g.elev, g.slope, 3, 3, 2, 0, 4, 20, 0.5, false)).toBeNull()
  })
  it('refuses a start or goal on blocked ground', () => {
    const g = flatGrid(5, 5)
    g.slope[24] = 40
    expect(astar(g.elev, g.slope, 5, 5, 2, 0, 24, 20, 0.5, false)).toBeNull()
  })
})

describe('straightening', () => {
  it('keeps the ends, never gets steeper, never gets longer', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = randomGrid(60, 60, seed, 0.15)
      g.slope[0] = 0; g.slope[3599] = 0
      const p = astar(g.elev, g.slope, 60, 60, 2, 0, 3599, 20, 0.5, false)
      if (!p) continue
      const pts = straighten(g, p)
      expect(pts[0]).toEqual({ x: 0, y: 0 })
      expect(pts[pts.length - 1]).toEqual({ x: 59, y: 59 })
      const r0 = analyse(g, [p], 'direct', P)!
      let gridLen = 0
      for (let i = 1; i < p.length; i++) gridLen += Math.hypot((p[i] % 60) - (p[i - 1] % 60), ((p[i] / 60) | 0) - ((p[i - 1] / 60) | 0)) * 2
      expect(r0.dist).toBeLessThanOrEqual(gridLen + 1e-6)
      expect(r0.maxSlope).toBeLessThanOrEqual(Math.max(...Array.from(p, (c) => g.slope[c]), 5) + 1e-6)
    }
  })
})

describe('slope limit', () => {
  it('no sampled point of any straightened route is over the limit', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = randomGrid(70, 70, seed, 0.25)
      g.slope[0] = 0; g.slope[4899] = 0
      const p = astar(g.elev, g.slope, 70, 70, 2, 0, 4899, 20, 0.5, seed % 2 === 0)
      if (!p) continue
      const r = analyse(g, [p], 'direct', P)!
      for (const c of r.path) expect(g.slope[c]).toBeLessThanOrEqual(20)
    }
  })
  it('finds every cell a line crosses, corners included', () => {
    const g = flatGrid(5, 5)
    g.slope[1 * 5 + 2] = 30 // cell (2,1)
    expect(segmentMaxSlope(g, 0, 0, 4, 2)).toBe(30) // the line y = x/2 crosses cell (2,1)
    expect(segmentMaxSlope(g, 0, 0, 4, 0)).toBe(0)
  })
})

describe('route analysis', () => {
  it('measures a straight walk on flat ground exactly', () => {
    const g = flatGrid(101, 3)
    const path = Int32Array.from({ length: 101 }, (_, i) => 101 + i)
    const back = Int32Array.from(path).reverse()
    const r = analyse(g, [path, back], 'direct', P)!
    expect(r.dist).toBeCloseTo(400, 6) // 200 m out, 200 m back
    const v = speedMs(0, 0.5)
    expect(v * 3.6).toBeCloseTo(6 * Math.exp(-0.175) * 0.5, 6) // about 2.52 km/h
    expect(r.outMin).toBeCloseTo(200 / v / 60, 6)
    expect(r.backMin).toBeCloseTo(200 / v / 60, 6)
    expect(r.walk).toBeCloseTo(r.outMin + r.backMin + 30, 6)
    expect(r.stopAt).toEqual([200, 400]) // samples are 1 m apart
  })
  it('counts time at every stop', () => {
    const g = flatGrid(50, 3)
    const a = Int32Array.from({ length: 10 }, (_, i) => 50 + i), b = Int32Array.from({ length: 10 }, (_, i) => 59 + i), c = Int32Array.from({ length: 19 }, (_, i) => 68 - i)
    const r = analyse(g, [a, b, c], 'direct', P)!
    expect(r.workMin).toBe(60) // two stops at 30 min
    expect(r.legMin.length).toBe(3)
  })
  it('charges uphill more than downhill', () => {
    const g = flatGrid(51, 3)
    for (let x = 0; x < 51; x++) for (let y = 0; y < 3; y++) g.elev[y * 51 + x] = x * 0.3 // about 8.5 degrees
    const up = Int32Array.from({ length: 51 }, (_, i) => 51 + i), down = Int32Array.from(up).reverse()
    const r = analyse(g, [up, down], 'direct', P)!
    expect(r.outMin).toBeGreaterThan(r.backMin)
    expect(r.climb).toBeCloseTo(15, 3)
  })
})

describe('units', () => {
  it('uses the radiation rate per Earth day', () => {
    expect(doseFor(24 * 60)).toBeCloseTo(0.67, 6)
    expect(doseFor(60)).toBeCloseTo(0.67 / 24, 6)
  })
  it('converts between Mars and Earth minutes in the daylight check', () => {
    const r = { walk: 120, maxSlope: 10, backMin: 20 } as never
    const v = verdict(r, { ...P, depart: 600 }, 400, 1000)
    expect(v.back).toBeCloseTo(600 + 120 / MARS_MIN, 6)
    expect(v.margin).toBeCloseTo((1000 - v.back) * MARS_MIN, 6)
  })
  it('turns no-go inside the sunset reserve and before sunrise', () => {
    const r = { walk: 60, maxSlope: 10, backMin: 20 } as never
    expect(verdict(r, { ...P, depart: 1000 - 60 / MARS_MIN - (RESERVE_MIN - 5) / MARS_MIN }, 400, 1000).go).toBe(false)
    expect(verdict(r, { ...P, depart: 700 }, 400, 1000).go).toBe(true)
    expect(verdict(r, { ...P, depart: 390 }, 400, 1000).go).toBe(false)
  })
})

describe('sun', () => {
  const sun = siteJson.sun
  const crossing = (from: number, to: number) => {
    let a = from, b = to
    const f = (m: number) => sunAt(m, sun).el
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Math.sign(f(m)) === Math.sign(f(a))) a = m; else b = m }
    return (a + b) / 2
  }
  it('rises and sets when Curiosity\'s weather station says it does', () => {
    const rise = crossing(240, 720), set = crossing(720, 1260)
    expect(Math.abs(rise - parseClock(siteJson.conditions.sunrise))).toBeLessThan(4)
    expect(Math.abs(set - parseClock(siteJson.conditions.sunset))).toBeLessThan(4)
  })
  it('agrees with the season in the weather record', () => {
    expect(Math.abs(sun.ls - Number(siteJson.conditions.ls))).toBeLessThan(1.5)
  })
})

describe('legs', () => {
  it('labels a gentle walk as gentle', () => {
    const g = flatGrid(200, 3)
    const p = Int32Array.from({ length: 200 }, (_, i) => 200 + i)
    const r = analyse(g, [p, Int32Array.from(p).reverse()], 'direct', P)!
    const l = legs(g, r, 0, r.stopAt[0])
    expect(l.length).toBe(1)
    expect(l[0].k).toBe(0)
  })
})

describe('space weather', () => {
  const sw = { checked: '2026-11-15T00:00Z', sepEvents: [], marsArrivals: [{ time: '2026-11-13T12:00Z', glancing: true }] }
  it('warns within a day of a modelled arrival at Mars', () => {
    expect(stormNear(sw, '2026-11-13T00:00Z')).toMatch(/glancing Mars/)
    expect(stormNear(sw, '2026-11-15T00:00Z')).toBeNull()
  })
})

describe('time along a walk', () => {
  const g = flatGrid(60, 3)
  const out = Int32Array.from({ length: 51 }, (_, i) => 60 + i), back = Int32Array.from(out).reverse()
  const r = analyse(g, [out, back], 'direct', P)!
  const times = sampleTimes(r, P)
  it('waits at a stop for the planned time', () => {
    const arrive = times[r.stopAt[0]]
    expect(posAtTime(r, times, arrive + 1).x).toBeCloseTo(50, 3)
    expect(posAtTime(r, times, arrive + P.work - 0.5).x).toBeCloseTo(50, 3)
    expect(posAtTime(r, times, arrive + P.work + 2).x).toBeLessThan(50)
  })
  it('ends at the start', () => {
    expect(times[times.length - 1]).toBeCloseTo(r.walk, 4)
    expect(posAtTime(r, times, r.walk + 10).x).toBeCloseTo(0, 6)
  })
})

describe('working in pairs', () => {
  it('sees across flat ground and not through a wall', () => {
    const g = flatGrid(40, 5)
    expect(lineOfSight(g, { x: 2, y: 2 }, { x: 37, y: 2 })).toBe(true)
    for (let y = 0; y < 5; y++) g.elev[y * 40 + 20] = 5 // a 5 m wall
    expect(lineOfSight(g, { x: 2, y: 2 }, { x: 37, y: 2 })).toBe(false)
  })
  it('measures how far apart two walkers get', () => {
    const g = flatGrid(80, 3)
    const east = Int32Array.from({ length: 31 }, (_, i) => 80 + 40 + i), west = Int32Array.from({ length: 31 }, (_, i) => 80 + 40 - i)
    const a = analyse(g, [east, Int32Array.from(east).reverse()], 'direct', P)!
    const b = analyse(g, [west, Int32Array.from(west).reverse()], 'direct', P)!
    const c = pairCheck(g, a, b, P, 100)
    expect(c.maxSep).toBeCloseTo(120, 0) // 60 m each way, 2 m cells
    expect(c.inSight).toBe(1)
    expect(c.tooFar.length).toBe(1)
    const v = verdict([a, b], P, 400, 1200, null, undefined, { check: c, sepLimit: 100, gapLimit: 10 })
    expect(v.go).toBe(false)
    expect(v.head).toBe('Partners too far apart')
    expect(verdict([a, b], P, 400, 1200, null, undefined, { check: c, sepLimit: 150, gapLimit: 10 }).go).toBe(true)
  })
})

describe('stop order', () => {
  it('finds the shortest round trip', () => {
    // points on a line at 0, 3, 1, 2: the best order visits 1 (at 3) last
    const pos = [0, 3, 1, 2], m = pos.map((a) => pos.map((b) => Math.abs(a - b)))
    const o = bestOrder(m)
    const len = (ord: number[]) => m[0][ord[0]] + m[ord[ord.length - 1]][0] + ord.slice(1).reduce((t, x, i) => t + m[ord[i]][x], 0)
    expect(len(o)).toBe(6)
  })
})
