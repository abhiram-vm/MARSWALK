// Runs route searches off the main thread. AI-assisted (Claude Code).
// For a walk with stops it searches each leg in turn, for both route profiles.
import { astar } from './model'

let elev: Float32Array, slope: Float32Array, cols = 0, rows = 0, cell = 2

self.onmessage = (e: MessageEvent) => {
  const d = e.data
  if (d.init) { elev = d.elev; slope = d.slope; cols = d.cols; rows = d.rows; cell = d.cell; return }
  const out: Record<string, (Int32Array | null)[]> = { direct: [], cautious: [] }
  for (const kind of ['direct', 'cautious'] as const)
    for (let i = 0; i < d.points.length - 1; i++)
      out[kind].push(astar(elev, slope, cols, rows, cell, d.points[i], d.points[i + 1], d.limit, d.suit, kind === 'cautious'))
  ;(self as unknown as Worker).postMessage({ id: d.id, ...out })
}
