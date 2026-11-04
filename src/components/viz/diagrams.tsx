// Small dithered diagrams shown after an answer, so you can see what you just heard.
import { useId } from 'react'
import { FillPattern } from '@/lib/dither'
import { TAP_GOOD, TAP_PERFECT, tapGrade, type TapGrade } from '../../drills/common'

const useIds = () => useId().replace(/:/g, '')
const W = 480

function Frame({ h, label, children }: { h: number; label: string; children: React.ReactNode }) {
  return (
    <figure className="viz fade-in">
      <svg viewBox={`0 0 ${W} ${h}`} width={W} height={h} role="img" aria-label={label} style={{ maxWidth: '100%', height: 'auto' }}>
        {children}
      </svg>
    </figure>
  )
}

// ---------- Sync Check: where B's kick landed against A's ----------

export function SyncDiagram({ offsetMs }: { offsetMs: number }) {
  const id = useIds()
  const px = 2.2 // per ms
  const cx = W / 2
  const kick = (x: number, y: number) => {
    const pts = [`${x} ${y + 30}`, `${x} ${y + 2}`]
    for (let ms = 0; ms <= 90; ms += 6) pts.push(`${x + ms * px} ${y + 2 + 28 * (1 - Math.exp(-ms / 22))}`)
    pts.push(`${x + 90 * px} ${y + 30}`)
    return `M${pts.join('L')}Z`
  }
  const xb = cx + offsetMs * px
  const tag = offsetMs === 0 ? 'together' : `${Math.abs(Math.round(offsetMs))} ms ${offsetMs < 0 ? 'early' : 'late'}`
  return (
    <Frame h={96} label={`Deck B's kick landed ${tag} against deck A`}>
      <defs>
        <FillPattern id={`${id}a`} fill="gradient" color="ink" cell={2} ramp={{ edge: 'left', at: cx, length: 140 }} />
        <FillPattern id={`${id}b`} fill="gradient" color={offsetMs === 0 ? 'green' : 'orange'} cell={2} ramp={{ edge: 'left', at: xb, length: 140 }} />
      </defs>
      <line x1={cx} x2={cx} y1={4} y2={80} stroke="var(--border)" strokeDasharray="2 3" />
      <text x={4} y={26}>A</text>
      <text x={4} y={66}>B</text>
      <path d={kick(cx, 4)} fill={`url(#${id}a)`} />
      <path d={kick(xb, 44)} fill={`url(#${id}b)`} />
      <text x={cx - 100 * px} y={94} textAnchor="middle">
        −100 ms
      </text>
      <text x={cx} y={94} textAnchor="middle">
        0
      </text>
      <text x={cx + 100 * px} y={94} textAnchor="middle">
        +100 ms
      </text>
    </Frame>
  )
}

// ---------- EQ and filter: the frequency response that was applied ----------

const F0 = 20
const F1 = 20000
const fx = (f: number) => 40 + ((Math.log10(f) - Math.log10(F0)) / (Math.log10(F1) - Math.log10(F0))) * (W - 50)

function Response({ gain, label, marks }: { gain: (f: number) => number; label: string; marks: { f: number; text: string; on?: boolean }[] }) {
  const id = useIds()
  const top = 18
  const floor = 92
  const y = (db: number) => top + Math.min(1, -Math.min(0, db) / 40) * (floor - top - 6)
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const f = F0 * Math.pow(F1 / F0, i / 120)
    pts.push(`${fx(f)} ${y(gain(f))}`)
  }
  return (
    <Frame h={112} label={label}>
      <defs>
        <FillPattern id={id} fill="gradient" color="ink" cell={2} ramp={{ edge: 'top', at: top, length: floor - top }} level={0.75} />
      </defs>
      <path d={`M${fx(F0)} ${floor}L${pts.join('L')}L${fx(F1)} ${floor}Z`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--foreground)" strokeWidth={1.25} />
      <text x={4} y={top + 4}>
        0 dB
      </text>
      {marks.map((m) => (
        <text key={m.text} x={fx(m.f)} y={108} textAnchor="middle" style={m.on ? { fill: 'var(--foreground)', fontWeight: 600 } : undefined}>
          {m.text}
        </text>
      ))}
    </Frame>
  )
}

export function EqDiagram({ band, cutDb }: { band: 'low' | 'mid' | 'high'; cutDb: number }) {
  const w = {
    low: (f: number) => 1 / (1 + (f / 200) ** 2),
    mid: (f: number) => Math.exp(-(Math.log2(f / 1000) ** 2) / (2 * 1.1 ** 2)),
    high: (f: number) => 1 / (1 + (3500 / f) ** 2),
  }[band]
  return (
    <Response
      gain={(f) => cutDb * w(f)}
      label={`${band} band cut by ${-cutDb} dB`}
      marks={[
        { f: 70, text: 'Low', on: band === 'low' },
        { f: 1000, text: 'Mid', on: band === 'mid' },
        { f: 9000, text: 'High', on: band === 'high' },
      ]}
    />
  )
}

