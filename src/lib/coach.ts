// Practice coach: reads your scores and the course, plans the next 5 days. Runs locally, no account.
import type { Genre } from '../audio/synth'
import { GENRES } from '../audio/synth'
import { currentWeek, isDrillMission, missionBest, missionDone, missionsDone, WEEKS, type Week } from './course'
import { DRILLS, drillById, SKILLS, type Skill } from './drills'
import { best, dayKey, longestStreak, plays, RANKS, xpOf, type State } from './progress'

export interface PlanItem {
  drill: string
  reason: string
  /** The tempo world to play it in, for missions that name one. */
  genre?: Genre
}
export interface PlanDay {
  date: number
  items: PlanItem[]
}

const DAY = 86400000

/** Recent form for a drill: weighted mean of the last 5 scores (newest weighs most). */
export function form(s: State, drill: string): number | null {
  const r = plays(s, drill).slice(-5)
  if (!r.length) return null
  let num = 0
  let den = 0
  r.forEach((x, i) => {
    const w = i + 1
    num += x.score * w
    den += w
  })
  return num / den
}

export function skillLevels(s: State): Record<Skill, number | null> {
  const out = {} as Record<Skill, number | null>
  for (const sk of SKILLS) {
    const f = DRILLS.filter((d) => d.skill === sk).map((d) => form(s, d.id))
    const played = f.filter((x): x is number => x !== null)
    // unplayed drills count as 0 once you have started the skill, so the level is honest
    out[sk] = played.length ? f.reduce<number>((a, x) => a + (x ?? 0), 0) / f.length : null
  }
  return out
}

function lastPlayed(s: State, drill: string): number {
  const r = plays(s, drill)
  return r.length ? r[r.length - 1].at : 0
}

const name = (id: string) => drillById(id)?.name ?? id
const ordinal = ['weakest', 'second-weakest', 'third-weakest']

/** Why an untried drill fits now: it trains this week's skills, or it is a mission later in the course. */
function newReason(week: Week, id: string): string {
  const d = drillById(id)!
  const same = week.missions.filter(isDrillMission).find((m) => drillById(m.drill)?.skill === d.skill && m.drill !== id)
  if (same) return `New drill. It trains ${d.skill}, the same skill as week ${week.n}'s ${name(same.drill)} mission, from another angle.`
  const later = WEEKS.find((w) => w.n > week.n && w.missions.some((m) => isDrillMission(m) && m.drill === id))
  if (later) return `New drill. It is a week ${later.n} mission (“${later.title}”); a first try now gives you a baseline.`
  return `New drill. You have not trained ${d.skill} yet, and it rounds out week ${week.n}.`
}

/**
 * Five days of three drills. Each slot has a specific reason: an open course mission (with target and
 * best), your weakest skills (with level), spaced review (with days since you last played) or a new
 * drill that fits the current week. No drill appears more than twice, except open missions.
 */
export function plan(s: State, now = Date.now()): PlanDay[] {
  const week = currentWeek(s)
  // event missions happen elsewhere in the app, so the plan only schedules drill missions
  const open = week.missions.filter(isDrillMission).filter((m) => !missionDone(s, m))
  const levels = skillLevels(s)
  const weakest = SKILLS.filter((k) => levels[k] !== null).sort((a, b) => levels[a]! - levels[b]!)
  const weekSkills = new Set(week.missions.filter(isDrillMission).map((m) => drillById(m.drill)?.skill))
  const weekOf = (id: string) => WEEKS.find((w) => w.missions.some((m) => isDrillMission(m) && m.drill === id))?.n ?? 99
  // untried drills, those that fit this week first, then in course order
  const untried = DRILLS.filter((d) => !plays(s, d.id).length).sort(
    (a, b) => Number(weekSkills.has(b.skill)) - Number(weekSkills.has(a.skill)) || weekOf(a.id) - weekOf(b.id),
  )
  const played = DRILLS.filter((d) => plays(s, d.id).length).sort((a, b) => lastPlayed(s, a.id) - lastPlayed(s, b.id))

  const uses = new Map<string, number>()
  const days: PlanDay[] = []
  for (let i = 0; i < 5; i++) {
    const date = now + i * DAY
    const yesterday = new Set(days[i - 1]?.items.map((x) => x.drill))
    const items: PlanItem[] = []
    // open missions have their own slot, so the other slots leave them alone
    const free = (id: string) => !items.some((x) => x.drill === id) && (uses.get(id) ?? 0) < 2 && !open.some((m) => m.drill === id)
    const add = (id: string, reason: string, genre?: Genre) => {
      items.push({ drill: id, reason, genre })
      uses.set(id, (uses.get(id) ?? 0) + 1)
    }
    // prefer what the plan has used least, then something you did not see yesterday; ties keep priority order
    const choose = <T extends { id: string }>(xs: T[]) => {
      const cost = (id: string) => (uses.get(id) ?? 0) * 2 + Number(yesterday.has(id))
      return xs.filter((x) => free(x.id)).reduce<T | undefined>((b, x) => (!b || cost(x.id) < cost(b.id) ? x : b), undefined)
    }

    const mission = () => {
      if (!open.length) return false
      const m = open[i % open.length]
      if (items.some((x) => x.drill === m.drill)) return false
      const b = missionBest(s, m)
      const where = m.genre ? ` in ${GENRES[m.genre].name} ${GENRES[m.genre].bpm}` : ''
      add(m.drill, `Week ${week.n} mission: score ${m.min}+${where}. ${b ? `Your best${where ? ' there' : ''} is ${b}, ${m.min - b} to go.` : 'Not played yet.'}`, m.genre)
      return true
    }
    const weak = () => {
      for (const [r, sk] of weakest.slice(0, 3).entries()) {
        const ds = DRILLS.filter((d) => d.skill === sk)
          .map((d) => ({ id: d.id, f: form(s, d.id) }))
          .sort((a, b) => (a.f ?? 0) - (b.f ?? 0))
        const d = choose(ds)
        if (!d) continue
        add(d.id, `${sk} is your ${ordinal[r]} skill (${Math.round(levels[sk]!)}/1000). ${d.f === null ? 'You have not tried this drill yet.' : `Recent form here: ${Math.round(d.f)}.`}`)
        return true
      }
      return false
    }
    const review = () => {
      const due = played.filter((d) => date - lastPlayed(s, d.id) >= DAY)
      const d = choose(due)
      if (!d) return false
      const ago = Math.floor((date - lastPlayed(s, d.id)) / DAY)
      add(d.id, `Spaced review: last played ${ago} day${ago === 1 ? '' : 's'} ago${i ? ' by then' : ''}, best ${best(s, d.id)}.`)
      return true
    }
    const fresh = () => {
      const d = choose(untried)
      if (!d) return false
      add(d.id, newReason(week, d.id))
      return true
    }

    mission()
    // then alternate the order of the other sources day by day, so the week mixes them
    const order = i % 2 === 0 ? [weak, fresh, review] : [weak, review, fresh]
    for (const f of order) if (items.length < 3) f()
    for (const f of [fresh, review, weak]) while (items.length < 3 && f());
    days.push({ date, items })
  }
  return days
}

