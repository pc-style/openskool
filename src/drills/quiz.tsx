// No-audio drills: tempo maths, Camelot, vocabulary, signal flow and set building.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Swap, Value } from '../components/Swap'
import { CamelotWheel } from '../components/viz/diagrams'
import { pick, shuffle } from '../lib/clips'
import { readyTracks } from '../lib/library'
import { getState, setKnown, useProgress } from '../lib/progress'
import { ChoiceDrill, type ChoiceRound, type DrillProps, type RunDetail } from './common'
import { ROUTINES } from '../lib/signal'
import './quiz.css'

const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))

/** The answer plus the first three distinct distractors, shuffled. List distractors most likely first. */
function opts(answer: string, distractors: string[], hint?: (x: string) => string) {
  const uniq = [answer, ...new Set(distractors.filter((d) => d !== answer))].slice(0, 4)
  return shuffle(uniq).map((x) => ({ id: x, label: x, hint: hint?.(x) }))
}
function ans(answer: string, wrong: string[], hint?: (x: string) => string) {
  return { options: opts(answer, wrong, hint), answer }
}

// ---------- BPM Math ----------
const msOf = (x: number) => `${Math.round(x)} ms`
const bpmOf = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)} BPM`
const secOf = (x: number) => `${Math.abs(x - Math.round(x)) < 0.05 ? Math.round(x) : x.toFixed(1)} s`
const pctOf = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)} %`

export const BPM_KINDS = 8

