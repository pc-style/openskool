// Two practice decks and a DJ mixer. HTML audio elements give key lock (preservesPitch) for free.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ac, out, djFilter, eq3 } from '../audio/engine'
import { GENRES, type Genre } from '../audio/synth'
import { Swap } from '../components/Swap'
import { DitherWave } from '../components/viz/meters'
import { groove } from '../lib/clips'
import { readyTracks, useTracks } from '../lib/library'
import { recordEvent } from '../lib/progress'
import { get } from 'idb-keyval'

interface Loaded {
  name: string
  url: string
  bpm: number
  anchor: number
  peaks?: number[]
}

function wav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels
  const n = buf.length
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  data.setUint32(4, 36 + n * ch * 2, true)
  w(8, 'WAVEfmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, ch, true)
  data.setUint32(24, buf.sampleRate, true)
  data.setUint32(28, buf.sampleRate * ch * 2, true)
  data.setUint16(32, ch * 2, true)
  data.setUint16(34, 16, true)
  w(36, 'data')
  data.setUint32(40, n * ch * 2, true)
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 0x7fff, true)
      o += 2
    }
  return new Blob([data], { type: 'audio/wav' })
}

interface Channel {
  el: HTMLAudioElement
  trim: GainNode
  eq: ReturnType<typeof eq3>
  filter: ReturnType<typeof djFilter>
  fader: GainNode
  xf: GainNode
  meter: AnalyserNode
}

function makeChannel(master: AudioNode): Channel {
  const c = ac()
  const el = new Audio()
  el.crossOrigin = 'anonymous'
  el.preservesPitch = true
  const src = c.createMediaElementSource(el)
  const trim = c.createGain()
  const eq = eq3(c)
  const filter = djFilter(c)
  const fader = c.createGain()
  const xf = c.createGain()
  const meter = c.createAnalyser()
  meter.fftSize = 512
  src.connect(trim).connect(eq.input)
  eq.output.connect(filter.input)
  filter.output.connect(fader).connect(xf).connect(master)
  fader.connect(meter)
  return { el, trim, eq, filter, fader, xf, meter }
}

type Mix = { trim: number; high: number; mid: number; low: number; filter: number; fader: number }
const FLAT: Mix = { trim: 0, high: 0, mid: 0, low: 0, filter: 0, fader: 0.8 }

// knob rows of the channel strip: key, label, min, max, drag step, keyboard step
const KNOBS = [
  ['trim', 'Trim', -12, 12, 0.5, 1],
  ['high', 'High', -40, 6, 0.5, 1],
  ['mid', 'Mid', -40, 6, 0.5, 1],
  ['low', 'Low', -40, 6, 0.5, 1],
  ['filter', 'Filter', -1, 1, 0.01, 0.05],
] as const

