// No-audio drills: tempo maths, Camelot, vocabulary, signal flow and set building.
import { useMemo, useState } from 'react'
import { camelotOf, PITCH } from '../audio/analyze'
import { pick, shuffle } from '../lib/clips'
import { readyTracks } from '../lib/library'
import { ChoiceDrill, type ChoiceRound, type DrillProps } from './common'

const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))

/** Four distinct options: the answer plus distractors, shuffled. */
function opts(answer: string, distractors: string[]) {
  const set = [answer, ...distractors.filter((d) => d !== answer)]
  const uniq = [...new Set(set)].slice(0, 4)
  return shuffle(uniq).map((x) => ({ id: x, label: x }))
}

// ---------- BPM Math ----------
export function bpmQuestion(kind = ri(0, 5)): ChoiceRound {
  switch (kind) {
    case 0: {
      const bpm = pick([120, 125, 128, 130, 140, 150, 160, 174])
      const a = Math.round(60000 / bpm)
      return { prompt: `How long is one beat at ${bpm} BPM?`, ...ans(`${a} ms`, [`${a + 40} ms`, `${a - 35} ms`, `${Math.round(a * 1.5)} ms`]), explain: `60 000 ms ÷ ${bpm} = ${a} ms.` }
    }
    case 1: {
      const bpm = pick([170, 172, 174, 140, 150, 87, 85, 70])
      const half = bpm >= 120
      const a = half ? bpm / 2 : bpm * 2
      return {
        prompt: `A ${bpm} BPM track played ${half ? 'halftime' : 'double-time'} sits on a grid of…`,
        ...ans(`${a} BPM`, [`${a + 4} BPM`, `${a - 3} BPM`, `${bpm} BPM`]),
        explain: `${half ? 'Halftime halves' : 'Double-time doubles'} the BPM: ${bpm} → ${a}.`,
      }
    }
    case 2: {
      const from = ri(118, 132)
      let to = ri(120, 136)
      if (to === from) to += 2
      const p = ((to / from - 1) * 100).toFixed(1)
      const sign = (x: string) => (Number(x) > 0 ? `+${x}` : x)
      const w = [(Number(p) * 1.5).toFixed(1), (to - from).toFixed(1), (-Number(p)).toFixed(1)]
      return { prompt: `Pitch % to take a ${from} BPM track to ${to} BPM?`, ...ans(`${sign(p)}%`, w.map((x) => `${sign(x)}%`)), explain: `(${to} ÷ ${from} − 1) × 100 = ${sign(p)}%.` }
    }
    case 3: {
      const bpm = pick([120, 124, 128, 130, 135, 140, 150])
      const bars = pick([8, 16, 32])
      const s = Math.round((bars * 4 * 60) / bpm)
      return { prompt: `How long do ${bars} bars last at ${bpm} BPM?`, ...ans(`${s} s`, [`${s + 4} s`, `${Math.round(s / 2)} s`, `${s * 2} s`]), explain: `${bars} bars × 4 beats × 60 ÷ ${bpm} ≈ ${s} s.` }
    }
    case 4: {
      const bpm = pick([120, 124, 126, 128, 130])
      const pct = pick([2, 3, 4, 5, -2, -3, -4])
      const a = (bpm * (1 + pct / 100)).toFixed(1)
      return {
        prompt: `A ${bpm} BPM track with the pitch at ${pct > 0 ? '+' : ''}${pct}% plays at…`,
        ...ans(`${a} BPM`, [`${(bpm + pct).toFixed(1)} BPM`, `${(Number(a) + 1.5).toFixed(1)} BPM`, `${(bpm * (1 - pct / 100)).toFixed(1)} BPM`]),
        explain: `${bpm} × (1 ${pct > 0 ? '+' : '−'} ${Math.abs(pct) / 100}) = ${a}.`,
      }
    }
    default: {
      const bpm = pick([120, 125, 128, 130, 140])
      const beat = 60 / bpm
      const dly = pick([0.5, 0.75, 1] as const)
      const a = Math.round(beat * dly * 1000)
      const name = dly === 0.5 ? '1/2' : dly === 0.75 ? '3/4' : '1/1'
      return { prompt: `A ${name}-beat echo at ${bpm} BPM repeats every…`, ...ans(`${a} ms`, [`${Math.round(a * 1.33)} ms`, `${Math.round(a * 0.66)} ms`, `${Math.round(a + 100)} ms`]), explain: `One beat is ${Math.round(beat * 1000)} ms; × ${dly} = ${a} ms.` }
    }
  }
}
function ans(answer: string, wrong: string[]) {
  return { options: opts(answer, wrong), answer }
}

