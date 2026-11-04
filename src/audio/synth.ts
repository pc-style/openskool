// Built-in grooves rendered offline, so every drill works before you add your own tracks.
// Everything is synthesised sample by sample (seeded, deterministic): one-shots are rendered once per groove and
// mixed in at their step times, then the mix goes through sidechain ducking, delay, reverb and a loudness-matched master.

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
  if (s < 0) s += 2147483646
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
  const { L, R } = mixBars(opts)
  const buf = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: SR })
  buf.copyToChannel(L, 0)
  buf.copyToChannel(R, 1)
  return buf
}

// ---------- DSP building blocks ----------

const SR = 44100
const TAU = Math.PI * 2
const TAIL = 0.5
/** Integrated loudness every groove is matched to (K-weighted, ungated). */
const TARGET_LUFS = -14
/** Soft-clip ceiling, about -1.5 dBFS, so tiled tails still stay well under 0 dBFS. */
const CEILING = 0.84

type Mono = Float32Array<ArrayBuffer>
interface Stereo {
  L: Mono
  R: Mono
}
const mono = (n: number): Mono => new Float32Array(n)
const stereo = (n: number): Stereo => ({ L: mono(n), R: mono(n) })
const sec = (s: number) => Math.max(1, Math.round(s * SR))

/** Seeded white noise in -1..1. */
function noiseGen(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 2147483648 - 1
  }
}

/** Topology-preserving state-variable filter. g = gOf(cutoff), k = 1/Q. Mode 0 = LP, 1 = BP, 2 = HP. */
function svf() {
  let s1 = 0
  let s2 = 0
  return (x: number, g: number, k: number, mode: 0 | 1 | 2) => {
    const hp = (x - (k + g) * s1 - s2) / (1 + g * (g + k))
    const bp = g * hp + s1
    s1 = g * hp + bp
    const lp = g * bp + s2
    s2 = g * bp + lp
    return mode === 0 ? lp : mode === 1 ? bp : hp
  }
}
const gOf = (fc: number) => Math.tan((Math.PI * Math.min(Math.max(fc, 10), SR * 0.45)) / SR)

function blep(t: number, dt: number) {
  if (t < dt) {
    t /= dt
    return t + t - t * t - 1
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt
    return t * t + t + t + 1
  }
  return 0
}
const saw = (ph: number, dt: number) => 2 * ph - 1 - blep(ph, dt)

/** Fade the last `ms` of a one-shot to zero so truncation never clicks. */
function fadeOut(x: Mono, ms = 6) {
  const f = Math.min(x.length, sec(ms / 1000))
  for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f
  return x
}

// ---------- one-shots ----------

interface KickSpec {
  f0: number
  f1: number
  pitchTau: number
  hold: number
  decay: number
  len: number
  drive: number
  click: number
}

function kickSample(k: KickSpec, noise: () => number): Mono {
  const out = mono(sec(k.len))
  const bp = svf()
  const g = gOf(3500)
  const norm = Math.tanh(k.drive)
  let ph = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    ph += (k.f1 + (k.f0 - k.f1) * Math.exp(-t / k.pitchTau)) / SR
    const amp = Math.min(1, t / 0.0008) * (t < k.hold ? 1 : Math.exp(-(t - k.hold) / k.decay))
    // the click sits after the drive so the saturation does not smear it across the whole top end
    const click = bp(noise(), g, 1, 1) * Math.exp(-t / 0.0025) * k.click
    out[i] = Math.tanh(Math.sin(TAU * ph) * amp * k.drive) / norm + click
  }
  return fadeOut(out, 12)
}

/** Techno rumble: a dark, distorted low tail that swells after each kick and is gone before the next one. */
function rumbleSample(beat: number, f: number, noise: () => number): Mono {
  const out = mono(sec(beat * 0.97))
  const a = svf()
  const b = svf()
  const g = gOf(f)
  const g2 = gOf(f * 2.2)
  let ph = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    const x = b(a(noise(), g, 0.25, 0), g2, 0.8, 0) * 9
    ph += f / SR
    const tone = Math.sin(TAU * ph + 0.6 * Math.sin(TAU * ph * 0.5))
    const u = t / (beat * 0.97)
    const env = u < 0.12 ? 0 : Math.sin(Math.PI * ((u - 0.12) / 0.88)) ** 1.5
    out[i] = Math.tanh((x * 0.8 + tone * 0.5) * 1.8) * env
  }
  return out
}

const RATIOS = [1, 1.483, 1.801, 2.546, 2.631, 3.897]

