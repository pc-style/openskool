// Local-first progress: everything lives in localStorage and can be exported as JSON.
import { useSyncExternalStore } from 'react'
import type { Genre } from '../audio/synth'
import { hasWorlds } from './drills'

export type SourceKind = 'mine' | 'builtin'

export interface Result {
  drill: string
  score: number
  at: number
  source: SourceKind
  genre?: Genre
  /** Optional per-run detail reported by the drill. */
  right?: number
  total?: number
  bestStreak?: number
  /** Perfect / Good / Close / Off / Miss counts for tap drills (Close since the wider windows). */
  grades?: { perfect: number; good: number; close?: number; off: number; miss: number }
  /** True for the first run of the day's daily drill (pays double XP). */
  daily?: boolean
}

export type Theme = 'system' | 'light' | 'dark'
export type Motion = 'system' | 'reduced' | 'full'

export interface Settings {
  theme: Theme
  latencyMs: number
  source: SourceKind
  genre: Genre
  name: string
  motion: Motion
  /** Vibrate on taps in the tap drills, where the device supports it. */
  haptics: boolean
}

export interface State {
  version: 1
  results: Result[]
  tasks: string[]
  /** Vocab terms the learner marked as known in study mode. */
  known: string[]
  /** App events that missions can check, e.g. 'decks:two-loaded'. */
  events: string[]
  settings: Settings
}

const KEY = 'openskool:v1'

const fresh = (): State => ({
  version: 1,
  results: [],
  tasks: [],
  known: [],
  events: [],
  settings: { theme: 'system', latencyMs: 0, source: 'builtin', genre: 'house', name: '', motion: 'system', haptics: true },
})

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh()
    const s = JSON.parse(raw) as State
    return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } }
  } catch {
    return fresh()
  }
}

let state: State = typeof localStorage === 'undefined' ? fresh() : load()
const subs = new Set<() => void>()

function set(next: State) {
  state = next
  localStorage.setItem(KEY, JSON.stringify(state))
  for (const s of subs) s()
}

export const getState = () => state
export const getSettings = () => state.settings

export function useProgress(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state,
  )
}

export function updateSettings(patch: Partial<Settings>) {
  set({ ...state, settings: { ...state.settings, ...patch } })
}

export function addResult(r: Result) {
  set({ ...state, results: [...state.results, r] })
}

export function toggleTask(id: string) {
  const tasks = state.tasks.includes(id) ? state.tasks.filter((t) => t !== id) : [...state.tasks, id]
  set({ ...state, tasks })
}

export function setKnown(term: string, on: boolean) {
  const known = on ? [...new Set([...state.known, term])] : state.known.filter((t) => t !== term)
  set({ ...state, known })
}

export function recordEvent(id: string) {
  if (!state.events.includes(id)) set({ ...state, events: [...state.events, id] })
}

export function importState(json: string) {
  const s = JSON.parse(json) as State
  if (s.version !== 1 || !Array.isArray(s.results)) throw new Error('Not an openskool progress file')
  set({ ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } })
}

export function resetProgress() {
  set({ ...fresh(), settings: state.settings })
}

// ---------- derived ----------

export function best(s: State, drill: string): number {
  let b = 0
  for (const r of s.results) if (r.drill === drill && r.score > b) b = r.score
  return b
}

export function plays(s: State, drill: string): Result[] {
  return s.results.filter((r) => r.drill === drill)
}

/** Best score in one world (a built-in genre) or on your own tracks. */
export function bestIn(s: State, drill: string, where: Genre | 'mine'): number {
  let b = 0
  for (const r of s.results) {
    if (r.drill !== drill || r.score <= b) continue
    if (where === 'mine' ? r.source === 'mine' : r.source === 'builtin' && (r.genre ?? 'house') === where) b = r.score
  }
  return b
}

/**
 * Tempo worlds: the built-in genres, slowest to fastest. Faster is harder, so it pays more XP.
 * Nothing is locked; `xp` is when a world is recommended.
 */
export const WORLDS: { genre: Genre; xp: number; mult: number }[] = [
  { genre: 'house', xp: 0, mult: 1 },
  { genre: 'techno', xp: 1500, mult: 1.25 },
  { genre: 'psy', xp: 4000, mult: 1.5 },
  { genre: 'hitech', xp: 8000, mult: 2 },
]

/** XP multiplier for a run: its world's, or 1× for your own tracks and no-audio drills. */
export const worldMult = (r: Pick<Result, 'drill' | 'source' | 'genre'>) =>
  r.source === 'builtin' && r.genre && hasWorlds(r.drill) ? (WORLDS.find((w) => w.genre === r.genre)?.mult ?? 1) : 1

/** The fastest world recommended at this XP, and the next one with the XP still needed. */
export function worldAt(xp: number) {
  let i = 0
  while (i + 1 < WORLDS.length && xp >= WORLDS[i + 1].xp) i++
  return { current: WORLDS[i], index: i, next: WORLDS[i + 1] }
}

/** XP for a run's score: score/10 times the world's multiplier, doubled for the first run of the day's daily drill. */
export const scoreXp = (r: Pick<Result, 'drill' | 'score' | 'daily' | 'source' | 'genre'>) => Math.round((r.score / 10) * worldMult(r)) * (r.daily ? 2 : 1)
export const FIRST_PLAY_XP = 50
export const TASK_XP = 50

/** XP: score/10 per run (times the tempo world's multiplier, 2× for the daily drill), +50 for the first run of each drill, plus missions and practice tasks. */
export function xpOf(s: State, missionsDone: number): number {
  const seen = new Set<string>()
  let xp = 0
  for (const r of s.results) {
    xp += scoreXp(r)
    if (!seen.has(r.drill)) {
      seen.add(r.drill)
      xp += FIRST_PLAY_XP
    }
  }
  return xp + missionsDone * 150 + s.tasks.length * TASK_XP
}

export const RANKS = [
  { xp: 0, name: 'Bedroom' },
  { xp: 500, name: 'Warm-up' },
  { xp: 1500, name: 'Opener' },
  { xp: 3500, name: 'Resident' },
  { xp: 7000, name: 'Peak time' },
  { xp: 12000, name: 'Headliner' },
  { xp: 20000, name: 'Closing set' },
]

export function rankOf(xp: number) {
  let i = 0
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++
  return { ...RANKS[i], index: i, next: RANKS[i + 1] }
}

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function streak(s: State, now = Date.now()): number {
  const days = new Set(s.results.map((r) => dayKey(r.at)))
  let n = 0
  const d = new Date(now)
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1)
  while (days.has(dayKey(d.getTime()))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** The longest run of consecutive days with at least one result, ever. */
export function longestStreak(s: State): number {
  const days = [...new Set(s.results.map((r) => dayKey(r.at)))].sort()
  let bestRun = 0
  let run = 0
  let prev = ''
  for (const k of days) {
    const d = new Date(`${k}T12:00:00`)
    d.setDate(d.getDate() - 1)
    run = prev === dayKey(d.getTime()) ? run + 1 : 1
    bestRun = Math.max(bestRun, run)
    prev = k
  }
  return bestRun
}
