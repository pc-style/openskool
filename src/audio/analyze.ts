// Pure track analysis: tempo, beat grid, downbeat/phrase anchor, key, per-bar energy.
// Runs on raw PCM so it is testable outside the browser.

export interface Analysis {
  bpm: number
  /** Time (s) of a downbeat that starts an 8-bar phrase. Bars are anchor + n * barLength. */
  anchor: number
  /** Camelot key such as "8A", or null when no key is clear. */
  camelot: string | null
  keyName: string | null
  /** Mean RMS per bar starting at the first bar ≥ 0, normalised to 0..1. */
  barEnergy: number[]
  /** Overall loudness 0..1 used for set flow. */
  energy: number
  /** Peak envelope for drawing, 0..1. */
  peaks: number[]
  duration: number
}

const ENV_RATE_TARGET = 11025

export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const out = new Float32Array(channels[0].length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length
  return out
}

function decimate(x: Float32Array, factor: number): Float32Array {
  const n = Math.floor(x.length / factor)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < factor; j++) s += x[i * factor + j]
    out[i] = s / factor
  }
  return out
}

/** One-pole low-pass, in place copy. */
function lowpass(x: Float32Array, rate: number, cutoff: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoff) / rate)
  const out = new Float32Array(x.length)
  let y = 0
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * x[i] + a * y
    out[i] = y
  }
  return out
}

/** Log-energy flux per hop: positive changes in band energy. */
function flux(x: Float32Array, hop: number): Float32Array {
  const n = Math.floor(x.length / hop)
  const e = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) {
      const v = x[i * hop + j]
      s += v * v
    }
    e[i] = Math.log(1e-9 + s / hop)
  }
  const f = new Float32Array(n)
  for (let i = 1; i < n; i++) f[i] = Math.max(0, e[i] - e[i - 1])
  return f
}

function normalise(x: Float32Array): Float32Array {
  // subtract a moving mean (≈0.5 s) so loud sections do not dominate
  const w = 40
  const out = new Float32Array(x.length)
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    sum += x[i]
    if (i >= w) sum -= x[i - w]
    out[i] = Math.max(0, x[i] - sum / Math.min(i + 1, w))
  }
  let max = 0
  for (const v of out) max = Math.max(max, v)
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max
  return out
}

function interp(x: Float32Array, t: number): number {
  const i = Math.floor(t)
  if (i < 0 || i + 1 >= x.length) return 0
  const f = t - i
  return x[i] * (1 - f) + x[i + 1] * f
}

/** Sum of the envelope sampled on a comb of period p (frames) and phase. */
function comb(env: Float32Array, p: number, phase: number): number {
  let s = 0
  for (let t = phase; t < env.length - 1; t += p) s += interp(env, t)
  return s
}

export function estimateTempo(env: Float32Array, envRate: number, minBpm = 85, maxBpm = 200): number {
  const lagFor = (bpm: number) => (60 / bpm) * envRate
  const acf = (lag: number) => {
    let s = 0
    const l = Math.floor(lag)
    const f = lag - l
    for (let i = 0; i + l + 1 < env.length; i++) s += env[i] * (env[i + l] * (1 - f) + env[i + l + 1] * f)
    return s
  }
  let best = 120
  let bestScore = -Infinity
  for (let bpm = minBpm; bpm < maxBpm; bpm += 0.5) {
    const lag = lagFor(bpm)
    // reward lags whose multiples (bar structure) also correlate
    const score = acf(lag) + 0.5 * acf(lag * 2) + 0.25 * acf(lag * 4)
    if (score > bestScore) {
      bestScore = score
      best = bpm
    }
  }
  // refine with a comb search (tempo × phase) at fine resolution
  let refined = best
  let refinedScore = -Infinity
  for (let bpm = best - 0.75; bpm <= best + 0.75; bpm += 0.01) {
    const p = lagFor(bpm)
    let m = 0
    for (let ph = 0; ph < p; ph += 0.5) m = Math.max(m, comb(env, p, ph))
    const score = (m / env.length) * p
    if (score > refinedScore) {
      refinedScore = score
      refined = bpm
    }
  }
  const rounded = Math.round(refined)
  if (Math.abs(refined - rounded) < 0.08) return rounded
  return Math.round(refined * 100) / 100
}

/** Best beat phase (seconds of the first beat) for a known tempo, refined on a fine envelope. */
export function estimateBeatPhase(env: Float32Array, envRate: number, fine: Float32Array, fineRate: number, bpm: number): number {
  const p = (60 / bpm) * envRate
  let bestPh = 0
  let best = -1
  for (let ph = 0; ph < p; ph += 0.25) {
    const s = comb(env, p, ph)
    if (s > best) {
      best = s
      bestPh = ph
    }
  }
  // refine: for every beat find the steepest rise in the fine envelope within ±25 ms
  const beat = 60 / bpm
  const t0 = bestPh / envRate
  const devs: number[] = []
  const win = Math.round(0.025 * fineRate)
  for (let t = t0; t < fine.length / fineRate; t += beat) {
    const c = Math.round(t * fineRate)
    let bi = -1
    let bv = 0.15
    for (let i = c - win; i <= c + win; i++) {
      if (i > 0 && i < fine.length && fine[i] > bv) {
        bv = fine[i]
        bi = i
      }
    }
    if (bi >= 0) devs.push(bi / fineRate - t)
  }
  devs.sort((a, b) => a - b)
  const med = devs.length ? devs[Math.floor(devs.length / 2)] : 0
  let first = t0 + med
  while (first - beat >= 0) first -= beat
  while (first < 0) first += beat
  return first
}

