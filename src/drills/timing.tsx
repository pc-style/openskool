// Drills scored on when you tap or how you ride the pitch fader.
import { useEffect, useRef, useState } from 'react'
import { ac, play, stopAll, track } from '../audio/engine'
import { barLen, barTime, beatLen, getClip, pickBar, type Clip } from '../lib/clips'
import { clamp, ms, TapPad, useTaps, type DrillProps } from './common'

const lin = (err: number, full: number, zero: number) => clamp(1 - (Math.abs(err) - full) / (zero - full), 0, 1)

function useUnmountStop() {
  useEffect(() => () => stopAll(), [])
}

// ---------- Downbeat Tapper ----------
const DB_BARS = 16
const DB_GRACE = 2
export function DownbeatTapper({ source, onDone }: DrillProps) {
  useUnmountStop()
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'done'>('ready')
  const [flash, setFlash] = useState(0)
  const run = useRef<{ targets: number[]; beat: number; taps: number[] }>({ targets: [], beat: 0.5, taps: [] })
  const [report, setReport] = useState<{ score: number; errs: (number | null)[]; extras: number } | null>(null)

  const begin = async () => {
    setPhase('loading')
    const c = await getClip(source)
    const n = pickBar(c, DB_BARS + 1)
    const offBeats = 1 + Math.floor(Math.random() * 3)
    const from = barTime(c, n) + offBeats * beatLen(c)
    const at = ac().currentTime + 0.2
    const end = barTime(c, n + DB_BARS) + beatLen(c)
    play(c.buffer, { from, dur: end - from, at })
    const targets: number[] = []
    for (let k = 1; k < DB_BARS; k++) targets.push(at + barTime(c, n + k) - from)
    run.current = { targets, beat: beatLen(c), taps: [] }
    setPhase('playing')
    setTimeout(() => score(), (end - from + 0.4) * 1000)
  }

  const score = () => {
    const { targets, beat, taps } = run.current
    const scored = targets.slice(DB_GRACE)
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
    const pts = errs.reduce<number>((s, e) => s + (e === null ? 0 : lin(e, 0.035, 0.15)), 0)
    const sc = Math.round(clamp((pts - extras * 0.5) / scored.length, 0, 1) * 1000)
    setReport({ score: sc, errs, extras })
    setPhase('done')
  }

  const onPad = useTaps((t) => {
    run.current.taps.push(t)
    setFlash((f) => f + 1)
  }, phase === 'playing')

  if (phase === 'ready' || phase === 'loading')
    return (
      <div className="center">
        <p>The track starts on a random beat. Find the 1 and tap it every bar for {DB_BARS} bars. The first {DB_GRACE} bars are free.</p>
        <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
          {phase === 'loading' ? 'Loading…' : 'Start'}
        </button>
      </div>
    )
  if (phase === 'playing') return <TapPad onPointerDown={onPad} label="Tap the 1" flash={flash} />
  const hits = report!.errs.filter((e): e is number => e !== null)
  return (
    <div className="center">
      <h2>{report!.score} / 1000</h2>
      <p>
        {hits.length}/{report!.errs.length} downbeats hit · mean error {hits.length ? Math.round((hits.reduce((s, e) => s + Math.abs(e), 0) / hits.length) * 1000) : '—'} ms ·{' '}
        {report!.extras} extra tap{report!.extras === 1 ? '' : 's'}
      </p>
      <div className="errs">
        {report!.errs.map((e, k) => (
          <span key={k} className={e === null ? 'miss' : Math.abs(e) < 0.035 ? 'good' : Math.abs(e) < 0.08 ? 'ok' : 'bad'}>
            {e === null ? 'miss' : ms(e)}
          </span>
        ))}
      </div>
      <p className="muted">Negative = early, positive = late. Consistently early or late by the same amount? Calibrate latency in Profile.</p>
      <button className="primary" onClick={() => onDone(report!.score)}>
        Continue
      </button>
    </div>
  )
}

// ---------- shared multi-round tap drill ----------
interface TapRound {
  /** Starts audio; returns the target context time for the single tap. */
  start: () => Promise<{ target: number; endsAt: number; onTap?: (t: number) => void; describe: (err: number) => string | null }>
  points: (err: number) => number
}

