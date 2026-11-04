// Local-first progress: everything lives in localStorage and can be exported as JSON.
import { useSyncExternalStore } from 'react'
import type { Genre } from '../audio/synth'

export type SourceKind = 'mine' | 'builtin'

export interface Result {
  drill: string
  score: number
  at: number
  source: SourceKind
  genre?: Genre
}

export interface Settings {
  latencyMs: number
  source: SourceKind
  genre: Genre
  name: string
}

export interface State {
  version: 1
  results: Result[]
  tasks: string[]
  settings: Settings
}

const KEY = 'openskool:v1'

const fresh = (): State => ({
  version: 1,
  results: [],
  tasks: [],
  settings: { latencyMs: 0, source: 'builtin', genre: 'house', name: '' },
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

/** XP: score/10 per run, +50 for the first run of each drill, plus missions and practice tasks. */
export function xpOf(s: State, missionsDone: number): number {
  const seen = new Set<string>()
  let xp = 0
  for (const r of s.results) {
    xp += Math.round(r.score / 10)
    if (!seen.has(r.drill)) {
      seen.add(r.drill)
      xp += 50
    }
  }
  return xp + missionsDone * 150 + s.tasks.length * 50
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
