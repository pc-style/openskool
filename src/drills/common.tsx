import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Reserve, Swap, Value } from '../components/Swap'
import { heardTime, stopAll } from '../audio/engine'
import './timing.css'
import './choice.css'
import { BarCounter } from '../components/viz/BarCounter'
import type { SourcePref } from '../lib/clips'

/** What a finished run reports besides its 0–1000 score. Every field is optional. */
export interface RunDetail {
  /** Rounds answered or hit correctly, and how many rounds there were. */
  right?: number
  total?: number
  /** Longest run of correct rounds in a row. */
  bestStreak?: number
  /** Rounds the learner got wrong: what they were asked, what they picked, what was right. */
  misses?: { prompt: string; picked: string; answer: string }[]
  /** Perfect / Good / Close / Off counts for tap drills. */
  grades?: { perfect: number; good: number; close?: number; off: number; miss: number }
}

export interface DrillProps {
  source: SourcePref
  onDone: (score: number, detail?: RunDetail) => void
}

/** A moment on the round's audio clock, labelled on the beat strip, e.g. "Cut" or "Deck B in". */
export interface RoundMark {
  /** Audio-context time in seconds (the same clock `heardTime()` reads). */
  at: number
  text: string
}

export interface ChoiceRound {
  prompt: string
  /** One short line under the prompt saying how hard this round is, e.g. "Cut depth: −9 dB". */
  sub?: string
  options: { id: string; label: string; hint?: string }[]
  answer: string
  /** Returns timing for the beat strip and the answer lock, or nothing for a quiz. */
  play?: () => void | RoundTiming | Promise<RoundTiming | void>
  explain: string
  /** A second, muted paragraph after `explain`: how to use this in a mix. */
  tip?: string
  /** Shown above the prompt, e.g. which deck is playing. */
  header?: ReactNode
  /** Shown after answering: a picture of what was played. */
  visual?: ReactNode
}

/** Audio timing of a round, for the beat strip and the answer lock. */
export interface RoundTiming {
  /** Audio-context time of the first downbeat, and the tempo. */
  start: number
  bpm: number
  /** Answers stay disabled until this audio-context time. */
  enableAt?: number
  marks?: RoundMark[]
  /** Audio-context time the round's audio ends; the beat strip goes dark after it. */
  end?: number
}

/** Timing for a beat strip that is only laid out, never shown. */
const STILL_TIMING: RoundTiming = { start: 0, bpm: 120 }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export { clamp }

type Miss = NonNullable<RunDetail['misses']>[number]

/** The muted line shown while answers are locked, named after the last mark before they open. */
function lockLine(t: RoundTiming) {
  const m = (t.marks ?? []).filter((x) => x.at <= (t.enableAt ?? Infinity)).at(-1) ?? t.marks?.[0]
  if (!m) return 'Listen first…'
  return /^listen/i.test(m.text) ? `${m.text}…` : `Listen for “${m.text}”…`
}

/**
 * Listen-and-choose (or quiz) drill: N rounds, keyboard 1–N to answer, Space to replay, S to skip, Enter for next.
 * R (restart the run) belongs to the drill page.
 * When a round's `play()` resolves timing, a beat strip follows the audio and the answers stay locked
 * until `enableAt` has been heard.
 */
