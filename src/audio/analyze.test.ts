import { describe, expect, it } from 'vitest'
import { analyse, estimateKey } from './analyze'

const SR = 44100

/** Minimal dance loop: kick on every beat, offbeat hats, a bass note on the 1 that changes each bar,
 *  and a noise crash at every 8-bar phrase start. Starts with `lead` seconds of silence then
 *  `pickupBeats` beats before the first phrase so the anchor is not at 0. */
function render(bpm: number, bars: number, lead: number, pickupBeats: number, seed = 1) {
  const beat = 60 / bpm
  const len = Math.ceil((lead + (bars * 4 + pickupBeats) * beat + 1) * SR)
  const x = new Float32Array(len)
  let r = seed
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  const notes = [55, 65.4, 49, 73.4]
  const anchor = lead + pickupBeats * beat
  const totalBeats = bars * 4 + pickupBeats
  for (let b = 0; b < totalBeats; b++) {
    const t = lead + b * beat
    const s = Math.round(t * SR)
    for (let i = 0; i < 0.3 * SR && s + i < len; i++) {
      const tt = i / SR
      const f = 50 + 100 * Math.exp(-tt * 30)
      x[s + i] += 0.8 * Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 9)
    }
    const h = Math.round((t + beat / 2) * SR)
    for (let i = 0; i < 0.04 * SR && h + i < len; i++) x[h + i] += 0.15 * (rnd() * 2 - 1) * Math.exp(-(i / SR) * 80)
    const beatInBar = (((b - pickupBeats) % 4) + 4) % 4
    const bar = Math.floor((b - pickupBeats) / 4)
    if (b >= pickupBeats && beatInBar === 0) {
      const f = notes[bar % 4]
      for (let i = 0; i < beat * 2 * SR && s + i < len; i++) x[s + i] += 0.3 * Math.sign(Math.sin(2 * Math.PI * f * (i / SR))) * 0.5
      if (bar % 8 === 0) for (let i = 0; i < 1.5 * SR && s + i < len; i++) x[s + i] += 0.25 * (rnd() * 2 - 1) * Math.exp(-(i / SR) * 2)
    }
  }
  return { x, anchor }
}

describe('analyse', () => {
  for (const [bpm, lead, pickup] of [
    [124, 0.37, 3],
    [134, 1.1, 6],
    [145, 0.05, 0],
    [174, 0.6, 9],
    [126.5, 0.2, 2],
  ] as const) {
    it(`finds tempo, beat and phrase anchor at ${bpm} BPM`, () => {
      const { x, anchor } = render(bpm, 48, lead, pickup)
      const a = analyse([x], SR)
      expect(Math.abs(a.bpm - bpm)).toBeLessThan(0.05)
      const phrase = (32 * 60) / bpm
      const d = (((a.anchor - anchor) % phrase) + phrase) % phrase
      expect(Math.min(d, phrase - d)).toBeLessThan(0.015)
    })
  }

  it('hears A minor from an Am–Dm–Em–Am progression as 8A', () => {
    const chords = [[57, 60, 64], [62, 65, 69], [64, 67, 71], [57, 60, 64]]
    const roots = [45, 50, 52, 45]
    const x = new Float32Array(SR * 8)
    chords.forEach((c, k) => {
      for (let i = 0; i < SR * 2; i++) {
        const t = i / SR
        let v = 0
        for (const m of [...c, roots[k]]) v += Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * t)
        x[k * SR * 2 + i] = v * 0.2
      }
    })
    const k = estimateKey(x, SR)
    expect([k.pc, k.minor]).toEqual([9, true])
  })
})
