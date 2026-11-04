// Two practice decks and a DJ mixer. HTML audio elements give key lock (preservesPitch) for free.
import { useEffect, useRef, useState } from 'react'
import { ac, djFilter, eq3 } from '../audio/engine'
import { GENRES, type Genre } from '../audio/synth'
import { groove } from '../lib/clips'
import { readyTracks, useTracks } from '../lib/library'
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

export function Decks() {
  const chans = useRef<Channel[] | null>(null)
  const [ready, setReady] = useState(false)
  const [xf, setXf] = useState(0)
  useEffect(() => {
    const c = ac()
    const master = c.createGain()
    master.gain.value = 0.9
    master.connect(c.destination)
    chans.current = [makeChannel(master), makeChannel(master)]
    setReady(true)
    return () => {
      for (const ch of chans.current ?? []) {
        ch.el.pause()
        ch.el.src = ''
      }
      master.disconnect()
    }
  }, [])
  useEffect(() => {
    if (!chans.current) return
    // constant-power crossfader
    const x = (xf + 1) / 2
    chans.current[0].xf.gain.value = Math.cos((x * Math.PI) / 2)
    chans.current[1].xf.gain.value = Math.cos(((1 - x) * Math.PI) / 2)
  }, [xf, ready])
  const decks = useRef<(DeckApi | null)[]>([null, null])
  if (!ready || !chans.current) return null
  return (
    <div className="decks-page">
      <h1>Decks</h1>
      <p className="muted">Practise blends with your tracks: tempo with key lock, nudge, hot cues, beat loops and a 3-band mixer. Use headphones or speakers.</p>
      <div className="decks">
        {[0, 1].map((i) => (
          <Deck key={i} side={i ? 'B' : 'A'} ch={chans.current![i]} register={(api) => (decks.current[i] = api)} other={() => decks.current[1 - i]} />
        ))}
      </div>
      <div className="xfader">
        <span>A</span>
        <input type="range" min={-1} max={1} step={0.01} value={xf} onChange={(e) => setXf(Number(e.target.value))} aria-label="Crossfader" onDoubleClick={() => setXf(0)} />
        <span>B</span>
      </div>
    </div>
  )
}

interface DeckApi {
  bpmNow: () => number
  /** Beat position within the bar, 0..4, or null. */
  beatPos: () => number | null
}

