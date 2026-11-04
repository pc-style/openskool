import { describe, expect, it } from 'vitest'
import { badges, plan } from './coach'
import { currentWeek, isDrillMission, missionDone, WEEKS } from './course'
import { xpOf, type Result, type State } from './progress'

const NOW = new Date(2026, 10, 4, 12).getTime()
const DAY = 86400000

const state = (results: Omit<Result, 'source'>[] = []): State => ({
  version: 1,
  results: results.map((r) => ({ ...r, source: 'builtin' })),
  tasks: [],
  known: [],
  events: [],
  settings: { theme: 'system', latencyMs: 0, source: 'builtin', genre: 'house', name: '', motion: 'system', haptics: true },
})

const withEvents = (events: string[], s: State): State => ({ ...s, events })

const states: Record<string, State> = {
  empty: state(),
  // a beginner a few days in: some week-1 play, one mission done
  beginner: state([
    { drill: 'downbeat', score: 420, at: NOW - 3 * DAY },
    { drill: 'downbeat', score: 520, at: NOW - 2 * DAY },
    { drill: 'signal', score: 760, at: NOW - 4 * DAY },
    { drill: 'sync', score: 640, at: NOW - DAY },
    { drill: 'bpmmath', score: 300, at: NOW - 6 * DAY },
  ]),
  // weeks 1–3 done, everything played once, two decks loaded
  advanced: withEvents(['decks:two-loaded'], state(
    ['downbeat', 'signal', 'sync', 'tempomatch', 'taptempo', 'eq', 'gain', 'clash', 'timefeel', 'bpmmath', 'drop', 'phrase', 'filter', 'loops', 'fx', 'genre', 'camelot', 'setbuilder', 'vocab'].map(
      (drill, k) => ({ drill, score: ['drop', 'phrase'].includes(drill) ? 350 : 880 - k * 5, at: NOW - (k + 1) * DAY }),
    ),
  )),
}

describe('coach plan', () => {
  for (const [label, s] of Object.entries(states)) {
    it(`gives 5 varied, specific days (${label})`, () => {
      const days = plan(s, NOW)
      expect(days).toHaveLength(5)
      const open = new Set(currentWeek(s).missions.filter(isDrillMission).filter((m) => !missionDone(s, m)).map((m) => m.drill))
      const uses = new Map<string, number>()
      for (const d of days) {
        expect(d.items).toHaveLength(3)
        expect(new Set(d.items.map((x) => x.drill)).size).toBe(3)
        for (const it of d.items) {
          uses.set(it.drill, (uses.get(it.drill) ?? 0) + 1)
          // every reason names a number or the drill's situation, never filler
          expect(it.reason).toMatch(/\d|Not played yet|New drill/)
          expect(it.reason).not.toMatch(/warm|widen/i)
        }
      }
      for (const [drill, n] of uses) if (!open.has(drill)) expect(n, drill).toBeLessThanOrEqual(2)
      expect(uses.size).toBeGreaterThanOrEqual(8)
    })
  }
})

describe('xp, missions and badges', () => {
  it('doubles the score part of a daily run only', () => {
    const plain = state([{ drill: 'eq', score: 500, at: NOW }])
    const daily = state([{ drill: 'eq', score: 500, at: NOW, daily: true }])
    expect(xpOf(daily, 0) - xpOf(plain, 0)).toBe(50)
  })
  it('pays the tempo world multiplier only on drills that play that world', () => {
    const run = (drill: string, genre: 'house' | 'hitech') => xpOf(state([{ drill, score: 500, at: NOW, genre }]), 0)
    expect(run('eq', 'hitech') - run('eq', 'house')).toBe(50) // 2× of 50
    expect(run('bpmmath', 'hitech')).toBe(run('bpmmath', 'house')) // a quiz has no tempo
  })
  it('counts a world mission only from scores in that world', () => {
    const m = WEEKS.flatMap((w) => w.missions).find((x) => isDrillMission(x) && x.genre === 'hitech')!
    if (!isDrillMission(m)) throw new Error('expected a drill mission')
    expect(missionDone(state([{ drill: m.drill, score: 1000, at: NOW, genre: 'house' }]), m)).toBe(false)
    expect(missionDone(state([{ drill: m.drill, score: m.min, at: NOW, genre: 'hitech' }]), m)).toBe(true)
  })
  it('counts event missions from state.events', () => {
    const m = WEEKS.flatMap((w) => w.missions).find((x) => !isDrillMission(x))!
    expect(missionDone(state(), m)).toBe(false)
    expect(missionDone({ ...state(), events: ['decks:two-loaded'] }, m)).toBe(true)
  })
  it('earns badges from results', () => {
    const earned = (s: State) => badges(s).filter((b) => b.earned).map((b) => b.id)
    expect(earned(state())).toEqual([])
    expect(earned(state([{ drill: 'sync', score: 920, at: NOW, right: 6, total: 6 }]))).toEqual(['first', 'perfect', 'sync900'])
  })
})