function OneTapRounds({ rounds, make, intro, label, onDone }: { rounds: number; make: (i: number) => TapRound; intro: string; label: string; onDone: (s: number) => void }) {
  useUnmountStop()
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result'>('ready')
  const [total, setTotal] = useState(0)
  const [msg, setMsg] = useState('')
  const [flash, setFlash] = useState(0)
  const cur = useRef<{ target: number; tapped: boolean; round: TapRound; info?: Awaited<ReturnType<TapRound['start']>> } | null>(null)
  const timer = useRef<number>(0)

  const begin = async () => {
    setPhase('loading')
    const round = make(i)
    const info = await round.start()
    cur.current = { target: info.target, tapped: false, round, info }
    setPhase('playing')
    timer.current = window.setTimeout(() => {
      if (!cur.current?.tapped) resolve(null)
    }, (info.endsAt - ac().currentTime) * 1000)
  }

  const resolve = (t: number | null) => {
    const c = cur.current!
    c.tapped = true
    clearTimeout(timer.current)
    if (t === null) {
      setMsg('No tap. Keep counting through the gap.')
    } else {
      const err = t - c.target
      const custom = c.info!.describe(err)
      const p = c.round.points(err)
      setTotal((x) => x + p)
      setMsg(custom ?? `${ms(err)} · ${Math.round(p)} pts`)
      c.info!.onTap?.(t)
    }
    setPhase('result')
  }

  const onPad = useTaps((t) => {
    setFlash((f) => f + 1)
    if (cur.current && !cur.current.tapped) resolve(t)
  }, phase === 'playing')

  const next = () => {
    stopAll()
    if (i + 1 >= rounds) onDone(Math.round(total))
    else {
      setI(i + 1)
      setPhase('ready')
    }
  }

  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round {i + 1} / {rounds}
        </span>
        <span>{Math.round(total)} pts</span>
      </div>
      {phase === 'playing' ? (
        <TapPad onPointerDown={onPad} label={label} flash={flash} />
      ) : phase === 'result' ? (
        <>
          <p className="big-msg">{msg}</p>
          <button className="primary" onClick={next} autoFocus>
            {i + 1 >= rounds ? 'Finish' : 'Next round'}
          </button>
        </>
      ) : (
        <>
          <p>{intro}</p>
          <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
            {phase === 'loading' ? 'Loading…' : 'Play'}
          </button>
        </>
      )}
    </div>
  )
}

// ---------- Drop Timing ----------
const GAPS = [1, 2, 2, 4, 4]
export function DropTiming({ source, onDone }: DrillProps) {
  const make = (i: number): TapRound => ({
    points: (e) => 200 * lin(e, 0.03, 0.2),
    start: async () => {
      const c = await getClip(source)
      const gap = GAPS[i]
      const pre = 2
      const n = pickBar(c, pre + gap + 2)
      const bl = barLen(c)
      const at = ac().currentTime + 0.2
      const a = play(c.buffer, { from: barTime(c, n), dur: pre * bl, at })
      a.gain.gain.setValueAtTime(1, at + pre * bl - beatLen(c) / 2)
      a.gain.gain.linearRampToValueAtTime(0, at + pre * bl)
      const target = at + (pre + gap) * bl
      play(c.buffer, { from: barTime(c, n + pre + gap), dur: 2 * bl, at: target })
      return {
        target,
        endsAt: target + bl,
        describe: (e) => (Math.abs(e) > bl / 2 ? `${ms(e)}: that is a whole bar out. Count bars, not beats.` : null),
      }
    },
  })
  return <OneTapRounds rounds={5} make={make} onDone={onDone} intro={`Two bars play, then silence for a set number of bars (round 1: 1 bar, later up to 4). Tap on the 1 when the music comes back.`} label="Tap the drop" />
}