function Deck({ side, ch, register, other }: { side: string; ch: Channel; register: (a: DeckApi) => void; other: () => DeckApi | null }) {
  useTracks()
  const [t, setT] = useState<Loaded | null>(null)
  const [pitch, setPitch] = useState(0)
  const [keylock, setKeylock] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [cue, setCue] = useState(0)
  const [hot, setHot] = useState<(number | null)[]>([null, null, null, null])
  const [loop, setLoop] = useState<{ a: number; b: number; beats: number } | null>(null)
  const [eq, setEq] = useState({ trim: 0, low: 0, mid: 0, high: 0, filter: 0, fader: 0.8 })
  const [level, setLevel] = useState(0)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const tRef = useRef(t)
  tRef.current = t
  const rate = 1 + pitch / 100

  register({
    bpmNow: () => (tRef.current ? tRef.current.bpm * rate : 0),
    beatPos: () => {
      const tt = tRef.current
      if (!tt) return null
      const b = ((ch.el.currentTime - tt.anchor) * tt.bpm) / 60
      return ((b % 4) + 4) % 4
    },
  })

  useEffect(() => {
    ch.el.playbackRate = rate
    ch.el.preservesPitch = keylock
  }, [rate, keylock, ch])
  useEffect(() => {
    ch.trim.gain.value = 10 ** (eq.trim / 20)
    ch.eq.low.gain.value = eq.low
    ch.eq.mid.gain.value = eq.mid
    ch.eq.high.gain.value = eq.high
    ch.filter.set(eq.filter, ac().currentTime)
    ch.fader.gain.value = eq.fader ** 2
  }, [eq, ch])

  useEffect(() => {
    let raf = 0
    const buf = new Float32Array(512)
    const tick = () => {
      const l = loopRef.current
      if (l && ch.el.currentTime >= l.b) ch.el.currentTime = l.a + (ch.el.currentTime - l.b)
      setPos(ch.el.currentTime)
      ch.meter.getFloatTimeDomainData(buf)
      let pk = 0
      for (const v of buf) pk = Math.max(pk, Math.abs(v))
      setLevel(pk)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ch])

  const load = async (v: string) => {
    ch.el.pause()
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
    } else {
      const tr = readyTracks().find((x) => x.id === v)
      const blob = (await get(`file:${v}`)) as Blob | undefined
      if (!tr || !blob) return
      setT({ name: tr.name, url: URL.createObjectURL(blob), bpm: tr.analysis!.bpm, anchor: tr.analysis!.anchor, peaks: tr.analysis!.peaks })
    }
  }
  useEffect(() => {
    if (!t) return
    ch.el.src = t.url
    ch.el.currentTime = Math.max(0, t.anchor)
    setCue(Math.max(0, t.anchor))
    return () => URL.revokeObjectURL(t.url)
  }, [t, ch])

  const beat = t ? 60 / t.bpm : 0.5
  const snap = (x: number) => (t ? t.anchor + Math.round((x - t.anchor) / beat) * beat : x)
  const toggle = () => {
    ac()
    if (ch.el.paused) {
      void ch.el.play()
      setPlaying(true)
    } else {
      ch.el.pause()
      setPlaying(false)
    }
  }
  const sync = () => {
    const o = other()
    if (!o || !t || !o.bpmNow()) return
    setPitch(Math.max(-16, Math.min(16, (o.bpmNow() / t.bpm - 1) * 100)))
    const ob = o.beatPos()
    const mb = ((((ch.el.currentTime - t.anchor) / beat) % 4) + 4) % 4
    if (ob !== null) {
      let d = ob - mb
      if (d > 2) d -= 4
      if (d < -2) d += 4
      ch.el.currentTime += d * beat
    }
  }
  const nudge = (d: number) => {
    ch.el.playbackRate = rate * (1 + d * 0.04)
  }
  const unnudge = () => {
    ch.el.playbackRate = rate
  }
  const setLoopBeats = (n: number) => {
    if (loop?.beats === n) return setLoop(null)
    const a = snap(ch.el.currentTime - beat / 2)
    setLoop({ a, b: a + n * beat, beats: n })
  }
  // a small epsilon so a playhead parked exactly on a grid line counts as that beat
  const bp = t ? ((((pos - t.anchor + 0.002) / beat) % 4) + 4) % 4 : -1
  const bar = t ? Math.floor((pos - t.anchor + 0.002) / (beat * 4)) : 0
  const dur = ch.el.duration || 1
  return (
    <div className="card deck">
      <div className="row between">
        <h2>Deck {side}</h2>
        <select onChange={(e) => void load(e.target.value)} defaultValue="" aria-label={`Load deck ${side}`}>
          <option value="" disabled>
            Load…
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
      </div>
      <div className="deck-title">{t?.name ?? 'Empty'}</div>
      <div className="deck-wave" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        ch.el.currentTime = ((e.clientX - r.left) / r.width) * dur
      }}>
        {t?.peaks && (
          <svg viewBox={`0 0 ${t.peaks.length} 100`} preserveAspectRatio="none">
            <path d={t.peaks.map((p, i) => `M${i} ${50 - p * 48}V${50 + p * 48}`).join('')} stroke="#4b5563" />
          </svg>
        )}
        <i className="head" style={{ left: `${(pos / dur) * 100}%` }} />
        {loop && <i className="loop" style={{ left: `${(loop.a / dur) * 100}%`, width: `${((loop.b - loop.a) / dur) * 100}%` }} />}
      </div>
      <div className="row between">
        <div className="beats" aria-label="Beat in bar">
          {[0, 1, 2, 3].map((k) => (
            <i key={k} className={Math.floor(bp) === k ? (k === 0 ? 'on one' : 'on') : ''} />
          ))}
          <span className="num">bar {bar + 1}</span>
        </div>
        <span className="num big">{t ? (t.bpm * rate).toFixed(2) : '—'} BPM</span>
      </div>
      <div className="row wrap">
        <button className="primary" onClick={toggle} disabled={!t}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          onClick={() => {
            if (playing) {
              ch.el.pause()
              setPlaying(false)
              ch.el.currentTime = cue
            } else setCue(snap(ch.el.currentTime))
          }}
          disabled={!t}
          title="Playing: return to cue. Paused: set cue here."
        >
          CUE
        </button>
        <button onPointerDown={() => nudge(-1)} onPointerUp={unnudge} onPointerLeave={unnudge} disabled={!t}>
          ◀
        </button>
        <button onPointerDown={() => nudge(1)} onPointerUp={unnudge} onPointerLeave={unnudge} disabled={!t}>
          ▶
        </button>
        <button onClick={sync} disabled={!t}>
          SYNC
        </button>
        <label className="toggle">
          <input type="checkbox" checked={keylock} onChange={(e) => setKeylock(e.target.checked)} /> Key lock
        </label>
      </div>
      <div className="row wrap">
        <span className="muted small">Cues</span>
        {hot.map((h, k) => (
          <button
            key={k}
            className={h !== null ? 'pad set' : 'pad'}
            disabled={!t}
            onClick={(e) => {
              if (e.shiftKey && h !== null) return setHot(hot.map((x, j) => (j === k ? null : x)))
              if (h === null) setHot(hot.map((x, j) => (j === k ? snap(ch.el.currentTime) : x)))
              else ch.el.currentTime = h
            }}
            title="Click to set or jump, Shift-click to clear"
          >
            {k + 1}
          </button>
        ))}
        <span className="sep" />
        <span className="muted small">Loop</span>
        {[1, 2, 4, 8].map((n) => (
          <button key={n} className={loop?.beats === n ? 'pad set' : 'pad'} onClick={() => setLoopBeats(n)} disabled={!t}>
            {n}
          </button>
        ))}
      </div>
      <div className="mixer">
        {(
          [
            ['trim', 'Trim', -12, 12],
            ['high', 'High', -40, 6],
            ['mid', 'Mid', -40, 6],
            ['low', 'Low', -40, 6],
            ['filter', 'Filter', -1, 1],
          ] as const
        ).map(([k, label, mn, mx]) => (
          <label key={k} className="knob">
            <span>{label}</span>
            <input type="range" min={mn} max={mx} step={k === 'filter' ? 0.01 : 0.5} value={eq[k]} onChange={(e) => setEq({ ...eq, [k]: Number(e.target.value) })} onDoubleClick={() => setEq({ ...eq, [k]: 0 })} />
            <small>{k === 'filter' ? (eq.filter < -0.02 ? 'LP' : eq.filter > 0.02 ? 'HP' : 'off') : eq[k] <= -40 ? 'kill' : `${eq[k] > 0 ? '+' : ''}${eq[k]}`}</small>
          </label>
        ))}
        <label className="knob">
          <span>Pitch</span>
          <input type="range" min={-8} max={8} step={0.01} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} onDoubleClick={() => setPitch(0)} />
          <small>{(pitch >= 0 ? '+' : '') + pitch.toFixed(2)}%</small>
        </label>
        <label className="knob">
          <span>Fader</span>
          <input type="range" min={0} max={1} step={0.01} value={eq.fader} onChange={(e) => setEq({ ...eq, fader: Number(e.target.value) })} />
          <small className="meter">
            <i style={{ width: `${Math.min(1, level) * 100}%` }} className={level > 0.98 ? 'clip' : ''} />
          </small>
        </label>
      </div>
    </div>
  )
}