export function BpmMath({ onDone }: DrillProps) {
  return <ChoiceDrill rounds={10} make={() => bpmQuestion()} onDone={onDone} />
}

// ---------- Camelot ----------
const CODES = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [`${n}A`, `${n}B`])
const parse = (c: string) => ({ n: Number(c.slice(0, -1)), l: c.slice(-1) })
const wrap = (n: number) => ((n - 1 + 120) % 12) + 1
export const compatible = (c: string) => {
  const { n, l } = parse(c)
  return [c, `${wrap(n - 1)}${l}`, `${wrap(n + 1)}${l}`, `${n}${l === 'A' ? 'B' : 'A'}`]
}
function keyName(code: string) {
  const { n, l } = parse(code)
  for (let pc = 0; pc < 12; pc++) if (camelotOf(pc, l === 'A') === `${n}${l}`) return `${PITCH[pc]} ${l === 'A' ? 'minor' : 'major'}`
  return code
}

export function camelotQuestion(kind = ri(0, 3)): ChoiceRound {
  const c = pick(CODES)
  const { n, l } = parse(c)
  const far = CODES.filter((x) => !compatible(c).includes(x))
  switch (kind) {
    case 0: {
      const a = pick(compatible(c).slice(1))
      return { prompt: `Which key mixes harmonically with ${c}?`, ...ans(a, shuffle(far).slice(0, 3)), explain: `From ${c} you can go to ${compatible(c).slice(1).join(', ')} (one step, or switch letter).` }
    }
    case 1: {
      return { prompt: `What is the Camelot code for ${keyName(c)}?`, ...ans(c, [`${n}${l === 'A' ? 'B' : 'A'}`, `${wrap(n + 5)}${l}`, `${wrap(n + 2)}${l}`]), explain: `${keyName(c)} = ${c}. A is minor, B is major.` }
    }
    case 2: {
      const a = `${wrap(n + 2)}${l}`
      return { prompt: `An "energy boost" of +2 from ${c} lands on…`, ...ans(a, [`${wrap(n + 1)}${l}`, `${wrap(n - 2)}${l}`, `${wrap(n + 2)}${l === 'A' ? 'B' : 'A'}`]), explain: `+2 on the wheel = +2 semitones in pitch: ${c} → ${a}. Lifts energy; keep the blend short.` }
    }
    default: {
      const bad = `${c} → ${pick(far)}`
      const good = shuffle(compatible(c).slice(1)).map((x) => `${c} → ${x}`)
      return { prompt: 'Which transition will clash in a long blend?', ...ans(bad, good), explain: `${bad} is not adjacent on the wheel. Safe moves from ${c}: ${compatible(c).slice(1).join(', ')}.` }
    }
  }
}

export function Camelot({ onDone }: DrillProps) {
  return <ChoiceDrill rounds={10} make={() => camelotQuestion()} onDone={onDone} />
}

