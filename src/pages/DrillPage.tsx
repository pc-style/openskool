import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ac } from '../audio/engine'
import { GENRES, type Genre } from '../audio/synth'
import { DRILL_COMPONENTS } from '../drills'
import { WEEKS, missionDone, missionsDone } from '../lib/course'
import { drillById } from '../lib/drills'
import { readyTracks, useTracks } from '../lib/library'
import { addResult, best, getState, updateSettings, useProgress, xpOf, type SourceKind } from '../lib/progress'

export function DrillPage() {
  const { id = '' } = useParams()
  // a fresh instance per drill, so moving between drills never carries over a running round
  return <Drill key={id} id={id} />
}

function Drill({ id }: { id: string }) {
  const meta = drillById(id)
  const s = useProgress()
  useTracks()
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro')
  const [result, setResult] = useState<{ score: number; prevBest: number; missions: string[]; xp: number } | null>(null)
  const [runKey, setRunKey] = useState(0)
  if (!meta) return <p>Unknown drill. <Link to="/train">Back to Train</Link></p>
  const Comp = DRILL_COMPONENTS[meta.id]
  const mineCount = readyTracks().length
  const kind: SourceKind = meta.audio === 'mine' && s.settings.source === 'mine' && mineCount ? 'mine' : 'builtin'

  const done = (score: number) => {
    const prev = getState()
    const prevBest = best(prev, meta.id)
    const before = WEEKS.flatMap((w) => w.missions.filter((m) => missionDone(prev, m)).map((m) => `${w.n}:${m.drill}:${m.min}`))
    addResult({ drill: meta.id, score, at: Date.now(), source: kind, genre: kind === 'builtin' ? s.settings.genre : undefined })
    const now = getState()
    const unlocked = WEEKS.flatMap((w) => w.missions.filter((m) => missionDone(now, m) && !before.includes(`${w.n}:${m.drill}:${m.min}`)).map((m) => `Week ${w.n}: ${drillById(m.drill)?.name} ${m.min}+`))
    setResult({ score, prevBest, missions: unlocked, xp: xpOf(now, missionsDone(now)) - xpOf(prev, missionsDone(prev)) })
    setPhase('done')
  }

  return (
    <div className="drill-page">
      <div className="crumbs">
        <Link to="/train">Train</Link> / {meta.skill}
      </div>
      <h1>{meta.name}</h1>
      {phase === 'intro' && (
        <div className="intro">
          <ul className="teach">
            {meta.teach.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {meta.audio !== 'none' && (
            <div className="source">
              <span className="label">Audio</span>
              {meta.audio === 'mine' && (
                <button className={kind === 'mine' ? 'seg on' : 'seg'} disabled={!mineCount} onClick={() => updateSettings({ source: 'mine' })} title={mineCount ? '' : 'Add tracks in the Library first'}>
                  My tracks ({mineCount})
                </button>
              )}
              {(Object.keys(GENRES) as Genre[]).map((g) => (
                <button key={g} className={kind === 'builtin' && s.settings.genre === g ? 'seg on' : 'seg'} onClick={() => updateSettings({ source: 'builtin', genre: g })}>
                  {GENRES[g].name} {GENRES[g].bpm}
                </button>
              ))}
            </div>
          )}
          {meta.audio === 'mine' && !mineCount && (
            <p className="muted small">
              Tip: <Link to="/library">add your own tracks</Link> and every audio drill runs on your music.
            </p>
          )}
          {meta.needs && kind === 'mine' && <p className="muted small">{meta.needs}</p>}
          <div className="row">
            <button
              className="primary big"
              onClick={() => {
                ac()
                setPhase('play')
              }}
            >
              Start
            </button>
            <span className="muted">Best: {best(s, meta.id) || '—'}</span>
          </div>
        </div>
      )}
      {phase === 'play' && (
        <div className="stage" key={runKey}>
          <Comp source={{ kind, genre: s.settings.genre }} onDone={done} />
        </div>
      )}
      {phase === 'done' && result && (
        <div className="results">
          <div className="score">
            {result.score}
            <small>/1000</small>
          </div>
          {result.score > result.prevBest && result.prevBest > 0 && <p className="good">New best (was {result.prevBest})</p>}
          <p>+{result.xp} XP</p>
          {result.missions.map((m) => (
            <p key={m} className="mission-unlock">
              Mission complete: {m}
            </p>
          ))}
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                setRunKey((k) => k + 1)
                setPhase('play')
              }}
            >
              Again
            </button>
            <button onClick={() => setPhase('intro')}>Change audio</button>
            <Link to="/" className="button">
              Today
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
