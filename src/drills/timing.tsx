// Drills scored on when you tap or how you ride the pitch fader.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ac, click, out, play, stopAll, track } from '../audio/engine'
import { barLen, barTime, beatLen, getClip, partnerClip, pickBar, type Clip } from '../lib/clips'
import { getSettings } from '../lib/progress'
import { Swap, Value } from '../components/Swap'
import { TapTimeline } from '../components/viz/diagrams'
import { BarCounter } from '../components/viz/BarCounter'
import {
  clamp,
  gradeCounts,
  ms,
  rateTap,
  TAP_CLOSE,
  TAP_GOOD,
  TAP_PERFECT,
  TapPad,
  tapGrade,
  useTaps,
  type DrillProps,
  type RoundTiming,
  type RunDetail,
  type TapGrade,
  type TapRating,
} from './common'
import './timing.css'

const lin = (err: number, full: number, zero: number) => clamp(1 - (Math.abs(err) - full) / (zero - full), 0, 1)

/** Share of a tap's points: full to TAP_PERFECT, then falling to about 70 % at TAP_GOOD, 40 % at TAP_CLOSE and 0 at half a beat. */
function tapCredit(err: number, beat: number): number {
  const a = Math.abs(err)
  const curve: [number, number][] = [
    [TAP_PERFECT, 1],
    [TAP_GOOD, 0.68],
    [TAP_CLOSE, 0.4],
    [Math.max(beat / 2, TAP_CLOSE + 0.03), 0],
  ]
  if (a <= curve[0][0]) return 1
  for (let k = 1; k < curve.length; k++) {
    const [x0, y0] = curve[k - 1]
    const [x1, y1] = curve[k]
    if (a <= x1) return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0)
  }
  return 0
}

/**
 * When tap latency is not calibrated and the taps near their targets sit consistently early or late
 * by a similar amount, a tip pointing to the calibration in Profile.
 */
function latencyTip(errs: (number | null)[]): string | null {
  if (getSettings().latencyMs !== 0) return null
  const h = errs.filter((e): e is number => e !== null && Math.abs(e) < 0.2)
  if (h.length < 3) return null
  const mean = h.reduce((s, e) => s + e, 0) / h.length
  const sd = Math.sqrt(h.reduce((s, e) => s + (e - mean) ** 2, 0) / h.length)
  const same = h.filter((e) => Math.sign(e) === Math.sign(mean)).length
  if (Math.abs(mean) < 0.025 || sd > Math.max(0.03, Math.abs(mean) * 0.6) || same < h.length * 0.8) return null
  return `Your taps land about ${Math.round(Math.abs(mean) * 1000)} ms ${mean < 0 ? 'early' : 'late'} every time. That is often your headphones or screen, not your timing: set Profile → Tap latency and the drills will correct for it.`
}

/** A short buzz on each pad tap, a stronger one on a Perfect, when haptics are on. */
const buzz = (strong = false) => {
  if (getSettings().haptics) navigator.vibrate?.(strong ? 25 : 10)
}

const longestRun = (ok: boolean[]) => ok.reduce<[number, number]>(([best, cur], x) => (x ? [Math.max(best, cur + 1), cur + 1] : [best, 0]), [0, 0])[0]

const tapDetail = (errs: (number | null)[]): RunDetail => {
  const ok = errs.map((e) => e !== null && Math.abs(e) <= TAP_GOOD)
  return { right: ok.filter(Boolean).length, total: errs.length, bestStreak: longestRun(ok), grades: gradeCounts(errs) }
}

/** Signed ms without a "−0 ms". */
const msr = (s: number) => (Math.round(Math.abs(s) * 1000) ? ms(s) : '0 ms')

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** "1½ beats", "¾ of a beat": a distance in quarter beats, for verdicts. */
function beatsText(beats: number): string {
  const q = Math.round(beats * 4) / 4
  const whole = Math.floor(q)
  const frac = ['', '¼', '½', '¾'][Math.round((q - whole) * 4)]
  if (!whole) return `${frac} of a beat`
  return `${whole}${frac} beat${whole === 1 && !frac ? '' : 's'}`
}

/** How far off a tap was, in ms for small errors and in beats once it is a noticeable part of a beat. */
function howFar(err: number, beat: number): string {
  const dir = err < 0 ? 'early' : 'late'
  if (Math.abs(err) < beat * 0.2) return `${Math.round(Math.abs(err) * 1000)} ms ${dir}`
  return `${beatsText(Math.abs(err) / beat)} ${dir} (${msr(err)})`
}

/** "2 bars early", "1 bar and 2 beats late". */
function barsText(err: number, bl: number): string {
  const beat = bl / 4
  const totalBeats = Math.round(Math.abs(err) / beat)
  const bars = Math.floor(totalBeats / 4)
  const beats = totalBeats % 4
  const parts = [bars ? plural(bars, 'bar') : '', beats ? plural(beats, 'beat') : ''].filter(Boolean)
  return `${parts.join(' and ')} ${err < 0 ? 'early' : 'late'}`
}

type Tone = 'good' | 'ok' | 'bad'
/** What a round says after the tap: a verdict, an explanation with numbers, and a separate tip. */
interface RoundDesc {
  verdict: string
  tone: Tone
  explain: string
  tip?: string
}

/** The better half of the Good window. */
const TAP_GREAT = 0.075

/**
 * Perfect, then Great or Good inside the Good window, then Close, then Too early / Too late (Off) or
 * Wrong bar, on the same windows as the live pad rating.
 */
function tapTier(err: number, bl: number): { verdict: string; tone: Tone } {
  const a = Math.abs(err)
  if (a <= TAP_PERFECT) return { verdict: 'Perfect', tone: 'good' }
  if (a <= TAP_GREAT) return { verdict: 'Great', tone: 'good' }
  if (a <= TAP_GOOD) return { verdict: 'Good', tone: 'ok' }
  if (a <= TAP_CLOSE) return { verdict: `Close · a touch ${err < 0 ? 'early' : 'late'}`, tone: 'ok' }
  if (a >= bl / 2) return { verdict: 'Wrong bar', tone: 'bad' }
  return { verdict: err < 0 ? 'Too early' : 'Too late', tone: 'bad' }
}