/** Hats, rides and crashes: six detuned square partials (808 style) mixed with noise, then filtered. */
function metalSample(len: number, tau: number, noiseMix: number, hpF: number, base: number, noise: () => number, bell = 0): Mono {
  const out = mono(sec(len))
  const bp = svf()
  const hp = svf()
  const gb = gOf(hpF * 1.4)
  const gh = gOf(hpF)
  const ph = RATIOS.map(() => 0)
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    let m = 0
    for (let k = 0; k < 6; k++) {
      ph[k] = (ph[k] + (base * RATIOS[k]) / SR) % 1
      m += ph[k] < 0.5 ? 1 : -1
    }
    const x = (m / 6) * (1 - noiseMix) + noise() * noiseMix
    let y = hp(bp(x, gb, 1.2, 1), gh, 1.1, 2)
    if (bell) y += bell * (Math.sin(TAU * base * 7.2 * t) + 0.6 * Math.sin(TAU * base * 11.3 * t)) * Math.exp(-t / (tau * 0.6))
    out[i] = y * Math.min(1, t / 0.0005) * Math.exp(-t / tau)
  }
  return fadeOut(out)
}

function clapSample(noise: () => number, tone = 1200): Mono {
  const out = mono(sec(0.4))
  const bp = svf()
  const hp = svf()
  const lp = svf()
  const gb = gOf(tone)
  const gh = gOf(500)
  const gl = gOf(2800)
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    let env = 0
    for (let k = 0; k < 3; k++) {
      const d = t - k * 0.0095
      if (d >= 0 && d < 0.0095) env = Math.max(env, Math.exp(-d / 0.0025))
    }
    if (t >= 0.0285) env = Math.max(env, Math.exp(-(t - 0.0285) / 0.07))
    out[i] = lp(hp(bp(noise(), gb, 0.8, 1), gh, 1, 2), gl, 0.8, 0) * env * 2.4
  }
  return fadeOut(out)
}

/** Short pitched percussion: rim, conga or tom depending on frequency and decay. */
function percSample(f0: number, f1: number, tau: number, noiseAmt: number, noise: () => number): Mono {
  const out = mono(sec(tau * 6 + 0.01))
  const bp = svf()
  const g = gOf(f0 * 2)
  let ph = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    ph += (f1 + (f0 - f1) * Math.exp(-t / 0.02)) / SR
    const n = bp(noise(), g, 1, 1) * noiseAmt * Math.exp(-t / 0.006)
    out[i] = (Math.sin(TAU * ph) + n) * Math.min(1, t / 0.0005) * Math.exp(-t / tau)
  }
  return fadeOut(out)
}

/** FM bell / metallic tick for hi-tech (inharmonic modulator, decaying index). */
function fmSample(fc: number, ratio: number, index: number, tau: number): Mono {
  const out = mono(sec(tau * 5 + 0.01))
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    const e = Math.exp(-t / tau)
    out[i] = Math.sin(TAU * fc * t + index * e * Math.sin(TAU * fc * ratio * t)) * e * Math.min(1, t / 0.0005)
  }
  return fadeOut(out)
}

/** Psy / hi-tech laser zap: a fast exponential pitch dive. */
function zapSample(f0: number, f1: number, len: number): Mono {
  const out = mono(sec(len))
  let ph = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    const f = f1 * (f0 / f1) ** Math.max(0, 1 - t / len) ** 3
    ph = (ph + f / SR) % 1
    out[i] = (Math.sin(TAU * ph) * 0.6 + (ph < 0.5 ? 0.4 : -0.4)) * Math.exp(-t / (len * 0.45))
  }
  return fadeOut(out)
}

interface VoiceSpec {
  /** saw level, square level, sine sub level */
  saw: number
  sq: number
  sub: number
  /** second saw detuned by this many cents (0 = off) */
  det: number
  cut0: number
  cut1: number
  ctau: number
  q: number
  atk: number
  dec: number
  drive: number
}

/** One synth note through a 24 dB low-pass with its own filter and amp envelope. */
function noteSample(freq: number, gate: number, v: VoiceSpec): Mono {
  const out = mono(sec(gate + 0.012))
  const f1 = svf()
  const f2 = svf()
  const dt = freq / SR
  const dt2 = (freq * 2 ** (v.det / 1200)) / SR
  let p = 0
  let p2 = 0.37
  let ps = 0
  const k = 1 / v.q
  const norm = Math.tanh(v.drive)
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    p = (p + dt) % 1
    p2 = (p2 + dt2) % 1
    ps = (ps + dt) % 1
    let x = v.saw * saw(p, dt) + v.sq * (saw(p, dt) - saw((p + 0.5) % 1, dt)) * 0.5
    if (v.det) x = (x + v.saw * saw(p2, dt2)) * 0.6
    const fc = v.cut1 + (v.cut0 - v.cut1) * Math.exp(-t / v.ctau)
    const g = gOf(fc)
    let y = f2(f1(x, g, 1.4, 0), g, k, 0)
    y += v.sub * Math.sin(TAU * ps)
    const amp = Math.min(1, t / v.atk) * Math.exp(-t / v.dec) * (t > gate ? Math.max(0, 1 - (t - gate) / 0.012) : 1)
    out[i] = (Math.tanh(y * v.drive) / norm) * amp
  }
  return out
}