export function FilterDiagram({ kind }: { kind: 'lp' | 'hp' | 'none' }) {
  const gain = (f: number) => (kind === 'lp' ? -24 * Math.max(0, Math.log2(f / 700)) : kind === 'hp' ? -24 * Math.max(0, Math.log2(500 / f)) : 0)
  return (
    <Response
      gain={gain}
      label={kind === 'none' ? 'No filter' : kind === 'lp' ? 'Low-pass: highs removed' : 'High-pass: lows removed'}
      marks={[
        { f: 60, text: '60 Hz' },
        { f: 1000, text: '1 kHz' },
        { f: 10000, text: '10 kHz' },
      ]}
    />
  )
}

// ---------- Loop Lab: how the loop repeats over the beat grid ----------

export function LoopDiagram({ beats }: { beats: number }) {
  const id = useIds()
  const cell = (W - 20) / 12
  const segs: { x: number; w: number; k: number }[] = []
  for (let x = 4, k = 0; x < 12; x += beats, k++) segs.push({ x, w: Math.min(beats, 12 - x), k })
  return (
    <Frame h={72} label={`A ${beats}-beat loop repeating after one bar`}>
      <defs>
        <FillPattern id={`${id}p`} fill="gradient" color="ink" cell={2} level={0.25} />
        <FillPattern id={`${id}a`} fill="gradient" color="ink" cell={2} level={0.85} />
        <FillPattern id={`${id}b`} fill="gradient" color="ink" cell={2} level={0.5} />
      </defs>
      <rect x={10} y={14} width={4 * cell - 2} height={30} fill={`url(#${id}p)`} />
      {segs.map((s) => (
        <rect key={s.x} x={10 + s.x * cell} y={14} width={s.w * cell - 2} height={30} fill={`url(#${id}${s.k % 2 ? 'b' : 'a'})`} />
      ))}
      <rect x={10 + 4 * cell} y={12} width={Math.min(beats, 8) * cell - 2} height={34} fill="none" stroke="var(--lime)" />
      {Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1={10 + i * cell - 1} x2={10 + i * cell - 1} y1={i % 4 === 0 ? 6 : 48} y2={52} stroke="var(--border)" />
      ))}
      <text x={10} y={66}>
        bar 1
      </text>
      <text x={10 + 4 * cell} y={66}>
        loop engages
      </text>
    </Frame>
  )
}

// ---------- Downbeat Tapper: every tap against its downbeat ----------

export function TapTimeline({ errs }: { errs: (number | null)[] }) {
  const id = useIds()
  const n = errs.length
  const x = (i: number) => 52 + (i * (W - 70)) / Math.max(1, n - 1)
  const mid = 56
  const scale = 0.28 // px per ms
  const y = (s: number) => Math.max(8, Math.min(104, mid + s * 1000 * scale))
  const band = (sec: number) => sec * 1000 * scale
  const fill: Record<TapGrade, string> = { perfect: 'p', good: 'g', close: 'c', off: 'r', miss: 'r' }
  return (
    <Frame h={116} label={`${errs.filter((e) => e !== null).length} of ${n} hit`}>
      <defs>
        <FillPattern id={`${id}z`} fill="dotted" color="green" cell={2} />
        <FillPattern id={`${id}y`} fill="dotted" color="grey" cell={2} />
        <FillPattern id={`${id}p`} fill="gradient" color="green" cell={2} level={0.85} />
        <FillPattern id={`${id}g`} fill="gradient" color="ink" cell={2} level={0.8} />
        <FillPattern id={`${id}c`} fill="gradient" color="grey" cell={2} level={0.8} />
        <FillPattern id={`${id}r`} fill="gradient" color="red" cell={2} level={0.8} />
      </defs>
      {/* Good zone, with the Perfect zone inside it: the same windows the live rating uses */}
      <rect x={44} y={mid - band(TAP_GOOD)} width={W - 50} height={2 * band(TAP_GOOD)} fill={`url(#${id}y)`} />
      <rect x={44} y={mid - band(TAP_PERFECT)} width={W - 50} height={2 * band(TAP_PERFECT)} fill={`url(#${id}z)`} />
      <line x1={44} x2={W - 6} y1={mid} y2={mid} stroke="var(--border)" />
      <text x={0} y={14}>
        early
      </text>
      <text x={0} y={mid + 4}>
        on time
      </text>
      <text x={0} y={112}>
        late
      </text>
      {errs.map((e, i) =>
        e === null ? (
          <text key={i} x={x(i)} y={mid + 4} textAnchor="middle" style={{ fill: 'var(--bad)' }}>
            ×
          </text>
        ) : (
          <rect key={i} x={x(i) - 4} y={Math.min(mid, y(e))} width={8} height={Math.max(2, Math.abs(y(e) - mid))} fill={`url(#${id}${fill[tapGrade(e)]})`} />
        ),
      )}
    </Frame>
  )
}

// ---------- Camelot: the wheel, with the start key, its safe moves and the answer ----------

const camelotNum = (c: string) => Number(c.slice(0, -1))
const camelotWrap = (n: number) => ((n - 1 + 120) % 12) + 1