function Verdict({ d, pts }: { d: RoundDesc; pts?: number }) {
  return (
    <div className="verdict" role="status">
      <p className="verdict-line">
        <strong className={`tone-${d.tone}`}>{d.verdict}</strong>
        {pts !== undefined && <span className="muted"> · {Math.round(pts)} pts</span>}
      </p>
      <p>{d.explain}</p>
      {d.tip && <p className="muted small">{d.tip}</p>}
    </div>
  )
}

function Tally({ errs }: { errs: (number | null)[] }) {
  const c = gradeCounts(errs)
  const names: [TapGrade, string][] = [['perfect', 'Perfect'], ['good', 'Good'], ['close', 'Close'], ['off', 'Off'], ['miss', 'Miss']]
  return (
    <p className="tally">
      {names.map(([g, n]) => (
        <span key={g}>
          <b>{c[g]}</b> {n}
        </span>
      ))}
    </p>
  )
}

const ERR_CLASS: Record<TapGrade, string> = { perfect: 'good', good: 'ok', close: 'ok', off: 'bad', miss: 'miss' }

function useUnmountStop() {
  useEffect(() => () => stopAll(), [])
}

/** A Skip button with the S key: the round scores nothing and the next one starts from its Play screen. */
function Skip({ onSkip, last, what = 'round' }: { onSkip: () => void; last: boolean; what?: string }) {
  const cb = useRef(onSkip)
  useLayoutEffect(() => {
    cb.current = onSkip
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) cb.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <button className="ghost skip" onClick={onSkip}>
      {last ? 'Skip and finish' : `Skip ${what}`} <kbd>S</kbd>
    </button>
  )
}

/** One dot per scored bar, filled by grade; a gap marks where the pass mark falls. */
function GradeDots({ grades, pass }: { grades: (TapGrade | null)[]; pass: number }) {
  const ok = grades.filter((g) => g === 'perfect' || g === 'good').length
  return (
    <div className="grade-dots">
      <div className="dots" aria-hidden="true">
        {grades.map((g, k) => (
          <span key={k} className={`dot ${g ?? ''}`} />
        ))}
      </div>
      <p className="muted small">
        <Value v={ok} /> of {grades.length} Perfect or Good · pass {pass}
      </p>
    </div>
  )
}

// ---------- Downbeat Tapper ----------
/**
 * Four short stages that take the help away one piece at a time, so a slip costs one stage, not the run.
 * `lead` bars are free (count-in or settling in); `scored` bars count.
 */
