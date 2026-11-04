// Built-in grooves rendered offline, so every drill works before you add your own tracks.

export type Genre = 'house' | 'techno' | 'psy' | 'hitech'
export type Feel = 'standard' | 'half' | 'double'

export const GENRES: Record<Genre, { name: string; bpm: number; about: string }> = {
  house: {
    name: 'House',
    bpm: 124,
    about: 'Four-on-the-floor kick, clap on 2 and 4, open hat on every offbeat, a bouncy bass that answers the kick and warm chord stabs.',
  },
  techno: {
    name: 'Techno',
    bpm: 134,
    about: 'Harder, drier kick with a rumbling low-end tail, a ride cymbal driving 8ths, sparse dark stabs and very little melody.',
  },
  psy: {
    name: 'Psytrance',
    bpm: 145,
    about: 'Short tight kick followed by a rolling 16th bass (kick–bass–bass–bass), offbeat hats and acid-style squelch.',
  },
  hitech: {
    name: 'Hi-tech',
    bpm: 185,
    about: 'Psy taken to 180+: a fast rolling bass, metallic 16th percussion and very busy high-end detail.',
  },
}

export interface GrooveOptions {
  genre: Genre
  bars: number
  seed?: number
  bpm?: number
  feel?: Feel
  /** Add a crash on every 8-bar phrase start (true by default). */
  crashes?: boolean
}

function rng(seed: number) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const midi = (m: number) => 440 * 2 ** ((m - 69) / 12)

const PHRASE = 8

/** Long grooves are one rendered 8-bar phrase tiled end to end, which keeps rendering fast. */
export async function renderGroove(opts: GrooveOptions): Promise<AudioBuffer> {
  if (opts.bars <= PHRASE) return renderBars(opts)
  const phrase = await renderBars({ ...opts, bars: PHRASE })
  const bpm = opts.bpm ?? GENRES[opts.genre].bpm
  const step = Math.round(((PHRASE * 240) / bpm) * phrase.sampleRate)
  const tiles = Math.ceil(opts.bars / PHRASE)
  const out = new AudioBuffer({ numberOfChannels: 2, length: step * tiles + (phrase.length - step), sampleRate: phrase.sampleRate })
  for (let ch = 0; ch < 2; ch++) {
    const src = phrase.getChannelData(ch)
    const dst = out.getChannelData(ch)
    // add, so each phrase's release tail rings into the next one
    for (let t = 0; t < tiles; t++) for (let i = 0; i < src.length; i++) dst[t * step + i] += src[i]
  }
  return out
}

