// Learn steps for the knowledge drills: short, interactive lessons shown before each quiz.
import { useEffect, useMemo, useState } from 'react'
import { Reserve, Swap, Value } from '../components/Swap'
import { CamelotWheel, type CamelotMark } from '../components/viz/diagrams'
import { shuffle } from '../lib/clips'
import { ROUTINES } from '../lib/signal'
import { compatible, keyCost, keyName, scoreSet, TEMPO_OK, tempoStep, transitionNote, type SetTrack } from './quiz'
import './learn.css'

export interface LearnProps {
  onQuiz: () => void
}

function QuizFoot({ onQuiz, note }: LearnProps & { note: string }) {
  return (
    <div className="learn-foot">
      <p className="muted small">{note}</p>
      <button className="primary" onClick={onQuiz}>
        Start the quiz
      </button>
    </div>
  )
}

// ---------- BPM Math ----------

const round1 = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1))
const signed = (x: number, unit: string) => `${x >= 0 ? '+' : '−'}${round1(Math.abs(x))}${unit}`
const clampBpm = (x: number) => Math.min(200, Math.max(60, x))
const PRESETS = [87, 124, 128, 140, 174]

/** One line of the calculator: what, the number, and the sum that makes it. */
function Calc({ label, v, f }: { label: string; v: string; f: string }) {
  return (
    <div className="calc-row">
      <span className="calc-label">{label}</span>
      <span className="calc-v tabular">
        <Value v={v} />
      </span>
      <span className="calc-f muted small tabular">
        <Value v={f} />
      </span>
    </div>
  )
}

/** A tempo input: number field plus slider, both continuous, so `set` is told the change is live. */
function TempoInput({ id, label, bpm, set }: { id: string; label: string; bpm: number; set: (x: number, live: boolean) => void }) {
  const [text, setText] = useState(String(bpm))
  // follow outside changes (presets) without fighting the user's typing
  const [seen, setSeen] = useState(bpm)
  if (seen !== bpm) {
    setSeen(bpm)
    setText(String(bpm))
  }
  return (
    <div className="tempo-in">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={60}
        max={200}
        step={1}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const x = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(x) && x >= 60 && x <= 200) set(x, true)
        }}
        onBlur={() => setText(String(bpm))}
      />
      <input type="range" min={60} max={200} step={1} value={Math.round(bpm)} aria-label={`${label}, slider`} onChange={(e) => set(clampBpm(Number(e.target.value)), true)} />
    </div>
  )
}

