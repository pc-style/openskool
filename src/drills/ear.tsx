// Listen-and-choose drills. Each works on your tracks or the built-in grooves.
import { ac, click, djFilter, eq3, impulse, play, track } from '../audio/engine'
import { GENRES, type Feel, type Genre } from '../audio/synth'
import { barLen, barTime, beatLen, getClip, groove, pick, pickBar, shuffle, type Clip } from '../lib/clips'
import { ChoiceDrill, type ChoiceRound, type DrillProps } from './common'

const start = () => ac().currentTime + 0.15

// ---------- Feel the Time ----------
export function TimeFeel({ source, onDone }: DrillProps) {
  const make = async (): Promise<ChoiceRound> => {
    const feel: Feel = pick(['standard', 'half', 'double'])
    let clip: Clip
    let from: number
    let clickBpm: number
    if (source.kind === 'builtin') {
      // same grid, different groove
      const g = source.genre
      const bpm = GENRES[g].bpm
      clip = { id: 'feel', name: '', buffer: await groove(g, 1 + Math.floor(Math.random() * 3), feel, 4), bpm, anchor: 0, source: 'builtin' }
      from = 0
      clickBpm = bpm
    } else {
      // your track against a click at 2×, 1× or ½× its tempo
      clip = await getClip(source)
      from = barTime(clip, pickBar(clip, 4))
      clickBpm = clip.bpm * (feel === 'half' ? 2 : feel === 'double' ? 0.5 : 1)
    }
    const playIt = () => {
      const at = start()
      play(clip.buffer, { from, dur: 4 * barLen(clip), at, gain: 0.8 })
      const step = 60 / clickBpm
      const beatsPerBar = 4
      for (let k = 0; k * step < 4 * barLen(clip) - 0.01; k++) click(at + k * step, k % beatsPerBar === 0, 0.25)
    }
    const names: Record<Feel, string> = { half: 'Halftime', standard: 'Standard', double: 'Double-time' }
    const why: Record<Feel, string> = {
      half: 'The music moved at half the click rate: big gaps between hits, backbeat on 3 instead of 2 and 4.',
      standard: 'Kick and click landed together on every beat.',
      double: 'There were two hits for every click: the groove was running at twice the grid.',
    }
    return {
      prompt: `The click is the grid (${Math.round(clickBpm)} BPM). How does the music feel against it?`,
      options: (['half', 'standard', 'double'] as Feel[]).map((f) => ({ id: f, label: names[f] })),
      answer: feel,
      play: playIt,
      explain: why[feel],
    }
  }
  return <ChoiceDrill rounds={8} make={make} onDone={onDone} />
}

// ---------- Sync Check ----------
const SYNC_OFFSETS = [0.06, 0.05, 0.045, 0.04, 0.032, 0.026, 0.022, 0.018, 0.015, 0.012]
export function SyncCheck({ source, onDone }: DrillProps) {
  const make = async (i: number): Promise<ChoiceRound> => {
    const a = await getClip(source)
    const b = source.kind === 'builtin' ? await getClip(source, a.id) : a
    const na = pickBar(a, 4)
    let nb = pickBar(b, 3)
    if (b === a && Math.abs(nb - na) < 4) nb = pickBar(b, 3)
    const kind = pick(['early', 'sync', 'late'] as const)
    const off = kind === 'sync' ? 0 : (kind === 'early' ? -1 : 1) * SYNC_OFFSETS[i]
    const playIt = () => {
      const at = start()
      const bl = barLen(a)
      play(a.buffer, { from: barTime(a, na), dur: 4 * bl, at, gain: 0.65 })
      play(b.buffer, { from: barTime(b, nb), dur: 3 * bl, at: at + bl + off, gain: 0.65 })
    }
    const label = { early: 'Rushing (B early)', sync: 'In time', late: 'Dragging (B late)' }
    return {
      prompt: 'Deck B drops in after one bar. Is it in time?',
      options: (['early', 'sync', 'late'] as const).map((k) => ({ id: k, label: label[k] })),
      answer: kind,
      play: playIt,
      explain:
        kind === 'sync'
          ? 'Both kicks landed together: one solid thump.'
          : `B was ${Math.round(Math.abs(off) * 1000)} ms ${kind === 'early' ? 'ahead' : 'behind'}. ${kind === 'early' ? 'Ahead sounds like a flam with the click in front.' : 'Behind sounds like a gallop: "ka-boom".'}`,
    }
  }
  return <ChoiceDrill rounds={10} make={make} onDone={onDone} />
}

