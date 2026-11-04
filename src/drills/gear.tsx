import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Reserve, Swap, Value } from '../components/Swap'
import type { DrillProps, RunDetail } from './common'
import './gear.css'

/** One kind of control. Decks and channels repeat some kinds; clicking any copy counts. */
interface Kind {
  id: string
  name: string
  where: 'Deck' | 'Mixer'
  does: string
  tip: string
}

const KINDS: Kind[] = [
  { id: 'jog', name: 'Jog wheel', where: 'Deck', does: 'Nudges a playing track a little ahead or behind; press the top and it scrubs or scratches instead.', tip: 'For a small drift, give the outer rim a gentle push or drag rather than touching the tempo fader.' },
  { id: 'play', name: 'Play / pause', where: 'Deck', does: 'Starts and stops the deck.', tip: 'Start the incoming track so its first kick lands on the 1 of the playing track\'s bar.' },
  { id: 'cue', name: 'Cue', where: 'Deck', does: 'Jumps back to the cue point and waits there; hold it to preview from that spot.', tip: 'Set the cue on the first kick of a phrase, so every start begins in time.' },
  { id: 'sync', name: 'Sync', where: 'Deck', does: 'Matches this deck\'s tempo, and usually its beat grid, to the other deck.', tip: 'Sync trusts the grid it was given; your ears still have to check that the kicks land together.' },
  { id: 'pitch', name: 'Tempo fader', where: 'Deck', does: 'Speeds the track up or slows it down by a percentage.', tip: 'Move it in tiny steps and listen for a bar after each one, so you can hear which way the beats drift.' },
  { id: 'keylock', name: 'Key lock', where: 'Deck', does: 'Keeps the track in its original key when you change its tempo.', tip: 'Use it for big tempo changes so vocals don\'t go squeaky; for small changes you rarely need it.' },
  { id: 'pads', name: 'Hot cue pads', where: 'Deck', does: 'Each pad remembers a spot in the track and jumps straight to it.', tip: 'Mark the drop, the breakdown and the first vocal before the set, so you never hunt for them live.' },
  { id: 'loop', name: 'Loop controls', where: 'Deck', does: 'Set a loop\'s in and out points, or a loop of a set number of beats, and halve or double it.', tip: 'Loop the last clean bars of an outro to buy time when the next track isn\'t ready.' },
  { id: 'load', name: 'Load', where: 'Deck', does: 'Puts the track selected in your library onto this deck.', tip: 'Check which channel is up before you press it; loading onto the playing deck stops the music.' },
  { id: 'trim', name: 'Trim (gain)', where: 'Mixer', does: 'Sets how loud the track enters the channel, before the EQ and the fader.', tip: 'Match trims by the meters with both faders at the same height, so the swap doesn\'t jump in level.' },
  { id: 'eqhi', name: 'High EQ', where: 'Mixer', does: 'Boosts or cuts the top end: hats, cymbals and the air on vocals.', tip: 'Ease the incoming track\'s highs down at first so two sets of hats don\'t smear together.' },
  { id: 'eqmid', name: 'Mid EQ', where: 'Mixer', does: 'Boosts or cuts the middle: vocals, synths and the body of the snare.', tip: 'Two vocals at once fight; dip the mids on the one that should step back.' },
  { id: 'eqlow', name: 'Low EQ', where: 'Mixer', does: 'Boosts or cuts the bottom: kick and bassline.', tip: 'Play one bassline at a time: keep the incoming low cut and swap the lows on a phrase change.' },
  { id: 'filter', name: 'Filter', where: 'Mixer', does: 'One way removes lows, the other removes highs; straight up does nothing.', tip: 'A slow sweep on the outgoing track makes room for the new one without a hard cut.' },
  { id: 'chfader', name: 'Channel fader', where: 'Mixer', does: 'Sets this channel\'s volume in the mix.', tip: 'Bring the new track up over a phrase or two rather than in one grab.' },
  { id: 'xfader', name: 'Crossfader', where: 'Mixer', does: 'Blends between the channels on its left and right sides.', tip: 'For long blends, park it in the middle and mix on the channel faders; save it for quick cuts.' },
  { id: 'hpcue', name: 'Headphone cue', where: 'Mixer', does: 'Sends this channel to your headphones without sending it to the speakers.', tip: 'Cue the next track early, so you can check its beat while the room hears the other one.' },
  { id: 'hpmix', name: 'Headphone mix', where: 'Mixer', does: 'Blends between the cued channel and the master in your headphones.', tip: 'Set it near the middle while beatmatching to hear both decks at once.' },
  { id: 'hplevel', name: 'Headphone level', where: 'Mixer', does: 'Sets how loud your headphones are.', tip: 'Keep it lower than feels exciting; tired ears judge timing and EQ badly.' },
  { id: 'master', name: 'Master level', where: 'Mixer', does: 'Sets the overall output to the speakers or a recording.', tip: 'Leave headroom; if the meters hit red, bring the trims down instead of riding the master.' },
  { id: 'meters', name: 'Level meters', where: 'Mixer', does: 'Show how loud each channel is, or the master output.', tip: 'Aim for both channels to peak in the same place, just under the red.' },
  { id: 'beatfx', name: 'Beat FX', where: 'Mixer', does: 'Echo, delay, reverb and similar effects timed to the tempo, with a depth knob and an on button.', tip: 'Switch an effect on before a phrase ends and off on the 1 of the next, so it lands in time.' },
  { id: 'colourfx', name: 'Colour FX', where: 'Mixer', does: 'Chooses what each channel\'s filter knob does: a filter, an echo, noise and so on.', tip: 'Pick the effect before the transition; switching mid-sweep makes an audible jump.' },
]
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<string, Kind>