export function BpmLearn({ onQuiz }: LearnProps) {
  const [bpm, setBpm] = useState(124)
  const [a, setA] = useState(128)
  const [b, setB] = useState(124)
  // true while the change came from dragging or typing: plain, immediate updates
  const [live, setLive] = useState(false)
  const beat = 60000 / bpm
  const bar = (4 * 60) / bpm
  const pct = (a / b - 1) * 100
  const setTempo = (x: number, isLive: boolean) => {
    setLive(isLive)
    setBpm(x)
  }
  return (
    <div className="learn">
      <ol className="learn-rules">
        <li>
          <strong>A bar is four beats; a phrase is 8 bars.</strong> <span className="muted">Tracks change every 8 bars, so 8 bars = 32 beats and a 32-bar phrase = 128 beats.</span>
        </li>
        <li>
          <strong>One beat lasts 60 000 ms ÷ BPM.</strong> <span className="muted">Every echo, loop and phrase length is a multiple of this one number.</span>
        </li>
        <li>
          <strong>Halftime halves the BPM, double-time doubles it.</strong> <span className="muted">174 drum & bass sits on an 87 grid.</span>
        </li>
        <li>
          <strong>Pitch % is a share of the track's own tempo.</strong> <span className="muted">To take B to A: (A ÷ B − 1) × 100. So 4 % is not 4 BPM.</span>
        </li>
      </ol>

      <section className={`learn-card${live ? ' learn-instant' : ''}`} aria-label="Tempo calculator">
        <div className="tempo-head">
          <TempoInput id="bpm-main" label="Tempo, BPM" bpm={bpm} set={setTempo} />
          <div className="seg-group" role="group" aria-label="Common tempos">
            {PRESETS.map((x) => (
              <button key={x} className={`seg${bpm === x ? ' on' : ''}`} aria-pressed={bpm === x} onClick={() => setTempo(x, false)}>
                {x}
              </button>
            ))}
          </div>
        </div>
        <div className="calc">
          <Calc label="One beat" v={`${Math.round(beat)} ms`} f={`60 000 ÷ ${round1(bpm)}`} />
          <Calc label="One bar" v={`${bar.toFixed(2)} s`} f={`4 × 60 ÷ ${round1(bpm)}`} />
          <Calc label="8-bar phrase" v={`${round1(bar * 8)} s`} f="8 × one bar · 32 beats" />
          <Calc label="32-bar phrase" v={`${round1(bar * 32)} s`} f="32 × one bar · 128 beats" />
          <Calc label="Halftime" v={`${round1(bpm / 2)} BPM`} f={`${round1(bpm)} ÷ 2`} />
          <Calc label="Double-time" v={`${round1(bpm * 2)} BPM`} f={`${round1(bpm)} × 2`} />
          <Calc label="½-beat echo" v={`${Math.round(beat / 2)} ms`} f="one beat × 0.5" />
          <Calc label="¾-beat echo" v={`${Math.round(beat * 0.75)} ms`} f="one beat × 0.75" />
        </div>
      </section>

      <section className={`learn-card${live ? ' learn-instant' : ''}`} aria-label="Pitch calculator">
        <p className="learn-lead">Match track B to track A</p>
        <div className="tempo-pair">
          <TempoInput
            id="bpm-a"
            label="A, playing"
            bpm={a}
            set={(x) => {
              setLive(true)
              setA(x)
            }}
          />
          <TempoInput
            id="bpm-b"
            label="B, to match"
            bpm={b}
            set={(x) => {
              setLive(true)
              setB(x)
            }}
          />
        </div>
        <div className="calc">
          <Calc label="Pitch on B" v={signed(pct, ' %')} f={`(${round1(a)} ÷ ${round1(b)} − 1) × 100`} />
          <Calc label="BPM difference" v={signed(a - b, ' BPM')} f={`${round1(a)} − ${round1(b)}`} />
          <Calc label="1 % of B" v={`${(b / 100).toFixed(2)} BPM`} f={`${round1(b)} ÷ 100`} />
        </div>
        <p className="muted small learn-note">
          The % is of B's own tempo, not of A and not the BPM gap. At {round1(b)} BPM, 4 % is {((b * 4) / 100).toFixed(1)} BPM. Going the other way, B with the pitch at +4 % plays at {round1(b)} × 1.04 = {(b * 1.04).toFixed(1)} BPM.
        </p>
      </section>

      <QuizFoot onQuiz={onQuiz} note="The quiz asks these sums with round numbers. The wrong answers are the usual slips: a bar instead of a beat, beats instead of bars, the BPM gap instead of the %." />
    </div>
  )
}

// ---------- Camelot ----------

const num = (c: string) => Number(c.slice(0, -1))
const wrap12 = (n: number) => ((n - 1 + 120) % 12) + 1
const boostOf = (c: string) => `${wrap12(num(c) + 2)}${c.slice(-1)}`

/** The safe moves from a key, each with how you get there. */
function movesOf(c: string) {
  const [, down, up, swap] = compatible(c)
  return [
    { code: down, how: 'one step back' },
    { code: up, how: 'one step on' },
    { code: swap, how: c.endsWith('A') ? 'swap the letter: its relative major' : 'swap the letter: its relative minor' },
  ]
}

interface Try {
  prompt: string
  ok: (x: string) => boolean
  why: string
}

const TRIES: Try[] = [
  { prompt: 'Click a safe neighbour of 8A.', ok: (x) => compatible('8A').slice(1).includes(x), why: 'From 8A: 7A, 9A or 8B.' },
  { prompt: 'Click the relative major of 4A.', ok: (x) => x === '4B', why: 'Same number, swap A for B: 4B.' },
  { prompt: 'Click the +2 energy boost from 11B.', ok: (x) => x === '1B', why: 'Two steps on from 11B wraps past 12: 1B.' },
  { prompt: `Click the key for ${keyName('7A')}.`, ok: (x) => x === '7A', why: `${keyName('7A')} is 7A: minor keys sit on the inner A ring.` },
  { prompt: 'Click a safe neighbour of 1B.', ok: (x) => compatible('1B').slice(1).includes(x), why: 'From 1B: 12B, 2B or 1A. The wheel wraps round.' },
]

