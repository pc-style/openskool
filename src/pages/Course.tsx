import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DMeter } from '../components/viz/meters'
import { currentWeek, isDrillMission, MISSION_XP, missionBest, missionDone, missionId, missionLink, WEEKS } from '../lib/course'
import { GENRES } from '../audio/synth'
import { drillById } from '../lib/drills'
import { toggleTask, useProgress } from '../lib/progress'
import './shell.css'

export function Course() {
  const s = useProgress()
  const cur = currentWeek(s)
  const [open, setOpen] = useState(cur.n)
  // the week open on arrival appears as is; only weeks you open dissolve in
  const [touched, setTouched] = useState(false)
  const total = WEEKS.reduce((n, w) => n + w.missions.length + w.practice.length, 0)
  const done = WEEKS.reduce((n, w) => n + w.missions.filter((m) => missionDone(s, m)).length + w.practice.filter((p) => s.tasks.includes(p.id)).length, 0)
  return (
    <div className="course">
      <h1>The course</h1>
      <p className="muted page-intro">Eight weeks, from counting bars to recording a full mix. Every week is open.</p>
      <div className="course-progress">
        <DMeter value={done / total} label={`${done} of ${total} complete`} />
        <span className="muted small tabular">
          {done} of {total} complete
        </span>
      </div>
      <ol className="weeks">
        {WEEKS.map((w) => {
          const md = w.missions.filter((m) => missionDone(s, m)).length + w.practice.filter((p) => s.tasks.includes(p.id)).length
          const all = w.missions.length + w.practice.length
          const isOpen = open === w.n
          return (
            <li key={w.n} className={`week ${isOpen ? 'open' : ''} ${md === all ? 'complete' : ''} ${w.n === cur.n ? 'current' : ''}`}>
              <button className="week-head" onClick={() => {
                  setTouched(true)
                  setOpen(isOpen ? 0 : w.n)
                }} aria-expanded={isOpen}>
                <span className="wn">Week {w.n}</span>
                <span className="wt">
                  {w.title}
                  {w.n === cur.n && <span className="tag">Current</span>}
                </span>
                <span className="wp">
                  <span className="wp-meter">
                    <DMeter value={md / all} height={6} label={`${md} of ${all} done`} />
                  </span>
                  <span className="tabular" title="Missions and practice tasks done">
                    {md} of {all}
                  </span>
                </span>
                <span className="chev" aria-hidden="true" />
              </button>
              {isOpen && (
                <div className={`week-body ${touched ? 'fade-in' : ''}`}>
                  <p className="goal">{w.goal}</p>
                  <div className="missions-head">
                    <h3 className="label">Missions</h3>
                    <span className="muted small tabular">
                      +{MISSION_XP} XP each · {w.missions.filter((m) => missionDone(s, m)).length} of {w.missions.length} done
                    </span>
                  </div>
                  <ul className="missions">
                    {w.missions.map((m) => {
                      const ok = missionDone(s, m)
                      const mark = (
                        <span className="mark" aria-label={ok ? 'Done' : 'To do'}>
                          {ok ? '✓' : '○'}
                        </span>
                      )
                      if (!isDrillMission(m))
                        return (
                          <li key={missionId(w, m)} className={`mission ${ok ? 'done' : ''}`}>
                            {mark}
                            <span className="mission-text">
                              <b>{m.text}</b>
                              <span className="muted"> · in the app</span>
                            </span>
                            <span className="mission-meter">
                              <span className="mm-bar" />
                              <span className="muted small">{ok ? 'Done' : 'Not yet'}</span>
                            </span>
                            <Link to={m.to} className="button small">
                              {ok ? 'Open' : 'Go'}
                            </Link>
                          </li>
                        )
                      const d = drillById(m.drill)!
                      const b = missionBest(s, m)
                      return (
                        <li key={missionId(w, m)} className={`mission ${ok ? 'done' : ''}`}>
                          {mark}
                          <span className="mission-text">
                            <b>{d.name}</b>
                            {m.genre && <span className="muted"> · in {GENRES[m.genre].name} {GENRES[m.genre].bpm}</span>}
                          </span>
                          <span className="mission-meter">
                            <span className="mm-bar">{b > 0 && <DMeter value={b / m.min} height={6} color={ok ? 'green' : 'ink'} label={`Best ${b} of ${m.min}`} />}</span>
                            <span className="muted small tabular" title={`Your best against the target of ${m.min}`}>
                              {b ? <span className="fg">{b}</span> : '–'} / {m.min}
                            </span>
                          </span>
                          <Link to={missionLink(m)} className="button small">
                            {ok ? 'Again' : 'Play'}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  <h3 className="label">Practice on your decks</h3>
                  <ul className="tasks">
                    {w.practice.map((p) => (
                      <li key={p.id} className={s.tasks.includes(p.id) ? 'done' : ''}>
                        <label>
                          <input type="checkbox" checked={s.tasks.includes(p.id)} onChange={() => toggleTask(p.id)} />
                          <span>{p.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {/* the reading sits under the work, one click away */}
                  <details className="notes">
                    <summary>
                      Lesson notes <span className="muted tabular">· {w.lessons.length}</span>
                    </summary>
                    {w.lessons.map((l) => (
                      <div key={l.title} className="lesson">
                        <h3>{l.title}</h3>
                        <p>{l.body}</p>
                        {l.link && (
                          <p className="lesson-link">
                            <Link to={l.link.to}>{l.link.text} →</Link>
                          </p>
                        )}
                      </div>
                    ))}
                  </details>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