const knobText = (k: keyof Mix, v: number) => {
  if (k === 'filter') return v < -0.02 ? `LP ${Math.round(-v * 100)}` : v > 0.02 ? `HP ${Math.round(v * 100)}` : 'Off'
  if (k !== 'trim' && v <= -40) return 'Kill'
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`
}

const NARROW = '(max-width: 560px)'

export function Decks() {
  // the audio graph is built once; it is only wired to the output while the page is mounted
  const [{ master, chans }] = useState(() => {
    const master = ac().createGain()
    master.gain.value = 0.9
    return { master, chans: [makeChannel(master), makeChannel(master)] }
  })
  const [xf, setXf] = useState(0)
  // phones show one panel at a time; every panel stays mounted, so a deck keeps playing while you look at another
  const [view, setView] = useState<'a' | 'mix' | 'b'>('a')
  const [mix, setMix] = useState<[Mix, Mix]>([FLAT, FLAT])
  useEffect(() => {
    master.connect(out())
    return () => {
      for (const ch of chans) {
        ch.el.pause()
        ch.el.src = ''
      }
      master.disconnect()
    }
  }, [master, chans])
  useEffect(() => {
    // constant-power crossfader
    const x = (xf + 1) / 2
    const gains = [Math.cos((x * Math.PI) / 2), Math.cos(((1 - x) * Math.PI) / 2)]
    chans.forEach((ch, i) => (ch.xf.gain.value = gains[i]))
  }, [xf, chans])
  useEffect(() => {
    chans.forEach((ch, i) => {
      const m = mix[i]
      ch.trim.gain.value = 10 ** (m.trim / 20)
      ch.eq.low.gain.value = m.low
      ch.eq.mid.gain.value = m.mid
      ch.eq.high.gain.value = m.high
      ch.filter.set(m.filter, ac().currentTime)
      ch.fader.gain.value = m.fader ** 2
    })
  }, [mix, chans])
  const decks = useRef<(DeckApi | null)[]>([null, null])
  const loaded = useRef([false, false])
  const set = (i: number, k: keyof Mix, v: number) => setMix((m) => m.map((x, j) => (j === i ? { ...x, [k]: v } : x)) as [Mix, Mix])
  const onLoaded = (i: number) => {
    loaded.current[i] = true
    if (loaded.current[0] && loaded.current[1]) recordEvent('decks:two-loaded')
  }
  const deck = (i: number) => (
    <Deck
      key={i}
      side={i ? 'B' : 'A'}
      ch={chans[i]}
      register={(api) => (decks.current[i] = api)}
      other={() => decks.current[1 - i]}
      onLoaded={() => onLoaded(i)}
    />
  )
  return (
    <div className="decks-page">
      <h1>Decks</h1>
      <p className="muted page-intro">Two decks and a mixer for practising blends. Use headphones or speakers.</p>
      <div className="seg-group deck-tabs" role="group" aria-label="Show">
        {(
          [
            ['a', 'Deck A'],
            ['mix', 'Mixer'],
            ['b', 'Deck B'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className={view === v ? 'seg on' : 'seg'} aria-pressed={view === v} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="decks" data-view={view}>
        {deck(0)}
        <section className="mixer" aria-label="Mixer">
          <div className="strips">
            <span className="strip-side">A</span>
            <span />
            <span className="strip-side">B</span>
            {KNOBS.map(([k, label, mn, mx, step, keyStep]) => (
              <Fragment key={k}>
                {[0, 1].map((i) => {
                  const knob = (
                    <Knob
                      key={i}
                      label={`${label}, deck ${i ? 'B' : 'A'}`}
                      value={mix[i][k]}
                      min={mn}
                      max={mx}
                      step={step}
                      keyStep={keyStep}
                      text={knobText(k, mix[i][k])}
                      kill={k !== 'trim' && k !== 'filter' && mix[i][k] <= -40}
                      onChange={(v) => set(i, k, v)}
                    />
                  )
                  return i ? knob : [knob, <span key="l" className="strip-label">{label}</span>]
                })}
              </Fragment>
            ))}
            {[0, 1].map((i) => {
              const channel = (
                <div key={i} className="channel">
                  {i ? <LevelMeter ch={chans[i]} label="Level, deck B" /> : null}
                  <Fader
                    vertical
                    label={`Channel fader, deck ${i ? 'B' : 'A'}`}
                    value={mix[i].fader}
                    min={0}
                    max={1}
                    step={0.01}
                    keyStep={0.05}
                    text={`${Math.round(mix[i].fader * 100)}%`}
                    onChange={(v) => set(i, 'fader', v)}
                  />
                  {i ? null : <LevelMeter ch={chans[i]} label="Level, deck A" />}
                </div>
              )
              return i ? channel : [channel, <span key="l" className="strip-label fader-label">Fader</span>]
            })}
          </div>
          <div className="xfader">
            <span>A</span>
            <Fader label="Crossfader" value={xf} min={-1} max={1} step={0.01} keyStep={0.05} reset={0} detent text={xf === 0 ? 'Centre' : xf < 0 ? `A ${Math.round(-xf * 100)}%` : `B ${Math.round(xf * 100)}%`} onChange={setXf} />
            <span>B</span>
          </div>
        </section>
        {deck(1)}
      </div>
    </div>
  )
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
 * A rotary knob with its zero at twelve o'clock. Drag up or down, use the arrow keys, double-click
 * to reset. The arc runs from zero to the value, so a cut reads to the left and a boost to the right.
 */
function Knob({
  label,
  value,
  min,
  max,
  step,
  keyStep,
  text,
  kill,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  keyStep: number
  text: string
  kill?: boolean
  onChange: (v: number) => void
}) {
  const toF = (v: number) => (v < 0 ? 0.5 * (1 - v / min) : 0.5 + 0.5 * (v / max))
  const fromF = (f: number) => {
    const g = clamp(f, 0, 1)
    const v = g < 0.5 ? min * (1 - g / 0.5) : ((g - 0.5) / 0.5) * max
    return clamp(Math.round(v / step) * step, min, max)
  }
  const f = toF(value)
  const ang = -135 + f * 270
  const drag = useRef<{ y: number; f: number } | null>(null)
  const pt = (a: number, r = 19) => `${20 + r * Math.sin((a * Math.PI) / 180)} ${20 - r * Math.cos((a * Math.PI) / 180)}`
  const arc = (a0: number, a1: number) => `M${pt(a0)}A19 19 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`
  return (
    <div className="knob-wrap">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className={`knob ${kill ? 'kill' : ''}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, f }
        }}
        onPointerMove={(e) => {
          if (drag.current) onChange(fromF(drag.current.f + (drag.current.y - e.clientY) / 160))
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          const d = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 } as Record<string, number>)[e.key]
          let v: number | null = d ? clamp(Math.round((value + d * keyStep) / step) * step, min, max) : null
          if (e.key === 'Home') v = min
          if (e.key === 'End') v = max
          if (e.key === '0' || e.key === 'Delete') v = 0
          if (v === null) return
          e.preventDefault()
          onChange(v)
        }}
      >
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d={arc(-135, 135)} className="knob-track" />
          {Math.abs(ang) > 0.5 && <path d={ang > 0 ? arc(0, ang) : arc(ang, 0)} className="knob-value" />}
        </svg>
        <span className="knob-cap" style={{ transform: `rotate(${ang}deg)` }}>
          <i />
        </span>
      </div>
      <small className="num">{text}</small>
    </div>
  )
}