/** Every key, to size the answer line for whichever one is clicked. */
const ALL_KEYS = Array.from({ length: 12 }, (_, k) => [`${k + 1}A`, `${k + 1}B`]).flat()

function CamelotTry({ onQuiz }: LearnProps) {
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<{ code: string; ok: boolean } | null>(null)
  const done = i >= TRIES.length
  const t = TRIES[Math.min(i, TRIES.length - 1)]
  const feedback = (p: { code: string; ok: boolean }) => (
    <>
      <p className="small">
        <span className={p.ok ? 'cam-yes' : 'note-bad'}>{p.ok ? `Yes, ${p.code}.` : `${p.code} is not it.`}</span> <span className="muted">{p.ok ? t.why : `${p.code} is ${keyName(p.code)}. Try another key.`}</span>
      </p>
      {p.ok && (
        <button
          autoFocus={p === pick}
          onClick={() => {
            setI(i + 1)
            setPick(null)
          }}
        >
          Next
        </button>
      )}
    </>
  )
  const marks: CamelotMark[] = pick ? [{ code: pick.code, tone: pick.ok ? 'good' : 'bad' }] : []
  return (
    <div className="cam-cols">
      <CamelotWheel onSelect={(x) => !done && !pick?.ok && setPick({ code: x, ok: t.ok(x) })} highlight={marks} />
      <div className="cam-panel" aria-live="polite">
        <Swap k={`${i}-${pick?.code ?? ''}`}>
          {done ? (
            <>
              <p className="learn-lead">That's all five.</p>
              <p className="muted small">The quiz asks the same moves in words, with four options to pick from.</p>
              <div className="row">
                <button
                  onClick={() => {
                    setI(0)
                    setPick(null)
                  }}
                >
                  Again
                </button>
                <button className="primary" onClick={onQuiz}>
                  Start the quiz
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small tabular">
                {i + 1} of {TRIES.length}
              </p>
              <p className="learn-lead">{t.prompt}</p>
              {/* room for the longest answer line and Next, so the panel keeps its size and place */}
              <Reserve shape={[...ALL_KEYS.map((c) => feedback({ code: c, ok: false })), feedback({ code: '12B', ok: true })]}>{pick && feedback(pick)}</Reserve>
            </>
          )}
        </Swap>
      </div>
    </div>
  )
}

export function CamelotLearn({ onQuiz }: LearnProps) {
  const [mode, setMode] = useState<'explore' | 'try'>('explore')
  const [sel, setSel] = useState('8A')
  const boost = boostOf(sel)
  return (
    <div className="learn">
      <p className="learn-lead">Safe moves: stay on the same code, step one either way, or swap A and B.</p>
      <div className="seg-group learn-modes" role="group" aria-label="Mode">
        <button className={`seg${mode === 'explore' ? ' on' : ''}`} aria-pressed={mode === 'explore'} onClick={() => setMode('explore')}>
          Explore the wheel
        </button>
        <button className={`seg${mode === 'try' ? ' on' : ''}`} aria-pressed={mode === 'try'} onClick={() => setMode('try')}>
          Try it
        </button>
      </div>

      <Swap k={mode} hold>
        {mode === 'explore' ? (
          <div className="cam-cols">
            <CamelotWheel start={sel} onSelect={setSel} highlight={[{ code: boost, tone: 'boost' }]} />
            <div className="cam-panel" aria-live="polite">
              <p className="muted small">
                <span className="pointer-fine">Click any key.</span>
                <span className="pointer-touch">Tap any key.</span>
              </p>
              <Swap k={sel} hold>
                <p className="learn-lead">
                  {sel} · {keyName(sel)}
                </p>
                <ul className="cam-moves">
                  {movesOf(sel).map((m) => (
                    <li key={m.code}>
                      <span className="cam-code tabular">{m.code}</span>
                      <span>
                        {keyName(m.code)} <span className="muted">· {m.how}</span>
                      </span>
                    </li>
                  ))}
                  <li className="cam-boost">
                    <span className="cam-code tabular">{boost}</span>
                    <span>
                      {keyName(boost)} <span className="muted">· +2 boost, dashed: short blends only</span>
                    </span>
                  </li>
                </ul>
              </Swap>
            </div>
          </div>
        ) : (
          <CamelotTry onQuiz={onQuiz} />
        )}
      </Swap>

      <h3 className="learn-sub">How the wheel works</h3>
      <ol className="learn-rules">
        <li>
          <strong>Numbers 1 to 12 go round the wheel.</strong> <span className="muted">Each step is a fifth apart, so neighbours share most of their notes.</span>
        </li>
        <li>
          <strong>A is minor, on the inner ring. B is major, on the outer ring.</strong> <span className="muted">8A is A minor, 8B is C major.</span>
        </li>
        <li>
          <strong>Three safe moves: one step either way, or swap the letter.</strong> <span className="muted">Staying on the same code is safe too. These blend for as long as you like.</span>
        </li>
        <li>
          <strong>+2 is an energy boost, not a safe neighbour.</strong> <span className="muted">Two steps on lifts the mood, but the keys rub, so keep that blend short.</span>
        </li>
      </ol>

      <QuizFoot onQuiz={onQuiz} note="The quiz asks for a safe neighbour, a key's code, the +2 boost, or which transition clashes." />
    </div>
  )
}

