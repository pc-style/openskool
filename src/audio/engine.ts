// Shared AudioContext, playback helpers and tap timing.
import { getSettings } from '../lib/progress'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let scope: AnalyserNode | null = null

export function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    master = ctx.createGain()
    scope = ctx.createAnalyser()
    scope.fftSize = 2048
    scope.smoothingTimeConstant = 0.6
    master.connect(ctx.destination)
    master.connect(scope)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Everything audible goes through here, so visualisers can listen to it. */
export function out(): AudioNode {
  ac()
  return master!
}

/** The analyser on the master output, or null before any audio has been set up. */
export const outputAnalyser = () => scope

const active = new Set<AudioScheduledSourceNode>()

export function track<T extends AudioScheduledSourceNode>(n: T): T {
  active.add(n)
  n.addEventListener('ended', () => active.delete(n))
  return n
}

export function stopAll() {
  for (const n of active) {
    try {
      n.stop()
    } catch {
      /* not started */
    }
  }
  active.clear()
}

export interface PlayOptions {
  /** Offset into the buffer (s). */
  from: number
  /** How long to play (s of buffer time). */
  dur?: number
  /** Context time to start at; defaults to now + 0.12 s. */
  at?: number
  rate?: number
  /** Where to connect the source; defaults to destination. */
  to?: AudioNode
  gain?: number
  /** Stereo position, -1 left to 1 right. */
  pan?: number
}

export function play(buffer: AudioBuffer, o: PlayOptions) {
  const c = ac()
  const src = track(c.createBufferSource())
  src.buffer = buffer
  src.playbackRate.value = o.rate ?? 1
  const g = c.createGain()
  g.gain.value = o.gain ?? 1
  if (o.pan) {
    const p = c.createStereoPanner()
    p.pan.value = o.pan
    src.connect(g).connect(p).connect(o.to ?? out())
  } else src.connect(g).connect(o.to ?? out())
  const at = o.at ?? c.currentTime + 0.12
  const from = Math.max(0, o.from)
  // when asked to start before the buffer begins, delay the start instead
  const delay = o.from < 0 ? -o.from / (o.rate ?? 1) : 0
  if (o.dur !== undefined) src.start(at + delay, from, Math.max(0.01, o.dur - (from - o.from)))
  else src.start(at + delay, from)
  return { src, gain: g, at }
}

export function click(at: number, accent = false, level = 0.35, to?: AudioNode) {
  const c = ac()
  const o = track(c.createOscillator())
  o.frequency.value = accent ? 1760 : 1320
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(level, at + 0.001)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04)
  o.connect(g).connect(to ?? out())
  o.start(at)
  o.stop(at + 0.05)
}

/**
 * Context time the user heard when an input event happened. Uses the output timestamp, which
 * accounts for the device's output latency, then applies the user's calibration offset.
 */
export function heardTime(eventTimeStamp: number): number {
  const c = ac()
  const ts = c.getOutputTimestamp?.()
  let t: number
  if (ts && ts.contextTime !== undefined && ts.performanceTime) t = ts.contextTime + (eventTimeStamp - ts.performanceTime) / 1000
  else t = c.currentTime - (c.outputLatency || 0) - c.baseLatency
  return t - getSettings().latencyMs / 1000
}

// ---------- DJ mixer building blocks ----------

/** DJ-style 3-band EQ (kill-capable). Gains in dB; -40 is effectively a kill. */
export function eq3(c: BaseAudioContext) {
  const low = c.createBiquadFilter()
  low.type = 'lowshelf'
  low.frequency.value = 200
  const mid = c.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1000
  mid.Q.value = 0.6
  const high = c.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = 3500
  low.connect(mid).connect(high)
  return { input: low as AudioNode, output: high as AudioNode, low, mid, high }
}

/** One-knob DJ filter: -1 full low-pass, 0 off, +1 full high-pass. */
export function djFilter(c: BaseAudioContext) {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1.2
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.Q.value = 1.2
  lp.connect(hp)
  const set = (v: number, at = 0, ramp = false) => {
    const lpF = v < 0 ? 20000 * Math.pow(100 / 20000, -v) : 20000
    const hpF = v > 0 ? 20 * Math.pow(6000 / 20, v) : 20
    if (ramp) {
      lp.frequency.exponentialRampToValueAtTime(lpF, at)
      hp.frequency.exponentialRampToValueAtTime(hpF, at)
    } else {
      lp.frequency.setValueAtTime(lpF, at)
      hp.frequency.setValueAtTime(hpF, at)
    }
  }
  set(0)
  return { input: lp as AudioNode, output: hp as AudioNode, set }
}

export function impulse(c: BaseAudioContext, seconds = 2.5, decay = 3) {
  const len = Math.floor(c.sampleRate * seconds)
  const b = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return b
}
