import { Link } from 'react-router-dom'
import { Value } from '../components/Swap'
import { GrooveField } from '../components/viz/fields'
import { DMeter } from '../components/viz/meters'
import { GENRES } from '../audio/synth'
import { dailyDoneToday, dailyDrill, plan, skillLevels } from '../lib/coach'
import { currentWeek, isDrillMission, MISSION_XP, missionBest, missionDone, missionLink, missionsDone, WEEKS } from '../lib/course'
import { drillById, SKILLS } from '../lib/drills'
import { useTracks } from '../lib/library'
import { rankOf, streak, useProgress, worldAt, WORLDS, xpOf } from '../lib/progress'
import './shell.css'

export function Today() {
  const s = useProgress()
  const tracks = useTracks()
  const daily = dailyDrill()
  const dailyDone = dailyDoneToday(s)
  const week = currentWeek(s)
  const nextMission = week.missions.find((m) => !missionDone(s, m))
  const xp = xpOf(s, missionsDone(s))
  const rank = rankOf(xp)
  const world = worldAt(xp)
  const days = plan(s)
  const levels = skillLevels(s)
  const st = streak(s)
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
        <div>
          <p className="eyebrow">
            Week {week.n} of {WEEKS.length} · {week.title}
          </p>
          <h1>{s.settings.name ? `Good to see you, ${s.settings.name}.` : 'Fifteen minutes of ear training.'}</h1>
          <p className="muted small headphones">Wear headphones: the beatmatching drills put one deck in each ear.</p>
        </div>
        <div className="hero-side">
        <div className="rankline">
          <span style={{ whiteSpace: 'nowrap' }}>
            {rank.name}
            {st > 0 ? ` · ${st}-day streak` : ''}
          </span>
          {rank.next && <DMeter value={(xp - rank.xp) / (rank.next.xp - rank.xp)} label={`${rank.next.xp - xp} XP to ${rank.next.name}`} />}
          {rank.next && (
            <span style={{ whiteSpace: 'nowrap' }}>
              <Value v={rank.next.xp - xp} /> XP to {rank.next.name}
            </span>
          )}
        </div>
        {/* tempo worlds: nothing is locked, faster ones are recommended as XP grows */}
        <div className="worlds">
          <ol aria-label="Tempo worlds">
            {WORLDS.map((w, i) => (
              <li key={w.genre} className={i <= world.index ? 'reached' : undefined} aria-current={i === world.index ? 'step' : undefined}>
                <Link to="/train" state={{ genre: w.genre }}>
                  {GENRES[w.genre].name} <span className="tabular">{GENRES[w.genre].bpm}</span>
                </Link>
              </li>
            ))}
          </ol>
          <span className="muted small tabular">
            {world.next ? (
              <>
                <Value v={(world.next.xp - xp).toLocaleString()} /> XP to {GENRES[world.next.genre].name}, {world.next.mult}× XP
              </>
            ) : (
              'Every tempo world reached'
            )}
          </span>
        </div>
        </div>
      </section>

      {ticked < checklist.length && (
        <section className="first-steps">
          <div className="section-head first">
            <h2>Getting started</h2>
            <span className="muted small tabular">
              {ticked} of {checklist.length}
            </span>
          </div>
          <ol className="steps list">
            {checklist.map((c) => (
              <li key={c.text} className={c.done ? 'done' : ''}>
                <Link to={c.to}>
                  <span className="mark" aria-label={c.done ? 'Done' : 'To do'}>
                    {c.done ? '✓' : '○'}
                  </span>
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

      <div className="grid2">
        <Link to={`/train/${daily.id}`} className="card daily">
          <div className="daily-art" aria-hidden="true">
            <GrooveField className="absolute inset-0" palette={['--card', 'ink']} spin={(GENRES[s.settings.genre].bpm / 120) * 0.3} />
          </div>
          <p className="eyebrow">Daily drill · {dailyDone ? 'done' : <span className="fg">2× XP</span>}</p>
          <h2>{daily.name}</h2>
          <p className="muted">{dailyDone ? 'Done for today. Come back tomorrow for a new one at 2× XP.' : daily.blurb}</p>
          <span className="cta">{dailyDone ? 'Play again' : 'Play'} →</span>
        </Link>
        <Link to={nextMission ? (isDrillMission(nextMission) ? missionLink(nextMission) : nextMission.to) : '/course'} className="card">
          <p className="eyebrow">
            Course, week {week.n} · {weekDone}/{week.missions.length} missions
          </p>
          <h2>{week.title}</h2>
          {nextMission ? (
            isDrillMission(nextMission) ? (
              <>
                <p className="muted">
                  Next mission: {drillById(nextMission.drill)?.name} {nextMission.min}+
                  {nextMission.genre && ` in ${GENRES[nextMission.genre].name} ${GENRES[nextMission.genre].bpm}`} <span className="fg">· +{MISSION_XP} XP</span>
                </p>
                <div className="row" style={{ maxWidth: 360 }}>
                  <DMeter value={missionBest(s, nextMission) / nextMission.min} label={`Best ${missionBest(s, nextMission)} of ${nextMission.min}`} />
                  <span className="muted small tabular">
                    {missionBest(s, nextMission) || 0} / {nextMission.min}
                  </span>
                </div>
              </>
            ) : (
              <p className="muted">
                Next mission: {nextMission.text} <span className="fg">· +{MISSION_XP} XP</span>
              </p>
            )
          ) : (
            <p className="muted">All missions done. Tick off this week's practice tasks.</p>
          )}
          <span className="cta">Continue →</span>
        </Link>
      </div>

      {started && (
        <>
          <div className="section-head">
            <h2>Your next five days</h2>
            <span className="muted small">Planned from your scores and the course, on this device</span>
          </div>
          <div className="plan">
            {days.map((d, k) => (
              <div key={k} className={`plan-day ${k === 0 ? 'now' : ''}`}>
                <h3>{k === 0 ? 'Today' : new Date(d.date).toLocaleDateString(undefined, { weekday: 'long' })}</h3>
                {d.items.map((it) => (
                  <Link key={it.drill} to={`/train/${it.drill}${it.genre ? `?genre=${it.genre}` : ''}`} className="plan-item">
                    <strong>{drillById(it.drill)?.name}</strong>
                    <span>{it.reason}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>

          <section className="skills">
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
    </div>
  )
}