/** Chord stab rendered once per chord: detuned voices spread left/right. */
function chordSample(notes: number[], gate: number, v: VoiceSpec, spread: number): Stereo {
  const n = sec(gate + 0.012)
  const out = stereo(n)
  for (const m of notes) {
    for (const [side, c] of [
      [out.L, -spread],
      [out.R, spread],
    ] as const) {
      const x = noteSample(midi(m) * 2 ** (c / 1200), gate, v)
      for (let i = 0; i < n; i++) side[i] += x[i] / Math.sqrt(notes.length)
    }
  }
  return out
}

// ---------- effects ----------

/** Stereo dotted-8th ping-pong delay with a darkening feedback loop, added into `out`. */
function pingPong(send: Mono, out: Stereo, time: number, fb: number, lpHz: number, level: number) {
  const d = sec(time)
  const bufL = mono(d)
  const bufR = mono(d)
  const lpL = svf()
  const lpR = svf()
  const g = gOf(lpHz)
  for (let i = 0, j = 0; i < send.length; i++, j = (j + 1) % d) {
    const yl = bufL[j]
    const yr = bufR[j]
    bufL[j] = send[i] + lpL(yr, g, 0.7, 0) * fb
    bufR[j] = lpR(yl, g, 0.7, 0) * fb
    out.L[i] += yl * level
    out.R[i] += yr * level
  }
}

/** Small Freeverb-style room: four damped combs and two allpasses per side. */
function reverb(send: Mono, out: Stereo, size: number, level: number) {
  const combs = [1116, 1188, 1277, 1356]
  const aps = [556, 441]
  for (const [ch, spread] of [
    [out.L, 0],
    [out.R, 23],
  ] as const) {
    const wet = mono(send.length)
    for (const c of combs) {
      const len = c + spread
      const buf = mono(len)
      let store = 0
      for (let i = 0, j = 0; i < send.length; i++, j = j + 1 === len ? 0 : j + 1) {
        const y = buf[j]
        store = y * 0.6 + store * 0.4
        buf[j] = send[i] + store * size
        wet[i] += y
      }
    }
    for (const a of aps) {
      const len = a + spread
      const buf = mono(len)
      for (let i = 0, j = 0; i < wet.length; i++, j = j + 1 === len ? 0 : j + 1) {
        const b = buf[j]
        buf[j] = wet[i] + b * 0.5
        wet[i] = b - wet[i]
      }
    }
    for (let i = 0; i < wet.length; i++) ch[i] += wet[i] * level * 0.25
  }
}

/** RBJ biquad, used for the K-weighting loudness filter. */
function biquad(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}