const DB_STAGES = [
  { name: 'With the click', lead: 1, scored: 4, click: 'all', random: false, help: 'The track starts on a 1 and a click plays on every beat, high on the 1. Tap with the high click.' },
  { name: 'Click drops out', lead: 2, scored: 4, click: 'lead', random: false, help: 'Two bars of click count you in, then it stops. Keep tapping the 1 by ear.' },
  { name: 'Find the 1', lead: 2, scored: 4, click: 'none', random: true, help: 'No click, and the track starts on a random beat. Use the two free bars to find the 1, then tap it.' },
  { name: 'Long run', lead: 2, scored: 8, click: 'none', random: true, help: 'Same as before, for eight bars. Stay locked on.' },
] as const
const DB_TOTAL = DB_STAGES.reduce((n, x) => n + x.scored, 0)
const GRADE_RANK: Record<TapGrade, number> = { perfect: 0, good: 1, close: 2, off: 3, miss: 4 }
interface DbStage {
  errs: (number | null)[]
  extras: number
  /** Credit for the stage, 0 to `scored` bars. */
  pts: number
}
export function DownbeatTapper({ source, onDone }: DrillProps) {
  useUnmountStop()
  const [si, setSi] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result' | 'done'>('ready')
  const [flash, setFlash] = useState(0)
  const [rating, setRating] = useState<TapRating | null>(null)
  const [dots, setDots] = useState<(TapGrade | null)[]>([])
  const [stages, setStages] = useState<(DbStage | null)[]>([])
  const run = useRef<{ targets: number[]; lead: number; beat: number; taps: number[]; bpm: number }>({ targets: [], lead: 1, beat: 0.5, taps: [], bpm: 120 })
  const [timeline, setTimeline] = useState<RoundTiming | null>(null)
  const endTimer = useRef(0)
  useEffect(() => () => clearTimeout(endTimer.current), [])
  const st = DB_STAGES[si]
  const last = si + 1 >= DB_STAGES.length
  const pass = Math.ceil(st.scored * 0.75)

  const begin = async () => {
    clearTimeout(endTimer.current)
    stopAll()
    setPhase('loading')
    const c = await getClip(source)
    const bars = st.lead + st.scored
    const n = pickBar(c, bars + 1)
    const offBeats = st.random ? 1 + Math.floor(Math.random() * 3) : 0
    const from = barTime(c, n) + offBeats * beatLen(c)
    const at = ac().currentTime + 0.2
    const end = barTime(c, n + bars) + beatLen(c)
    play(c.buffer, { from, dur: end - from, at })
    const targets: number[] = []
    for (let k = 1; k <= bars; k++) targets.push(at + barTime(c, n + k) - from)
    const clicks = st.click === 'all' ? bars * 4 : st.click === 'lead' ? st.lead * 4 : 0
    for (let k = 0; k < clicks; k++) click(targets[0] + k * beatLen(c), k % 4 === 0, 0.3)
    run.current = { targets, lead: st.lead, beat: beatLen(c), taps: [], bpm: c.bpm }
    setTimeline({ start: targets[0], bpm: c.bpm, end: end - from + at })
    setRating(null)
    setDots(targets.slice(st.lead).map(() => null))
    setPhase('playing')
    endTimer.current = window.setTimeout(() => score(), (end - from + 0.4) * 1000)
  }

  const score = () => {
    const { targets, lead, beat, taps } = run.current
    const scored = targets.slice(lead)
    const used = new Set<number>()
    const errs = scored.map((t) => {
      let bi = -1
      let be = Infinity
      taps.forEach((x, k) => {
        if (!used.has(k) && Math.abs(x - t) < Math.abs(be) && Math.abs(x - t) < beat / 2) {
          be = x - t
          bi = k
        }
      })
      if (bi < 0) return null
      used.add(bi)
      return be
    })
    const firstScored = scored[0] - beat / 2
    const extras = taps.filter((x, k) => !used.has(k) && x > firstScored).length
    const credit = errs.reduce<number>((s, e) => s + (e === null ? 0 : tapCredit(e, beat)), 0)
    const pts = clamp(credit - extras * 0.5, 0, scored.length)
    setStages((all) => {
      const next = [...all]
      next[si] = { errs, extras, pts }
      return next
    })
    setDots(errs.map(tapGrade))
    setPhase('result')
  }

  const finish = (all: (DbStage | null)[]) => {
    const errs = DB_STAGES.flatMap((x, k) => all[k]?.errs ?? Array<null>(x.scored).fill(null))
    const pts = all.reduce((s, x) => s + (x?.pts ?? 0), 0)
    const ok = errs.filter((e) => e !== null && Math.abs(e) <= TAP_GOOD).length
    const passed = all.map((x, k) => !!x && x.errs.filter((e) => e !== null && Math.abs(e) <= TAP_GOOD).length >= Math.ceil(DB_STAGES[k].scored * 0.75))
    onDone(Math.round((pts / DB_TOTAL) * 1000), { ...tapDetail(errs), right: ok, total: errs.length, bestStreak: longestRun(passed) })
  }
  const nextStage = (all = stages) => {
    stopAll()
    if (last) return finish(all)
    setSi(si + 1)
    setPhase('ready')
  }
  const skip = () => {
    clearTimeout(endTimer.current)
    const all = [...stages]
    all[si] = null
    setStages(all)
    nextStage(all)
  }

  const onPad = useTaps((t) => {
    const { targets, lead, beat, taps } = run.current
    taps.push(t)
    setFlash((f) => f + 1)
    // more than half a beat from every downbeat is not on the 1 at all
    const r = rateTap(t, targets, beat / 2, null)
    buzz(r.err !== null && Math.abs(r.err) <= TAP_PERFECT)
    setRating((prev) => ({ ...r, n: (prev?.n ?? 0) + 1 }))
    // fill the dot of the bar this tap landed on, keeping the best tap on each bar
    const k = targets.reduce((b, x, i) => (Math.abs(t - x) < Math.abs(t - targets[b]) ? i : b), 0)
    if (k >= lead && Math.abs(t - targets[k]) < beat / 2) {
      const g = tapGrade(t - targets[k])
      setDots((d) => d.map((x, i) => (i === k - lead && (x === null || GRADE_RANK[g] < GRADE_RANK[x]) ? g : x)))
    }
  }, phase === 'playing')

  const stageStrip = (
    <ol className="db-stages" aria-label="Stages">
      {DB_STAGES.map((x, k) => {
        const r = stages[k]
        const state = k === si ? 'now' : r ? 'done' : k < si ? 'skipped' : ''
        return (
          <li key={x.name} className={state} aria-current={k === si ? 'step' : undefined}>
            <span>{x.name}</span>
            <span className="tabular muted">{r ? `${Math.round((r.pts / x.scored) * 100)}%` : k < si ? 'skipped' : `${x.scored} bars`}</span>
          </li>
        )
      })}
    </ol>
  )

  let content: React.ReactNode
  if (phase === 'ready' || phase === 'loading')
    content = (
      <div className="center">
        <p>
          <b>{st.name}.</b> {st.help} {st.scored} bars count; {pass} Perfect or Good to pass.
        </p>
        <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
          {phase === 'loading' ? 'Loading…' : `Play stage ${si + 1}`}
        </button>
      </div>
    )
  else if (phase === 'playing') {
    const hits = dots.filter((g) => g === 'perfect' || g === 'good').length
    content = (
      <div className="db-deck">
        {/* the bars as a strip: free bars light; on the stages without a click, the counted bars stay dark */}
        {timeline && <BarCounter timing={timeline} cells={st.lead + st.scored} unit="bar" label="Bars" hideFrom={st.click === 'none' ? st.lead : st.lead + st.scored} />}
        <div className="db-main">
          <TapPad onPointerDown={onPad} label="Tap the 1" flash={flash} rating={rating} />
          <dl className="readout mono">
            <div>
              <dt>Stage</dt>
              <dd>
                {si + 1} / {DB_STAGES.length}
              </dd>
            </div>
            <div>
              <dt>Last tap</dt>
              <dd>
                <Value v={rating?.err == null ? '—' : msr(rating.err)} />
              </dd>
            </div>
            <div>
              <dt>On the 1</dt>
              <dd>
                <Value v={hits} /> / {st.scored}
              </dd>
            </div>
          </dl>
        </div>
        <GradeDots grades={dots} pass={pass} />
      </div>
    )
  }
  else {
    const { errs, extras } = stages[si]!
    const { bpm, beat } = run.current
    const c = gradeCounts(errs)
    const ok = c.perfect + c.good
    const hits = errs.filter((e): e is number => e !== null)
    const meanAbs = hits.length ? hits.reduce((s, e) => s + Math.abs(e), 0) / hits.length : 0
    const verdict: RoundDesc =
      ok === errs.length && c.perfect >= errs.length / 2 && extras === 0
        ? { verdict: 'Locked', tone: 'good', explain: '' }
        : ok >= pass
          ? { verdict: 'Solid', tone: 'ok', explain: '' }
          : { verdict: 'Lost the 1', tone: 'bad', explain: '' }
    verdict.explain =
      `${ok} of ${errs.length} bars Perfect or Good (pass mark ${pass})${c.miss ? `, ${c.miss} missed` : ''}` +
      (hits.length ? `, mean error ${Math.round(meanAbs * 1000)} ms` : '') +
      `, ${plural(extras, 'extra tap')}. At ${Math.round(bpm * 10) / 10} BPM the 1 comes back every ${(beat * 4).toFixed(2)} s.`
    verdict.tip =
      latencyTip(errs) ??
      (verdict.verdict === 'Lost the 1'
        ? 'Count 1 2 3 4 out loud with the kick. The 1 is where the bass note changes and crashes land; the clap sits on 2 and 4, never on the 1.'
        : 'Tap with the kick, not just before it: aim to hear the tap and the kick as one sound.')
    content = (
      <div className="center">
        <Verdict d={verdict} />
        <GradeDots grades={dots} pass={pass} />
        <div className="errs">
          {errs.map((e, k) => (
            <span key={k} className={ERR_CLASS[tapGrade(e)]}>
              {e === null ? 'miss' : msr(e)}
            </span>
          ))}
        </div>
        <div className="row">
          <button onClick={begin}>Retry stage</button>
          <button className="primary" onClick={() => nextStage()} autoFocus>
            {last ? 'Finish' : `Next: ${DB_STAGES[si + 1].name}`} <kbd>↵</kbd>
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="center">
      {stageStrip}
      <Swap k={`${si}-${phase === 'loading' ? 'ready' : phase}`}>{content}</Swap>
      {phase !== 'result' && <Skip onSkip={skip} last={last} what="stage" />}
    </div>
  )
}

// ---------- shared multi-round tap drill ----------
interface RoundInfo {
  /** Context time the single tap should land on. */
  target: number
  /** The round ends with no tap at this context time. */
  endsAt: number
  /** Taps before this context time are ignored and the pad is disabled until then. */
  enableAt?: number
  /** A bar counter above the pad. */
  counter?: { timing: RoundTiming; cells: number; hideFrom?: number; target: { cell: number; text: string }; label?: string }
  onTap?: (t: number) => void
  /** Points for a tap error (s). */
  points: (err: number) => number
  /** Verdict, explanation and tip for a tap error (s, negative = early), or null for no tap. */
  describe: (err: number | null) => RoundDesc
}

interface TapRound {
  /** Starts audio and returns the round's timing. */
  start: () => Promise<RoundInfo>
}

function OneTapRounds({
  rounds,
  make,
  intro,
  label,
  waitLabel,
  onDone,
}: {
  rounds: number
  make: (i: number) => TapRound
  intro: string
  label: string
  /** Pad label while taps are still ignored. */
  waitLabel?: string
  onDone: DrillProps['onDone']
}) {
  useUnmountStop()
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result'>('ready')
  const [armed, setArmed] = useState(false)
  const [total, setTotal] = useState(0)
  const [desc, setDesc] = useState<{ d: RoundDesc; pts?: number } | null>(null)
  const [counter, setCounter] = useState<RoundInfo['counter']>(undefined)
  const [flash, setFlash] = useState(0)
  const [rating, setRating] = useState<TapRating | null>(null)
  const [errs, setErrs] = useState<(number | null)[]>([])
  const errsRef = useRef<(number | null)[]>([])
  const cur = useRef<{ tapped: boolean; round: TapRound; info: RoundInfo } | null>(null)
  const timers = useRef<number[]>([])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const begin = async () => {
    setPhase('loading')
    const round = make(i)
    const info = await round.start()
    cur.current = { tapped: false, round, info }
    setRating(null)
    setCounter(info.counter)
    const wait = info.enableAt === undefined ? 0 : info.enableAt - ac().currentTime
    setArmed(wait <= 0)
    if (wait > 0) timers.current.push(window.setTimeout(() => setArmed(true), wait * 1000))
    setPhase('playing')
    timers.current.push(
      window.setTimeout(() => {
        if (!cur.current?.tapped) resolve(null)
      }, (info.endsAt - ac().currentTime) * 1000),
    )
  }

  const resolve = (t: number | null) => {
    const c = cur.current!
    c.tapped = true
    clearTimers()
    const err = t === null ? null : t - c.info.target
    setRating((r) => ({ n: (r?.n ?? 0) + 1, err }))
    errsRef.current = [...errsRef.current, err]
    setErrs(errsRef.current)
    let d = c.info.describe(err)
    const lt = latencyTip(errsRef.current)
    if (lt) d = { ...d, tip: d.tip ? `${d.tip} ${lt}` : lt }
    if (err === null) setDesc({ d })
    else {
      const p = c.info.points(err)
      setTotal((x) => x + p)
      setDesc({ d, pts: p })
      c.info.onTap?.(t!)
    }
    setPhase('result')
  }

  const live = phase === 'playing' && armed
  const onPad = useTaps((t) => {
    const c = cur.current
    if (!c || c.tapped || (c.info.enableAt !== undefined && t < c.info.enableAt)) return
    setFlash((f) => f + 1)
    buzz(Math.abs(t - c.info.target) <= TAP_PERFECT)
    resolve(t)
  }, live)

  const next = () => {
    stopAll()
    if (i + 1 >= rounds) onDone(Math.round(total), tapDetail(errsRef.current))
    else {
      setI(i + 1)
      setPhase('ready')
    }
  }
  const skip = () => {
    clearTimers()
    if (cur.current) cur.current.tapped = true
    errsRef.current = [...errsRef.current, null]
    setErrs(errsRef.current)
    next()
  }

  const last = i + 1 >= rounds
  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round <Value v={i + 1} /> of {rounds}
        </span>
        <span>
          <Value v={Math.round(total)} /> pts
        </span>
      </div>
      {/* the pad stays put after the tap so its rating dissolves in place */}
      <Swap k={`${i}-${phase === 'loading' ? 'ready' : phase === 'result' ? 'playing' : phase}`}>
        {phase === 'playing' || phase === 'result' ? (
          <>
            {counter && <BarCounter unit="bar" {...counter} />}
            <TapPad onPointerDown={onPad} label={live || phase === 'result' || !waitLabel ? label : waitLabel} flash={flash} rating={rating} disabled={!live} />
            {phase === 'result' && desc && (
              <div className="fade-in center">
                <Verdict d={desc.d} pts={desc.pts} />
                {last && <Tally errs={errs} />}
                {last && <TapTimeline errs={errs} />}
                <button className="primary" onClick={next} autoFocus>
                  {last ? 'Finish' : 'Next round'}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p>{intro}</p>
            <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
              {phase === 'loading' ? 'Loading…' : 'Play'}
            </button>
          </>
        )}
      </Swap>
      {phase !== 'result' && <Skip onSkip={skip} last={last} />}
    </div>
  )
}

/** A snare roll that builds through one bar (8ths, then 16ths), so the drop is easier to feel in early rounds. */
function snareRoll(from: number, bl: number) {
  const c = ac()
  const len = Math.floor(c.sampleRate * 0.12)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (c.sampleRate * 0.025))
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.9
  bp.frequency.setValueAtTime(1400, from)
  bp.frequency.exponentialRampToValueAtTime(4200, from + bl)
  bp.connect(out())
  for (let s = 0; s < 16; s++) {
    if (s < 8 && s % 2) continue
    const at = from + (s * bl) / 16
    const src = track(c.createBufferSource())
    src.buffer = buf
    const g = c.createGain()
    g.gain.value = 0.06 + 0.24 * (s / 15) ** 1.5
    src.connect(g).connect(bp)
    src.start(at)
  }
}

// ---------- Drop Timing ----------
const GAPS = [1, 2, 2, 4, 4]
const DROP_PRE = 2
export function DropTiming({ source, onDone }: DrillProps) {
  const make = (i: number): TapRound => ({
    start: async () => {
      const c = await getClip(source)
      const gap = GAPS[i]
      const pre = DROP_PRE
      const n = pickBar(c, pre + gap + 2)
      const bl = barLen(c)
      const beat = beatLen(c)
      const at = ac().currentTime + 0.2
      const a = play(c.buffer, { from: barTime(c, n), dur: pre * bl, at })
      a.gain.gain.setValueAtTime(1, at + pre * bl - beat / 2)
      a.gain.gain.linearRampToValueAtTime(0, at + pre * bl)
      const target = at + (pre + gap) * bl
      play(c.buffer, { from: barTime(c, n + pre + gap), dur: 2 * bl, at: target })
      if (i < 2) snareRoll(target - bl, bl)
      // the counter hides through more of the silence each round
      const hideFrom = [undefined, pre + 1, pre, pre, pre - 1][i]
      const count = Array.from({ length: pre + gap }, (_, k) => `${k + 1} 2 3 4`)
      const pattern = `${count.slice(0, pre).join(' · ')} with the music, ${count.slice(pre).join(' · ')} in the silence, then tap the next 1`
      return {
        target,
        endsAt: target + bl,
        enableAt: at + pre * bl,
        points: (e) => 200 * tapCredit(e, beat),
        counter: { timing: { start: at, bpm: c.bpm }, cells: pre + gap + 1, hideFrom, target: { cell: pre + gap, text: '↓' }, label: 'Bar' },
        describe: (e) => {
          const tip = `Count: ${pattern}.`
          if (e === null) return { verdict: 'No tap', tone: 'bad', explain: `The music came back after ${plural(gap, 'silent bar')} and the round ended a bar later.`, tip }
          const t = tapTier(e, bl)
          const explain =
            t.verdict === 'Wrong bar'
              ? `${barsText(e, bl)} (${msr(e)}). After ${plural(gap, 'silent bar')} you were a bar out: count bars, not just beats.`
              : t.tone === 'bad'
                ? `${howFar(e, beat)}. ${e <= -beat / 2 ? 'You tapped while the gap was still silent.' : e < 0 ? 'Just ahead of the drop: let the 1 arrive.' : 'The drop had already landed.'} A beat here is ${Math.round(beat * 1000)} ms.`
                : `${msr(e)} from the drop, after ${plural(gap, 'silent bar')}. Perfect is within ${TAP_PERFECT * 1000} ms, Good within ${TAP_GOOD * 1000} ms, Close within ${TAP_CLOSE * 1000} ms.`
          return { ...t, explain, tip }
        },
      }
    },
  })
  return (
    <OneTapRounds
      rounds={5}
      make={make}
      onDone={onDone}
      intro="Two bars play, then silence for a set number of bars (round 1: 1 bar, later up to 4). Keep counting and tap on the 1 when the music comes back. The pad wakes up when the silence starts."
      label="Tap the drop"
      waitLabel="Count with the music"
    />
  )
}

// ---------- Phrase In ----------
export function PhraseIn({ source, onDone }: DrillProps) {
  const make = (i: number): TapRound => ({
    start: async () => {
      const a = await getClip(source)
      const b = await partnerClip(source, a)
      const p = pickBar(a, 26, true)
      const into = 3 + Math.floor(Math.random() * 4)
      const bl = barLen(a)
      const from = barTime(a, p + into) + Math.floor(Math.random() * 4) * beatLen(a)
      const at = ac().currentTime + 0.2
      play(a.buffer, { from, dur: barTime(a, p + 24) - from, at, gain: 0.7, pan: -0.7 })
      const phraseStart = at + barTime(a, p) - from
      const target = phraseStart + 8 * bl
      const nb = pickBar(b, 9, true)
      const rate = a.bpm / b.bpm
      const listen =
        a.source === 'builtin'
          ? 'In these grooves the kick and bass drop out on the last beat of bar 8 (house adds a clap fill), then a crash lands on the 1 of the new phrase.'
          : 'At a phrase start listen for a crash, a bass change or a new layer coming in on the 1; the bar before often has a fill, a riser or a gap.'
      const tip = 'Count the bars of A 1 to 8 on each downbeat; the pad wakes up two bars before the next phrase.'
      return {
        target,
        endsAt: target + 8 * bl,
        enableAt: target - 2 * bl,
        points: (e) => 250 * tapCredit(e, beatLen(a)),
        counter: {
          timing: { start: phraseStart, bpm: a.bpm },
          cells: 9,
          hideFrom: Math.min(8, into + [3, 2, 2, 1][i]),
          target: { cell: 8, text: 'B in' },
          label: 'Phrase bar',
        },
        onTap: (t) => {
          // start B as if it had started exactly when you tapped
          const now = ac().currentTime + 0.03
          play(b.buffer, { from: barTime(b, nb) + (now - t) * rate, dur: 8 * barLen(b), at: now, rate, gain: 0.7, pan: 0.7 })
          setTimeout(() => stopAll(), 6 * bl * 1000)
        },
        describe: (e) => {
          if (e === null) return { verdict: 'No tap', tone: 'bad', explain: `The phrase started and B never came in. ${listen}`, tip }
          const t = tapTier(e, bl)
          const explain =
            t.verdict === 'Wrong bar'
              ? `You started B ${barsText(e, bl)}: mid-phrase, so B's changes land ${plural(Math.max(1, Math.round(Math.abs(e) / bl)), 'bar')} off A's and the structures clash. ${listen}`
              : `B came in ${msr(e)} from A's phrase start${t.tone === 'bad' ? `, ${howFar(e, bl / 4)}` : ''}. ${listen}`
          return { ...t, explain, tip }
        },
      }
    },
  })
  return (
    <OneTapRounds
      rounds={4}
      make={make}
      onDone={onDone}
      intro="Track A starts somewhere inside a phrase. Count and press on the 1 of the next 8-bar phrase to start track B."
      label="Start B"
      waitLabel="Count the phrase"
    />
  )
}

// ---------- Tap Tempo ----------
function fitBpm(taps: number[]): number | null {
  if (taps.length < 4) return null
  const iv = taps.slice(1).map((t, k) => t - taps[k])
  const med = [...iv].sort((a, b) => a - b)[Math.floor(iv.length / 2)]
  const idx = taps.map((t) => Math.round((t - taps[0]) / med))
  const n = taps.length
  const mx = idx.reduce((s, x) => s + x, 0) / n
  const my = taps.reduce((s, x) => s + x, 0) / n
  let num = 0
  let den = 0
  for (let k = 0; k < n; k++) {
    num += (idx[k] - mx) * (taps[k] - my)
    den += (idx[k] - mx) ** 2
  }
  return den ? 60 / (num / den) : null
}

const TT_FIT = 12
const TT_MIN = 8
export function TapTempo({ source, onDone }: DrillProps) {
  useUnmountStop()
  const ROUNDS = 4
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result'>('ready')
  const [taps, setTaps] = useState<number[]>([])
  const [total, setTotal] = useState(0)
  const [desc, setDesc] = useState<{ d: RoundDesc; pts: number } | null>(null)
  const [oks, setOks] = useState<boolean[]>([])
  const truth = useRef(0)

  const begin = async () => {
    setPhase('loading')
    const c = await getClip(source)
    const rate = 0.94 + Math.random() * 0.12
    truth.current = c.bpm * rate
    const n = pickBar(c, 12)
    play(c.buffer, { from: barTime(c, n), dur: 12 * barLen(c), rate })
    setTaps([])
    setPhase('playing')
  }
  const onPad = useTaps((t) => {
    buzz()
    setTaps((x) => [...x, t])
  }, phase === 'playing')
  const guess = fitBpm(taps.slice(-TT_FIT))

  const submit = () => {
    stopAll()
    const tr = truth.current
    const f = (x: number) => x.toFixed(1)
    let d: RoundDesc
    let p = 0
    const tip = `Tap with the kick, one tap per beat, and keep going until the readout settles; the estimate fits your last ${TT_FIT} taps.`
    if (guess === null) d = { verdict: 'No tempo', tone: 'bad', explain: `Not enough taps to fit a tempo. It was ${f(tr)} BPM.`, tip }
    else if (Math.abs(guess - tr / 2) <= 2) {
      p = 0.5 * 250 * lin(guess * 2 - tr, 0.5, 5)
      d = {
        verdict: 'Half-time',
        tone: 'ok',
        explain: `You tapped ${f(guess)} BPM, half of the actual ${f(tr)} BPM: one tap every two beats. Doubled, your reading is ${f(guess * 2)} BPM, so half credit.`,
        tip: 'Tap every kick, not every other one. House and techno have four kicks to the bar; count 1 2 3 4 and tap on each number.',
      }
    } else if (Math.abs(guess - tr * 2) <= 2) {
      p = 0.5 * 250 * lin(guess / 2 - tr, 0.5, 5)
      d = {
        verdict: 'Double-time',
        tone: 'ok',
        explain: `You tapped ${f(guess)} BPM, twice the actual ${f(tr)} BPM: you tapped the off-beats between the kicks too. Halved, your reading is ${f(guess / 2)} BPM, so half credit.`,
        tip: 'Tap only the kicks; the open hats sit between them on the off-beat.',
      }
    } else {
      const err = guess - tr
      p = 250 * lin(err, 0.5, 5)
      const a = Math.abs(err)
      const t = a <= 0.5 ? { verdict: 'Perfect', tone: 'good' as Tone } : a <= 1 ? { verdict: 'Great', tone: 'good' as Tone } : a <= 2 ? { verdict: 'Good', tone: 'ok' as Tone } : { verdict: err < 0 ? 'Too slow' : 'Too fast', tone: 'bad' as Tone }
      d = {
        ...t,
        explain: `You: ${f(guess)} BPM · actual ${f(tr)} BPM, ${err >= 0 ? '+' : '−'}${a.toFixed(1)} BPM (${((a / tr) * 100).toFixed(1)}%). Within 0.5 BPM is Perfect, 2 BPM Good.`,
        tip,
      }
    }
    setTotal((x) => x + p)
    setOks((o) => [...o, d.tone !== 'bad' && d.verdict !== 'Half-time' && d.verdict !== 'Double-time'])
    setDesc({ d, pts: p })
    setPhase('result')
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || taps.length < TT_MIN) return
      e.preventDefault()
      submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const finish = (o = oks) => {
    if (i + 1 >= ROUNDS) onDone(Math.round(total), { right: o.filter(Boolean).length, total: ROUNDS, bestStreak: longestRun(o) })
    else {
      setI(i + 1)
      setPhase('ready')
    }
  }
  const skip = () => {
    stopAll()
    const o = [...oks, false]
    setOks(o)
    finish(o)
  }

  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round <Value v={i + 1} /> of {ROUNDS}
        </span>
        <span>
          <Value v={Math.round(total)} /> pts
        </span>
      </div>
      <Swap k={`${i}-${phase === 'loading' ? 'ready' : phase}`}>
        {phase === 'playing' ? (
          <>
            <TapPad onPointerDown={onPad} label={guess !== null ? `${guess.toFixed(1)} BPM` : `${taps.length} taps`} flash={taps.length} />
            <p className="muted small tt-count">
              <Value v={taps.length} /> taps
            </p>
            <div className="row">
              <button
                onClick={(e) => {
                  e.currentTarget.blur()
                  setTaps([])
                }}
                disabled={!taps.length}
              >
                Reset
              </button>
              <button className="primary" onClick={submit} disabled={taps.length < TT_MIN}>
                {taps.length < TT_MIN ? `Tap ${TT_MIN - taps.length} more` : 'Lock in'} {taps.length >= TT_MIN && <kbd>↵</kbd>}
              </button>
            </div>
          </>
        ) : phase === 'result' && desc ? (
          <>
            <Verdict d={desc.d} pts={desc.pts} />
            <button className="primary" onClick={() => finish()} autoFocus>
              {i + 1 >= ROUNDS ? 'Finish' : 'Next round'}
            </button>
          </>
        ) : (
          <>
            <p>Tap every beat ({TT_MIN}+ taps), then lock in. The tempo is hidden and randomised; your estimate shows on the pad after 4 taps.</p>
            <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
              {phase === 'loading' ? 'Loading…' : 'Play'}
            </button>
          </>
        )}
      </Swap>
      {phase !== 'result' && <Skip onSkip={skip} last={i + 1 >= ROUNDS} />}
    </div>
  )
}

