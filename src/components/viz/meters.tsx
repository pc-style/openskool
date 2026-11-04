import { useEffect, useId, useRef, useState } from 'react'
import { cssColor, ditherMaskStyle, FillPattern, fillStyle, type DitherColor } from '@/lib/dither'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** A thin dithered meter: a sparse track and a dense fill that thins towards its end. */
export function DMeter({ value, color = 'ink', label, height = 8 }: { value: number; color?: DitherColor; label: string; height?: number }) {
  const v = clamp01(value)
  return (
    <div className="dmeter" style={{ height }} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="track" style={{ ...ditherMaskStyle(0.125, { cell: '2px' }), backgroundColor: cssColor(color) }} />
      <div className="fill" style={{ width: `${v * 100}%`, ...fillStyle('gradient', { color, cell: '2px', edge: 'left', length: 60, from: 1, to: 0.4 }) }} />
    </div>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * A track overview drawn as a dithered SVG. The part before `progress` is dense, the rest light, and
 * an optional window marks a region. The viewBox matches CSS pixels so dither cells stay square.
 */
export function DitherWave({
  peaks,
  height = 44,
  progress = 0,
  window: win,
  head,
  label,
  onSeek,
}: {
  peaks: number[]
  height?: number
  progress?: number
  window?: [number, number]
  /** Draw a playhead line at `progress`. */
  head?: boolean
  label: string
  onSeek?: (fraction: number) => void
}) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const id = useId().replace(/:/g, '')
  const H = height
  let d = ''
  if (W > 0 && peaks.length) {
    const top: string[] = []
    const bottom: string[] = []
    for (let x = 0; x <= W; x += 2) {
      const p = peaks[Math.min(peaks.length - 1, Math.floor((x / W) * peaks.length))]
      const h = Math.max(1, p * (H / 2 - 1))
      top.push(`${x} ${H / 2 - h}`)
      bottom.unshift(`${x} ${H / 2 + h}`)
    }
    d = `M${top.join('L')}L${bottom.join('L')}Z`
  }
  return (
    <div
      ref={ref}
      style={{ height: H, cursor: onSeek ? 'pointer' : undefined }}
      onClick={(e) => {
        if (!onSeek) return
        const r = e.currentTarget.getBoundingClientRect()
        onSeek((e.clientX - r.left) / r.width)
      }}
    >
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <defs>
            <FillPattern id={`${id}a`} fill="gradient" level={0.3} color="ink" cell={2} />
            <FillPattern id={`${id}b`} fill="gradient" level={0.85} color="ink" cell={2} />
            <clipPath id={`${id}c`}>
              <rect width={clamp01(progress) * W} height={H} />
            </clipPath>
          </defs>
          <path d={d} fill={`url(#${id}a)`} />
          <path d={d} fill={`url(#${id}b)`} clipPath={`url(#${id}c)`} />
          {win && (
            <g fill="var(--lime)">
              <rect x={clamp01(win[0]) * W} width={Math.max(2, (clamp01(win[1]) - clamp01(win[0])) * W)} height={H} opacity={0.16} />
              <rect x={clamp01(win[0]) * W} width={1} height={H} />
              <rect x={Math.max(clamp01(win[0]) * W + 1, clamp01(win[1]) * W - 1)} width={1} height={H} />
            </g>
          )}
          {head && <rect x={Math.min(W - 1.5, clamp01(progress) * W)} width={1.5} height={H} fill="var(--foreground)" />}
        </svg>
      )}
    </div>
  )
}

/** A score out of 1000 as a dithered ring with the number in plain text inside. */
export function ScoreRing({ score, size = 168 }: { score: number; size?: number }) {
  const id = useId().replace(/:/g, '')
  const v = clamp01(score / 1000)
  const c = size / 2
  const R = c - 4
  const r = R - 14
  const arc = (a0: number, a1: number) => {
    const p = (rad: number, a: number) => [c + rad * Math.sin(a), c - rad * Math.cos(a)]
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [x0, y0] = p(R, a0)
    const [x1, y1] = p(R, a1)
    const [x2, y2] = p(r, a1)
    const [x3, y3] = p(r, a0)
    return `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${large} 0 ${x3} ${y3}Z`
  }
  const end = Math.max(0.0001, v) * Math.PI * 2 - (v >= 1 ? 0.0001 : 0)
  return (
    <div style={{ position: 'relative', width: size, height: size }} role="img" aria-label={`Score ${score} of 1000`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <FillPattern id={`${id}t`} fill="dotted" color="ink" cell={2} />
          <FillPattern id={`${id}f`} fill="gradient" level={0.9} color={score >= 800 ? 'green' : 'ink'} cell={2} />
        </defs>
        <path d={arc(0, Math.PI * 2 - 0.0001)} fill={`url(#${id}t)`} opacity={0.6} />
        {v > 0 && <path d={arc(0, end)} fill={`url(#${id}f)`} />}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
          <div className="muted small">of 1000</div>
        </div>
      </div>
    </div>
  )
}

/** Area sparkline of recent scores, dithered under a crisp line. */
export function DitherSpark({ values, label }: { values: number[]; label: string }) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const id = useId().replace(/:/g, '')
  const H = 28
  const n = Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [values.length === 1 ? W / 2 : (i / n) * W, H - 2 - (v / 1000) * (H - 4)])
  return (
    <div ref={ref} className="spark">
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <defs>
            <FillPattern id={id} fill="gradient" color="ink" cell={2} ramp={{ edge: 'top', at: 0, length: H }} level={0.5} />
          </defs>
          <path d={`M0 ${H}L${pts.map((p) => p.join(' ')).join('L')}L${W} ${H}Z`} fill={`url(#${id})`} />
          <polyline fill="none" stroke="var(--foreground)" strokeWidth={1.5} points={pts.map((p) => p.join(',')).join(' ')} />
        </svg>
      )}
    </div>
  )
}

/** A segmented level meter, like a channel's LED ladder: `n` cells, lit up to `value` (0–1). */
export function SegMeter({ value, n = 6, label, live }: { value: number; n?: number; label: string; live?: boolean }) {
  const lit = Math.round(clamp01(value) * n)
  return (
    <span className={live ? 'segs live' : 'segs'} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp01(value) * 100)}>
      {Array.from({ length: n }, (_, k) => (
        <i key={k} className={k < lit ? 'on' : undefined} />
      ))}
    </span>
  )
}