/** Ungated BS.1770 loudness (LUFS) of the first `len` samples. */
function loudness(mix: Stereo, len: number): number {
  let total = 0
  for (const ch of [mix.L, mix.R]) {
    const A = 10 ** (3.99984 / 40)
    let w = (TAU * 1681.97) / SR
    let alpha = Math.sin(w) / (2 * 0.7071752)
    let cw = Math.cos(w)
    const shelf = biquad(
      A * (A + 1 + (A - 1) * cw + 2 * Math.sqrt(A) * alpha),
      -2 * A * (A - 1 + (A + 1) * cw),
      A * (A + 1 + (A - 1) * cw - 2 * Math.sqrt(A) * alpha),
      A + 1 - (A - 1) * cw + 2 * Math.sqrt(A) * alpha,
      2 * (A - 1 - (A + 1) * cw),
      A + 1 - (A - 1) * cw - 2 * Math.sqrt(A) * alpha,
    )
    w = (TAU * 38.1355) / SR
    alpha = Math.sin(w) / (2 * 0.500327)
    cw = Math.cos(w)
    const hp = biquad((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha)
    let s = 0
    for (let i = 0; i < len; i++) {
      const y = hp(shelf(ch[i]))
      s += y * y
    }
    total += s / len
  }
  return -0.691 + 10 * Math.log10(total + 1e-12)
}

// ---------- arrangement ----------

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const scaleNote = (tonic: number, degree: number) => tonic + MINOR[degree % 7] + 12 * Math.floor(degree / 7)
/** Diatonic seventh chord on a minor-scale degree, voiced close inside [lo, lo + 12). */
const chordOf = (pc: number, degree: number, lo: number) =>
  [0, 2, 4, 6].map((i) => {
    const m = scaleNote(pc, degree + i)
    return lo + ((((m - lo) % 12) + 12) % 12)
  })

/** Tonic pitch class per genre, picked by seed. */
const KEYS: Record<Genre, number[]> = {
  house: [9, 5, 2, 0],
  techno: [9, 7, 4, 2],
  psy: [4, 6, 5, 7],
  hitech: [6, 7, 4, 5],
}

/** Parse a 16-step string: '.' rest, 'x' hit, 'X' accent. */
const steps = (s: string) => s.replace(/ /g, '').split('').map((c) => (c === 'X' ? 1 : c === 'x' ? 0.6 : 0))

/** Acid line: semitones with 'a' accent and 's' slide into the next note, '-' rest. */
const acidSteps = (s: string) =>
  s.split(' ').map((tok) => (tok === '-' ? null : { semi: parseInt(tok, 10), acc: tok.includes('a'), slide: tok.includes('s') }))

const ACID = [
  '0a 0 12a 0 - 3 - 0s 7 - 0 - 0 - 5 -',
  '0a 12 0 0a 7 - 0 10s 12 - 0 - - 0 - -',
  '0a 12a 13s 12 - 0 - 0 1 - 0 13 - 0 - -',
]

function mixBars(opts: GrooveOptions): Stereo {
  const { genre, bars, seed = 7, feel = 'standard', crashes = true } = opts
  const bpm = opts.bpm ?? GENRES[genre].bpm
  const beat = 60 / bpm
  const s16 = beat / 4
  const barLen = 4 * beat
  const n = Math.ceil((bars * barLen + TAIL) * SR)
  const v = (((seed - 1) % 3) + 3) % 3
  const keys = KEYS[genre]
  const pc = keys[(((seed - 1) % keys.length) + keys.length) % keys.length]
  const rand = rng(seed * 7919 + bars * 13 + genre.length * 104729)
  const noise = noiseGen(seed * 977 + genre.length)
  const isPsy = genre === 'psy' || genre === 'hitech'

  // buses: kick and bass stay mono-centre; music and its sends are ducked by the kick
  const kickBus = stereo(n)
  const drums = stereo(n)
  const bassBus = stereo(n)
  const music = stereo(n)
  const verbSend = mono(n)
  const dlySend = mono(n)
  const kickTimes: number[] = []

  const put = (bus: Stereo, src: Mono, t: number, gain: number, pan = 0, verb = 0, dly = 0, maxDur = Infinity) => {
    const at = Math.round(t * SR)
    const len = Math.min(src.length, sec(maxDur), n - at)
    const gl = gain * Math.min(1, 1 - pan)
    const gr = gain * Math.min(1, 1 + pan)
    const fade = Math.min(len, 220)
    const choke = len < src.length
    for (let i = Math.max(0, -at); i < len; i++) {
      const x = choke && i > len - fade ? (src[i] * (len - i)) / fade : src[i]
      bus.L[at + i] += x * gl
      bus.R[at + i] += x * gr
      if (verb) verbSend[at + i] += x * gain * verb
      if (dly) dlySend[at + i] += x * gain * dly
    }
  }
  const putSt = (src: Stereo, t: number, gain: number, verb = 0, dly = 0, bus = music) => {
    const at = Math.round(t * SR)
    const len = Math.min(src.L.length, n - at)
    for (let i = 0; i < len; i++) {
      bus.L[at + i] += src.L[i] * gain
      bus.R[at + i] += src.R[i] * gain
      const m = (src.L[i] + src.R[i]) * 0.5 * gain
      if (verb) verbSend[at + i] += m * verb
      if (dly) dlySend[at + i] += m * dly
    }
  }

  // ---- sounds per genre ----
  const kickSpec: KickSpec = {
    house: { f0: 230, f1: 50, pitchTau: 0.03, hold: 0.04, decay: 0.12, len: Math.min(0.45, beat * 0.95), drive: 1.6, click: 0.12 },
    techno: { f0: 320, f1: 47, pitchTau: 0.018, hold: 0.02, decay: 0.07, len: Math.min(0.3, beat * 0.8), drive: 3.2, click: 0.3 },
    psy: { f0: 360, f1: 52, pitchTau: 0.013, hold: 0.025, decay: 0.04, len: s16 * 1.05, drive: 2.4, click: 0.25 },
    hitech: { f0: 420, f1: 56, pitchTau: 0.01, hold: 0.02, decay: 0.032, len: s16 * 1.05, drive: 3, click: 0.3 },
  }[genre]
  const kick = kickSample(kickSpec, noise)
  const bassRoot = genre === 'house' ? 33 + ((pc - 9 + 12) % 12) : 28 + ((pc - 4 + 12) % 12)
  const rumble = genre === 'techno' ? rumbleSample(beat, midi(bassRoot), noise) : null
  const hatBase = { house: 310, techno: 360, psy: 400, hitech: 470 }[genre]
  const chh = metalSample(0.09, genre === 'house' ? 0.016 : 0.012, 0.45, 7500, hatBase, noise)
  const ohh = metalSample(0.4, genre === 'house' ? 0.11 : isPsy ? 0.06 : 0.09, 0.5, 7000, hatBase, noise)
  const shaker = metalSample(0.06, 0.018, 0.95, 8000, hatBase, noise)
  const ride = metalSample(0.9, 0.28, 0.35, 4800, hatBase * 1.9, noise, 0.25)
  const crashL = metalSample(2.2, 0.55, 0.65, 4200, 340, noise)
  const crashR = metalSample(2.2, 0.55, 0.65, 4200, 351, noise)
  const clap = clapSample(noise, genre === 'house' ? 1150 : 1300)
  const rim = percSample(1700, 1600, 0.012, 0.6, noise)
  const conga = percSample(390, 300, 0.07, 0.2, noise)
  const tom = percSample(220, 140, 0.09, 0.1, noise)
  const fmA = fmSample(1250 + v * 170, 1.414, 4, 0.03)
  const fmB = fmSample(2600, 2.76, 2.5, 0.018)
  const zap = zapSample(isPsy ? 4200 : 3000, 90, genre === 'hitech' ? 0.11 : 0.16)

  const bassVoice: VoiceSpec = {
    house: { saw: 0.6, sq: 0.2, sub: 0.7, det: 0, cut0: 1500, cut1: 280, ctau: 0.05, q: 1.1, atk: 0.003, dec: 0.22, drive: 1.6 },
    techno: { saw: 0.5, sq: 0.3, sub: 0.8, det: 0, cut0: 700, cut1: 140, ctau: 0.03, q: 1.3, atk: 0.002, dec: 0.08, drive: 1.8 },
    psy: { saw: 1, sq: 0, sub: 0.35, det: 7, cut0: 2600, cut1: 170, ctau: 0.022, q: 1.8, atk: 0.001, dec: 0.4, drive: 2.2 },
    hitech: { saw: 0.8, sq: 0.4, sub: 0.35, det: 9, cut0: 4200, cut1: 240, ctau: 0.013, q: 2.6, atk: 0.001, dec: 0.3, drive: 2.8 },
  }[genre]
  const bassGate = { house: s16 * 1.7, techno: s16 * 0.9, psy: s16 * 0.82, hitech: s16 * 0.8 }[genre]
  const bassCache = new Map<string, Mono>()
  const bassNote = (m: number, gate = bassGate) => {
    const key = `${m}:${gate.toFixed(4)}`
    let x = bassCache.get(key)
    if (!x) bassCache.set(key, (x = noteSample(midi(m), gate, bassVoice)))
    return x
  }

  const stabVoice: VoiceSpec =
    genre === 'house'
      ? { saw: 0.6, sq: 0.5, sub: 0, det: 0, cut0: 3800, cut1: 900, ctau: 0.07, q: 1, atk: 0.003, dec: 0.16, drive: 1.3 }
      : genre === 'techno'
        ? { saw: 1, sq: 0, sub: 0, det: 0, cut0: 1600, cut1: 380, ctau: 0.05, q: 2.2, atk: 0.002, dec: 0.1, drive: 1.8 }
        : { saw: 1, sq: 0.3, sub: 0, det: 0, cut0: 5000, cut1: 700, ctau: 0.04, q: 1.5, atk: 0.001, dec: 0.12, drive: 2 }
  const chordCache = new Map<string, Stereo>()
  const chord = (notes: number[], gate: number) => {
    const key = `${notes.join(',')}:${gate.toFixed(3)}`
    let x = chordCache.get(key)
    if (!x) chordCache.set(key, (x = chordSample(notes, gate, stabVoice, genre === 'house' ? 9 : 6)))
    return x
  }

  // ---- harmony: a 4-bar progression per seed so the 1 of each bar moves ----
  const PROG: Record<Genre, number[][]> = {
    house: [
      [0, 5, 3, 4],
      [0, 3, 6, 5],
      [0, 6, 5, 6],
    ],
    techno: [
      [0, 0, 0, 6],
      [0, 3, 0, 3],
      [0, 0, 5, 4],
    ],
    psy: [
      [0, 0, 0, 1],
      [0, 3, 0, 5],
      [0, 0, 3, -2],
    ],
    hitech: [
      [0, 0, 1, -2],
      [0, 3, 1, 0],
      [0, 5, 3, 1],
    ],
  }
  const prog = PROG[genre][v]

  // per-seed rhythm variations
  const houseBass = [
    ['..x...x...x...X.', '..x...x...x...x.'],
    ['..x...xx..x...xx', '..x...x...x..x.x'],
    ['..xx..x...xx..x.', '..x...x.x.x...x.'],
  ][v].map(steps)
  // stabs after the 1 stay out of beat 4, so the 1 is the biggest change in the bar
  const houseStab = steps(['X.....x...x.....', 'X..x....x..x....', 'X.....x.x..x....'][v])
  const housePerc = steps(['...x.x.....x..x.', '.x....x..x....x.', '..x..x.x....x..x'][v])
  const technoStab = steps(['X.....x....x....', 'X..x......x.....', 'X........x...x..'][v])
  const technoPerc = steps(['..x..x..x..x..x.', '...x..x...x..x..', '.x..x..x..x..x..'][v])
  const technoBass = steps(['...x.......x....', '..........xx....', '...x..x...x.....'][v])
  const psyBassBeat = [
    [0, 0, 0],
    [0, 12, 0],
    [0, 0, 12],
  ][v]
  const hitechMetal = steps(['x.xx.x.xx.x.x.xx', '.xx.x.xx.xx.x.x.', 'xx.x.xx.x.xx.x.x'][v])
  const hitechZap = steps(['X.......x.......', 'X.....x...x.....', 'X..x......x.....'][v])
  const acid = acidSteps(ACID[v])

  const kickAt = (t: number, g = 1) => {
    put(kickBus, kick, t, g)
    kickTimes.push(t)
    if (rumble) put(kickBus, rumble, t, 0.32 * g)
  }

  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * barLen
    const deg = prog[bar % 4]
    const lastBar = bar % PHRASE === PHRASE - 1
    // psy keys move by semitones (phrygian colour), the rest by scale degree
    const root = isPsy ? bassRoot + deg : genre === 'house' ? scaleNote(bassRoot, deg) - (scaleNote(bassRoot, deg) - bassRoot > 7 ? 12 : 0) : scaleNote(bassRoot, deg)
    // psy and hi-tech get a bright fifth-and-octave lead hit instead of a seventh chord
    const psyLead = 52 + ((pc - 4 + 12) % 12) + deg
    const stabNotes = isPsy ? [psyLead, psyLead + 7, psyLead + 12] : chordOf(pc, deg, genre === 'house' ? 57 : 55)
    const T = (s: number) => b0 + s * s16
    if (crashes && bar % PHRASE === 0) {
      put(drums, crashL, b0, 0.5, -0.6, 0.2)
      put(drums, crashR, b0, 0.5, 0.6, 0.2)
    }

    if (feel !== 'standard') {
      const half = feel === 'half'
      const kicks = half ? [0, 10] : [0, 2, 4, 6, 8, 10, 12, 14]
      for (const s of kicks) kickAt(T(s), s % 4 ? 0.85 : 1)
      for (const s of half ? [8] : [2, 6, 10, 14]) put(drums, clap, T(s), half ? 0.5 : 0.38, 0, 0.35)
      for (let s = 0; s < 16; s += half ? 2 : 1) put(drums, chh, T(s), half ? 0.3 : s % 2 ? 0.32 : 0.18, 0.2)
      for (const s of half ? [4, 12] : [1, 3, 5, 7, 9, 11, 13, 15]) put(drums, ohh, T(s), half ? 0.3 : 0.18, -0.15, 0, 0, s16 * 1.8)
      if (half) {
        put(bassBus, bassNote(root, beat * 1.6), T(0), 0.8)
        put(bassBus, bassNote(root + 12, s16 * 1.5), T(11), 0.55)
      } else for (let s = 1; s < 16; s += 2) put(bassBus, bassNote(s === 15 ? root + 12 : root, Math.min(bassGate, s16 * 0.85)), T(s), 0.7)
      putSt(chord(stabNotes, half ? beat * 1.5 : beat * 0.5), T(0), 0.5, 0.3, 0.2)
      continue
    }

    if (genre === 'house') {
      for (let q = 0; q < 4; q++) if (!(lastBar && q === 3)) kickAt(T(q * 4))
      put(drums, clap, T(4), 0.27, 0, 0.35)
      put(drums, clap, T(12), 0.27, 0, 0.35)
      for (let s = 0; s < 16; s++) {
        const sw = s % 2 ? s16 * 0.12 : 0 // light shuffle on the 16ths
        if (s % 4 === 2) put(drums, ohh, T(s), 0.42, 0.15, 0, 0, s16 * 1.9)
        else if (s % 2) put(drums, chh, T(s) + sw, 0.26 + 0.1 * rand(), -0.25)
        put(drums, shaker, T(s) + sw, s % 2 ? 0.2 : 0.12, 0.35)
        if (housePerc[s]) put(drums, s % 3 ? conga : rim, T(s) + sw, s % 3 ? 0.22 : 0.12, 0.45, 0.15)
        const bp = houseBass[bar % 2]
        if (bp[s] && !(lastBar && s >= 12)) {
          const up = bp[s] > 0.8 || (s % 4 === 3 && s > 8)
          put(bassBus, bassNote(up ? root + 12 : s === 14 && bar % 2 ? root + 7 : root), T(s), 0.62)
        }
        const sp = houseStab[s]
        // the stab on the 1 skips the sidechain so it lands with the kick
        if (sp) putSt(chord(stabNotes, s === 0 ? beat * 0.9 : s16 * 1.4), T(s), sp > 0.8 ? 0.75 : 0.3, 0.4, 0.22, s === 0 ? drums : music)
      }
      if (lastBar) for (const s of [13, 14, 15]) put(drums, clap, T(s), 0.18 + 0.08 * (s - 13), 0, 0.3)
    } else if (genre === 'techno') {
      for (let q = 0; q < 4; q++) if (!(lastBar && q === 3)) kickAt(T(q * 4))
      if (v !== 1) for (const s of [4, 12]) put(drums, clap, T(s), 0.24, 0, 0.45)
      for (let s = 0; s < 16; s++) {
        const acc = s % 4 === 2 ? 0.34 : s % 2 ? 0.16 : 0.1
        put(drums, s % 4 === 2 ? ohh : chh, T(s), acc + 0.04 * rand(), 0.2, 0, 0, s16 * 1.2)
        if (s % 2 === 0) put(drums, ride, T(s), s % 4 === 2 ? 0.2 : 0.11, -0.35, 0.1)
        if (technoPerc[s]) put(drums, s % 2 ? rim : tom, T(s), s % 2 ? 0.12 : 0.28, -0.3 + 0.2 * (s % 3), 0.25, 0.15)
        if (technoBass[s] && !(lastBar && s >= 12)) put(bassBus, bassNote(root + (s > 8 ? 12 : 0)), T(s), 0.5)
        const sp = technoStab[s]
        if (sp) putSt(chord(stabNotes, s16 * (s === 0 ? 3 : 1.2)), T(s), sp > 0.8 ? 0.65 : 0.32, 0.35, 0.55, s === 0 ? drums : music)
      }
    } else {
      // psytrance and hi-tech: kick then three rolling 16ths of bass on every beat (KBBB)
      const hi = genre === 'hitech'
      for (let q = 0; q < 4; q++) {
        const gap = lastBar && q === 3
        if (!gap) kickAt(T(q * 4))
        for (let k = 1; k < 4; k++) {
          if (gap) continue
          let semi = psyBassBeat[k - 1]
          if (q === 3 && bar % 2 === 1) semi = [0, 3, 7][k - 1] + (hi ? 12 : 0)
          if (hi && (q + k) % 3 === 0) semi += 12
          // near-legato B-B, then a gap so the next kick hits out of silence
          put(bassBus, bassNote(root + semi, s16 * (k === 3 ? 0.6 : 0.98)), T(q * 4 + k), k === 1 ? 0.62 : 0.55)
        }
        put(drums, ohh, T(q * 4 + 2), hi ? 0.3 : 0.4, 0.2, 0, 0, s16 * 1.6)
        if (q % 2 === 1) put(drums, clap, T(q * 4), 0.18, 0, 0.3)
      }
      for (let s = 0; s < 16; s++) {
        if (s % 4 !== 2) put(drums, chh, T(s), (s % 2 ? 0.16 : 0.09) + 0.05 * rand(), s % 2 ? 0.35 : -0.35)
        if (hi) {
          if (hitechMetal[s]) put(drums, s % 3 ? fmA : fmB, T(s), s % 3 ? 0.13 : 0.1, ((s * 5) % 7) / 3.5 - 1, 0.1, 0.2)
          if (s % 2 === 0) put(drums, ride, T(s), 0.08, -0.5)
          const z = hitechZap[s]
          if (z) put(music, zap, T(s), z > 0.8 ? 0.34 : 0.2, s ? 0.4 : 0, 0.2, 0.35)
        } else if (s === 0) put(music, zap, T(0), 0.3, 0, 0.25, 0.3)
        if (s === 0) putSt(chord(stabNotes, s16 * 3), T(0), hi ? 0.4 : 0.36, 0.3, 0.3, drums)
        if (lastBar && hi && s >= 12) put(drums, chh, T(s + 0.5), 0.12, 0.3)
      }
      if (!hi) {
        // acid squelch: monophonic 303-style line, one octave and a bit above the bass
        const line = acidLine(acid, bar, s16, root + 24)
        put(music, line, T(0), 0.42, -0.1, 0.25, 0.4)
      }
    }
  }

  // ---- mix ----
  const duck = new Float32Array(n).fill(1)
  const depth = { house: 0.55, techno: 0.5, psy: 0.45, hitech: 0.45 }[genre]
  const rec = genre === 'house' ? beat * 0.5 : beat * 0.35
  for (const t of kickTimes) {
    const a = Math.round(t * SR)
    for (let i = 0; i < sec(rec * 3) && a + i < n; i++) {
      const tt = i / SR
      const d = 1 - depth * Math.min(1, tt / 0.003) * Math.exp(-Math.max(0, tt - 0.01) / rec)
      if (d < duck[a + i]) duck[a + i] = d
    }
  }
  const fx = stereo(n)
  pingPong(dlySend, fx, s16 * 3, 0.45, genre === 'techno' ? 1400 : 2800, 0.6)
  reverb(verbSend, fx, genre === 'techno' ? 0.8 : 0.72, 0.6)

  const mix = stereo(n)
  const bassDuck = genre === 'house' || genre === 'techno'
  for (let i = 0; i < n; i++) {
    const d = duck[i]
    const bd = bassDuck ? d : 1
    mix.L[i] = kickBus.L[i] + bassBus.L[i] * bd + drums.L[i] + (music.L[i] + fx.L[i]) * d
    mix.R[i] = kickBus.R[i] + bassBus.R[i] * bd + drums.R[i] + (music.R[i] + fx.R[i]) * d
  }

  // ---- master: match loudness across genres, then soft-clip peaks under the ceiling ----
  const gain = 10 ** ((TARGET_LUFS - loudness(mix, Math.min(n, Math.round(bars * barLen * SR)))) / 20)
  const th = CEILING * 0.72
  for (const ch of [mix.L, mix.R]) {
    for (let i = 0; i < n; i++) {
      const x = ch[i] * gain
      const a = Math.abs(x)
      ch[i] = a <= th ? x : Math.sign(x) * (th + (CEILING - th) * Math.tanh((a - th) / (CEILING - th)))
    }
  }
  return mix
}