/** Band-energy features averaged per beat, used for downbeat and phrase novelty. */
function beatFeatures(x: Float32Array, rate: number, firstBeat: number, beat: number): number[][] {
  const bands = [120, 400, 1500, 5000]
  const filtered = bands.map((c) => lowpass(x, rate, c))
  const feats: number[][] = []
  for (let t = firstBeat; t + beat < x.length / rate; t += beat) {
    const a = Math.floor(t * rate)
    const b = Math.floor((t + beat) * rate)
    const f: number[] = []
    let prev: Float32Array = new Float32Array(0)
    for (let k = 0; k <= bands.length; k++) {
      let s = 0
      for (let i = a; i < b; i++) {
        const low = k < bands.length ? filtered[k][i] : x[i]
        const below = k > 0 ? (prev.length ? prev[i] : 0) : 0
        const v = low - below
        s += v * v
      }
      f.push(Math.log(1e-9 + s / Math.max(1, b - a)))
      if (k < bands.length) prev = filtered[k]
    }
    feats.push(f)
  }
  return feats
}

/** How much of b is new compared to a: only rising band energy counts, so decays after a hit do not. */
function rise(a: number[], b: number[]): number {
  let s = 0
  // capped per band so the jump out of leading silence does not outvote the music
  for (let i = 0; i < a.length; i++) s += Math.min(1.5, Math.max(0, b[i] - a[i]))
  return s
}

/**
 * Which of the 4 beats in a bar is the 1, and which of 8 bars starts a phrase.
 * Dance music changes on downbeats and on phrase starts, so we pick the phase with most novelty.
 */
export function estimateAnchor(x: Float32Array, rate: number, firstBeat: number, bpm: number): number {
  const beat = 60 / bpm
  const feats = beatFeatures(x, rate, firstBeat, beat)
  if (feats.length < 16) return firstBeat
  const nov = feats.map((f, i) => (i === 0 ? 0 : rise(feats[i - 1], f)))
  // low band energy per beat also tends to peak on the 1 (kick + bass note)
  const beatPhase = [0, 1, 2, 3].map((p) => {
    let s = 0
    let n = 0
    for (let i = p; i < nov.length; i += 4) {
      s += nov[i]
      n++
    }
    return s / Math.max(1, n)
  })
  const db = beatPhase.indexOf(Math.max(...beatPhase))
  // bar-level novelty for phrase start
  const bars: number[][] = []
  for (let i = db; i + 4 <= feats.length; i += 4) {
    const avg = feats[i].map((_, k) => (feats[i][k] + feats[i + 1][k] + feats[i + 2][k] + feats[i + 3][k]) / 4)
    bars.push(avg)
  }
  let phraseBar = 0
  if (bars.length >= 16) {
    const bnov = bars.map((f, i) => (i === 0 ? 0 : rise(bars[i - 1], f)))
    const ph = Array.from({ length: 8 }, (_, p) => {
      let s = 0
      let n = 0
      for (let i = p; i < bnov.length; i += 8) {
        if (i === 0) continue
        s += bnov[i]
        n++
      }
      return s / Math.max(1, n)
    })
    phraseBar = ph.indexOf(Math.max(...ph))
  }
  let anchor = firstBeat + (db + phraseBar * 4) * beat
  const phraseLen = 32 * beat
  while (anchor - phraseLen >= -beat * 0.5) anchor -= phraseLen
  return anchor
}

// ---------- key ----------

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j]
        const ai = im[i + j]
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr
        re[i + j] = ar + br
        im[i + j] = ai + bi
        re[i + j + len / 2] = ar - br
        im[i + j + len / 2] = ai - bi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
export const PITCH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
// Camelot numbers indexed by pitch class
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10]

export function camelotOf(pc: number, minor: boolean): string {
  return `${(minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[pc]}${minor ? 'A' : 'B'}`
}

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length
  const mb = b.reduce((s, v) => s + v, 0) / b.length
  let num = 0
  let da = 0
  let dbb = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    dbb += (b[i] - mb) ** 2
  }
  return num / Math.sqrt(da * dbb || 1)
}