async function renderBars(opts: GrooveOptions): Promise<AudioBuffer> {
  const { genre, bars, seed = 7, feel = 'standard', crashes = true } = opts
  const bpm = opts.bpm ?? GENRES[genre].bpm
  const sr = 44100
  const beat = 60 / bpm
  const s16 = beat / 4
  const length = Math.ceil((bars * 4 * beat + 0.5) * sr)
  const ctx = new OfflineAudioContext(2, length, sr)
  const rand = rng(seed * 9973 + bars)
  const master = ctx.createDynamicsCompressor()
  master.threshold.value = -10
  master.ratio.value = 4
  const out = ctx.createGain()
  out.gain.value = 0.8
  master.connect(out).connect(ctx.destination)

  const noise = ctx.createBuffer(1, sr * 2, sr)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  const env = (g: AudioParam, t: number, peak: number, decay: number, attack = 0.002) => {
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(peak, t + attack)
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  const hard = genre === 'techno' || genre === 'hitech'
  const kick = (t: number, level = 1) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const top = genre === 'psy' || genre === 'hitech' ? 180 : 150
    o.frequency.setValueAtTime(top, t)
    o.frequency.exponentialRampToValueAtTime(genre === 'house' ? 48 : 45, t + 0.07)
    const dec = genre === 'psy' || genre === 'hitech' ? 0.18 : genre === 'techno' ? 0.4 : 0.32
    env(g.gain, t, 1.1 * level, dec)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + dec + 0.05)
    // click
    const n = ctx.createBufferSource()
    n.buffer = noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const ng = ctx.createGain()
    env(ng.gain, t, hard ? 0.25 : 0.15, 0.012, 0.001)
    n.connect(hp).connect(ng).connect(master)
    n.start(t, rand())
    n.stop(t + 0.03)
    if (genre === 'techno') {
      // rumble: filtered, delayed low tail
      const r = ctx.createOscillator()
      r.type = 'triangle'
      r.frequency.value = 46
      const rg = ctx.createGain()
      rg.gain.setValueAtTime(0, t + 0.08)
      rg.gain.linearRampToValueAtTime(0.25, t + 0.12)
      rg.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.95)
      r.connect(rg).connect(master)
      r.start(t + 0.08)
      r.stop(t + beat)
    }
  }

  const hat = (t: number, open: boolean, level = 0.2, freq = 8000) => {
    const n = ctx.createBufferSource()
    n.buffer = noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = freq
    const g = ctx.createGain()
    env(g.gain, t, level, open ? 0.18 : 0.035, 0.001)
    n.connect(hp).connect(g).connect(master)
    n.start(t, rand())
    n.stop(t + (open ? 0.25 : 0.06))
  }

  const ride = (t: number) => {
    const n = ctx.createBufferSource()
    n.buffer = noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 6500
    bp.Q.value = 2
    const g = ctx.createGain()
    env(g.gain, t, 0.22, 0.3, 0.001)
    n.connect(bp).connect(g).connect(master)
    n.start(t, rand())
    n.stop(t + 0.4)
  }

  const clap = (t: number, level = 0.5) => {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1400
    bp.Q.value = 1.2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    for (let k = 0; k < 3; k++) {
      g.gain.setValueAtTime(level, t + k * 0.01)
      g.gain.exponentialRampToValueAtTime(0.05, t + k * 0.01 + 0.009)
    }
    g.gain.setValueAtTime(level * 0.8, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    const n = ctx.createBufferSource()
    n.buffer = noise
    n.connect(bp).connect(g).connect(master)
    n.start(t, rand())
    n.stop(t + 0.25)
  }

  const crash = (t: number) => {
    const n = ctx.createBufferSource()
    n.buffer = noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 4500
    const g = ctx.createGain()
    env(g.gain, t, 0.3, 1.6, 0.002)
    n.connect(hp).connect(g).connect(master)
    n.start(t, rand())
    n.stop(t + 1.8)
  }

  const bassNote = (t: number, note: number, dur: number, level = 0.35, cutoff = 600, type: OscillatorType = 'sawtooth') => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = midi(note)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(cutoff * 2, t)
    lp.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur)
    lp.Q.value = genre === 'psy' ? 8 : 2
    const g = ctx.createGain()
    env(g.gain, t, level, dur * 0.9, 0.004)
    o.connect(lp).connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  const stab = (t: number, notes: number[], dur: number, level = 0.08) => {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = genre === 'techno' ? 900 : 2200
    const g = ctx.createGain()
    env(g.gain, t, level, dur, 0.005)
    lp.connect(g).connect(master)
    for (const m of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = midi(m)
        o.detune.value = det
        o.connect(lp)
        o.start(t)
        o.stop(t + dur + 0.05)
      }
    }
  }

  // a small chord loop per seed so each groove has bar-to-bar harmonic movement (marks the 1)
  const roots = [[45, 41, 43, 40], [43, 39, 41, 46], [38, 41, 36, 43], [40, 36, 38, 43]][Math.floor(rand() * 4)]
  const minorTriad = (r: number) => [r + 12, r + 15, r + 19]

  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4 * beat
    const root = roots[bar % 4]
    if (crashes && bar % 8 === 0) crash(b0)
    if (feel === 'half') {
      kick(b0)
      kick(b0 + 2.5 * beat, 0.7)
      clap(b0 + 2 * beat, 0.7)
      for (let i = 0; i < 8; i++) hat(b0 + i * beat * 0.5, false, 0.12)
      bassNote(b0, root, beat * 1.5)
      stab(b0, minorTriad(root), beat * 3)
      continue
    }
    if (feel === 'double') {
      for (let i = 0; i < 8; i++) kick(b0 + i * beat * 0.5, i % 2 ? 0.8 : 1)
      for (let i = 0; i < 4; i++) clap(b0 + (i + 0.25) * beat + beat * 0.25, 0.45)
      for (let i = 0; i < 16; i++) hat(b0 + i * s16, false, 0.12)
      for (let i = 0; i < 8; i++) bassNote(b0 + i * beat * 0.5 + s16, root, s16 * 0.9, 0.25)
      stab(b0, minorTriad(root), beat)
      continue
    }
    for (let q = 0; q < 4; q++) {
      const t = b0 + q * beat
      kick(t)
      if (genre === 'house') {
        hat(t + 2 * s16, true, 0.16)
        hat(t + s16, false, 0.07)
        hat(t + 3 * s16, false, 0.07)
        if (q % 2 === 1) clap(t)
        bassNote(t + 2 * s16, root + (q === 3 && rand() > 0.5 ? 7 : 0), s16 * 1.6, 0.35, 700)
        if (q === 0 || (q === 2 && rand() > 0.6)) stab(t + (q === 2 ? 2 * s16 : 0), minorTriad(root), beat * 0.4)
      } else if (genre === 'techno') {
        hat(t + 2 * s16, false, 0.18, 9000)
        ride(t)
        ride(t + 2 * s16)
        if (q % 2 === 1 && rand() > 0.3) clap(t, 0.25)
        if (q === 0 && bar % 2 === 0) stab(t + 3 * s16, [root + 12, root + 15], beat * 0.6, 0.06)
        if (q === 0) bassNote(t + 2 * s16, root, s16 * 1.5, 0.25, 300, 'square')
      } else {
        // psy / hi-tech rolling bass
        hat(t + 2 * s16, genre === 'psy', 0.15, genre === 'hitech' ? 10000 : 8000)
        if (genre === 'hitech') for (let k = 0; k < 4; k++) hat(t + k * s16, false, 0.06, 11000)
        for (let k = 1; k < 4; k++) bassNote(t + k * s16, root, s16 * 0.85, 0.3, genre === 'hitech' ? 900 : 650)
        if (q % 2 === 1) clap(t, 0.15)
        if (genre === 'psy' && q === 0) bassNote(t + 3 * s16, root + 24, beat * 1.2, 0.07, 1800, 'sawtooth')
      }
    }
  }
  return ctx.startRendering()
}