// ---------- Signal Flow ----------

function SignalTry({ r, onNext }: { r: number; onNext?: () => void }) {
  const steps = ROUTINES[r].steps.map((s) => s.step)
  const [pool] = useState(() => shuffle(steps))
  const [done, setDone] = useState(0)
  const [wrong, setWrong] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  useEffect(() => {
    if (!wrong) return
    const t = window.setTimeout(() => setWrong(null), 900)
    return () => window.clearTimeout(t)
  }, [wrong])
  const choose = (s: string) => {
    if (s === steps[done]) {
      setDone(done + 1)
      setHint(false)
      setWrong(null)
    } else setWrong(s)
  }
  const complete = done >= steps.length
  return (
    <div className="sig-try">
      <p className="muted small">Click the steps in order. A right pick locks in.</p>
      {/* every step has its row from the start, and a placed chip leaves its slot: nothing below moves */}
      <ol className="sig-chain">
        {steps.map((s, k) =>
          k < done ? (
            <li key={s} className="fade-in">
              {s}
            </li>
          ) : (
            <li key={s} className="invisible" aria-hidden="true">
              {s}
            </li>
          ),
        )}
      </ol>
      {complete ? (
        <div className="row fade-in" role="status">
          <span>All {steps.length} in order.</span>
          {onNext && <button onClick={onNext}>Next routine</button>}
        </div>
      ) : (
        <>
          <div className="sig-pool">
            {pool.map((s) =>
              steps.slice(0, done).includes(s) ? (
                <button key={s} className="sig-chip invisible" aria-hidden="true" tabIndex={-1} disabled>
                  {s}
                </button>
              ) : (
                <button key={s} className={`sig-chip${wrong === s ? ' is-wrong' : ''}${hint && s === steps[done] ? ' is-hint' : ''}`} onClick={() => choose(s)}>
                  {s}
                </button>
              ),
            )}
          </div>
          <div className="row">
            <button className="ghost small" onClick={() => setHint(true)} disabled={hint}>
              Hint
            </button>
            <span className="muted small" aria-live="polite">
              {wrong ? `Not ${wrong} yet.` : hint ? 'The outlined step comes next.' : '\u00a0'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

export function SignalLearn({ onQuiz }: LearnProps) {
  const [r, setR] = useState(0)
  const [i, setI] = useState(0)
  const [trying, setTrying] = useState(false)
  const routine = ROUTINES[r]
  const last = routine.steps.length - 1
  const goRoutine = (x: number) => {
    setR(x)
    setI(0)
    setTrying(false)
  }
  useEffect(() => {
    if (trying) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || e.altKey || e.metaKey || e.ctrlKey) return
      if (e.key === 'ArrowRight') setI((x) => Math.min(last, x + 1))
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trying, last])
  const next = r + 1 < ROUTINES.length ? () => goRoutine(r + 1) : undefined
  return (
    <div className="learn">
      <div className="seg-group learn-modes" role="group" aria-label="Routine">
        {ROUTINES.map((x, k) => (
          <button key={x.title} className={`seg${k === r ? ' on' : ''}`} aria-pressed={k === r} onClick={() => goRoutine(k)}>
            {x.title}
          </button>
        ))}
      </div>

      <Swap k={`${r}-${trying}`} hold>
        <p className="learn-lead">{routine.title}</p>
        <p className="muted">{routine.about}</p>
        {trying ? (
          <SignalTry r={r} onNext={next} />
        ) : (
          <>
            {/* room for the whole routine with its longest note, so Next step does not move the buttons */}
            <Reserve
              shape={routine.steps.map((_, j) => (
                <ol key={j} className="sig-chain">
                  {routine.steps.map((s, k) => (
                    <li key={s.step}>
                      <span className="sig-step">{s.step}</span>
                      {k === j && <span className="sig-why muted small">{s.why}</span>}
                    </li>
                  ))}
                </ol>
              ))}
            >
              <ol className="sig-chain">
                {routine.steps.slice(0, i + 1).map((s, k) => (
                  <li key={s.step} className={k === i ? 'is-new fade-in' : undefined}>
                    <span className="sig-step">{s.step}</span>
                    {k === i && <span className="sig-why muted small">{s.why}</span>}
                  </li>
                ))}
              </ol>
            </Reserve>
            <div className="row sig-nav">
              <button onClick={() => setI(i - 1)} disabled={i === 0}>
                Back
              </button>
              {i < last ? (
                <button className="sig-next" onClick={() => setI(i + 1)}>
                  Next step
                </button>
              ) : (
                <button className="sig-next" onClick={() => setTrying(true)}>
                  Practise it
                </button>
              )}
              <span className="muted small tabular sig-count">
                Step <Value v={i + 1} /> of {routine.steps.length}
              </span>
            </div>
            {i < last ? (
              <button className="ghost small" onClick={() => setTrying(true)}>
                Practise this routine now
              </button>
            ) : (
              next && (
                <button className="ghost small" onClick={next}>
                  Next routine
                </button>
              )
            )}
          </>
        )}
        {trying && (
          <button className="ghost small" onClick={() => setTrying(false)}>
            Back to the walkthrough
          </button>
        )}
      </Swap>

      <QuizFoot onQuiz={onQuiz} note="The quiz gives you these routines with the steps shuffled. Put them back in order." />
    </div>
  )
}

// ---------- Set Builder ----------

const CRATE: SetTrack[] = [
  { name: 'Night Bus', bpm: 122, camelot: '8A', energy: 0.3 },
  { name: 'Glass Hours', bpm: 124, camelot: '9A', energy: 0.45 },
  { name: 'Copper Tide', bpm: 125, camelot: '9B', energy: 0.55 },
  { name: 'Halogen', bpm: 127, camelot: '10B', energy: 0.68 },
  { name: 'Sea Wall', bpm: 130, camelot: '12B', energy: 0.82 },
  { name: 'Slow Burn', bpm: 123, camelot: '8A', energy: 0.36 },
]
const e10 = (t: SetTrack) => Math.round(t.energy * 10)

function TrackLine({ t }: { t: SetTrack }) {
  return (
    <>
      <span className="name">{t.name}</span>
      <span className="tag tabular">{t.bpm}</span>
      <span className="tag tabular">{t.camelot}</span>
      <span className="learn-energy" aria-label={`Energy ${e10(t)} of 10`}>
        <i style={{ width: `${t.energy * 100}%` }} />
      </span>
    </>
  )
}

/** Why each part of transitionNote came out as it did, in the same order. */
function explainParts(a: SetTrack, b: SetTrack): string[] {
  const kc = keyCost(a.camelot, b.camelot)
  const ka = a.camelot!
  const kb = b.camelot!
  const key =
    kc === 0
      ? `Both are ${ka}: nothing to clash.`
      : kc <= 0.5
        ? `${kb} is a safe neighbour of ${ka} on the wheel.`
        : kc <= 1.5
          ? `${kb} is two steps on from ${ka}: it lifts the mood, but keep the blend short.`
          : `${kb} is not next to ${ka}. Safe from ${ka}: ${compatible(ka).slice(1).join(', ')}.`
  const p = tempoStep(a, b)
  const tempo = `${b.bpm} ÷ ${a.bpm} − 1 = ${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)} % of ${a.name}'s tempo. ${Math.abs(p) <= TEMPO_OK ? `Within ${TEMPO_OK} %, so the pitch fader hides it.` : `Over ${TEMPO_OK} %: the room hears the speed change.`}`
  const d = e10(b) - e10(a)
  const energy = d > 0 ? `Energy ${e10(a)} → ${e10(b)} of 10: the set keeps climbing.` : d < 0 ? `Energy ${e10(a)} → ${e10(b)} of 10: a sudden drop loses the floor.` : `Energy stays about ${e10(a)} of 10, which is fine.`
  return [key, tempo, energy]
}

export function SetLearn({ onQuiz }: LearnProps) {
  const [sel, setSel] = useState<SetTrack[]>([CRATE[0], CRATE[1]])
  const [showBest, setShowBest] = useState(false)
  const best = useMemo(() => scoreSet(CRATE).best, [])
  const [a, b] = sel
  const click = (t: SetTrack) => setSel(sel.length === 1 && t !== a ? [a, t] : [t])
  const bestOrder = (
    <>
      <p className="small">The best order for this crate:</p>
      <ol className="learn-best small">
        {best.map((t, k) => (
          <li key={t.name}>
            {t.name} <span className="muted tabular">{t.camelot} · {t.bpm}</span>
            {k > 0 && (
              <span className="muted">
                {' '}
                ·{' '}
                {transitionNote(best[k - 1], t).map((p, j) => (
                  <span key={p.text} className={p.bad ? 'note-bad' : undefined}>
                    {j > 0 && ', '}
                    {p.text}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ol>
    </>
  )
  return (
    <div className="learn">
      <ol className="learn-rules">
        <li>
          <strong>Compatible keys.</strong> <span className="muted">Same code, one step round the Camelot wheel, or swap the letter. +2 is allowed as a boost; anything further clashes.</span>
        </li>
        <li>
          <strong>Small tempo steps, {TEMPO_OK} % or less.</strong> <span className="muted">Measured as a share of the outgoing track's tempo.</span>
        </li>
        <li>
          <strong>Energy that builds without sudden drops.</strong> <span className="muted">Each track as strong as the last or stronger, and the set ends higher than it starts.</span>
        </li>
      </ol>

      <section className="learn-card" aria-label="Transition checker">
        <p className="learn-lead">Check a transition</p>
        <p className="muted small">Click a track to play first, then the one to mix into.</p>
        <ul className="learn-crate">
          {CRATE.map((t) => {
            const role = t === a ? 'A' : t === b ? 'B' : null
            return (
              <li key={t.name}>
                <button className={`set-row learn-track${role ? ' is-on' : ''}`} aria-pressed={!!role} onClick={() => click(t)}>
                  <span className="learn-role" aria-hidden>
                    {role ?? ''}
                  </span>
                  <TrackLine t={t} />
                  {role && <span className="sr-only">{role === 'A' ? ', playing first' : ', mixed in next'}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        <div aria-live="polite">
          <Swap k={sel.map((t) => t.name).join('>')} hold>
            {a && b ? (
              <div className="learn-check">
                <p className="small">
                  <span className="learn-pair">
                    {a.name} → {b.name}:
                  </span>{' '}
                  {transitionNote(a, b).map((p, j) => (
                    <span key={p.text}>
                      {j > 0 && <span className="muted">, </span>}
                      <span className={p.bad ? 'note-bad' : 'muted'}>{p.text}</span>
                    </span>
                  ))}
                </p>
                <ul className="learn-parts small">
                  {transitionNote(a, b).map((p, j) => (
                    <li key={p.text}>
                      <span className={p.bad ? 'note-bad' : undefined}>{p.text}</span>
                      <span className="muted">{explainParts(a, b)[j]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted small learn-check">{a.name} is first. Now click the track to mix into.</p>
            )}
          </Swap>
        </div>
      </section>

      <section className="learn-score">
        <p className="learn-lead">How the quiz scores</p>
        <p className="muted">
          You get six tracks with the calmest as a fixed opener. Your order is compared with every other order from that opener: the best scores 1000 and the worst 0, curved so that nearly best still scores well. Red notes are what cost points: key clashes, tempo jumps over {TEMPO_OK} % and energy drops.
        </p>
        {/* the list's room is kept under the button, so revealing it does not push the page down */}
        <Reserve shape={bestOrder}>{showBest ? <div className="fade-in">{bestOrder}</div> : <button onClick={() => setShowBest(true)}>Show the best order for this crate</button>}</Reserve>
      </section>

      <QuizFoot onQuiz={onQuiz} note="Three crates. Tap the tracks in the order you would play them." />
    </div>
  )
}