// ---------- Tempo Match ----------
/** Rounds that show the live phase meter. */
const TM_METER_ROUNDS = 2
export function TempoMatch({ source, onDone }: DrillProps) {
  useUnmountStop()
  const ROUNDS = 3
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result'>('ready')
  const [pitch, setPitch] = useState(0)
  const [total, setTotal] = useState(0)
  const [left, setLeft] = useState(0)
  const [desc, setDesc] = useState<{ d: RoundDesc; pts: number } | null>(null)
  const [oks, setOks] = useState<boolean[]>([])
  const meter = useRef<HTMLDivElement>(null)
  // fader position v; the correct tempo sits at a hidden position h, so centring the fader is not the answer.
  // B's playhead is integrated from its rate (seg*) so the phase meter can compare it with A's.
  const r = useRef({
    src: undefined as AudioBufferSourceNode | undefined,
    base: 1,
    hidden: 0,
    clipA: undefined as Clip | undefined,
    clipB: undefined as Clip | undefined,
    bpmA: 120,
    t0: 0,
    endTimer: 0,
    endAt: 0,
    startErr: 0,
    aAt: 0,
    aFrom: 0,
    segT: 0,
    segPos: 0,
    rateNow: 1,
  })

  const rateFor = (v: number) => r.current.base * (1 + (v - r.current.hidden) / 100)
  const setRate = (rate: number) => {
    const s = r.current
    const now = ac().currentTime
    if (now > s.segT) {
      s.segPos += s.rateNow * (now - s.segT)
      s.segT = now
    }
    s.rateNow = rate
  }

  const begin = async () => {
    setPhase('loading')
    const a = await getClip(source)
    const b = await partnerClip(source, a)
    const ctx = ac()
    const bl = barLen(a)
    const na = pickBar(a, 16)
    let nb = pickBar(b, 16)
    if (a === b && Math.abs(na - nb) < 8) nb = pickBar(b, 16)
    const sign = Math.random() < 0.5 ? -1 : 1
    const off = sign * (2 + Math.random() * (2 + i * 1.5))
    // B runs off-tempo; pitch fader is relative to B's correct rate
    const correct = a.bpm / b.bpm
    const hidden = Math.round((Math.random() * 6 - 3) * 100) / 100
    const v0 = clamp(hidden + off, -8, 8)
    const at = ctx.currentTime + 0.2
    const dur = Math.min(16 * bl, a.buffer.duration - barTime(a, na))
    const s = r.current
    Object.assign(s, { base: correct, hidden, bpmA: a.bpm, t0: ctx.currentTime, clipA: a, clipB: b, startErr: v0 - hidden, aAt: at, aFrom: barTime(a, na), endAt: at + dur })
    s.segT = at + bl
    s.segPos = barTime(b, nb)
    s.rateNow = rateFor(v0)
    setPitch(v0)
    play(a.buffer, { from: barTime(a, na), dur, at, gain: 0.6, pan: -0.7 })
    const src = track(ctx.createBufferSource())
    src.buffer = b.buffer
    src.playbackRate.value = rateFor(v0)
    const g = ctx.createGain()
    g.gain.value = 0.6
    src.connect(g).connect(out())
    src.start(at + bl, barTime(b, nb))
    s.src = src
    setLeft(Math.ceil(dur + 0.2))
    setPhase('playing')
    s.endTimer = window.setTimeout(() => lock(), (dur + 0.2) * 1000)
  }

  const setP = (p: number) => {
    const v = clamp(p, -8, 8)
    setPitch(v)
    setRate(rateFor(v))
    r.current.src?.playbackRate.setTargetAtTime(rateFor(v), ac().currentTime, 0.01)
  }
  const nudge = (dir: number) => {
    const s = r.current.src
    if (!s) return
    const now = ac().currentTime
    s.playbackRate.cancelScheduledValues(now)
    setRate(rateFor(pitch) * (1 + dir * 0.04))
    s.playbackRate.setValueAtTime(rateFor(pitch) * (1 + dir * 0.04), now)
  }
  const unnudge = () => {
    setRate(rateFor(pitch))
    r.current.src?.playbackRate.setTargetAtTime(rateFor(pitch), ac().currentTime, 0.005)
  }

  const lock = () => {
    clearTimeout(r.current.endTimer)
    stopAll()
    const s = r.current
    const errPct = pitch - s.hidden
    const errBpm = (errPct / 100) * s.bpmA
    const secs = ac().currentTime - s.t0
    const p = (900 * lin(errBpm, 0.08, 2) + (Math.abs(errBpm) < 0.5 ? 100 * lin(secs, 15, 45) : 0)) / ROUNDS
    const a = Math.abs(errPct)
    const t: { verdict: string; tone: Tone } =
      a < 0.15 ? { verdict: 'Perfect', tone: 'good' } : a < 0.3 ? { verdict: 'Great', tone: 'good' } : a < 0.6 ? { verdict: 'Close', tone: 'ok' } : { verdict: 'Still drifting', tone: 'bad' }
    const pct = (x: number) => `${Math.abs(x).toFixed(2)}% ${x >= 0 ? 'fast' : 'slow'}`
    const bpm = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs((x / 100) * s.bpmA).toFixed(2)} BPM`
    const d: RoundDesc = {
      ...t,
      explain: `B started ${pct(s.startErr)} (${bpm(s.startErr)}); you left it ${pct(errPct)} (${bpm(errPct)}) after ${Math.round(secs)} s. Under 0.15% is Perfect, 0.3% Great, 0.6% Close.`,
      tip: 'Make big moves first until the drift slows to a crawl, then fine steps of 0.05%. While fine-tuning, nudge the kicks back together so you can hear which way they drift next.',
    }
    setTotal((x) => x + p)
    setOks((o) => [...o, a < 0.3])
    setDesc({ d, pts: p })
    setPhase('result')
  }

  // seconds left, and the live phase meter in the first rounds
  useEffect(() => {
    if (phase !== 'playing') return
    const id = window.setInterval(() => setLeft(Math.max(0, Math.ceil(r.current.endAt - ac().currentTime))), 250)
    const raf = { id: 0 }
    const tick = () => {
      raf.id = requestAnimationFrame(tick)
      const el = meter.current
      const s = r.current
      if (!el || !s.clipA || !s.clipB) return
      const now = ac().currentTime
      const marker = el.querySelector<HTMLElement>('.phase-marker')!
      const readout = el.querySelector<HTMLElement>('.phase-readout')!
      if (now < s.segT) {
        readout.textContent = 'B joins after a bar'
        marker.style.opacity = '0'
        return
      }
      const posA = s.aFrom + (now - s.aAt)
      const posB = s.segPos + s.rateNow * (now - s.segT)
      const beatA = 60 / s.clipA.bpm
      const d = (posB - s.clipB.anchor) / (60 / s.clipB.bpm) - (posA - s.clipA.anchor) / beatA
      const ph = ((((d + 0.5) % 1) + 1) % 1) - 0.5
      marker.style.opacity = '1'
      marker.style.left = `${50 + ph * 100}%`
      const msOff = Math.round(Math.abs(ph) * beatA * 1000)
      readout.textContent = msOff < 10 ? 'in phase' : `B ${ph > 0 ? 'ahead' : 'behind'} ${msOff} ms`
    }
    if (i < TM_METER_ROUNDS) raf.id = requestAnimationFrame(tick)
    return () => {
      clearInterval(id)
      cancelAnimationFrame(raf.id)
    }
  }, [phase, i])

  useEffect(() => () => clearTimeout(r.current.endTimer), [])

  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'ArrowLeft') nudge(-1)
      if (e.key === 'ArrowRight') nudge(1)
      if (e.key === 'ArrowUp') setP(pitch + (e.shiftKey ? 0.5 : 0.05))
      if (e.key === 'ArrowDown') setP(pitch - (e.shiftKey ? 0.5 : 0.05))
      if (e.key === 'Enter') {
        // otherwise the same Enter also presses the result's autofocused Next button
        e.preventDefault()
        lock()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') unnudge()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  })

  const finish = (o = oks) => {
    if (i + 1 >= ROUNDS) onDone(Math.round(total), { right: o.filter(Boolean).length, total: ROUNDS, bestStreak: longestRun(o) })
    else {
      setI(i + 1)
      setPhase('ready')
    }
  }
  const skip = () => {
    clearTimeout(r.current.endTimer)
    stopAll()
    const o = [...oks, false]
    setOks(o)
    finish(o)
  }

  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round <Value v={i + 1} /> of {ROUNDS}
        </span>
        {phase === 'playing' && (
          <span className={left <= 5 ? 'hot' : ''}>
            <Value v={left} /> s left
          </span>
        )}
        <span>
          <Value v={Math.round(total)} /> pts
        </span>
      </div>
      <Swap k={`${i}-${phase === 'loading' ? 'ready' : phase}`}>
        {phase === 'playing' ? (
          <div className="tempo-ui">
            <p className="muted">Deck B is off. Ride its pitch until the kicks stop drifting, nudge to line them up, then lock.</p>
            {i < TM_METER_ROUNDS && (
              <div className="phase-meter" ref={meter}>
                <div className="phase-track" aria-hidden="true">
                  <span className="phase-centre" />
                  <span className="phase-marker" />
                </div>
                <div className="phase-labels">
                  <span>B behind</span>
                  <span className="phase-readout" role="status" />
                  <span>B ahead</span>
                </div>
              </div>
            )}
            <div className="pitch">
              <span>slower</span>
              <input type="range" min={-8} max={8} step={0.01} value={pitch} onChange={(e) => setP(Number(e.target.value))} aria-label="Deck B pitch" />
              <span>faster</span>
            </div>
            <div className="row">
              <button onClick={() => setP(pitch - 0.05)}>− fine</button>
              <button onPointerDown={() => nudge(-1)} onPointerUp={unnudge} onPointerLeave={unnudge}>
                ◀ nudge
              </button>
              <button onPointerDown={() => nudge(1)} onPointerUp={unnudge} onPointerLeave={unnudge}>
                nudge ▶
              </button>
              <button onClick={() => setP(pitch + 0.05)}>+ fine</button>
            </div>
            <p className="muted small">Keys: ↑/↓ pitch (Shift for coarse), ←/→ hold to nudge, Enter to lock.</p>
            <button className="primary big" onClick={lock}>
              Lock it
            </button>
          </div>
        ) : phase === 'result' && desc ? (
          <>
            <Verdict d={desc.d} pts={desc.pts} />
            <button className="primary" onClick={() => finish()} autoFocus>
              {i + 1 >= ROUNDS ? 'Finish' : 'Next round'}
            </button>
          </>
        ) : (
          <>
            <p>
              Deck A plays at its own tempo. Deck B joins after a bar, running 2–8% off. Fix it by ear.
              {i < TM_METER_ROUNDS ? ' A phase meter shows whether B is ahead or behind.' : ' No meter this round.'}
            </p>
            <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
              {phase === 'loading' ? 'Loading…' : 'Play'}
            </button>
          </>
        )}
      </Swap>
      {phase !== 'result' && <Skip onSkip={skip} last={i + 1 >= ROUNDS} />}
    </div>
  )
}
