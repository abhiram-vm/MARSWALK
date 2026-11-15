// Runs both route searches off the main thread. AI-assisted (Claude Code).
import { astar } from './model'

let elev: Float32Array, slope: Float32Array, cols = 0, rows = 0, cell = 2

self.onmessage = (e: MessageEvent) => {
  const d = e.data
  if (d.init) { elev = d.elev; slope = d.slope; cols = d.cols; rows = d.rows; cell = d.cell; return }
  const direct = astar(elev, slope, cols, rows, cell, d.s, d.g, d.limit, d.suit, false)
  const cautious = astar(elev, slope, cols, rows, cell, d.s, d.g, d.limit, d.suit, true)
  ;(self as unknown as Worker).postMessage({ id: d.id, direct, cautious })
}
