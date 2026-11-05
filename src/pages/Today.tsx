import { Link } from 'react-router-dom'
import { Value } from '../components/Swap'
import { GrooveField } from '../components/viz/fields'
import { DMeter } from '../components/viz/meters'
import { GENRES } from '../audio/synth'
import { dailyDoneToday, dailyDrill, plan, skillLevels } from '../lib/coach'
import { currentWeek, isDrillMission, MISSION_XP, missionBest, missionDone, missionLink, WEEKS } from '../lib/course'
import { drillById, hasWorlds, SKILLS } from '../lib/drills'
import { useTracks } from '../lib/library'
import { best, bestIn, useProgress } from '../lib/progress'
import './shell.css'

export function Today() {
  const s = useProgress()
  const tracks = useTracks()
  const daily = dailyDrill()
  const dailyDone = dailyDoneToday(s)
  const week = currentWeek(s)
  const nextMission = week.missions.find((m) => !missionDone(s, m))
  const days = plan(s)
  const levels = skillLevels(s)
  const started = s.results.length > 0
  const checklist = [
    { done: started, text: 'Play your first drill', why: 'Any drill counts. The daily one is a good start.', time: '2 min', to: `/train/${daily.id}` },
    { done: s.results.some((r) => r.drill === 'downbeat'), text: 'Find the 1 in Downbeat Tapper', why: 'Every other skill builds on hearing where the bar starts.', time: '1 min', to: '/train/downbeat' },
    { done: s.settings.latencyMs !== 0, text: 'Calibrate tap latency', why: 'Headphones and screens add delay; tap drills correct for it.', time: '30 s', to: '/profile' },
    { done: tracks.some((t) => t.status === 'ready'), text: 'Add your own tracks', why: 'Most drills can run on your music instead of built-in grooves.', time: '2 min', to: '/library' },
  ]
  const ticked = checklist.filter((c) => c.done).length
  const weekDone = week.missions.filter((m) => missionDone(s, m)).length
  return (
    <div className="today">
      <section className="hero">
        <p className="eyebrow">
          Week {week.n} of {WEEKS.length} · {week.title}
        </p>
        <h1>{s.settings.name ? `Good to see you, ${s.settings.name}.` : 'Fifteen minutes of ear training.'}</h1>
        <p className="muted headphones">Wear headphones: the beatmatching drills put one deck in each ear.</p>
      </section>

      {/* the one next thing to do, then the course beside it */}
      <div className="grid2 focus">
        <Link to={`/train/${daily.id}`} className="card focus-card daily">
          <div className="focus-text">
            <p className="eyebrow">Daily drill · {dailyDone ? 'done' : <span className="fg">2× XP</span>}</p>
            <h2>{daily.name}</h2>
            <p className="muted">{dailyDone ? 'Done for today. A new one tomorrow at 2× XP.' : daily.blurb}</p>
            <span className={dailyDone ? 'button' : 'button primary'}>{dailyDone ? 'Play again' : 'Start drill'}</span>
          </div>
          <div className="daily-art" aria-hidden="true">
            <GrooveField className="absolute inset-0" palette={['transparent', 'ink']} spin={(GENRES[s.settings.genre].bpm / 120) * 0.3} />
          </div>
        </Link>
        <Link to={nextMission ? (isDrillMission(nextMission) ? missionLink(nextMission) : nextMission.to) : '/course'} className="card focus-card">
          <div className="focus-text">
            <p className="eyebrow tabular">
              Course · week {week.n} · {weekDone} of {week.missions.length} missions
            </p>
            <h2>{week.title}</h2>
            {nextMission ? (
              isDrillMission(nextMission) ? (
                <>
                  <p className="muted">
                    Next: {drillById(nextMission.drill)?.name} {nextMission.min}+
                    {nextMission.genre && ` in ${GENRES[nextMission.genre].name}`} · <span className="fg">+{MISSION_XP} XP</span>
                  </p>
                  <div className="focus-meter">
                    <DMeter value={missionBest(s, nextMission) / nextMission.min} label={`Best ${missionBest(s, nextMission)} of ${nextMission.min}`} />
                    <span className="muted small tabular">
                      {missionBest(s, nextMission) || 0} / {nextMission.min}
                    </span>
                  </div>
                </>
              ) : (
                <p className="muted">
                  Next: {nextMission.text} · <span className="fg">+{MISSION_XP} XP</span>
                </p>
              )
            ) : (
              <p className="muted">All missions done. Tick off this week's practice tasks.</p>
            )}
            <span className="button">Continue</span>
          </div>
        </Link>
      </div>

      {started && (
        <>
          {/* today's three drills as a compact table: best against the target, one play button each */}
          <div className="section-head">
            <h2>Today's session</h2>
            <span className="muted small">Planned from your scores</span>
          </div>
          <table className="session">
            <thead>
              <tr>
                <th scope="col" className="num-col">#</th>
                <th scope="col">Drill</th>
                <th scope="col" className="score-col">Best</th>
                <th scope="col" className="score-col">Target</th>
                <th scope="col"><span className="sr-only">Play</span></th>
              </tr>
            </thead>
            <tbody>
              {days[0].items.map((it, k) => {
                const d = drillById(it.drill)!
                const m = week.missions.filter(isDrillMission).find((x) => x.drill === it.drill && !missionDone(s, x))
                const b = m ? missionBest(s, m) : hasWorlds(it.drill) && s.settings.source !== 'mine' ? bestIn(s, it.drill, s.settings.genre) : best(s, it.drill)
                const to = `/train/${it.drill}${it.genre ? `?genre=${it.genre}` : ''}`
                return (
                  <tr key={it.drill}>
                    <td className="num-col mono muted">{k + 1}</td>
                    <td>
                      <Link to={to} className="session-name">
                        {d.name}
                      </Link>
                      <span className="muted small session-why" title={it.reason}>
                        {it.short}
                      </span>
                    </td>
                    <td className="score-col mono">{b || <span className="muted">–</span>}</td>
                    <td className="score-col mono muted">{m ? m.min : '–'}</td>
                    <td className="play-col">
                      <Link to={to} className="button small" aria-label={`Play ${d.name}`}>
                        Play
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="section-head">
            <h2>Later this week</h2>
          </div>
          <ol className="later">
            {days.slice(1).map((d) => (
              <li key={d.date}>
                <span className="muted later-day">{new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span>
                  {d.items.map((it, k) => (
                    <span key={it.drill}>
                      {k > 0 && <span className="muted"> · </span>}
                      <Link to={`/train/${it.drill}${it.genre ? `?genre=${it.genre}` : ''}`} title={it.reason}>
                        {drillById(it.drill)?.name}
                      </Link>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>

          {/* on desktop the sidebar shows these; phones have no sidebar */}
          <section className="skills phone-only">
            <h2>Skills</h2>
            {SKILLS.map((k) => (
              <div key={k} className="skill">
                <span>{k}</span>
                <DMeter value={(levels[k] ?? 0) / 1000} label={`${k}: ${levels[k] === null ? 'not started' : Math.round(levels[k]!)}`} />
                <b>
                  <Value v={levels[k] === null ? '—' : Math.round(levels[k]!)} />
                </b>
              </div>
            ))}
          </section>
        </>
      )}

      {ticked < checklist.length && (
        <section className="first-steps">
          <div className="section-head">
            <h2>Getting started</h2>
            <span className="muted small tabular">
              {ticked} of {checklist.length} done
            </span>
          </div>
          <ol className="steps list">
            {checklist
              .filter((c) => !c.done)
              .map((c) => (
                <li key={c.text}>
                  <Link to={c.to}>
                    <span className="step-text">
                      <b>{c.text}</b>
                      <span className="muted small">{c.why}</span>
                    </span>
                    <span className="muted small tabular step-time">{c.time}</span>
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  )
}