// ---------- EQ Detective ----------
const EQ_CUTS = [-40, -40, -30, -24, -18, -15, -12, -12, -10, -9]
export function EqDetective({ source, onDone }: DrillProps) {
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await getClip(source)
    const n = pickBar(c, 4)
    const band = pick(['low', 'mid', 'high'] as const)
    const cut = EQ_CUTS[i]
    const playIt = () => {
      const ctx = ac()
      const eq = eq3(ctx)
      eq.output.connect(ctx.destination)
      const at = start()
      const bl = barLen(c)
      play(c.buffer, { from: barTime(c, n), dur: 4 * bl, at, to: eq.input })
      eq[band].gain.setValueAtTime(0, at)
      eq[band].gain.setValueAtTime(cut, at + 2 * bl)
    }
    const what = {
      low: 'The kick lost its weight and the bassline disappeared.',
      mid: 'The body went hollow: synths, vocals and snare got scooped out.',
      high: 'Hats and air vanished; the track went dull but still thumped.',
    }
    return {
      prompt: 'Two bars full, then one band drops. Which knob moved?',
      options: [
        { id: 'low', label: 'Low' },
        { id: 'mid', label: 'Mid' },
        { id: 'high', label: 'High' },
      ],
      answer: band,
      play: playIt,
      explain: `${band[0].toUpperCase() + band.slice(1)} at ${cut <= -30 ? 'kill' : `${cut} dB`}. ${what[band]}`,
    }
  }
  return <ChoiceDrill rounds={10} make={make} onDone={onDone} />
}

// ---------- Filter Sweep ----------
export function FilterSweep({ source, onDone }: DrillProps) {
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await getClip(source)
    const n = pickBar(c, 4)
    const kind = pick(['lp', 'hp', 'none'] as const)
    const depth = i < 4 ? 0.85 : i < 7 ? 0.65 : 0.5
    const playIt = () => {
      const ctx = ac()
      const f = djFilter(ctx)
      f.output.connect(ctx.destination)
      const at = start()
      const bl = barLen(c)
      play(c.buffer, { from: barTime(c, n), dur: 4 * bl, at, to: f.input })
      f.set(0, at + bl)
      if (kind !== 'none') f.set(kind === 'lp' ? -depth : depth, at + 3 * bl, true)
    }
    const why = {
      lp: 'Low-pass: the highs closed down and it went muffled.',
      hp: 'High-pass: the lows thinned out and the kick lost its body.',
      none: 'Nothing moved. Good DJs know when not to touch the filter.',
    }
    return {
      prompt: 'Listen through the sweep. What happened?',
      options: [
        { id: 'lp', label: 'Low-pass' },
        { id: 'hp', label: 'High-pass' },
        { id: 'none', label: 'Nothing' },
      ],
      answer: kind,
      play: playIt,
      explain: why[kind],
    }
  }
  return <ChoiceDrill rounds={10} make={make} onDone={onDone} />
}

// ---------- Gain Match ----------
const GAIN_DB = [6, 5, 4, 3, 3, 2, 2, 1.5, 1, 1]
export function GainMatch({ source, onDone }: DrillProps) {
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await getClip(source)
    const n = pickBar(c, 1)
    const louder = pick(['a', 'b'] as const)
    const db = GAIN_DB[i]
    const lin = 10 ** (-db / 20)
    const playIt = () => {
      let at = start()
      const bl = barLen(c)
      for (const which of ['a', 'b', 'a', 'b'] as const) {
        play(c.buffer, { from: barTime(c, n), dur: bl, at, gain: 0.8 * (which === louder ? 1 : lin) })
        at += bl + 0.15
      }
    }
    return {
      prompt: 'You hear A, B, A, B (the same bar). Which is louder?',
      options: [
        { id: 'a', label: 'A (1st & 3rd)' },
        { id: 'b', label: 'B (2nd & 4th)' },
      ],
      answer: louder,
      play: playIt,
      explain: `${louder.toUpperCase()} was ${db} dB louder. Match trims before the blend so neither track wins on volume alone.`,
    }
  }
  return <ChoiceDrill rounds={10} make={make} onDone={onDone} />
}

