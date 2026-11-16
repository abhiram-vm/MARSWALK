// Runs route searches off the main thread. AI-assisted (Claude Code).
//   { walks: number[][] }  routes every leg of each walk (one walk per astronaut), both profiles
//   { order: number[] }    finds the visiting order with the least walking time
import { astar, bestOrder, orderMatrix, type Grid } from './model'

let g: Grid

self.onmessage = (e: MessageEvent) => {
  const d = e.data
  if (d.init) { g = { elev: d.elev, slope: d.slope, cols: d.cols, rows: d.rows, cell: d.cell }; return }
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  if (d.order) {
    const m = orderMatrix(g, d.order, d.limit, d.suit, !!d.cautious)
    post({ id: d.id, order: bestOrder(m), reachable: m.every((row) => row.every(Number.isFinite)) })
    return
  }
  const out: Record<'direct' | 'cautious', (Int32Array | null)[][]> = { direct: [], cautious: [] }
  for (const kind of ['direct', 'cautious'] as const)
    for (const walk of d.walks as number[][])
      out[kind].push(walk.slice(0, -1).map((s, i) => astar(g.elev, g.slope, g.cols, g.rows, g.cell, s, walk[i + 1], d.limit, d.suit, kind === 'cautious')))
  post({ id: d.id, ...out })
}