// ---------- Vocab ----------
export const VOCAB: [string, string][] = [
  ['Downbeat', 'The first beat of a bar, "the 1"'],
  ['Bar', 'Four beats in 4/4 time'],
  ['Phrase', 'A block of bars (usually 8) where the track changes'],
  ['Beatmatching', 'Matching tempo and phase of two tracks'],
  ['Pitch fader', 'Changes a deck\'s playback speed'],
  ['Nudge', 'A brief push or drag to fix phase'],
  ['Key lock', 'Changing tempo without changing pitch'],
  ['Cue', 'A marked point to start a track from'],
  ['Hot cue', 'A cue point you jump to instantly with a pad'],
  ['Trim', 'Channel input gain, set before the EQ'],
  ['Crossfader', 'Blends between deck A and deck B'],
  ['Channel fader', 'Sets one channel\'s level into the mix'],
  ['Low-pass filter', 'Cuts the highs, keeps the lows'],
  ['High-pass filter', 'Cuts the lows, keeps the highs'],
  ['Kill', 'An EQ cut that removes a band entirely'],
  ['Bass swap', 'Trading the low end from one track to the other'],
  ['Headroom', 'Space between your level and clipping'],
  ['Clipping', 'Distortion from a signal that is too hot'],
  ['Gain staging', 'Setting levels at each point of the signal path'],
  ['Camelot', 'Wheel notation for harmonic mixing'],
  ['Harmonic mixing', 'Mixing tracks in compatible keys'],
  ['Halftime', 'Feeling a groove at half the tempo'],
  ['Breakdown', 'A section where the drums drop out'],
  ['Build-up', 'Rising tension leading into a drop'],
  ['Drop', 'Where the full groove returns after a build'],
  ['Intro', 'DJ-friendly start of a track, often beats only'],
  ['Outro', 'DJ-friendly end of a track for mixing out'],
  ['Loop roll', 'A momentary loop that releases back in time'],
  ['Slip mode', 'Playback continues silently under loops and scratches'],
  ['Quantize', 'Snaps cues and loops to the beat grid'],
  ['Beat grid', 'Markers placed on every beat of a track'],
  ['Sync', 'Automatic tempo and phase matching'],
  ['Booth monitor', 'The speaker beside the DJ'],
  ['Cue mix', 'Headphone blend between cue and master'],
  ['Split cue', 'Cue in one ear, master in the other'],
  ['Echo out', 'Exiting a track on an echo tail'],
  ['Spinback', 'Rewinding the platter for a quick stop effect'],
  ['Back-to-back', 'Two DJs alternating tracks'],
  ['Warm-up', 'The opening slot that builds the room'],
  ['Peak time', 'The busiest, highest-energy part of the night'],
  ['Crate', 'A prepared playlist for a set'],
  ['Rekordbox analysis', 'Pre-computing BPM, grid and key for USB'],
  ['Transition', 'Moving from one track into the next'],
  ['Track ID', 'The name of a track someone heard you play'],
]

export function Vocab({ onDone }: DrillProps) {
  const make = (): ChoiceRound => {
    const [term, def] = pick(VOCAB)
    const wrong = shuffle(VOCAB.filter(([t]) => t !== term)).slice(0, 3).map(([, d]) => d)
    return { prompt: term, options: shuffle([def, ...wrong]).map((d) => ({ id: d, label: d })), answer: def, explain: '' }
  }
  return <ChoiceDrill rounds={999} timed={60} make={make} onDone={onDone} />
}

// ---------- Signal Flow (ordering) ----------
const SEQUENCES: { title: string; steps: string[] }[] = [
  { title: 'Channel signal path', steps: ['Trim / gain', 'EQ', 'Filter', 'Channel fader', 'Crossfader', 'Master out'] },
  { title: 'The rig, end to end', steps: ['Library / USB', 'Deck', 'Mixer channel', 'Master bus', 'PA and booth'] },
  {
    title: 'A clean blend',
    steps: ['Cue B in headphones', 'Set B\'s trim to match A', 'Start B on A\'s phrase start', 'Match tempo with the pitch fader', 'Fix phase with a nudge', 'Fader up with B\'s low cut', 'Swap the lows on the phrase', 'Fade A out'],
  },
  { title: 'An echo-out exit', steps: ['Find the last phrase of A', 'Set echo to ½ or ¾ beat', 'Engage echo on the last beat', 'Pull A\'s fader', 'Let the tail ring over B'] },
]