export function ChoiceDrill({
  rounds,
  make,
  onDone,
  timed,
}: {
  rounds: number
  make: (i: number) => Promise<ChoiceRound> | ChoiceRound
  onDone: (score: number, detail?: RunDetail) => void
  /** Seconds on the clock: endless rounds, score from correct and wrong answers. */
  timed?: number
}) {
  const [i, setI] = useState(0)
  const [round, setRound] = useState<ChoiceRound | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [right, setRight] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [streak, setStreak] = useState(0)
  const [left, setLeft] = useState(timed ?? 0)
  const [timing, setTiming] = useState<RoundTiming | null>(null)
  const [locked, setLocked] = useState(false)
  const finished = useRef(false)
  const stats = useRef({ streak: 0, best: 0, misses: [] as Miss[] })
  // only the latest play() may set the timing, so a slow first play can't overwrite a replay
  const playId = useRef(0)

  const finish = useCallback(
    (r: number, w: number) => {
      if (finished.current) return
      finished.current = true
      stopAll()
      const { best, misses } = stats.current
      const score = timed ? clamp(r * 60 - w * 30, 0, 1000) : Math.round((r / rounds) * 1000)
      onDone(score, { right: r, total: r + w, bestStreak: best, misses: [...misses] })
    },
    [onDone, rounds, timed],
  )

  /** Plays a round and takes its timing. A replay keeps the answers unlocked once they have opened. */
  const begin = useCallback((r: ChoiceRound, first: boolean) => {
    const id = ++playId.current
    stopAll()
    if (!r.play) return
    Promise.resolve(r.play()).then(
      (t) => {
        if (id !== playId.current) return
        const tm = t ? t : null
        setTiming(tm)
        setLocked((l) => (first || l) && tm?.enableAt !== undefined)
      },
      () => id === playId.current && setLocked(false),
    )
  }, [])

  useEffect(() => {
    let live = true
    setRound(null)
    setPicked(null)
    setTiming(null)
    setLocked(false)
    playId.current++
    stopAll()
    Promise.resolve(make(i)).then((r) => {
      if (!live) return
      setRound(r)
      setLocked(!!r.play)
      begin(r, true)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  useEffect(() => () => stopAll(), [])

  // release the lock once the learner has heard the moment that matters
  useEffect(() => {
    const at = timing?.enableAt
    if (!locked || at === undefined) return
    let raf = 0
    const tick = () => {
      if (heardTime(performance.now()) >= at) setLocked(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [locked, timing])

  useEffect(() => {
    if (!timed) return
    const id = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(id)
  }, [timed])
  useEffect(() => {
    if (timed && left <= 0) finish(right, wrong)
  }, [left, timed, right, wrong, finish])

  const choose = useCallback(
    (id: string) => {
      if (!round || picked || locked) return
      setPicked(id)
      const ok = id === round.answer
      const s = stats.current
      const label = (x: string) => round.options.find((o) => o.id === x)?.label ?? x
      if (ok) {
        s.streak++
        s.best = Math.max(s.best, s.streak)
      } else {
        s.streak = 0
        s.misses.push({ prompt: round.prompt, picked: label(id), answer: label(round.answer) })
      }
      setStreak(s.streak)
      setRight(right + (ok ? 1 : 0))
      setWrong(wrong + (ok ? 0 : 1))
      // timed: a wrong pick shows the right answer briefly before moving on
      if (timed) setTimeout(() => !finished.current && setI((x) => x + 1), ok ? 250 : 800)
    },
    [round, picked, locked, right, wrong, timed],
  )

  const next = useCallback(() => {
    if (!picked) return
    if (!timed && i + 1 >= rounds) finish(right, wrong)
    else setI((x) => x + 1)
  }, [picked, i, rounds, right, wrong, finish, timed])

  /** Moves straight on. The round counts as missed, with the right answer listed on the results. */
  const skip = useCallback(() => {
    if (!round || picked || finished.current) return
    const s = stats.current
    s.streak = 0
    s.misses.push({ prompt: round.prompt, picked: 'Skipped', answer: round.options.find((o) => o.id === round.answer)?.label ?? round.answer })
    setStreak(0)
    const w = wrong + 1
    setWrong(w)
    if (!timed && i + 1 >= rounds) finish(right, w)
    else setI((x) => x + 1)
  }, [round, picked, wrong, right, timed, i, rounds, finish])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!round || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= round.options.length) choose(round.options[n - 1].id)
      else if (e.key === 'Enter') next()
      else if (e.key === 's' || e.key === 'S') skip()
      else if (e.code === 'Space' && round.play && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        begin(round, false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [round, choose, next, skip, begin])

  const answerLabel = round?.options.find((o) => o.id === round.answer)?.label
  const nw = timed ? 2 : String(rounds).length

  /** The answer's feedback. Both versions are laid out invisibly before the answer, so answering does not grow the drill. */
  const feedback = (r: ChoiceRound, ok: boolean, live = false) => (
    <div className={live ? 'feedback fade-in' : 'feedback'} role={live ? 'status' : undefined}>
      <p>
        <strong className={ok ? 'good' : 'bad'}>{ok ? 'Correct. ' : 'Not quite. '}</strong>
        {r.explain}
      </p>
      {r.tip && <p className="tip">{r.tip}</p>}
      {r.visual}
    </div>
  )
  const skipButton = (
    <button className="ghost" onClick={skip}>
      Skip <kbd>S</kbd>
    </button>
  )
  const nextLabel = (
    <>
      {i + 1 >= rounds ? 'Finish' : 'Next'} <kbd>↵</kbd>
    </>
  )

  return (
    <div className="choice">
      <div className="drill-meta">
        {/* each value ends its group, so the room it reserves trails it unseen instead of opening a gap */}
        {timed ? (
          <span className={left <= 10 ? 'hot' : ''}>
            <Value v={`${Math.max(0, left)} s left`} w={9} start />
          </span>
        ) : (
          <span>
            Round <Value v={`${Math.min(i + 1, rounds)} of ${rounds}`} w={4 + 2 * nw} start />
          </span>
        )}
        <span className="meta-counts">
          {/* the streak keeps its place while hidden, so the counts beside it stay put */}
          <span className={streak >= 2 ? undefined : 'invisible'} aria-hidden={streak < 2 || undefined}>
            <Value v={streak} w={nw} /> in a row
          </span>
          <span>
            <Value v={right} w={nw} /> right
          </span>
          <span>
            <Value v={wrong} w={nw} /> wrong
          </span>
        </span>
      </div>
      <Swap k={round ? `r${i}` : `l${i}`} hold>
      {!round ? (
        <div className="loading">Preparing audio…</div>
      ) : (
        <>
          {round.header}
          <h2 className="prompt">{round.prompt}</h2>
          {round.sub && <p className="sub">{round.sub}</p>}
          {/* the beat strip and lock line keep their room while the audio starts, so the options do not drop */}
          {round.play && (timing ? <BarCounter timing={timing} cells={4} /> : <Reserve shape={<BarCounter timing={STILL_TIMING} cells={4} still />} />)}
          {round.play && (
            <Swap k={locked && !picked && timing ? 'locked' : 'open'} className="lockline">
              {locked && !picked && timing ? <span role="status">{lockLine(timing)}</span> : <span>&nbsp;</span>}
            </Swap>
          )}
          <div className={`options n${round.options.length} ${locked && !picked ? 'locked' : ''}`}>
            {round.options.map((o, k) => {
              const state = picked ? (o.id === round.answer ? 'right' : o.id === picked ? 'wrong' : 'dim') : ''
              return (
                <button key={o.id} className={`option ${state}`} onClick={() => choose(o.id)} disabled={!!picked || locked}>
                  <kbd>{k + 1}</kbd>
                  <span className="opt-text">
                    <span>{o.label}</span>
                    {o.hint && <span className="opt-hint">{o.hint}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="row">
            {round.play && (
              <button className="ghost" onClick={() => begin(round, false)}>
                ↻ Replay <kbd>Space</kbd>
              </button>
            )}
            {/* Skip and Next take turns in one slot as wide as the wider of them */}
            <Reserve inline shape={timed ? skipButton : [skipButton, <button key="next" className="primary">{nextLabel}</button>]}>
              {!picked && skipButton}
              {picked && !timed && (
                <button className="primary" onClick={next} autoFocus>
                  {nextLabel}
                </button>
              )}
            </Reserve>
          </div>
          {timed && (
            <p className="timed-answer" role="status">
              {picked && picked !== round.answer ? <>Answer: {answerLabel}</> : '\u00a0'}
            </p>
          )}
          {!timed && (
            <Reserve shape={[feedback(round, true), feedback(round, false)]}>
              {picked && feedback(round, picked === round.answer, true)}
            </Reserve>
          )}
        </>
      )}
      </Swap>
    </div>
  )
}

/** Space bar or pad taps, with the time the user heard (context clock). */
export function useTaps(onTap: (t: number) => void, enabled: boolean) {
  const cb = useRef(onTap)
  cb.current = onTap
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      cb.current(heardTime(e.timeStamp))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
  return (e: React.PointerEvent) => {
    if (enabled) cb.current(heardTime(e.timeStamp))
  }
}

/** Tap rating windows (s), shared by the live rating, the results counts and the timeline. */
export const TAP_PERFECT = 0.045
export const TAP_GOOD = 0.11
/** Close still earns partial credit; only taps beyond it are Off. */
export const TAP_CLOSE = 0.17
export type TapGrade = 'perfect' | 'good' | 'close' | 'off' | 'miss'
export const tapGrade = (err: number | null): TapGrade =>
  err === null ? 'miss' : Math.abs(err) <= TAP_PERFECT ? 'perfect' : Math.abs(err) <= TAP_GOOD ? 'good' : Math.abs(err) <= TAP_CLOSE ? 'close' : 'off'
export const GRADE_NAME: Record<TapGrade, string> = { perfect: 'Perfect', good: 'Good', close: 'Close', off: 'Off', miss: 'Miss' }

/** One live rating on the tap pad. `n` changes on every tap so a repeat rating still dissolves in. */
export interface TapRating {
  n: number
  /** Seconds from the target, negative = early; null = no tap. */
  err: number | null
  /** Overrides the ms detail, e.g. "not on the 1". */
  note?: string
}

/**
 * Rates tap `t` against the nearest target. More than `window` s from every target counts as not on
 * a target at all. Pass the previous rating so a repeat grade still dissolves in.
 */
export function rateTap(t: number, targets: number[], window: number, prev: TapRating | null, miss = 'not on the 1'): TapRating {
  const err = targets.reduce((b, x) => (Math.abs(t - x) < Math.abs(b) ? t - x : b), Infinity)
  const n = (prev?.n ?? 0) + 1
  return Math.abs(err) < window ? { n, err } : { n, err: Infinity, note: miss }
}

/** Counts per grade, for results screens. */
export function gradeCounts(errs: (number | null)[]): Record<TapGrade, number> {
  const c = { perfect: 0, good: 0, close: 0, off: 0, miss: 0 }
  for (const e of errs) c[tapGrade(e)]++
  return c
}

export function TapPad({
  onPointerDown,
  label,
  flash,
  rating,
  disabled,
}: {
  onPointerDown: (e: React.PointerEvent) => void
  label: string
  flash: number
  /** Live rating of the last tap, shown on the pad. */
  rating?: TapRating | null
  disabled?: boolean
}) {
  const el = useRef<HTMLButtonElement>(null)
  // restart the flash on every tap without remounting the pad (a remount would cut the rating's dissolve)
  useEffect(() => {
    const b = el.current
    if (!b || !flash) return
    b.style.animation = 'none'
    void b.offsetWidth
    b.style.animation = ''
  }, [flash])
  const g = rating ? tapGrade(rating.err) : null
  const detail = rating && (rating.note ?? (rating.err === null ? 'no tap' : g === 'off' || g === 'close' ? `${rating.err < 0 ? 'Early' : 'Late'} ${ms(rating.err)}` : ms(rating.err)))
  return (
    <button ref={el} className="tappad" onPointerDown={onPointerDown} data-flash={flash > 0} aria-disabled={disabled || undefined}>
      <span>{label}</span>
      <Swap k={rating ? rating.n : 'none'} className="tap-rating">
        {rating ? (
          <span className={`tap-grade ${g}`} role="status">
            <b>{GRADE_NAME[g!]}</b> <span>{detail}</span>
          </span>
        ) : (
          <span className="tap-grade">&nbsp;</span>
        )}
      </Swap>
      <small>Space bar or tap here</small>
    </button>
  )
}

export const ms = (s: number) => `${s >= 0 ? '+' : '−'}${Math.round(Math.abs(s) * 1000)} ms`