// ---------- Phrase In ----------
export function PhraseIn({ source, onDone }: DrillProps) {
  const make = (): TapRound => {
    let phraseLen = 0
    return {
      points: (e) => 250 * lin(e, 0.04, 0.25),
      start: async () => {
        const a = await getClip(source)
        const b = await getClip(source, a.id)
        const p = pickBar(a, 26, true)
        const into = 3 + Math.floor(Math.random() * 4)
        const bl = barLen(a)
        phraseLen = 8 * bl
        const from = barTime(a, p + into) + Math.floor(Math.random() * 4) * beatLen(a)
        const at = ac().currentTime + 0.2
        play(a.buffer, { from, dur: barTime(a, p + 24) - from, at, gain: 0.7 })
        const target = at + barTime(a, p + 8) - from
        const nb = pickBar(b, 9, true)
        const rate = a.bpm / b.bpm
        return {
          target,
          endsAt: target + phraseLen,
          onTap: (t) => {
            // start B as if it had started exactly when you tapped
            const now = ac().currentTime + 0.03
            play(b.buffer, { from: barTime(b, nb) + (now - t) * rate, dur: 8 * barLen(b), at: now, rate, gain: 0.7 })
            setTimeout(() => stopAll(), 6 * bl * 1000)
          },
          describe: (e) => {
            const bars = Math.round(e / bl)
            if (bars !== 0) return `You started B ${Math.abs(bars)} bar${Math.abs(bars) > 1 ? 's' : ''} ${bars < 0 ? 'early' : 'late'}: that is mid-phrase, so the structure will clash.`
            return null
          },
        }
      },
    }
  }
  return <OneTapRounds rounds={4} make={make} onDone={onDone} intro="Track A starts somewhere inside a phrase. Count and press on the 1 of the next 8-bar phrase to start track B." label="Start B" />
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

export function TapTempo({ source, onDone }: DrillProps) {
  useUnmountStop()
  const ROUNDS = 4
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result'>('ready')
  const [taps, setTaps] = useState<number[]>([])
  const [total, setTotal] = useState(0)
  const [msg, setMsg] = useState('')
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
  const onPad = useTaps((t) => setTaps((x) => [...x, t]), phase === 'playing')
  const guess = fitBpm(taps)
  const submit = () => {
    stopAll()
    const err = guess === null ? 99 : guess - truth.current
    const p = 250 * lin(err, 0.5, 5)
    setTotal((x) => x + p)
    setMsg(`You: ${guess?.toFixed(1) ?? '—'} BPM · actual ${truth.current.toFixed(1)} BPM · ${Math.round(p)} pts`)
    setPhase('result')
  }
  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round {i + 1} / {ROUNDS}
        </span>
        <span>{Math.round(total)} pts</span>
      </div>
      {phase === 'playing' ? (
        <>
          <TapPad onPointerDown={onPad} label={`${taps.length} taps`} flash={taps.length} />
          <button className="primary" onClick={submit} disabled={taps.length < 8}>
            {taps.length < 8 ? `Tap ${8 - taps.length} more` : 'Lock in'}
          </button>
        </>
      ) : phase === 'result' ? (
        <>
          <p className="big-msg">{msg}</p>
          <button
            className="primary"
            onClick={() => {
              if (i + 1 >= ROUNDS) onDone(Math.round(total))
              else {
                setI(i + 1)
                setPhase('ready')
              }
            }}
            autoFocus
          >
            {i + 1 >= ROUNDS ? 'Finish' : 'Next round'}
          </button>
        </>
      ) : (
        <>
          <p>Tap every beat (8+ taps), then lock in. The tempo is hidden and randomised.</p>
          <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
            {phase === 'loading' ? 'Loading…' : 'Play'}
          </button>
        </>
      )}
    </div>
  )
}