const STORE = 'openskool:gear-explored'
const ROUNDS = 10
const ROUND_MS = 6000

function loadExplored(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x in KIND) : []
  } catch {
    return []
  }
}

function useNarrow() {
  const q = '(max-width: 640px)'
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

type Round = { phase: 'ask' | 'right' | 'wrong' | 'timeout'; picked?: string }

/** Gear Lab's Learn step: explore the controller; its button hands over to the quiz. */
export function GearLearn({ onQuiz }: { onQuiz: () => void }) {
  return <GearLab source={{ kind: 'builtin', genre: 'house' }} onDone={() => {}} onQuiz={onQuiz} />
}

/** The find-it quiz, or with `onQuiz` the explore mode that leads to it. */
export function GearLab({ onDone, onQuiz }: DrillProps & { onQuiz?: () => void }) {
  const narrow = useNarrow()
  const [mode, setMode] = useState<'explore' | 'quiz'>(onQuiz ? 'explore' : 'quiz')
  const [sel, setSel] = useState<string | null>(null) // instance id, e.g. "trim@c1"
  const [explored, setExplored] = useState<string[]>(loadExplored)

  // quiz
  const [targets, setTargets] = useState<string[]>(() => (onQuiz ? [] : shuffle(KINDS.map((k) => k.id)).slice(0, ROUNDS)))
  const [i, setI] = useState(0)
  const [round, setRound] = useState<Round>({ phase: 'ask' })
  const [right, setRight] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [misses, setMisses] = useState<NonNullable<RunDetail['misses']>>([])
  const score = useRef(0)
  const started = useRef(0)
  const finished = useRef(false)

  const selKind = sel ? sel.split('@')[0] : null
  const target = mode === 'quiz' ? targets[i] : undefined

  const explore = useCallback((id: string) => {
    setSel(id)
    const k = id.split('@')[0]
    setExplored((e) => {
      if (e.includes(k)) return e
      const next = [...e, k]
      try {
        localStorage.setItem(STORE, JSON.stringify(next))
      } catch {
        /* storage full or blocked: progress just isn't kept */
      }
      return next
    })
  }, [])

  const startQuiz = () => {
    setTargets(shuffle(KINDS.map((k) => k.id)).slice(0, ROUNDS))
    setI(0)
    setRound({ phase: 'ask' })
    setRight(0)
    setStreak(0)
    setBestStreak(0)
    setMisses([])
    setSel(null)
    score.current = 0
    finished.current = false
    started.current = performance.now()
    setMode('quiz')
  }

  const answer = useCallback(
    (picked: string | null) => {
      if (!target || round.phase !== 'ask') return
      const kind = picked?.split('@')[0]
      if (kind === target) {
        const left = Math.max(0, 1 - (performance.now() - started.current) / ROUND_MS)
        // 70 for finding it, up to 30 more for finding it fast
        score.current += 70 + 30 * left
        setRight((r) => r + 1)
        setStreak(streak + 1)
        setBestStreak((b) => Math.max(b, streak + 1))
        setRound({ phase: 'right', picked: picked! })
      } else {
        setStreak(0)
        setMisses((m) => [...m, { prompt: `Find the ${KIND[target].name}`, picked: kind ? KIND[kind].name : 'Ran out of time', answer: KIND[target].name }])
        setRound(picked ? { phase: 'wrong', picked } : { phase: 'timeout' })
      }
    },
    [target, round.phase, streak],
  )

  // the clock for each round
  useEffect(() => {
    if (mode !== 'quiz' || round.phase !== 'ask') return
    started.current = performance.now()
    const t = window.setTimeout(() => answer(null), ROUND_MS)
    return () => window.clearTimeout(t)
  }, [mode, i, round.phase, answer])

  // after an answer: a short beat to see the result, then the next target or the end
  useEffect(() => {
    if (mode !== 'quiz' || round.phase === 'ask') return
    const t = window.setTimeout(
      () => {
        if (i + 1 < ROUNDS) {
          setI(i + 1)
          setRound({ phase: 'ask' })
        } else if (!finished.current) {
          finished.current = true
          onDone(Math.round(Math.min(1000, score.current)), { right, total: ROUNDS, bestStreak, misses })
        }
      },
      round.phase === 'right' ? 450 : 1400,
    )
    return () => window.clearTimeout(t)
  }, [mode, round.phase, i, right, bestStreak, misses, onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'explore') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const activate = mode === 'quiz' ? answer : explore

  // every instance's state class, accessible name and handlers
  const ctx: Ctx = {
    labels: mode === 'explore',
    stateOf: (id) => {
      const k = id.split('@')[0]
      if (mode === 'explore') return [sel === id && 'sel', explored.includes(k) && 'seen'].filter(Boolean).join(' ')
      if (round.phase === 'ask') return ''
      if (k === target) return round.phase === 'right' && round.picked !== id ? '' : round.phase === 'right' ? 'found' : 'target'
      return round.picked === id ? 'wrong' : ''
    },
    activate,
  }

  const about = (k: string) => (
    <div>
      <p className="eyebrow">{KIND[k].where}</p>
      <h2>{KIND[k].name}</h2>
      <p>{KIND[k].does}</p>
      <p className="muted">{KIND[k].tip}</p>
      <p className="muted small gear-hint">Esc to close</p>
    </div>
  )
  const intro = (
    <div>
      <p className="eyebrow">Explore</p>
      <h2>Pick a part</h2>
      <p className="muted">Click or tap any control, or Tab to it and press Enter, to see what it does and how it helps a mix.</p>
      {narrow && <p className="muted small">Deck 2 has the same controls as deck 1, so on a small screen only deck 1 is drawn.</p>}
    </div>
  )

  const W = narrow ? 664 : 1000
  const H = 560

  return (
    <div className={`gear ${mode}`}>
      {mode === 'quiz' && target && (
        <div className="gear-quiz-head">
          <div className="drill-meta">
            <span>
              Target <Value v={i + 1} /> of {ROUNDS}
            </span>
            <span>
              <Value v={right} /> found · streak <Value v={streak} />
            </span>
          </div>
          <Swap k={`${i}-${round.phase}`} className="gear-prompt-wrap">
            <h2 className="prompt gear-prompt" aria-live="polite">
              {round.phase === 'ask' && <>Find the {KIND[target].name}</>}
              {round.phase === 'right' && <span className="good">{KIND[target].name}: found</span>}
              {round.phase === 'wrong' && <span>That's the {KIND[round.picked!.split('@')[0]].name}.</span>}
              {round.phase === 'timeout' && <span>Time's up.</span>}
            </h2>
          </Swap>
          <div className="gear-clock" aria-hidden="true">
            <span key={i} className={round.phase === 'ask' ? '' : 'stop'} />
          </div>
        </div>
      )}

      <div className="gear-layout">
        <div className="gear-draw">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={mode === 'quiz' ? 'DJ controller: find the named part' : 'DJ controller: pick a part to learn what it does'}>
            <rect className="g-body" x={6} y={6} width={W - 12} height={H - 12} rx={14} />
            <line className="g-sep" x1={346} y1={20} x2={346} y2={H - 20} />
            {!narrow && <line className="g-sep" x1={654} y1={20} x2={654} y2={H - 20} />}
            <Deck n={1} x={0} ctx={ctx} />
            <Mixer ctx={ctx} />
            {!narrow && <Deck n={2} x={640} ctx={ctx} />}
          </svg>
        </div>

        {mode === 'explore' && (
          <aside className="gear-card card" aria-live="polite">
            {/* room for the longest explanation, so picking a part never moves Start quiz */}
            <Reserve className="gear-text" shape={[intro, ...KINDS.map((k) => about(k.id))]}>
              <Swap k={selKind ?? 'none'}>{selKind ? about(selKind) : intro}</Swap>
            </Reserve>
            <div className="gear-foot">
              <span className="muted small tabular">
                <Value v={explored.length} w={2} /> of {KINDS.length} explored
              </span>
              <button className="primary" onClick={onQuiz ?? startQuiz}>
                Start quiz
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

interface Ctx {
  labels: boolean
  stateOf: (id: string) => string
  activate: (id: string) => void
}

// fixed numbering for the unnamed controls during the quiz
const DECK_ORDER = ['load', 'loop', 'jog', 'pitch', 'keylock', 'sync', 'cue', 'play', 'pads']
const CHANNEL_ORDER = ['trim', 'eqhi', 'eqmid', 'eqlow', 'filter', 'hpcue', 'chfader']
const CENTRE_ORDER = ['master', 'meters', 'colourfx', 'hpmix', 'hplevel', 'beatfx', 'xfader']

type Hit = { x: number; y: number; w: number; h: number } | { cx: number; cy: number; r: number }

/** One clickable, focusable control: an invisible hit area (also the focus ring) plus its drawing. */
function Part({ ctx, kind, at, area, hit, label, children }: { ctx: Ctx; kind: string; at: string; area: string; hit: Hit; label?: ReactNode; children: ReactNode }) {
  const id = `${kind}@${at}`
  const n = (at.startsWith('d') ? DECK_ORDER : at.startsWith('c') ? CHANNEL_ORDER : CENTRE_ORDER).indexOf(kind) + 1
  const name = ctx.labels ? `${KIND[kind].name}, ${area}` : `${area}, control ${n}`
  return (
    <g
      className={`part ${ctx.stateOf(id)}`}
      tabIndex={0}
      role="button"
      aria-label={name}
      onClick={() => ctx.activate(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ctx.activate(id)
        }
      }}
    >
      {'r' in hit ? <circle className="hit" cx={hit.cx} cy={hit.cy} r={hit.r} /> : <rect className="hit" x={hit.x} y={hit.y} width={hit.w} height={hit.h} rx={6} />}
      <g className="shape">{children}</g>
      {ctx.labels && label}
    </g>
  )
}

const Lbl = ({ x, y, children, anchor = 'middle' }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end' }) => (
  <text className="lbl" x={x} y={y} textAnchor={anchor}>
    {children}
  </text>
)

/** A round knob with its pointer at `deg` (0 = straight up). */
const Knob = ({ cx, cy, r, deg = 0 }: { cx: number; cy: number; r: number; deg?: number }) => {
  const a = (deg * Math.PI) / 180
  return (
    <>
      <circle className="s" cx={cx} cy={cy} r={r} />
      <line className="s ink" x1={cx + Math.sin(a) * r * 0.3} y1={cy - Math.cos(a) * r * 0.3} x2={cx + Math.sin(a) * r * 0.85} y2={cy - Math.cos(a) * r * 0.85} />
    </>
  )
}

function Deck({ n, x, ctx }: { n: 1 | 2; x: number; ctx: Ctx }) {
  const at = `d${n}`
  const area = `deck ${n}`
  const p = { ctx, at, area }
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, k) => (k / 48) * Math.PI * 2), [])
  return (
    <g transform={`translate(${x} 0)`}>
      <text className="g-deck" x={135} y={48} textAnchor="middle">
        {n}
      </text>

      <Part {...p} kind="load" hit={{ x: 24, y: 14, w: 88, h: 56 }}>
        <rect className="s" x={36} y={30} width={64} height={26} rx={4} />
        <text className="cap" x={68} y={47} textAnchor="middle">LOAD</text>
      </Part>

      <Part {...p} kind="loop" hit={{ x: 160, y: 18, w: 152, h: 52 }} label={<Lbl x={170} y={26} anchor="start">LOOP</Lbl>}>
        <rect className="s" x={170} y={32} width={40} height={24} rx={4} />
        <text className="cap" x={190} y={48} textAnchor="middle">IN</text>
        <rect className="s" x={216} y={32} width={40} height={24} rx={4} />
        <text className="cap" x={236} y={48} textAnchor="middle">OUT</text>
        <Knob cx={288} cy={44} r={14} />
      </Part>

      <Part {...p} kind="jog" hit={{ cx: 170, cy: 212, r: 114 }}>
        <circle className="s open" cx={170} cy={212} r={110} />
        <circle className="s faint" cx={170} cy={212} r={96} />
        {ticks.map((t, k) => (
          <line key={k} className="s faint" x1={170 + Math.sin(t) * 96} y1={212 - Math.cos(t) * 96} x2={170 + Math.sin(t) * (k % 4 ? 101 : 106)} y2={212 - Math.cos(t) * (k % 4 ? 101 : 106)} />
        ))}
        <circle className="s open" cx={170} cy={212} r={62} />
        <line className="s ink" x1={170} y1={160} x2={170} y2={176} />
        <circle className="s faint" cx={170} cy={212} r={14} />
      </Part>

      <Part {...p} kind="pitch" hit={{ x: 286, y: 74, w: 54, h: 240 }} label={<Lbl x={314} y={88}>TEMPO</Lbl>}>
        <rect className="s faint" x={311} y={98} width={6} height={206} rx={3} />
        {Array.from({ length: 11 }, (_, k) => (
          <line key={k} className="s faint" x1={k === 5 ? 294 : 298} y1={100 + k * 20} x2={304} y2={100 + k * 20} />
        ))}
        <rect className="s fill" x={297} y={188} width={34} height={16} rx={3} />
        <line className="s ink" x1={300} y1={196} x2={328} y2={196} />
      </Part>

      <Part {...p} kind="keylock" hit={{ x: 286, y: 318, w: 54, h: 50 }}>
        <rect className="s" x={292} y={331} width={44} height={24} rx={4} />
        <text className="cap" x={314} y={347} textAnchor="middle">KEY</text>
      </Part>

      <Part {...p} kind="sync" hit={{ x: 286, y: 370, w: 54, h: 50 }}>
        <rect className="s" x={292} y={383} width={44} height={24} rx={4} />
        <text className="cap" x={314} y={399} textAnchor="middle">SYNC</text>
      </Part>

      <Part {...p} kind="cue" hit={{ x: 28, y: 388, w: 64, h: 64 }}>
        <circle className="s" cx={60} cy={420} r={25} />
        <text className="cap" x={60} y={424} textAnchor="middle">CUE</text>
      </Part>

      <Part {...p} kind="play" hit={{ x: 28, y: 456, w: 64, h: 64 }}>
        <circle className="s" cx={60} cy={488} r={25} />
        <path className="s ink" d="M51 480 L60 488 L51 496 Z M64 480 V496 M69 480 V496" />
      </Part>

      <Part {...p} kind="pads" hit={{ x: 100, y: 418, w: 194, h: 96 }} label={<Lbl x={104} y={432} anchor="start">HOT CUE</Lbl>}>
        {Array.from({ length: 8 }, (_, k) => (
          <rect key={k} className="s" x={104 + (k % 4) * 48} y={440 + Math.floor(k / 4) * 40} width={42} height={34} rx={4} />
        ))}
      </Part>
    </g>
  )
}

function Mixer({ ctx }: { ctx: Ctx }) {
  const channel = (c: 1 | 2, x: number) => {
    const p = { ctx, at: `c${c}`, area: `mixer channel ${c}` }
    const knob = (kind: string, cy: number, label: string, r = 15, deg = 0) => (
      <Part {...p} kind={kind} hit={{ x: x - 31, y: cy - 31, w: 62, h: 54 }} label={<Lbl x={x} y={cy - r - 5}>{label}</Lbl>}>
        <Knob cx={x} cy={cy} r={r} deg={deg} />
      </Part>
    )
    return (
      <g key={c}>
        {knob('trim', 62, 'TRIM', 15, 30)}
        {knob('eqhi', 117, 'HI')}
        {knob('eqmid', 172, 'MID')}
        {knob('eqlow', 227, 'LOW')}
        {knob('filter', 286, 'FILTER', 17)}
        <Part {...p} kind="hpcue" hit={{ x: x - 31, y: 311, w: 62, h: 52 }}>
          <rect className="s" x={x - 20} y={326} width={40} height={22} rx={4} />
          <path className="s ink" d={`M${x - 7} ${341} v-4 a7 7 0 0 1 14 0 v4`} />
          <rect className="s ink" x={x - 9} y={338} width={4} height={6} rx={1} />
          <rect className="s ink" x={x + 5} y={338} width={4} height={6} rx={1} />
        </Part>
        <Part {...p} kind="chfader" hit={{ x: x - 31, y: 364, w: 62, h: 128 }}>
          <rect className="s faint" x={x - 3} y={372} width={6} height={112} rx={3} />
          {Array.from({ length: 6 }, (_, k) => (
            <line key={k} className="s faint" x1={x + 10} y1={376 + k * 21} x2={x + 16} y2={376 + k * 21} />
          ))}
          <rect className="s fill" x={x - 17} y={398} width={34} height={14} rx={3} />
          <line className="s ink" x1={x - 13} y1={405} x2={x + 13} y2={405} />
        </Part>
      </g>
    )
  }
  const p = { ctx, at: 'm', area: 'mixer' }
  return (
    <g>
      {channel(1, 435)}
      {channel(2, 565)}

      <Part {...p} kind="master" hit={{ x: 467, y: 28, w: 66, h: 56 }} label={<Lbl x={500} y={40}>MASTER</Lbl>}>
        <Knob cx={500} cy={62} r={15} deg={60} />
      </Part>

      <Part {...p} kind="meters" hit={{ x: 467, y: 88, w: 66, h: 150 }}>
        {Array.from({ length: 24 }, (_, k) => {
          const col = k % 2
          const row = Math.floor(k / 2)
          // a static reading: lower segments lit in ink, the top ones empty
          const lit = row >= (col ? 5 : 4)
          return <rect key={k} className={lit ? 's seg-lit' : 's faint'} x={col ? 504 : 486} y={98 + row * 11} width={10} height={7} rx={1} />
        })}
      </Part>

      <Part {...p} kind="colourfx" hit={{ x: 467, y: 240, w: 66, h: 64 }} label={<Lbl x={500} y={252}>COLOUR FX</Lbl>}>
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} className="s" x={477 + (k % 2) * 25} y={262 + Math.floor(k / 2) * 20} width={21} height={14} rx={3} />
        ))}
      </Part>

      <Part {...p} kind="hpmix" hit={{ x: 467, y: 306, w: 66, h: 52 }} label={<Lbl x={500} y={318}>CUE/MST</Lbl>}>
        <Knob cx={500} cy={337} r={12} deg={-40} />
      </Part>

      <Part {...p} kind="hplevel" hit={{ x: 467, y: 360, w: 66, h: 52 }} label={<Lbl x={500} y={372}>PHONES</Lbl>}>
        <Knob cx={500} cy={391} r={12} deg={20} />
      </Part>

      <Part {...p} kind="beatfx" hit={{ x: 467, y: 414, w: 66, h: 80 }} label={<Lbl x={500} y={426}>BEAT FX</Lbl>}>
        <path className="s ink" d="M478 437 l-5 4 l5 4 M522 437 l5 4 l-5 4" />
        <Knob cx={500} cy={444} r={12} deg={-60} />
        <rect className="s" x={482} y={466} width={36} height={20} rx={4} />
        <text className="cap" x={500} y={480} textAnchor="middle">ON</text>
      </Part>

      <Part {...p} kind="xfader" hit={{ x: 425, y: 496, w: 150, h: 56 }}>
        <rect className="s faint" x={440} y={522} width={120} height={6} rx={3} />
        <line className="s faint" x1={500} y1={510} x2={500} y2={516} />
        <rect className="s fill" x={493} y={510} width={14} height={30} rx={3} />
        <line className="s ink" x1={500} y1={514} x2={500} y2={536} />
      </Part>
    </g>
  )
}