/** A fader with a cap you grab. Click or drag anywhere on it, arrow keys step, double-click resets when `reset` is set. */
function Fader({
  label,
  value,
  min,
  max,
  step,
  keyStep,
  text,
  onChange,
  vertical,
  reset,
  detent,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  keyStep: number
  text: string
  onChange: (v: number) => void
  vertical?: boolean
  reset?: number
  detent?: boolean
}) {
  const rail = useRef<HTMLDivElement>(null)
  const down = useRef(false)
  const f = clamp((value - min) / (max - min), 0, 1)
  const snap = (v: number) => clamp(Math.round(v / step) * step, min, max)
  const at = (e: React.PointerEvent) => {
    const r = rail.current!.getBoundingClientRect()
    const g = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
    onChange(snap(min + clamp(g, 0, 1) * (max - min)))
  }
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      className={`fader ${vertical ? 'v' : 'h'} ${detent ? 'detent' : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        down.current = true
        at(e)
      }}
      onPointerMove={(e) => down.current && at(e)}
      onPointerUp={() => (down.current = false)}
      onPointerCancel={() => (down.current = false)}
      onDoubleClick={() => reset !== undefined && onChange(reset)}
      onKeyDown={(e) => {
        const d = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 } as Record<string, number>)[e.key]
        let v: number | null = d ? snap(value + d * keyStep) : null
        if (e.key === 'Home') v = min
        if (e.key === 'End') v = max
        if (reset !== undefined && (e.key === '0' || e.key === 'Delete')) v = reset
        if (v === null) return
        e.preventDefault()
        onChange(v)
      }}
    >
      <div ref={rail} className="rail">
        <span className="cap" style={vertical ? { bottom: `${f * 100}%` } : { left: `${f * 100}%` }} />
      </div>
    </div>
  )
}

const SEGMENTS = 14
/** Peak level as a column of segments, 3 dB apart; the top one marks clipping. */
function LevelMeter({ ch, label }: { ch: Channel; label: string }) {
  const [lit, setLit] = useState(0)
  useEffect(() => {
    let raf = 0
    const buf = new Float32Array(512)
    const tick = () => {
      ch.meter.getFloatTimeDomainData(buf)
      let pk = 0
      for (const v of buf) pk = Math.max(pk, Math.abs(v))
      const db = 20 * Math.log10(Math.max(pk, 1e-6))
      setLit(pk > 0.98 ? SEGMENTS : clamp(Math.floor((db + 3 * SEGMENTS) / 3), 0, SEGMENTS - 1))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ch])
  return (
    <div className="level" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={SEGMENTS} aria-valuenow={lit}>
      {Array.from({ length: SEGMENTS }, (_, k) => (
        <i key={k} className={k < lit ? (k === SEGMENTS - 1 ? 'on clip' : 'on') : ''} />
      ))}
    </div>
  )
}

interface DeckApi {
  bpmNow: () => number
  /** Beat position within the bar, 0..4, or null. */
  beatPos: () => number | null
}

function Deck({
  side,
  ch,
  register,
  other,
  onLoaded,
}: {
  side: string
  ch: Channel
  register: (a: DeckApi) => void
  other: () => DeckApi | null
  onLoaded: () => void
}) {
  useTracks()
  // phones give the overview less height, so the crossfader stays above the tab bar
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches)
  useEffect(() => {
    const m = matchMedia(NARROW)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  const [t, setT] = useState<Loaded | null>(null)
  const picker = useRef<HTMLSelectElement>(null)
  const [pitch, setPitch] = useState(0)
  const [keylock, setKeylock] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [cue, setCue] = useState(0)
  const [hot, setHot] = useState<(number | null)[]>([null, null, null, null])
  const [loop, setLoop] = useState<{ a: number; b: number; beats: number } | null>(null)
  const rate = 1 + pitch / 100
  // the deck's audio element lives outside React; handlers and effects drive it through this ref
  const el = useRef(ch.el)
  // the latest render's values, for the animation loop and the other deck's sync
  const live = useRef({ t, loop, rate })
  useLayoutEffect(() => {
    live.current = { t, loop, rate }
  })

  useLayoutEffect(() => {
    register({
      bpmNow: () => (live.current.t ? live.current.t.bpm * live.current.rate : 0),
      beatPos: () => {
        const tt = live.current.t
        if (!tt) return null
        const b = ((el.current.currentTime - tt.anchor) * tt.bpm) / 60
        return ((b % 4) + 4) % 4
      },
    })
  }, [register, ch])

  useEffect(() => {
    el.current.playbackRate = rate
    el.current.preservesPitch = keylock
  }, [rate, keylock, ch])

  useEffect(() => {
    const frame = { id: 0 }
    const tick = () => {
      const l = live.current.loop
      if (l && el.current.currentTime >= l.b) el.current.currentTime = l.a + (el.current.currentTime - l.b)
      setPos(el.current.currentTime)
      frame.id = requestAnimationFrame(tick)
    }
    frame.id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.id)
  }, [ch])

  const load = async (v: string) => {
    el.current.pause()
    setPlaying(false)
    setLoop(null)
    setHot([null, null, null, null])
    if (v.startsWith('g:')) {
      const g = v.slice(2) as Genre
      const buf = await groove(g, 1, 'standard', 64)
      const d = buf.getChannelData(0)
      const step = Math.floor(d.length / 800)
      const peaks = Array.from({ length: 800 }, (_, i) => {
        let m = 0
        for (let j = i * step; j < (i + 1) * step; j += 8) m = Math.max(m, Math.abs(d[j]))
        return m
      })
      setT({ name: `${GENRES[g].name} groove`, url: URL.createObjectURL(wav(buf)), bpm: GENRES[g].bpm, anchor: 0, peaks })
      setCue(0)
    } else {
      const tr = readyTracks().find((x) => x.id === v)
      const blob = (await get(`file:${v}`)) as Blob | undefined
      if (!tr || !blob) return
      setT({ name: tr.name, url: URL.createObjectURL(blob), bpm: tr.analysis!.bpm, anchor: tr.analysis!.anchor, peaks: tr.analysis!.peaks })
      setCue(Math.max(0, tr.analysis!.anchor))
    }
    onLoaded()
  }
  useEffect(() => {
    if (!t) return
    el.current.src = t.url
    el.current.currentTime = Math.max(0, t.anchor)
    return () => URL.revokeObjectURL(t.url)
  }, [t, ch])

  const beat = t ? 60 / t.bpm : 0.5
  const snap = (x: number) => (t ? t.anchor + Math.round((x - t.anchor) / beat) * beat : x)
  const toggle = () => {
    ac()
    if (el.current.paused) {
      void el.current.play()
      setPlaying(true)
    } else {
      el.current.pause()
      setPlaying(false)
    }
  }
  const sync = () => {
    const o = other()
    if (!o || !t || !o.bpmNow()) return
    setPitch(Math.max(-16, Math.min(16, (o.bpmNow() / t.bpm - 1) * 100)))
    const ob = o.beatPos()
    const mb = ((((el.current.currentTime - t.anchor) / beat) % 4) + 4) % 4
    if (ob !== null) {
      let d = ob - mb
      if (d > 2) d -= 4
      if (d < -2) d += 4
      el.current.currentTime += d * beat
    }
  }
  const nudge = (d: number) => {
    el.current.playbackRate = rate * (1 + d * 0.04)
  }
  const unnudge = () => {
    el.current.playbackRate = rate
  }
  const setLoopBeats = (n: number) => {
    if (loop?.beats === n) return setLoop(null)
    const a = snap(el.current.currentTime - beat / 2)
    setLoop({ a, b: a + n * beat, beats: n })
  }
  // a small epsilon so a playhead parked exactly on a grid line counts as that beat
  const bp = t ? ((((pos - t.anchor + 0.002) / beat) % 4) + 4) % 4 : -1
  const bar = t ? Math.floor((pos - t.anchor + 0.002) / (beat * 4)) : 0
  const dur = ch.el.duration || 1
  const pitchText = `${pitch >= 0 ? '+' : '−'}${Math.abs(pitch).toFixed(2)}%`
  return (
    <section className={`deck deck-${side.toLowerCase()}${t ? '' : ' empty'}`} aria-label={`Deck ${side}`}>
      <header className="deck-head">
        <span className="deck-side">{side}</span>
        <div className="deck-title">
          <Swap k={t?.name ?? ''}>{t ? t.name : <span className="muted">No track</span>}</Swap>
        </div>
        <select ref={picker} className={t ? 'ghost' : undefined} onChange={(e) => void load(e.target.value)} value="" aria-label={`Load deck ${side}`}>
          <option value="" disabled>
            {t ? 'Change…' : 'Load…'}
          </option>
          <optgroup label="My tracks">
            {readyTracks().map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Built-in">
            {(Object.keys(GENRES) as Genre[]).map((g) => (
              <option key={g} value={`g:${g}`}>
                {GENRES[g].name} groove
              </option>
            ))}
          </optgroup>
        </select>
      </header>
      <div className="deck-wave">
        {t?.peaks ? (
          <DitherWave
            peaks={t.peaks}
            height={narrow ? 112 : 176}
            progress={pos / dur}
            head
            window={loop ? [loop.a / dur, loop.b / dur] : undefined}
            label={`${t.name} overview. Click to jump.`}
            onSeek={(fr) => (el.current.currentTime = fr * dur)}
          />
        ) : (
          <div className="deck-wave-empty muted small">
            No track loaded
            {/* the deck's one action, here where the track will appear; it opens the same picker as the header */}
            <button
              className="primary small"
              onClick={() => {
                const s = picker.current
                if (!s) return
                s.focus()
                try {
                  s.showPicker()
                } catch {
                  // older browsers: the focused select is the fallback
                }
              }}
            >
              Load track
            </button>
          </div>
        )}
      </div>
      <div className="deck-info">
        <div className="beats" aria-label={t ? `Beat ${Math.floor(bp) + 1} of bar ${bar + 1}` : 'No track'}>
          {[0, 1, 2, 3].map((k) => (
            <i key={k} className={Math.floor(bp) === k ? (k === 0 ? 'on one' : 'on') : ''} />
          ))}
          <span className="num">Bar {t ? bar + 1 : '—'}</span>
        </div>
        <div className="deck-bpm num">
          {t ? (t.bpm * rate).toFixed(2) : '—'}
          <span className="muted"> BPM</span>
        </div>
      </div>
      <div className="pitch-row">
        <span className="muted small">Pitch</span>
        <Fader label={`Pitch, deck ${side}`} value={pitch} min={-8} max={8} step={0.01} keyStep={0.1} reset={0} detent text={pitchText} onChange={setPitch} />
        <span className="num small pitch-val">{pitchText}</span>
        <button className="toggle" aria-pressed={keylock} onClick={() => setKeylock(!keylock)}>
          <i aria-hidden="true" />
          Key lock
        </button>
      </div>
      <div className="transport">
        <div className="btn-group">
          <button className="primary play" onClick={toggle} disabled={!t} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            onClick={() => {
              if (playing) {
                el.current.pause()
                setPlaying(false)
                el.current.currentTime = cue
              } else setCue(snap(el.current.currentTime))
            }}
            disabled={!t}
            title="Playing: return to cue. Paused: set cue here."
          >
            Cue
          </button>
        </div>
        <div className="btn-group">
          <button onPointerDown={() => nudge(-1)} onPointerUp={unnudge} onPointerLeave={unnudge} disabled={!t} aria-label="Nudge back" title="Hold to slow down">
            −
          </button>
          <span className="btn-group-label">Nudge</span>
          <button onPointerDown={() => nudge(1)} onPointerUp={unnudge} onPointerLeave={unnudge} disabled={!t} aria-label="Nudge forward" title="Hold to speed up">
            +
          </button>
        </div>
        <button onClick={sync} disabled={!t} title={`Match tempo and beat to deck ${side === 'A' ? 'B' : 'A'}`}>
          Sync
        </button>
      </div>
      <div className="pads">
        <div>
          <span className="muted small">Hot cues</span>
          <div className="pad-row">
            {hot.map((h, k) => (
              <button
                key={k}
                className={h !== null ? 'pad set' : 'pad'}
                disabled={!t}
                aria-label={h !== null ? `Jump to hot cue ${k + 1}` : `Set hot cue ${k + 1}`}
                onClick={(e) => {
                  if (e.shiftKey && h !== null) return setHot(hot.map((x, j) => (j === k ? null : x)))
                  if (h === null) setHot(hot.map((x, j) => (j === k ? snap(el.current.currentTime) : x)))
                  else el.current.currentTime = h
                }}
                title="Click to set or jump, Shift-click to clear"
              >
                {k + 1}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="muted small">Loop, beats</span>
          <div className="pad-row">
            {[1, 2, 4, 8].map((n) => (
              <button key={n} className={loop?.beats === n ? 'pad on' : 'pad'} aria-pressed={loop?.beats === n} onClick={() => setLoopBeats(n)} disabled={!t}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