// ---------- Tempo Match ----------
export function TempoMatch({ source, onDone }: DrillProps) {
  useUnmountStop()
  const ROUNDS = 3
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'result'>('ready')
  const [pitch, setPitch] = useState(0)
  const [total, setTotal] = useState(0)
  const [msg, setMsg] = useState('')
  // fader position v; the correct tempo sits at a hidden position h, so centring the fader is not the answer
  const r = useRef<{ src?: AudioBufferSourceNode; base: number; hidden: number; clipB?: Clip; bpmA: number; t0: number; endTimer?: number }>({ base: 1, hidden: 0, bpmA: 120, t0: 0 })

  const rateFor = (v: number) => r.current.base * (1 + (v - r.current.hidden) / 100)

  const begin = async () => {
    setPhase('loading')
    const a = await getClip(source)
    const b = source.kind === 'builtin' ? await getClip(source, a.id) : a
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
    r.current = { base: correct, hidden, bpmA: a.bpm, t0: ctx.currentTime, clipB: b }
    setPitch(clamp(hidden + off, -8, 8))
    const at = ctx.currentTime + 0.2
    const dur = Math.min(16 * bl, a.buffer.duration - barTime(a, na))
    play(a.buffer, { from: barTime(a, na), dur, at, gain: 0.6 })
    const src = track(ctx.createBufferSource())
    src.buffer = b.buffer
    src.playbackRate.value = rateFor(clamp(hidden + off, -8, 8))
    const g = ctx.createGain()
    g.gain.value = 0.6
    src.connect(g).connect(ctx.destination)
    src.start(at + bl, barTime(b, nb))
    r.current.src = src
    setPhase('playing')
    r.current.endTimer = window.setTimeout(() => lock(), (dur + 0.2) * 1000)
  }

  const setP = (p: number) => {
    const v = clamp(p, -8, 8)
    setPitch(v)
    r.current.src?.playbackRate.setTargetAtTime(rateFor(v), ac().currentTime, 0.01)
  }
  const nudge = (dir: number) => {
    const s = r.current.src
    if (!s) return
    const now = ac().currentTime
    s.playbackRate.cancelScheduledValues(now)
    s.playbackRate.setValueAtTime(rateFor(pitch) * (1 + dir * 0.04), now)
  }
  const unnudge = () => r.current.src?.playbackRate.setTargetAtTime(rateFor(pitch), ac().currentTime, 0.005)

  const lock = () => {
    clearTimeout(r.current.endTimer)
    stopAll()
    const errPct = pitch - r.current.hidden
    const errBpm = Math.abs(errPct / 100) * r.current.bpmA
    const secs = ac().currentTime - r.current.t0
    const p = (900 * lin(errBpm, 0.08, 2) + (errBpm < 0.5 ? 100 * lin(secs, 15, 45) : 0)) / ROUNDS
    setTotal((x) => x + p)
    setMsg(`Off by ${errBpm.toFixed(2)} BPM (B was ${errPct >= 0 ? 'fast' : 'slow'} by ${Math.abs(errPct).toFixed(2)}%) after ${Math.round(secs)} s · ${Math.round(p)} pts`)
    setPhase('result')
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'ArrowLeft') nudge(-1)
      if (e.key === 'ArrowRight') nudge(1)
      if (e.key === 'ArrowUp') setP(pitch + (e.shiftKey ? 0.5 : 0.05))
      if (e.key === 'ArrowDown') setP(pitch - (e.shiftKey ? 0.5 : 0.05))
      if (e.key === 'Enter') lock()
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

  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round {i + 1} / {ROUNDS}
        </span>
        <span>{Math.round(total)} pts</span>
      </div>
      {phase === 'playing' ? (
        <div className="tempo-ui">
          <p className="muted">Deck B is off. Ride its pitch until the kicks stop drifting, nudge to line them up, then lock.</p>
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
      ) : phase === 'result' ? (
        <>
          <p className="big-msg">{msg}</p>
          <button
            className="primary"
            onClick={() => {
              if (i + 1 >= ROUNDS) onDone(Math.round(total))
              else {
                setI(i + 1)
                setPhase('ready')
              }
            }}
            autoFocus
          >
            {i + 1 >= ROUNDS ? 'Finish' : 'Next round'}
          </button>
        </>
      ) : (
        <>
          <p>Deck A plays at its own tempo. Deck B joins after a bar, running 2–8% off. Fix it by ear.</p>
          <button className="primary big" onClick={begin} disabled={phase === 'loading'}>
            {phase === 'loading' ? 'Loading…' : 'Play'}
          </button>
        </>
      )}
    </div>
  )
}
