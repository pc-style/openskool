// A clip is audio plus its grid. Drills ask for clips; they come from your library or the built-in grooves.
import { GENRES, renderGroove, type Feel, type Genre } from '../audio/synth'
import { decodeTrack, readyTracks } from './library'
import type { SourceKind } from './progress'

export interface Clip {
  id: string
  name: string
  buffer: AudioBuffer
  bpm: number
  /** Time (s) of a phrase-start downbeat. */
  anchor: number
  source: SourceKind
  genre?: Genre
  camelot?: string | null
  energy?: number
  barEnergy?: number[]
}

export interface SourcePref {
  kind: SourceKind
  genre: Genre
}

const grooves = new Map<string, Promise<AudioBuffer>>()

export function groove(genre: Genre, seed: number, feel: Feel = 'standard', bars = 32, bpm?: number) {
  const key = `${genre}:${seed}:${feel}:${bars}:${bpm ?? ''}`
  if (!grooves.has(key)) grooves.set(key, renderGroove({ genre, bars, seed, feel, bpm }))
  return grooves.get(key)!
}

export async function builtinClip(genre: Genre, seed = 1 + Math.floor(Math.random() * 3)): Promise<Clip> {
  const buffer = await groove(genre, seed)
  return {
    id: `builtin:${genre}:${seed}`,
    name: `${GENRES[genre].name} groove ${seed}`,
    buffer,
    bpm: GENRES[genre].bpm,
    anchor: 0,
    source: 'builtin',
    genre,
  }
}

export async function getClip(pref: SourcePref, exclude?: string): Promise<Clip> {
  const mine = readyTracks()
  if (pref.kind === 'mine' && mine.length) {
    const pool = mine.length > 1 ? mine.filter((t) => t.id !== exclude) : mine
    const t = pool[Math.floor(Math.random() * pool.length)]
    const a = t.analysis!
    return {
      id: t.id,
      name: t.name,
      buffer: await decodeTrack(t.id),
      bpm: a.bpm,
      anchor: a.anchor,
      source: 'mine',
      camelot: a.camelot,
      energy: a.energy,
      barEnergy: a.barEnergy,
    }
  }
  const seeds = [1, 2, 3].filter((s) => `builtin:${pref.genre}:${s}` !== exclude)
  return builtinClip(pref.genre, seeds[Math.floor(Math.random() * seeds.length)])
}

export const beatLen = (c: Clip) => 60 / c.bpm
export const barLen = (c: Clip) => 240 / c.bpm
export const barTime = (c: Clip, n: number) => c.anchor + n * barLen(c)

/**
 * A random bar index with `bars` bars of audio after it. Prefers energetic sections (no intros or
 * breakdowns) for your tracks; `phrase` keeps it on an 8-bar phrase start.
 */
export function pickBar(c: Clip, bars: number, phrase = false): number {
  const bl = barLen(c)
  const first = Math.ceil(-c.anchor / bl)
  const last = Math.floor((c.buffer.duration - bars * bl - c.anchor) / bl)
  let candidates: number[] = []
  for (let n = first; n <= last; n++) if (!phrase || n % 8 === 0) candidates.push(n)
  if (!candidates.length) return first
  if (c.barEnergy?.length) {
    // barEnergy[0] is the first bar starting at or after 0 s
    const e0 = first
    const loud = candidates.filter((n) => {
      let min = 1
      for (let k = 0; k < Math.min(bars, 4); k++) min = Math.min(min, c.barEnergy![n - e0 + k] ?? 0)
      return min > 0.55
    })
    if (loud.length) candidates = loud
  }
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