// ---------- Bass Clash ----------
export function BassClash({ source, onDone }: DrillProps) {
  const make = async (): Promise<ChoiceRound> => {
    const a = await getClip(source)
    const b = source.kind === 'builtin' ? await getClip(source, a.id) : a
    const na = pickBar(a, 2)
    let nb = pickBar(b, 2)
    if (a === b && Math.abs(na - nb) < 4) nb = pickBar(b, 2)
    const muddy = pick(['1', '2'] as const)
    const playIt = () => {
      const ctx = ac()
      let at = start()
      const bl = barLen(a)
      for (const v of ['1', '2'] as const) {
        const eq = eq3(ctx)
        eq.output.connect(ctx.destination)
        eq.low.gain.value = v === muddy ? 0 : -40
        play(a.buffer, { from: barTime(a, na), dur: 2 * bl, at, gain: 0.6 })
        play(b.buffer, { from: barTime(b, nb), dur: 2 * bl, at, gain: 0.6, rate: a.bpm / b.bpm, to: eq.input })
        at += 2 * bl + 0.6
      }
    }
    return {
      prompt: 'Two versions of the same blend. Which one has both basses fighting?',
      options: [
        { id: '1', label: 'First' },
        { id: '2', label: 'Second' },
      ],
      answer: muddy,
      play: playIt,
      explain: `Version ${muddy} had both lows up: boomy and smeared. The clean one cut the incoming low, which is the bass swap.`,
    }
  }
  return <ChoiceDrill rounds={8} make={make} onDone={onDone} />
}

// ---------- Loop Lab ----------
export function LoopLab({ source, onDone }: DrillProps) {
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await getClip(source)
    const n = pickBar(c, 3)
    const choices = i < 5 ? [1, 2, 4, 8] : [0.5, 1, 2, 4]
    const beats = pick(choices)
    const playIt = () => {
      const ctx = ac()
      const src = track(ctx.createBufferSource())
      src.buffer = c.buffer
      const loopStart = barTime(c, n + 1)
      src.loop = true
      src.loopStart = loopStart
      src.loopEnd = loopStart + beats * beatLen(c)
      src.connect(ctx.destination)
      const at = start()
      const total = barLen(c) + Math.max(2 * barLen(c), 2 * beats * beatLen(c))
      src.start(at, barTime(c, n))
      src.stop(at + total)
    }
    const label = (b: number) => (b === 0.5 ? '½ beat' : `${b} beat${b > 1 ? 's' : ''}`)
    return {
      prompt: 'One bar plays, then a loop engages. How long is it?',
      options: choices.map((b) => ({ id: String(b), label: label(b) })),
      answer: String(beats),
      play: playIt,
      explain: `${label(beats)} loop. ${beats >= 4 ? 'Long loops keep the groove: good for extending an outro.' : 'Short loops stutter: a build-up tool, use sparingly.'}`,
    }
  }
  return <ChoiceDrill rounds={8} make={make} onDone={onDone} />
}

