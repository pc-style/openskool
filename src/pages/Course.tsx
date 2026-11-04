import { useState } from 'react'
import { Link } from 'react-router-dom'
import { currentWeek, missionDone, WEEKS } from '../lib/course'
import { drillById } from '../lib/drills'
import { best, toggleTask, useProgress } from '../lib/progress'

export function Course() {
  const s = useProgress()
  const cur = currentWeek(s)
  const [open, setOpen] = useState(cur.n)
  const total = WEEKS.reduce((n, w) => n + w.missions.length + w.practice.length, 0)
  const done = WEEKS.reduce((n, w) => n + w.missions.filter((m) => missionDone(s, m)).length + w.practice.filter((p) => s.tasks.includes(p.id)).length, 0)
  return (
    <div className="course">
      <h1>The course</h1>
      <p className="muted">
        Eight weeks, from counting bars to recording a full mix. All weeks are open; missions are drill scores, practice tasks are for your own decks. {done}/{total} complete.
      </p>
      <ol className="weeks">
        {WEEKS.map((w) => {
          const md = w.missions.filter((m) => missionDone(s, m)).length + w.practice.filter((p) => s.tasks.includes(p.id)).length
          const all = w.missions.length + w.practice.length
          return (
            <li key={w.n} className={`week ${open === w.n ? 'open' : ''} ${md === all ? 'complete' : ''}`}>
              <button className="week-head" onClick={() => setOpen(open === w.n ? 0 : w.n)} aria-expanded={open === w.n}>
                <span className="wn">Week {w.n}</span>
                <span className="wt">{w.title}</span>
                <span className="wp">
                  {md}/{all}
                </span>
              </button>
              {open === w.n && (
                <div className="week-body">
                  <p className="goal">{w.goal}</p>
                  {w.lessons.map((l) => (
                    <div key={l.title} className="lesson">
                      <h3>{l.title}</h3>
                      <p>{l.body}</p>
                    </div>
                  ))}
                  <h3>Missions</h3>
                  <ul className="missions">
                    {w.missions.map((m) => {
                      const d = drillById(m.drill)!
                      const ok = missionDone(s, m)
                      return (
                        <li key={m.drill + m.min} className={ok ? 'done' : ''}>
                          <span>{ok ? '✓' : '○'}</span>
                          <span>
                            Score {m.min}+ in <b>{d.name}</b> <small className="muted">(best {best(s, m.drill) || '—'})</small>
                          </span>
                          <Link to={`/train/${m.drill}`} className="button small">
                            Play
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  <h3>Practice on your decks</h3>
                  <ul className="missions">
                    {w.practice.map((p) => (
                      <li key={p.id} className={s.tasks.includes(p.id) ? 'done' : ''}>
                        <label>
                          <input type="checkbox" checked={s.tasks.includes(p.id)} onChange={() => toggleTask(p.id)} /> {p.text}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