export function chroma(x: Float32Array, rate: number): number[] {
  const factor = Math.max(1, Math.floor(rate / 5512))
  // anti-alias before decimating, otherwise hats and noise fold down onto the note bins
  let aa = x
  for (let k = 0; k < 4; k++) aa = lowpass(aa, rate, 2100)
  const y = decimate(aa, factor)
  const r = rate / factor
  const N = 8192
  const hop = 4096
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  const bins: { pc: number; k: number }[] = []
  for (let k = 1; k < N / 2; k++) {
    const f = (k * r) / N
    if (f < 55 || f > 2000) continue
    const midi = 69 + 12 * Math.log2(f / 440)
    bins.push({ pc: ((Math.round(midi) % 12) + 12) % 12, k })
  }
  const c = new Array(12).fill(0)
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const mag = new Float64Array(N / 2 + 2)
  for (let s = 0; s + N < y.length; s += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = y[s + i] * win[i]
      im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k])
    // only tonal peaks well above the frame's noise floor count, so drums and hiss do not flatten the chroma
    const sorted = Float64Array.from(mag.subarray(bins[0].k, bins[bins.length - 1].k)).sort()
    const floor = sorted[Math.floor(sorted.length / 2)] * 4
    const frame = new Array(12).fill(0)
    for (const { pc, k } of bins) {
      const m = mag[k]
      if (m > floor && m >= mag[k - 1] && m >= mag[k + 1] && m >= mag[k - 2] && m >= mag[k + 2]) frame[pc] += Math.sqrt(m)
    }
    const total = frame.reduce((a, b) => a + b, 0)
    if (total > 0) for (let i = 0; i < 12; i++) c[i] += frame[i] / total
  }
  return c
}

export function estimateKey(x: Float32Array, rate: number): { pc: number; minor: boolean; confidence: number } {
  const c = chroma(x, rate)
  let best = { pc: 0, minor: false, confidence: -1 }
  for (let pc = 0; pc < 12; pc++) {
    const rot = c.map((_, i) => c[(i + pc) % 12])
    const mj = corr(rot, MAJOR)
    const mn = corr(rot, MINOR)
    if (mj > best.confidence) best = { pc, minor: false, confidence: mj }
    if (mn > best.confidence) best = { pc, minor: true, confidence: mn }
  }
  return best
}

// ---------- entry point ----------

export function analyse(channels: Float32Array[], sampleRate: number): Analysis {
  const mono = toMono(channels)
  const duration = mono.length / sampleRate
  const factor = Math.max(1, Math.round(sampleRate / ENV_RATE_TARGET))
  const x = decimate(mono, factor)
  const rate = sampleRate / factor

  const hop = 128
  const low = lowpass(lowpass(x, rate, 150), rate, 150)
  const env = new Float32Array(Math.floor(x.length / hop))
  const lowFlux = flux(low, hop)
  const fullFlux = flux(x, hop)
  for (let i = 0; i < env.length; i++) env[i] = lowFlux[i] + 0.5 * fullFlux[i]
  const envN = normalise(env)
  const envRate = rate / hop

  const fineHop = 32
  const fine = normalise(flux(low, fineHop))
  const fineRate = rate / fineHop

  const bpm = estimateTempo(envN, envRate)
  const firstBeat = estimateBeatPhase(envN, envRate, fine, fineRate, bpm)
  const anchor = estimateAnchor(x, rate, firstBeat, bpm)

  const key = estimateKey(x, rate)
  const clear = key.confidence > 0.4

  const bar = (240 / bpm) * rate
  const barEnergy: number[] = []
  let a0 = anchor
  while (a0 * rate >= bar) a0 -= bar / rate
  for (let s = Math.max(0, Math.round(a0 * rate)); s + bar <= x.length; s += bar) {
    let e = 0
    const a = Math.floor(s)
    const b = Math.floor(s + bar)
    for (let i = a; i < b; i++) e += x[i] * x[i]
    barEnergy.push(Math.sqrt(e / (b - a)))
  }
  const maxE = Math.max(1e-9, ...barEnergy)
  const peaks: number[] = []
  const P = 800
  const step = Math.floor(mono.length / P) || 1
  let pmax = 1e-9
  for (let i = 0; i < P; i++) {
    let m = 0
    for (let j = i * step; j < Math.min(mono.length, (i + 1) * step); j += 4) m = Math.max(m, Math.abs(mono[j]))
    peaks.push(m)
    pmax = Math.max(pmax, m)
  }
  const sortedE = [...barEnergy].sort((p, q) => p - q)
  const typical = sortedE[Math.floor(sortedE.length * 0.75)] ?? 0
  return {
    bpm,
    anchor,
    camelot: clear ? camelotOf(key.pc, key.minor) : null,
    keyName: clear ? `${PITCH[key.pc]}${key.minor ? 'm' : ''}` : null,
    barEnergy: barEnergy.map((e) => e / maxE),
    // loudness of the busier sections: about -20 dBFS RMS reads as 0, -6 dBFS as 1
    energy: Math.max(0, Math.min(1, (20 * Math.log10(typical + 1e-9) + 20) / 14)),
    peaks: peaks.map((p) => p / pmax),
    duration,
  }
}