// ---------- FX Spotter ----------
type Fx = 'echo' | 'reverb' | 'flanger' | 'phaser'
function fxChain(ctx: AudioContext, fx: Fx, bpm: number, onAt: number) {
  const input = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  input.connect(dry).connect(ctx.destination)
  wet.gain.setValueAtTime(0, 0)
  wet.gain.setValueAtTime(fx === 'reverb' ? 0.9 : 0.75, onAt)
  wet.connect(ctx.destination)
  const lfos: OscillatorNode[] = []
  if (fx === 'echo') {
    const d = ctx.createDelay(2)
    d.delayTime.value = (60 / bpm) * 0.75
    const fb = ctx.createGain()
    fb.gain.value = 0.5
    input.connect(d).connect(fb).connect(d)
    d.connect(wet)
  } else if (fx === 'reverb') {
    const conv = ctx.createConvolver()
    conv.buffer = impulse(ctx, 2.8, 2.5)
    input.connect(conv).connect(wet)
  } else if (fx === 'flanger') {
    const d = ctx.createDelay(0.02)
    d.delayTime.value = 0.004
    const lfo = track(ctx.createOscillator())
    lfo.frequency.value = 0.3
    const depth = ctx.createGain()
    depth.gain.value = 0.003
    lfo.connect(depth).connect(d.delayTime)
    const fb = ctx.createGain()
    fb.gain.value = 0.7
    input.connect(d).connect(fb).connect(d)
    d.connect(wet)
    dry.gain.setValueAtTime(1, 0)
    dry.gain.setValueAtTime(0.7, onAt)
    lfos.push(lfo)
  } else {
    let node: AudioNode = input
    const lfo = track(ctx.createOscillator())
    lfo.frequency.value = 0.4
    const depth = ctx.createGain()
    depth.gain.value = 900
    lfo.connect(depth)
    for (let k = 0; k < 6; k++) {
      const ap = ctx.createBiquadFilter()
      ap.type = 'allpass'
      ap.frequency.value = 1100
      ap.Q.value = 0.8
      depth.connect(ap.frequency)
      node.connect(ap)
      node = ap
    }
    node.connect(wet)
    dry.gain.setValueAtTime(1, 0)
    dry.gain.setValueAtTime(0.75, onAt)
    lfos.push(lfo)
  }
  return { input, lfos }
}

export function FxSpotter({ source, onDone }: DrillProps) {
  const make = async (): Promise<ChoiceRound> => {
    const c = await getClip(source)
    const n = pickBar(c, 3)
    const fx = pick(['echo', 'reverb', 'flanger', 'phaser'] as Fx[])
    const playIt = () => {
      const ctx = ac()
      const at = start()
      const bl = barLen(c)
      const ch = fxChain(ctx, fx, c.bpm, at + bl)
      for (const l of ch.lfos) {
        l.start(at)
        l.stop(at + 3 * bl + 3)
      }
      play(c.buffer, { from: barTime(c, n), dur: 3 * bl, at, to: ch.input, gain: 0.8 })
    }
    const why: Record<Fx, string> = {
      echo: 'Echo: distinct repeats locked to the beat (here ¾ of a beat).',
      reverb: 'Reverb: no distinct repeats, a smeared room tail behind everything.',
      flanger: 'Flanger: a sweeping metallic jet-plane whoosh from a very short modulated delay.',
      phaser: 'Phaser: a softer, hollow swirl as notches move through the spectrum.',
    }
    return {
      prompt: 'One bar dry, then an effect. Which one?',
      options: (['echo', 'reverb', 'flanger', 'phaser'] as Fx[]).map((f) => ({ id: f, label: f[0].toUpperCase() + f.slice(1) })),
      answer: fx,
      play: playIt,
      explain: why[fx],
    }
  }
  return <ChoiceDrill rounds={8} make={make} onDone={onDone} />
}

// ---------- Genre ID ----------
export function GenreId({ onDone }: DrillProps) {
  const genres = Object.keys(GENRES) as Genre[]
  const make = async (): Promise<ChoiceRound> => {
    const g = pick(genres)
    const buf = await groove(g, 1 + Math.floor(Math.random() * 3), 'standard', 8)
    const playIt = () => {
      play(buf, { from: 0, dur: 4 * (240 / GENRES[g].bpm), gain: 0.85 })
    }
    return {
      prompt: 'Which genre is this?',
      options: shuffle(genres).map((x) => ({ id: x, label: `${GENRES[x].name}` })),
      answer: g,
      play: playIt,
      explain: `${GENRES[g].name}, ${GENRES[g].bpm} BPM. ${GENRES[g].about}`,
    }
  }
  return <ChoiceDrill rounds={8} make={make} onDone={onDone} />
}