/** Render one bar of a 303-style acid line (continuous phase, glide, resonant filter with accent envelope). */
function acidLine(seq: ({ semi: number; acc: boolean; slide: boolean } | null)[], bar: number, s16: number, base: number): Mono {
  const n = sec(s16 * 16 + 0.05)
  const out = mono(n)
  const f1 = svf()
  const f2 = svf()
  // the filter opens and closes over 4 bars, so the line breathes across the phrase
  const sweep = 0.5 - 0.5 * Math.cos((TAU * ((bar % 4) + 0.5)) / 4)
  const cutBase = 260 + 700 * sweep
  let ph = 0
  let freq = midi(base)
  let amp = 0
  const stepN = s16 * SR
  for (let s = 0; s < 16; s++) {
    const st = seq[s]
    const a = Math.round(s * stepN)
    const b = Math.round((s + 1) * stepN)
    if (!st) {
      for (let i = a; i < b; i++) {
        amp *= 0.995
        out[i] = 0
      }
      continue
    }
    const target = midi(base + st.semi)
    const prevSlide = s > 0 && seq[s - 1]?.slide
    const gate = st.slide ? b - a : Math.round((b - a) * 0.6)
    const envAmt = st.acc ? 3200 : 1700
    for (let i = a; i < b; i++) {
      const t = (i - a) / SR
      freq = prevSlide ? freq + (target - freq) * 0.004 : target
      const dt = freq / SR
      ph = (ph + dt) % 1
      const x = saw(ph, dt)
      const fc = cutBase + envAmt * Math.exp(-t / (st.acc ? 0.09 : 0.06)) * (prevSlide ? 0.35 : 1)
      const g = gOf(fc)
      const y = f2(f1(x, g, 1.2, 0), g, st.acc ? 0.12 : 0.18, 0)
      const want = i - a < gate ? (st.acc ? 1 : 0.7) : 0
      amp += (want - amp) * (want > amp ? 0.08 : 0.01)
      out[i] = Math.tanh(y * 1.6) * amp
    }
  }
  return out
}