/** One tempo question. Wrong answers are the slips people actually make, not random offsets. */
export function bpmQuestion(kind = ri(0, BPM_KINDS - 1)): ChoiceRound {
  switch (kind) {
    case 0: {
      const bpm = pick([120, 125, 128, 130, 140, 150, 160, 174])
      const a = 60000 / bpm
      return {
        prompt: `How long is one beat at ${bpm} BPM?`,
        ...ans(msOf(a), [msOf(a * 4), msOf(a * 2), msOf(a / 2)]),
        explain: `60 000 ms ÷ ${bpm} = ${msOf(a)}. ${msOf(a * 4)} would be a whole bar of four beats.`,
        tip: 'Echo, delay and loop lengths are all multiples of this one number, so it is worth knowing for your usual tempo.',
      }
    }
    case 1: {
      const bpm = pick([170, 172, 174, 140, 150, 87, 85, 70])
      const half = bpm >= 120
      const a = half ? bpm / 2 : bpm * 2
      return {
        prompt: `A ${bpm} BPM track played ${half ? 'halftime' : 'double-time'} sits on a grid of…`,
        ...ans(bpmOf(a), [bpmOf(half ? bpm * 2 : bpm / 2), bpmOf(half ? bpm / 4 : bpm * 4), bpmOf(bpm)]),
        explain: `${half ? 'Halftime halves' : 'Double-time doubles'} the BPM: ${bpm} → ${a}. Going the other way gives ${bpmOf(half ? bpm * 2 : bpm / 2)}.`,
        tip: 'Halftime and double-time let you mix across genres: a 174 drum & bass tune locks to an 87 BPM hip-hop beat without touching the pitch fader.',
      }
    }
    case 2: {
      const from = ri(118, 132)
      let to = ri(120, 136)
      if (to === from) to += 2
      const p = (to / from - 1) * 100
      return {
        prompt: `Pitch % to take a ${from} BPM track to ${to} BPM?`,
        ...ans(pctOf(p), [pctOf(to - from), pctOf(((to - from) / to) * 100), pctOf(-p), pctOf(p * 2)]),
        explain: `(${to} ÷ ${from} − 1) × 100 = ${pctOf(p)}. The % is of the track's own tempo (${from}), not the target and not the BPM difference.`,
        tip: 'Decks show pitch in %. Past about ±6 % vocals and pads start to sound wrong even with key lock, so big jumps want a different track or a halftime trick.',
      }
    }
    case 3: {
      const bpm = pick([120, 124, 128, 130, 135, 140, 150])
      const bars = pick([8, 16])
      const s = (bars * 4 * 60) / bpm
      return {
        prompt: `How long do ${bars} bars last at ${bpm} BPM?`,
        ...ans(secOf(s), [secOf((bars * 60) / bpm), secOf(s / 2), secOf(s * 2)]),
        explain: `${bars} bars × 4 beats × 60 ÷ ${bpm} = ${secOf(s)}. Counting bars as beats gives ${secOf((bars * 60) / bpm)}.`,
        tip: 'This is how long you have to cue, match and start the next track before the outgoing phrase ends.',
      }
    }
    case 4: {
      const bpm = pick([120, 124, 126, 128, 130])
      const pct = pick([2, 3, 4, 5, 6, -2, -3, -4])
      const a = bpm * (1 + pct / 100)
      const f = (x: number) => `${x.toFixed(1)} BPM`
      return {
        prompt: `A ${bpm} BPM track with the pitch at ${pct > 0 ? '+' : '−'}${Math.abs(pct)} % plays at…`,
        ...ans(f(a), [f(bpm + pct), f(bpm * (1 + pct / 10)), f(bpm * (1 - pct / 100)), f(a + 1.5)]),
        explain: `${bpm} × ${(1 + pct / 100).toFixed(2)} = ${f(a)}. ${Math.abs(pct)} % of ${bpm} is ${((bpm * Math.abs(pct)) / 100).toFixed(1)} BPM, not ${Math.abs(pct)}, and the factor is × ${(1 + pct / 100).toFixed(2)}, not × ${(1 + pct / 10).toFixed(1)}.`,
        tip: 'Read the real tempo off the pitch fader before picking the next track, so you know how far it has to move.',
      }
    }
    case 5: {
      const bpm = pick([120, 125, 128, 130, 140])
      const beat = 60000 / bpm
      const dly = pick([0.5, 0.75, 1] as const)
      const a = beat * dly
      const name = dly === 0.5 ? '1/2' : dly === 0.75 ? '3/4' : '1/1'
      return {
        prompt: `A ${name}-beat echo at ${bpm} BPM repeats every…`,
        ...ans(msOf(a), [msOf(beat * 4 * dly), msOf(dly === 1 ? beat * 2 : beat), msOf(a / 2), msOf(a * 2)]),
        explain: `One beat is ${msOf(beat)}; × ${dly} = ${msOf(a)}. Using a bar instead of a beat gives ${msOf(beat * 4 * dly)}.`,
        tip: 'Beat FX sync this for you, but an outboard delay or a send effect often wants it in ms.',
      }
    }
    case 6: {
      const bars = pick([8, 8, 16, 32])
      const a = bars * 4
      return {
        prompt: `How many beats are in ${bars === 8 ? 'an' : 'a'} ${bars}-bar phrase?`,
        ...ans(`${a} beats`, [`${bars} beats`, `${bars * 2} beats`, `${bars * 8} beats`]),
        explain: `${bars} bars × 4 beats = ${a} beats. Counting each bar as one beat gives ${bars}.`,
        tip: 'Tracks change every 8 bars. Counting 32 beats from the drop is how you land a mix on the next phrase start.',
      }
    }
    default: {
      const bpm = pick([120, 122, 124, 125, 126, 128, 130, 135, 140])
      const s = (32 * 4 * 60) / bpm
      return {
        prompt: `How long is a 32-bar phrase at ${bpm} BPM?`,
        ...ans(secOf(s), [secOf((32 * 60) / bpm), secOf(s / 2), secOf(s * 2)]),
        explain: `32 bars × 4 beats = 128 beats; 128 × 60 ÷ ${bpm} = ${secOf(s)}.`,
        tip: 'A 32-bar intro or outro is your mixing window. At 128 BPM it is exactly a minute, which is plenty for a long blend.',
      }
    }
  }
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
// Camelot number → key, with the spellings DJ software usually shows.
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
const MAJOR = ['B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E']
export function keyName(code: string) {
  const { n, l } = parse(code)
  return l === 'A' ? `${MINOR[n - 1]} minor` : `${MAJOR[n - 1]} major`
}

const CAMELOT_TIP = 'Show the key column in your DJ software, set it to Camelot and sort by it: safe neighbours end up next to each other.'

export function camelotQuestion(kind = ri(0, 3)): ChoiceRound {
  const c = pick(CODES)
  const { n, l } = parse(c)
  const safe = compatible(c).slice(1)
  const far = CODES.filter((x) => !compatible(c).includes(x))
  const named = (x: string) => keyName(x)
  switch (kind) {
    case 0: {
      const a = pick(safe)
      return {
        prompt: `Which key mixes harmonically with ${c}?`,
        sub: keyName(c),
        ...ans(a, shuffle(far).slice(0, 3), named),
        explain: `From ${c} you can go to ${safe.join(', ')}: one step round the wheel, or swap the letter.`,
        tip: CAMELOT_TIP,
        visual: <CamelotWheel start={c} answer={a} />,
      }
    }
    case 1: {
      return {
        prompt: `What is the Camelot code for ${keyName(c)}?`,
        // no key hints here: they would give the answer away
        ...ans(c, [`${n}${l === 'A' ? 'B' : 'A'}`, `${wrap(n + 5)}${l}`, `${wrap(n + 2)}${l}`]),
        explain: `${keyName(c)} = ${c}. A is minor, B is major.`,
        tip: CAMELOT_TIP,
        visual: <CamelotWheel start={c} answer={c} />,
      }
    }
    case 2: {
      const a = `${wrap(n + 2)}${l}`
      return {
        prompt: `An "energy boost" of +2 from ${c} lands on…`,
        sub: keyName(c),
        ...ans(a, [`${wrap(n + 1)}${l}`, `${wrap(n - 2)}${l}`, `${wrap(n + 2)}${l === 'A' ? 'B' : 'A'}`], named),
        explain: `+2 on the wheel is two semitones up: ${c} → ${a}. It lifts the energy but is not a safe neighbour, so keep the blend short.`,
        tip: CAMELOT_TIP,
        visual: <CamelotWheel start={c} answer={a} />,
      }
    }
    default: {
      const to = pick(far)
      const bad = `${c} → ${to}`
      const good = shuffle(safe).map((x) => `${c} → ${x}`)
      return {
        prompt: 'Which transition will clash in a long blend?',
        ...ans(bad, good, (x) => x.split(' → ').map(keyName).join(' → ')),
        explain: `${to} is not next to ${c} on the wheel. Safe moves from ${c}: ${safe.join(', ')}.`,
        tip: CAMELOT_TIP,
        visual: <CamelotWheel start={c} answer={to} clash />,
      }
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
  ['Beatmatching', 'Matching tempo and phase of two tracks by ear'],
  ['Pitch fader', "Changes a deck's playback speed"],
  ['Tempo range', 'How far the pitch fader reaches, e.g. ±6, ±10 or ±16 %'],
  ['Nudge', 'A brief push or drag to fix phase'],
  ['Jog wheel', 'The platter on a CDJ or controller: turn its edge to nudge, its top to scratch or search'],
  ['Vinyl mode', 'Makes the top of the jog act like a record: touch to hold, move to scratch'],
  ['Key lock', "Keeps a track's pitch when you change its tempo; Pioneer calls it Master Tempo"],
  ['Key shift', 'Transposes a track up or down in semitones without changing its tempo'],
  ['Cue', 'The button that sets and returns to a start point; hold it to preview from there'],
  ['Hot cue', 'A cue point you jump to instantly with a pad'],
  ['Memory cue', 'A saved marker shown on the waveform, not assigned to a pad'],
  ['Performance pads', 'Rubber pads that trigger hot cues, loops, rolls or samples'],
  ['Quantize', 'Snaps cues and loops to the beat grid'],
  ['Slip mode', 'Playback continues silently under loops and scratches'],
  ['Loop roll', 'A momentary loop that releases back in time'],
  ['Auto loop', 'Sets a loop of a chosen number of beats with one press'],
  ['Loop in / out', 'Buttons that mark the start and end of a manual loop'],
  ['Beat jump', 'Skips forward or back by a set number of beats, staying on the grid'],
  ['Needle search', 'A touch strip that jumps straight to any point in the track'],
  ['Trim', 'Channel input gain, set before the EQ'],
  ['3-band EQ', 'Low, mid and high knobs on each channel for shaping or cutting frequencies'],
  ['Crossfader', 'Blends between deck A and deck B'],
  ['Crossfader curve', 'How sharply the crossfader cuts in: smooth for blends, sharp for scratching'],
  ['Channel fader', "Sets one channel's level into the mix"],
  ['Fader start', 'Starts a deck playing when you raise its channel fader'],
  ['Level meter', "Shows a channel's or the master's signal strength; keep it out of the red"],
  ['Master level', "The mixer's main output volume to the PA"],
  ['Booth level', 'Volume of the booth monitor output, set separately from the main out'],
  ['Limiter', 'Holds the output under a set ceiling so it cannot clip'],
  ['Low-pass filter', 'Lets the bass through and removes the treble, so the track sounds muffled'],
  ['High-pass filter', 'Removes the bass and lets the treble through, so the track sounds thin'],
  ['Colour FX', 'Single-knob effects on each mixer channel, such as filter, noise, crush or dub echo'],
  ['Beat FX', 'Tempo-synced effects such as echo, reverb or flanger, timed in beats'],
  ['Send/return', 'Routes a channel out to an external effect and brings the processed signal back into the mixer'],
  ['Sampler', 'Plays one-shot sounds or short loops alongside the decks'],
  ['Stems', 'A track split into drums, bass, vocals and melody that you can mute or solo live'],
  ['Kill', 'An EQ cut that removes a band entirely'],
  ['Bass swap', 'Trading the low end from one track to the other'],
  ['Headroom', 'Space between your level and clipping'],
  ['Clipping', 'Distortion from a signal that is too hot'],
  ['Gain staging', 'Setting levels at each point of the signal path'],
  ['Camelot', 'Wheel notation for harmonic mixing: numbers 1 to 12, A for minor, B for major'],
  ['Harmonic mixing', 'Mixing tracks in compatible keys'],
  ['Halftime', 'Feeling a groove at half the tempo'],
  ['Breakdown', 'A section where the drums drop out'],
  ['Build-up', 'Rising tension leading into a drop'],
  ['Drop', 'Where the full groove returns after a build'],
  ['Intro', 'DJ-friendly start of a track, often beats only'],
  ['Outro', 'DJ-friendly end of a track for mixing out'],
  ['Beat grid', 'Markers placed on every beat of a track'],
  ['Waveform', "The picture of a track's audio, often coloured by frequency"],
  ['Phase meter', "Shows how far apart two decks' beats are, to help keep them aligned"],
  ['Sync', 'Automatic tempo and phase matching'],
  ['Master deck', 'The deck the others follow when sync is on'],
  ['Booth monitor', 'The speaker beside the DJ'],
  ['PFL', 'Pre-fader listen: sends a channel to your headphones whatever its fader is doing'],
  ['Cue mix', 'Headphone blend between cue and master'],
  ['Split cue', 'Cue in one ear, master in the other'],
  ['Echo out', 'Exiting a track on an echo tail'],
  ['Spinback', 'Rewinding the platter for a quick stop effect'],
  ['Scratch', 'Moving a record or jog back and forth in rhythm to make a sound'],
  ['Back-to-back', 'Two DJs alternating tracks'],
  ['Warm-up', 'The opening slot that builds the room'],
  ['Peak time', 'The busiest, highest-energy part of the night'],
  ['Crate', 'A prepared playlist for a set'],
  ['Rekordbox analysis', 'Pre-computing BPM, grid and key for USB'],
  ['Transition', 'Moving from one track into the next'],
  ['Track ID', 'The name of a track someone heard you play'],
]

const STOP = new Set(['a', 'an', 'and', 'in', 'of', 'on', 'out', 'the', 'to', 'up'])

/** The definition with the term's own words (and their plurals or longer forms) blanked out. */
export function blankTerm(term: string, def: string) {
  const words = term
    .toLowerCase()
    .split(/[\s/-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (!words.length) return def
  return def.replace(new RegExp(`\\b(${words.join('|')})\\w*`, 'gi'), '____')
}

/** Vocab's Learn step: flip cards and mark the ones you know. */
export function VocabLearn({ onQuiz: onStart }: { onQuiz: () => void }) {
  const known = useProgress().known
  // terms you have not marked yet come first; the order holds for the session
  const [deck] = useState(() => {
    const k = new Set(getState().known)
    return [...shuffle(VOCAB.filter(([t]) => !k.has(t))), ...shuffle(VOCAB.filter(([t]) => k.has(t)))]
  })
  const [i, setI] = useState(0)
  const [back, setBack] = useState(false)
  const [term, def] = deck[i % deck.length]
  const knownCount = VOCAB.filter(([t]) => known.includes(t)).length
  const mark = (on: boolean) => {
    setKnown(term, on)
    setBack(false)
    setI((x) => x + 1)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        setBack((b) => !b)
      } else if (e.key === '1') mark(false)
      else if (e.key === '2') mark(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="study">
      <div className="drill-meta">
        <span>
          Study · card <Value v={(i % deck.length) + 1} /> of {deck.length}
        </span>
        <span>
          <Value v={knownCount} />/{VOCAB.length} known
        </span>
      </div>
      <button className="flashcard" onClick={() => setBack((b) => !b)} aria-label={back ? `Definition of ${term}. Flip to the term` : `${term}. Flip to the definition`}>
        <Swap k={`${i}-${back}`}>
          <span className="flash-side">{back ? 'Definition' : 'Term'}</span>
          <span className={back ? 'flash-def' : 'flash-term'}>{back ? def : term}</span>
          {known.includes(term) && <span className="flash-known">Marked known</span>}
        </Swap>
      </button>
      <p className="muted small study-hint">
        Tap the card or press <kbd>Space</kbd> to flip
      </p>
      <div className="row study-actions">
        <button onClick={() => mark(false)}>
          <kbd>1</kbd> Still learning
        </button>
        <button onClick={() => mark(true)}>
          <kbd>2</kbd> I know this
        </button>
      </div>
      <div className="study-start">
        <p className="muted small">The blitz shows a definition with its words blanked out. Pick the term, as many as you can in 60 seconds.</p>
        <button className="primary" onClick={onStart}>
          Start the quiz
        </button>
      </div>
    </div>
  )
}

export function Vocab({ onDone }: DrillProps) {
  const make = (): ChoiceRound => {
    const [term, def] = pick(VOCAB)
    const wrong = shuffle(VOCAB.filter(([t]) => t !== term))
      .slice(0, 3)
      .map(([t]) => t)
    return { prompt: blankTerm(term, def), sub: 'Which term is this?', ...ans(term, wrong), explain: `${term}: ${def}.` }
  }
  return <ChoiceDrill rounds={999} timed={60} make={make} onDone={onDone} />
}

// ---------- Signal Flow (ordering) ----------
/**
 * Click the steps of each routine in order. Each pick is checked at once: a right step locks in, a wrong
 * one flashes and stays in the pool, so one early slip never marks the rest wrong. Score: steps placed on
 * the first try.
 */
export function SignalFlow({ onDone }: DrillProps) {
  const [i, setI] = useState(0)
  const [placed, setPlaced] = useState(0)
  const [wrongAt, setWrongAt] = useState<{ step: string; n: number } | null>(null)
  const [firstTry, setFirstTry] = useState(0)
  const slipped = useRef(false)
  const stats = useRef({ firstTry: 0, misses: [] as NonNullable<RunDetail['misses']> })
  const r = ROUTINES[i]
  const pool = useMemo(() => shuffle(r.steps.map((x) => x.step)), [r])
  const total = ROUTINES.reduce((n, x) => n + x.steps.length, 0)
  const done = placed >= r.steps.length
  const last = i + 1 >= ROUTINES.length

  const finish = () => {
    const { firstTry: ft, misses } = stats.current
    onDone(Math.round((ft / total) * 1000), { right: ft, total, misses })
  }
  const advance = () => {
    if (last) return finish()
    setI(i + 1)
    setPlaced(0)
    setWrongAt(null)
    slipped.current = false
  }
  const pick = (step: string) => {
    if (done) return
    const want = r.steps[placed]
    if (step === want.step) {
      if (!slipped.current) {
        stats.current.firstTry++
        setFirstTry(stats.current.firstTry)
      }
      slipped.current = false
      setWrongAt(null)
      setPlaced(placed + 1)
    } else {
      if (!slipped.current) stats.current.misses.push({ prompt: `${r.title}, step ${placed + 1}`, picked: step, answer: want.step })
      slipped.current = true
      setWrongAt((w) => ({ step, n: (w?.n ?? 0) + 1 }))
    }
  }
  const skip = () => {
    // the steps left count as missed
    for (let k = placed; k < r.steps.length; k++) if (!(k === placed && slipped.current)) stats.current.misses.push({ prompt: `${r.title}, step ${k + 1}`, picked: 'Skipped', answer: r.steps[k].step })
    advance()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.key === 's' || e.key === 'S') && !done) skip()
      else if (e.key === 'Enter' && done) advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="signal">
      <div className="drill-meta">
        <span>
          Routine <Value v={i + 1} /> of {ROUTINES.length}
        </span>
        <span>
          <Value v={firstTry} /> of {total} first try
        </span>
      </div>
      <Swap k={i}>
        <h2 className="prompt">{r.title}</h2>
        <p className="sub">{r.about} Click the steps in order.</p>
        <ol className="order">
          {r.steps.slice(0, placed).map((x, k) => (
            <li key={x.step} className="good">
              <span>{x.step}</span>
              {k === placed - 1 && <span className="order-why muted small">{x.why}</span>}
            </li>
          ))}
          {!done && <li className="order-next muted">Step {placed + 1}?</li>}
        </ol>
        {!done ? (
          <div className="chips">
            {pool
              .filter((x) => !r.steps.slice(0, placed).some((y) => y.step === x))
              .map((x) => (
                <button key={x} className={wrongAt?.step === x ? 'chip-wrong' : undefined} data-n={wrongAt?.step === x ? wrongAt.n : undefined} onClick={() => pick(x)}>
                  {x}
                </button>
              ))}
          </div>
        ) : (
          <p className="fade-in">
            {r.steps.length} steps in order.{' '}
            <button className="primary" onClick={advance} autoFocus>
              {last ? 'Finish' : 'Next routine'} <kbd>↵</kbd>
            </button>
          </p>
        )}
        {wrongAt && !done && (
          <p className="muted small" role="status">
            Not step {placed + 1}. {placed > 0 ? `After “${r.steps[placed - 1].step}”, what comes next?` : 'What comes first?'}
          </p>
        )}
      </Swap>
      {!done && (
        <button className="ghost skip" onClick={skip}>
          {last ? 'Skip and finish' : 'Skip routine'} <kbd>S</kbd>
        </button>
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

/** Tempo change from a to b, in % of a's tempo. */
export const tempoStep = (a: SetTrack, b: SetTrack) => (b.bpm / a.bpm - 1) * 100
/** Tempo steps up to this size (%) are fine. */
export const TEMPO_OK = 3
const ENERGY_DROP = 0.05

/** Lower is better: tempo jumps, key clashes, energy dropping, and not building overall. */
export function transitionCost(a: SetTrack, b: SetTrack): number {
  const p = Math.abs(tempoStep(a, b))
  const drop = Math.max(0, a.energy - b.energy)
  return Math.max(0, p - 1) * 0.5 + Math.max(0, p - TEMPO_OK) * 0.8 + keyCost(a.camelot, b.camelot) + drop * 4
}
export function setCost(s: SetTrack[]): number {
  let c = 0
  for (let k = 1; k < s.length; k++) c += transitionCost(s[k - 1], s[k])
  // end higher than you start
  c += Math.max(0, s[0].energy - s[s.length - 1].energy) * 3
  return c
}

/** What a transition does, part by part; `bad` parts are the ones that cost points. */
export function transitionNote(a: SetTrack, b: SetTrack): { text: string; bad: boolean }[] {
  const kc = keyCost(a.camelot, b.camelot)
  const p = tempoStep(a, b)
  const step = `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)} %`
  return [
    kc === 0 ? { text: 'same key', bad: false } : kc <= 0.5 ? { text: 'keys compatible', bad: false } : kc <= 1.5 ? { text: 'key +2 boost', bad: false } : { text: 'key clash', bad: true },
    Math.abs(p) < 0.05 ? { text: 'same tempo', bad: false } : Math.abs(p) <= TEMPO_OK ? { text: `tempo ${step}`, bad: false } : { text: `tempo jump ${step}`, bad: true },
    a.energy - b.energy > ENERGY_DROP ? { text: 'energy drops', bad: true } : b.energy - a.energy > ENERGY_DROP ? { text: 'energy builds', bad: false } : { text: 'energy holds', bad: false },
  ]
}

export function verdict(score: number) {
  return score >= 900 ? 'Perfect flow' : score >= 700 ? 'Smooth set' : score >= 450 ? 'Decent' : 'Bumpy ride'
}

function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a]
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]))
}

/** Scores an order against every order that starts with the same opener, curved so near-best scores well. */
export function scoreSet(order: SetTrack[]) {
  const [opener, ...rest] = order
  const all = permutations(rest).map((p) => ({ p: [opener, ...p], c: setCost([opener, ...p]) }))
  const min = Math.min(...all.map((x) => x.c))
  const max = Math.max(...all.map((x) => x.c))
  const rel = max === min ? 1 : (max - setCost(order)) / (max - min)
  return { score: Math.round(1000 * Math.max(0, rel) ** 2), best: all.find((x) => x.c === min)!.p }
}

const CRATES = 3
const SAMPLE_NAMES = ['Night Bus', 'Concrete Bloom', 'Low Sun', 'Glass Hours', 'Static Choir', 'Ferro', 'Late Signal', 'Warehouse Prayer', 'Halogen', 'Sea Wall', 'Pulse Garden', 'Nine Lives', 'Copper Tide', 'Slow Burn', 'Afterlight', 'Tin Roof', 'Overpass', 'Blue Hour']
function sampleCrate(): SetTrack[] {
  const base = ri(118, 128)
  let key = ri(1, 12)
  return shuffle(SAMPLE_NAMES)
    .slice(0, 6)
    .map((name, k) => {
      key = wrap(key + pick([0, 1, -1, 2]))
      return { name, bpm: base + k + pick([0, 0, 1, 2]), camelot: `${key}${pick(['A', 'A', 'B'])}`, energy: Math.min(1, 0.3 + k * 0.12 + Math.random() * 0.08) }
    })
}

/** Six tracks with the calmest as the fixed opener. */
function makeCrate(): SetTrack[] {
  const mine = readyTracks().filter((t) => t.analysis!.camelot)
  const tracks =
    mine.length >= 6
      ? shuffle(mine)
          .slice(0, 6)
          .map((t) => ({ name: t.name, bpm: t.analysis!.bpm, camelot: t.analysis!.camelot, energy: t.analysis!.energy }))
      : sampleCrate()
  const opener = tracks.reduce((a, b) => (b.energy < a.energy ? b : a))
  return [opener, ...shuffle(tracks.filter((t) => t !== opener))]
}

function TrackRow({ t }: { t: SetTrack }) {
  return (
    <>
      <span className="name">{t.name}</span>
      <span className="tag">{t.bpm.toFixed(t.bpm % 1 ? 1 : 0)}</span>
      <span className="tag">{t.camelot ?? '?'}</span>
      <span className="energy" aria-label={`Energy ${Math.round(t.energy * 10)} of 10`}>
        <i style={{ width: `${t.energy * 100}%` }} />
      </span>
    </>
  )
}

function Notes({ set }: { set: SetTrack[] }) {
  return (
    <ul className="set-notes">
      {set.slice(1).map((t, k) => (
        <li key={t.name}>
          <span className="muted">
            {k + 1}→{k + 2}:
          </span>{' '}
          {transitionNote(set[k], t).map((p, j) => (
            <span key={p.text}>
              {j > 0 && <span className="muted">, </span>}
              <span className={p.bad ? 'note-bad' : 'muted'}>{p.text}</span>
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}

export function SetBuilder({ onDone }: DrillProps) {
  const [crates] = useState(() => Array.from({ length: CRATES }, makeCrate))
  const [ci, setCi] = useState(0)
  const [picked, setPicked] = useState<SetTrack[]>([])
  const [result, setResult] = useState<{ score: number; best: SetTrack[] } | null>(null)
  const [scores, setScores] = useState<number[]>([])
  const [opener, ...crate] = crates[ci]
  const set = [opener, ...picked]
  const left = crate.filter((t) => !picked.includes(t))
  const submit = () => {
    const r = scoreSet(set)
    setResult(r)
    setScores((s) => [...s, r.score])
  }
  const next = (sc = scores) => {
    if (ci + 1 >= CRATES) {
      const avg = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length)
      onDone(avg, { right: sc.filter((s) => s >= 700).length, total: CRATES })
      return
    }
    setCi(ci + 1)
    setPicked([])
    setResult(null)
  }
  return (
    <div className="setbuilder">
      <div className="drill-meta">
        <span>
          Crate <Value v={ci + 1} /> of {CRATES}
        </span>
        <span>{scores.length ? <>Average <Value v={Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)} /></> : '\u00a0'}</span>
      </div>
      <Swap k={ci}>
        <p className="muted">Build the set from the opener. Tap tracks in the order you would play them: small tempo steps, compatible keys, energy that builds.</p>
        <div className="sb-cols">
          <section>
            <h3>Your set</h3>
            <ol className="set">
              {set.map((t, k) => (
                <li key={t.name}>
                  <div className="set-row">
                    <TrackRow t={t} />
                    {k === 0 && <span className="sb-fixed">opener</span>}
                  </div>
                </li>
              ))}
            </ol>
            {!result && (
              <div className="row">
                <button onClick={() => setPicked(picked.slice(0, -1))} disabled={!picked.length}>
                  Undo
                </button>
                <button className="primary" onClick={submit} disabled={left.length > 0}>
                  Play this order
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    const sc = [...scores, 0]
                    setScores(sc)
                    next(sc)
                  }}
                >
                  {ci + 1 >= CRATES ? 'Skip and finish' : 'Skip crate'}
                </button>
              </div>
            )}
          </section>
          {!result && (
            <section>
              <h3>Crate</h3>
              {left.length ? (
                <ul className="sb-crate">
                  {left.map((t) => (
                    <li key={t.name}>
                      <button className="set-row" onClick={() => setPicked([...picked, t])}>
                        <TrackRow t={t} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Crate empty. Play the order, or undo to change it.</p>
              )}
            </section>
          )}
        </div>
        {result && (
          <div className="sb-result fade-in" role="status">
            <h3>
              {verdict(result.score)} <span className="muted">· {result.score} / 1000</span>
            </h3>
            <Notes set={set} />
            <h3>The best order</h3>
            <ol className="set">
              {result.best.map((t) => (
                <li key={t.name}>
                  <div className="set-row">
                    <TrackRow t={t} />
                  </div>
                </li>
              ))}
            </ol>
            <Notes set={result.best} />
            <div className="row">
              <button className="primary" onClick={() => next()} autoFocus>
                {ci + 1 >= CRATES ? 'Finish' : 'Next crate'}
              </button>
            </div>
          </div>
        )}
      </Swap>
    </div>
  )
}