/** The same daily drill for everyone on a given date, cycling through all audio drills. */
export function dailyDrill(now = Date.now()) {
  const pool = DRILLS.filter((d) => d.audio !== 'none')
  const key = dayKey(now)
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return pool[h % pool.length]
}

const today = (now: number) => dayKey(now)

/** True when a run of `drill` now would be the day's first daily-drill run, which pays 2× XP. */
export function isDailyRun(s: State, drill: string, now = Date.now()): boolean {
  return dailyDrill(now).id === drill && !dailyDoneToday(s, now)
}

/** Whether today's 2× daily run has been played. */
export function dailyDoneToday(s: State, now = Date.now()): boolean {
  return s.results.some((r) => r.daily && dayKey(r.at) === today(now))
}

/**
 * What to play after `drill`: the next open drill mission this week, otherwise the first item of
 * today's plan, skipping the drill you just played.
 */
export function nextUp(s: State, drill: string, now = Date.now()): { drill: string; why: string; genre?: Genre } | null {
  const week = currentWeek(s)
  const m = week.missions.filter(isDrillMission).find((x) => x.drill !== drill && !missionDone(s, x))
  if (m) return { drill: m.drill, why: `Week ${week.n} mission`, genre: m.genre }
  const it = plan(s, now)[0]?.items.find((x) => x.drill !== drill)
  return it ? { drill: it.drill, why: 'From today’s plan' } : null
}

export interface Badge {
  id: string
  name: string
  how: string
  earned: boolean
}

/** A small set of badges, computed from local results and events. Nothing is stored. */
export function badges(s: State): Badge[] {
  const rs = s.results
  const sumPerfect = (drill: string) => rs.filter((r) => r.drill === drill).reduce((n, r) => n + (r.grades?.perfect ?? 0), 0)
  const allItems = WEEKS.reduce((n, w) => n + w.missions.length + w.practice.length, 0)
  const doneItems = missionsDone(s) + WEEKS.reduce((n, w) => n + w.practice.filter((p) => s.tasks.includes(p.id)).length, 0)
  const longest = longestStreak(s)
  const list: (Omit<Badge, 'earned'> & { ok: boolean })[] = [
    { id: 'first', name: 'First round', how: 'Finish any drill.', ok: rs.length > 0 },
    { id: 'perfect', name: 'Perfect run', how: 'Score 1000, or get every round right.', ok: rs.some((r) => r.score >= 1000 || (!!r.total && r.right === r.total)) },
    { id: 'streak10', name: 'Ten in a row', how: 'Get 10 rounds right in a row in one run.', ok: rs.some((r) => (r.bestStreak ?? 0) >= 10) },
    { id: 'days3', name: 'Three days', how: 'Practise three days in a row.', ok: longest >= 3 },
    { id: 'days7', name: 'A full week', how: 'Practise seven days in a row.', ok: longest >= 7 },
    { id: 'sync900', name: 'Locked in', how: 'Score 900+ in Sync Check.', ok: best(s, 'sync') >= 900 },
    { id: 'drop10', name: 'On the drop', how: '10 Perfect taps in Drop Timing.', ok: sumPerfect('drop') >= 10 },
    { id: 'set900', name: 'Selector', how: 'Score 900+ in Set Builder.', ok: best(s, 'setbuilder') >= 900 },
    { id: 'vocab800', name: 'Fluent', how: 'Score 800+ in Vocab Blitz.', ok: best(s, 'vocab') >= 800 },
    { id: 'known20', name: 'Twenty terms', how: 'Mark 20 terms as known in Vocab study.', ok: s.known.length >= 20 },
    { id: 'course', name: 'Graduate', how: 'Finish every mission and task in all 8 weeks.', ok: doneItems >= allItems },
    { id: 'rank', name: RANKS[RANKS.length - 1].name, how: `Reach the top rank, ${RANKS[RANKS.length - 1].xp.toLocaleString()} XP.`, ok: xpOf(s, missionsDone(s)) >= RANKS[RANKS.length - 1].xp },
  ]
  return list.map(({ ok, ...b }) => ({ ...b, earned: ok }))
}