export function SignalFlow({ onDone }: DrillProps) {
  const [i, setI] = useState(0)
  const [order, setOrder] = useState<string[]>([])
  const [checked, setChecked] = useState(false)
  const [total, setTotal] = useState(0)
  const seq = SEQUENCES[i]
  const pool = useMemo(() => shuffle(seq.steps), [seq])
  const correct = order.filter((s, k) => seq.steps[k] === s).length
  const check = () => {
    setChecked(true)
    setTotal((t) => t + (correct / seq.steps.length) * (1000 / SEQUENCES.length))
  }
  return (
    <div className="center">
      <div className="drill-meta">
        <span>
          Round {i + 1} / {SEQUENCES.length}
        </span>
        <span>{Math.round(total)} pts</span>
      </div>
      <h2 className="prompt">{seq.title}: click the steps in order</h2>
      <ol className="order">
        {order.map((s, k) => (
          <li key={s} className={checked ? (seq.steps[k] === s ? 'good' : 'bad') : ''} onClick={() => !checked && setOrder(order.filter((x) => x !== s))}>
            {s}
            {checked && seq.steps[k] !== s && <em> → {seq.steps[k]}</em>}
          </li>
        ))}
      </ol>
      <div className="chips">
        {pool
          .filter((s) => !order.includes(s))
          .map((s) => (
            <button key={s} onClick={() => setOrder([...order, s])}>
              {s}
            </button>
          ))}
      </div>
      {!checked ? (
        <button className="primary" disabled={order.length < seq.steps.length} onClick={check}>
          Check
        </button>
      ) : (
        <>
          <p>
            {correct}/{seq.steps.length} in the right place.
          </p>
          <button
            className="primary"
            autoFocus
            onClick={() => {
              if (i + 1 >= SEQUENCES.length) onDone(Math.round(total))
              else {
                setI(i + 1)
                setOrder([])
                setChecked(false)
              }
            }}
          >
            {i + 1 >= SEQUENCES.length ? 'Finish' : 'Next'}
          </button>
        </>
      )}
    </div>
  )
}

// ---------- Set Builder ----------
export interface SetTrack {
  name: string
  bpm: number
  camelot: string | null
  energy: number
}

export function keyCost(a: string | null, b: string | null): number {
  if (!a || !b) return 1
  const x = parse(a)
  const y = parse(b)
  const d = Math.min((x.n - y.n + 12) % 12, (y.n - x.n + 12) % 12)
  if (x.l === y.l) return d === 0 ? 0 : d === 1 ? 0.5 : d === 2 ? 1.5 : 3
  return d === 0 ? 0.5 : d === 1 ? 2 : 3
}

/** Lower is better: tempo jumps, key clashes, energy dropping, and not building overall. */
export function transitionCost(a: SetTrack, b: SetTrack): number {
  const dBpm = Math.abs(a.bpm - b.bpm)
  const drop = Math.max(0, a.energy - b.energy)
  return Math.max(0, dBpm - 1) * 0.6 + keyCost(a.camelot, b.camelot) + drop * 4
}
export function setCost(s: SetTrack[]): number {
  let c = 0
  for (let k = 1; k < s.length; k++) c += transitionCost(s[k - 1], s[k])
  // end higher than you start
  c += Math.max(0, s[0].energy - s[s.length - 1].energy) * 3
  return c
}

function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a]
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]))
}