/** Same number, one step either way, or the A/B swap. */
function safeMoves(c: string) {
  const n = camelotNum(c)
  const l = c.slice(-1)
  return [`${camelotWrap(n - 1)}${l}`, `${camelotWrap(n + 1)}${l}`, `${n}${l === 'A' ? 'B' : 'A'}`]
}

/** An extra mark on a Camelot key: `boost` dashed, `good` lime, `bad` red and dashed. */
export interface CamelotMark {
  code: string
  tone: 'boost' | 'good' | 'bad'
}

/**
 * The 12-segment Camelot wheel: inner ring A (minor), outer ring B (major), 12 at the top. The start
 * key and its safe neighbours get muted fills; the answer is outlined in lime, or in red when it is
 * the clash the round asked for. Without `start` nothing is shaded. With `onSelect` every key is a
 * focusable button (style it with `.cw-key`); `highlight` adds extra outlines.
 */
export function CamelotWheel({
  start,
  answer,
  clash,
  onSelect,
  highlight = [],
}: {
  start?: string
  answer?: string
  clash?: boolean
  onSelect?: (code: string) => void
  highlight?: CamelotMark[]
}) {
  const S = 260
  const c = S / 2
  const rings = { A: [52, 89], B: [89, 126] } as const
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180
    return `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`
  }
  const seg = (n: number, r0: number, r1: number) => {
    const a0 = n * 30 - 15
    const a1 = n * 30 + 15
    return `M${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`
  }
  const segOf = (code: string) => {
    const [r0, r1] = rings[code.slice(-1) as 'A' | 'B']
    return seg(camelotNum(code), r0, r1)
  }
  const safe = start ? safeMoves(start) : []
  const marked = new Set(highlight.map((m) => m.code))
  const cells = (['A', 'B'] as const).flatMap((l) => Array.from({ length: 12 }, (_, i) => ({ n: i + 1, l, code: `${i + 1}${l}` })))
  const fillOf = (code: string) =>
    code === start
      ? 'color-mix(in srgb, var(--foreground) 22%, transparent)'
      : safe.includes(code)
        ? 'color-mix(in srgb, var(--foreground) 9%, transparent)'
        : 'transparent'
  const label = start
    ? `Camelot wheel: ${start} with safe moves ${safe.join(', ')}${answer && answer !== start ? `; answer ${answer}` : ''}`
    : 'Camelot wheel'
  const stroke = { boost: 'var(--foreground)', good: 'var(--lime)', bad: 'var(--bad)' }
  return (
    <figure className="viz fade-in" style={{ maxWidth: 300 }}>
      <svg viewBox={`0 0 ${S} ${S}`} role={onSelect ? 'group' : 'img'} aria-label={label}>
        {cells.map(({ n, l, code }) => {
          const [r0, r1] = rings[l]
          const on = code === start || safe.includes(code) || code === answer || marked.has(code)
          const select = onSelect && (() => onSelect(code))
          return (
            <g
              key={code}
              className={onSelect ? 'cw-key' : undefined}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? code : undefined}
              aria-pressed={onSelect ? code === start : undefined}
              onClick={select}
              onKeyDown={
                select &&
                ((e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    select()
                  }
                })
              }
            >
              <path d={seg(n, r0, r1)} fill={fillOf(code)} stroke="var(--border)" />
              <text
                x={c + ((r0 + r1) / 2) * Math.sin((n * Math.PI) / 6)}
                y={c - ((r0 + r1) / 2) * Math.cos((n * Math.PI) / 6) + 4}
                textAnchor="middle"
                style={on ? { fill: 'var(--foreground)', fontWeight: code === start || code === answer ? 600 : 400 } : undefined}
              >
                {code}
              </text>
            </g>
          )
        })}
        {highlight.map((m) => (
          <path
            key={`${m.code}-${m.tone}`}
            d={segOf(m.code)}
            fill={m.tone === 'good' ? 'var(--lime-soft)' : 'none'}
            stroke={stroke[m.tone]}
            strokeWidth={m.tone === 'boost' ? 1.25 : 2}
            strokeDasharray={m.tone === 'good' ? undefined : m.tone === 'boost' ? '2 3' : '4 3'}
            pointerEvents="none"
          />
        ))}
        {answer && (
          <path
            d={segOf(answer)}
            fill={clash ? 'none' : 'var(--lime-soft)'}
            stroke={clash ? 'var(--bad)' : 'var(--lime)'}
            strokeWidth={2}
            strokeDasharray={clash ? '4 3' : undefined}
            pointerEvents="none"
          />
        )}
        <text x={c} y={c - 2} textAnchor="middle" pointerEvents="none">
          A = minor
        </text>
        <text x={c} y={c + 12} textAnchor="middle" pointerEvents="none">
          B = major
        </text>
      </svg>
      {start && (
        <figcaption style={{ textAlign: 'center', marginTop: 4 }}>
          Shaded: {start} and its safe moves {safe.join(', ')}.
        </figcaption>
      )}
    </figure>
  )
}
