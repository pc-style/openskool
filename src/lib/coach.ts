// Practice coach: reads your scores and the course, plans the next 5 days. Runs locally, no account.
import { currentWeek, missionDone } from './course'
import { DRILLS, SKILLS, type Skill } from './drills'
import { dayKey, plays, type State } from './progress'

export interface PlanItem {
  drill: string
  reason: string
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

export function plan(s: State, now = Date.now()): PlanDay[] {
  const week = currentWeek(s)
  const open = week.missions.filter((m) => !missionDone(s, m))
  const levels = skillLevels(s)
  const weakest = SKILLS.filter((k) => levels[k] !== null).sort((a, b) => levels[a]! - levels[b]!)
  const untried = DRILLS.filter((d) => !plays(s, d.id).length)
  const review = DRILLS.filter((d) => plays(s, d.id).length).sort((a, b) => lastPlayed(s, a.id) - lastPlayed(s, b.id))

  const days: PlanDay[] = []
  for (let i = 0; i < 5; i++) {
    const items: PlanItem[] = []
    const add = (drill: string | undefined, reason: string) => {
      if (drill && !items.some((x) => x.drill === drill)) items.push({ drill, reason })
    }
    // 1. course mission for the current week, rotating through the open ones
    if (open.length) {
      const m = open[i % open.length]
      add(m.drill, `Week ${week.n} mission: score ${m.min}+ (best so far ${Math.round(bestOf(s, m.drill))}).`)
    }
    // 2. weakest skill, rotating through its weakest drills
    if (weakest.length) {
      const sk = weakest[i % Math.min(2, weakest.length)]
      const ds = DRILLS.filter((d) => d.skill === sk).sort((a, b) => (form(s, a.id) ?? 0) - (form(s, b.id) ?? 0))
      const d = ds[Math.floor(i / 2) % ds.length]
      add(d.id, `${sk} is your weakest skill (${Math.round(levels[sk]!)}/1000). ${form(s, d.id) === null ? 'You have not tried this one yet.' : `Recent form ${Math.round(form(s, d.id)!)}.`}`)
    }
    // 3. something new, or spaced review of what you have not touched for longest
    const fresh = untried[i % Math.max(1, untried.length)]
    if (fresh && (i % 2 === 0 || !review.length)) add(fresh.id, 'New drill: widen your skills.')
    else if (review.length) {
      const d = review[i % review.length]
      const ago = Math.round((now - lastPlayed(s, d.id)) / DAY)
      add(d.id, `Spaced review: last played ${ago <= 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`}.`)
    }
    // fill to 3
    const rest = [...untried, ...review]
    for (let k = 0; k < rest.length; k++) {
      const d = rest[(k + i * 2) % rest.length]
      if (items.length >= 3) break
      add(d.id, 'Keep the whole skill set warm.')
    }
    days.push({ date: now + i * DAY, items: items.slice(0, 3) })
  }
  return days
}

function bestOf(s: State, drill: string) {
  return Math.max(0, ...plays(s, drill).map((r) => r.score))
}

/** The same daily drill for everyone on a given date, cycling through all audio drills. */
export function dailyDrill(now = Date.now()) {
  const pool = DRILLS.filter((d) => d.audio !== 'none')
  const key = dayKey(now)
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return pool[h % pool.length]
}