const SAMPLE_NAMES = ['Night Bus', 'Concrete Bloom', 'Low Sun', 'Glass Hours', 'Static Choir', 'Ferro', 'Late Signal', 'Warehouse Prayer', 'Halogen', 'Sea Wall', 'Pulse Garden', 'Nine Lives']
function sampleCrate(): SetTrack[] {
  const base = ri(120, 128)
  let key = ri(1, 12)
  return shuffle(SAMPLE_NAMES)
    .slice(0, 6)
    .map((name, k) => {
      key = wrap(key + pick([0, 1, -1, 2]))
      return { name, bpm: base + k + pick([0, 0, 1]), camelot: `${key}${pick(['A', 'A', 'B'])}`, energy: Math.min(1, 0.35 + k * 0.11 + Math.random() * 0.08) }
    })
}

export function SetBuilder({ onDone }: DrillProps) {
  const crate = useMemo<SetTrack[]>(() => {
    const mine = readyTracks().filter((t) => t.analysis!.camelot)
    if (mine.length >= 5)
      return shuffle(mine)
        .slice(0, 6)
        .map((t) => ({ name: t.name, bpm: t.analysis!.bpm, camelot: t.analysis!.camelot, energy: t.analysis!.energy }))
    return shuffle(sampleCrate())
  }, [])
  const [order, setOrder] = useState(crate)
  const [done, setDone] = useState<{ score: number; best: SetTrack[] } | null>(null)
  const move = (k: number, d: number) => {
    const j = k + d
    if (j < 0 || j >= order.length) return
    const o = [...order]
    ;[o[k], o[j]] = [o[j], o[k]]
    setOrder(o)
  }
  const submit = () => {
    const all = permutations(crate).map((p) => ({ p, c: setCost(p) }))
    const min = Math.min(...all.map((x) => x.c))
    const max = Math.max(...all.map((x) => x.c))
    const mine = setCost(order)
    // score relative to the range of possible orders, curved so near-best scores well
    const rel = max === min ? 1 : (max - mine) / (max - min)
    setDone({ score: Math.round(1000 * rel ** 2), best: all.find((x) => x.c === min)!.p })
  }
  const row = (t: SetTrack, k: number, list: SetTrack[], controls: boolean) => {
    const prev = list[k - 1]
    return (
      <li key={t.name}>
        {prev && (
          <div className="transition">
            {(t.bpm - prev.bpm >= 0 ? '+' : '') + (t.bpm - prev.bpm).toFixed(1)} BPM · key {keyCost(prev.camelot, t.camelot) <= 0.5 ? '✓' : keyCost(prev.camelot, t.camelot) <= 1.5 ? 'boost' : 'clash'} · energy {t.energy >= prev.energy ? '↑' : '↓'}
          </div>
        )}
        <div className="set-row">
          <span className="name">{t.name}</span>
          <span className="tag">{t.bpm.toFixed(t.bpm % 1 ? 1 : 0)}</span>
          <span className="tag">{t.camelot ?? '?'}</span>
          <span className="energy">
            <i style={{ width: `${t.energy * 100}%` }} />
          </span>
          {controls && (
            <>
              <button onClick={() => move(k, -1)} aria-label="Move up">
                ↑
              </button>
              <button onClick={() => move(k, 1)} aria-label="Move down">
                ↓
              </button>
            </>
          )}
        </div>
      </li>
    )
  }
  return (
    <div className="setbuilder">
      <p className="muted">Order the crate from opener to closer. Smooth tempo steps, compatible keys, energy that builds.</p>
      <ol className="set">{order.map((t, k) => row(t, k, order, !done))}</ol>
      {!done ? (
        <button className="primary" onClick={submit}>
          Play this order
        </button>
      ) : (
        <>
          <h3>Score {done.score} / 1000. The best order:</h3>
          <ol className="set">{done.best.map((t, k) => row(t, k, done.best, false))}</ol>
          <button className="primary" onClick={() => onDone(done.score)}>
            Continue
          </button>
        </>
      )}
    </div>
  )
}
