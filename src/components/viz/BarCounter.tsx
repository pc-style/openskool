import { useEffect, useState } from 'react'
import { heardTime } from '../../audio/engine'
import type { RoundTiming } from '../../drills/common'
import '../../drills/choice.css'

/**
 * A small strip of beat or bar cells that follows the audio clock: the cell being heard lights.
 * Without `hideFrom` or `target` the strip loops (a beat strip of 4 cells shows each bar); with
 * either it counts once from `timing.start` and stays dark after the last cell. Cells from
 * `hideFrom` on are dashed and never light, so you keep counting in your head; the `target` cell
 * shows its text and lights when it arrives. `timing.marks` are labelled under the cell they fall in
 * (on a looping strip, during the loop they fall in and the one before it). Nothing lights after
 * `timing.end`.
 */
export function BarCounter({
  timing,
  cells,
  unit = 'beat',
  label,
  hideFrom,
  target,
  still,
}: {
  timing: RoundTiming
  cells: number
  unit?: 'beat' | 'bar'
  label?: string
  hideFrom?: number
  target?: { cell: number; text: string }
  /** Only laid out (e.g. to reserve room): does not follow the audio clock. */
  still?: boolean
}) {
  const len = (unit === 'bar' ? 240 : 60) / timing.bpm
  const loop = hideFrom === undefined && !target
  // whole cells heard since the start; -1 before it
  const [pos, setPos] = useState(-1)
  useEffect(() => {
    if (still) return
    let raf = 0
    const tick = () => {
      const now = heardTime(performance.now())
      const t = now - timing.start
      setPos(t < 0 || (timing.end !== undefined && now >= timing.end) ? -1 : Math.floor(t / len + 1e-6))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [timing.start, timing.end, len, still])

  const cycle = loop && pos >= 0 ? Math.floor(pos / cells) : 0
  const current = pos < 0 ? -1 : loop ? pos % cells : pos < cells ? pos : -1
  const marks = new Map<number, string>()
  for (const m of timing.marks ?? []) {
    const k = Math.floor((m.at - timing.start) / len + 1e-6)
    if (k < 0) continue
    if (loop) {
      const c = Math.floor(k / cells)
      // a mark in this loop wins over one coming up in the next
      if (c === cycle || (c === cycle + 1 && !marks.has(k % cells))) marks.set(k % cells, m.text)
    } else if (k < cells) marks.set(k, m.text)
  }
  const bar = unit === 'beat' && pos >= 0 ? Math.floor(pos / 4) + 1 : null

  return (
    <div className="barcounter" aria-hidden="true">
      {(label || (loop && unit === 'beat')) && (
        <div className="bc-label">
          {/* a looping beat strip counts the bar at its left; its cells are the beats 1 to 4 */}
          <span>{label ?? (bar ? `Bar ${bar}` : '\u00a0')}</span>
        </div>
      )}
      <div className="bc-cells" style={{ gridTemplateColumns: `repeat(${cells}, 1fr)` }}>
        {Array.from({ length: cells }, (_, k) => {
          const hidden = hideFrom !== undefined && k >= hideFrom
          const isTarget = target?.cell === k
          const on = k === current && (!hidden || isTarget)
          return (
            <div key={k} className="bc-cell">
              <i className={`${on ? 'on' : ''} ${hidden ? 'hidden' : ''} ${isTarget ? 'target' : ''}`}>{isTarget ? target.text : loop ? k + 1 : null}</i>
              <small className={marks.has(k) ? 'mark' : undefined}>{marks.get(k) ?? '\u00a0'}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}
