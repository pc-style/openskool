import { Link } from 'react-router-dom'
import { dailyDrill, plan, skillLevels } from '../lib/coach'
import { currentWeek, missionDone, missionsDone } from '../lib/course'
import { drillById, SKILLS } from '../lib/drills'
import { useTracks } from '../lib/library'
import { best, dayKey, rankOf, streak, useProgress, xpOf } from '../lib/progress'

export function Today() {
  const s = useProgress()
  const tracks = useTracks()
  const daily = dailyDrill()
  const playedDaily = s.results.some((r) => r.drill === daily.id && dayKey(r.at) === dayKey(Date.now()))
  const week = currentWeek(s)
  const nextMission = week.missions.find((m) => !missionDone(s, m))
  const xp = xpOf(s, missionsDone(s))
  const rank = rankOf(xp)
  const days = plan(s)
  const levels = skillLevels(s)
  const checklist = [
    { done: tracks.some((t) => t.status === 'ready'), text: 'Add a few of your own tracks', to: '/library' },
    { done: s.settings.latencyMs !== 0, text: 'Calibrate tap latency (30 s)', to: '/profile' },
    { done: s.results.length > 0, text: 'Play your first drill', to: `/train/${daily.id}` },
    { done: s.results.some((r) => r.drill === 'downbeat'), text: 'Find the 1 in Downbeat Tapper', to: '/train/downbeat' },
  ]
  return (
    <div className="today">
      <section className="hero">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{s.settings.name ? `Hey ${s.settings.name}.` : 'Train your ears.'} Fifteen minutes a day.</h1>
          <p className="muted">
            {rank.name}
            {rank.next ? ` · ${rank.next.xp - xp} XP to ${rank.next.name}` : ''} · {streak(s)} day streak
          </p>
          {rank.next && (
            <div className="bar">
              <i style={{ width: `${((xp - rank.xp) / (rank.next.xp - rank.xp)) * 100}%` }} />
            </div>
          )}
        </div>
      </section>

      <div className="grid2">
        <Link to={`/train/${daily.id}`} className="card daily">
          <p className="eyebrow">Daily drill {playedDaily && '· done ✓'}</p>
          <h2>{daily.name}</h2>
          <p>{daily.blurb}</p>
          <span className="cta">{playedDaily ? 'Play again' : 'Play'} →</span>
        </Link>
        <Link to={nextMission ? `/train/${nextMission.drill}` : '/course'} className="card">
          <p className="eyebrow">Course · week {week.n}</p>
          <h2>{week.title}</h2>
          {nextMission ? (
            <p>
              Next mission: {drillById(nextMission.drill)?.name} {nextMission.min}+ (best {best(s, nextMission.drill) || '—'})
            </p>
          ) : (
            <p>All missions done. Tick off this week's practice tasks.</p>
          )}
          <span className="cta">Continue →</span>
        </Link>
      </div>

      <section>
        <h2>Your next five days</h2>
        <p className="muted small">Planned from your scores and the course, on this device. Changes as you play.</p>
        <div className="plan">
          {days.map((d, k) => (
            <div key={k} className={`plan-day ${k === 0 ? 'now' : ''}`}>
              <h3>{k === 0 ? 'Today' : new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}</h3>
              {d.items.map((it) => (
                <Link key={it.drill} to={`/train/${it.drill}`} className="plan-item">
                  <strong>{drillById(it.drill)?.name}</strong>
                  <span>{it.reason}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Skills</h2>
          {SKILLS.map((k) => (
            <div key={k} className="skill">
              <span>{k}</span>
              <div className="bar">
                <i style={{ width: `${(levels[k] ?? 0) / 10}%` }} />
              </div>
              <b>{levels[k] === null ? '—' : Math.round(levels[k]!)}</b>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Getting started</h2>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.text} className={c.done ? 'done' : ''}>
                <Link to={c.to}>
                  {c.done ? '✓' : '○'} {c.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
