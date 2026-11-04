import { useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { GENRES, type Genre } from '../audio/synth'
import { Swap, Value } from '../components/Swap'
import { DMeter } from '../components/viz/meters'
import { DRILLS, hasWorlds, SKILLS } from '../lib/drills'
import { missionsDone } from '../lib/course'
import { best, bestIn, plays, updateSettings, useProgress, worldAt, WORLDS, xpOf } from '../lib/progress'

type Tab = 'ear' | 'knowledge'

export function Train() {
  const s = useProgress()
  // Today's world ladder links here with the world to show
  const asked = (useLocation().state as { genre?: Genre } | null)?.genre
  useEffect(() => {
    if (asked && asked in GENRES) updateSettings({ source: 'builtin', genre: asked })
  }, [asked])
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'knowledge' ? 'knowledge' : 'ear'
  // the sidebar's skill links filter to one skill, across both tabs
  const skillParam = params.get('skill')
  const skill = SKILLS.find((sk) => sk === skillParam) ?? null
  const inTab = DRILLS.filter((d) => (skill ? d.skill === skill : (tab === 'knowledge') === (d.audio === 'none')))
  const where: Genre | 'mine' = s.settings.source === 'mine' ? 'mine' : s.settings.genre
  const xp = xpOf(s, missionsDone(s))
  const reached = worldAt(xp).index
  const whereName = where === 'mine' ? 'your tracks' : `${GENRES[where].name} ${GENRES[where].bpm}`
  return (
    <div>
      <h1>Train</h1>
      {skill && (
        <p className="muted skill-filter">
          Showing {skill} only · <Link to="/train">All drills</Link>
        </p>
      )}
      <div className="seg-group train-tabs" role="tablist" aria-label="Drill type" hidden={!!skill}>
        {(
          [
            ['ear', 'Ear & timing'],
            ['knowledge', 'Knowledge'],
          ] as const
        ).map(([t, name]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'seg on' : 'seg'} onClick={() => setParams(t === 'ear' ? {} : { tab: t }, { replace: true })}>
            {name}
          </button>
        ))}
      </div>
      <Swap k={tab}>
        {tab === 'ear' ? (
          <>
            <p className="muted page-intro">Listening and timing drills. Faster tempos are harder and pay more XP.</p>
            <div className="world-picker">
              <div className="seg-group" role="group" aria-label="Tempo world">
                {WORLDS.map((w, i) => (
                  <button
                    key={w.genre}
                    className={where === w.genre ? 'seg on' : 'seg'}
                    onClick={() => updateSettings({ source: 'builtin', genre: w.genre })}
                    title={i <= reached ? `${w.mult}× XP` : `Recommended from ${w.xp.toLocaleString()} XP. Open to try any time.`}
                  >
                    {GENRES[w.genre].name} {GENRES[w.genre].bpm}
                    {w.mult > 1 && <span className="seg-mult"> {w.mult}×</span>}
                  </button>
                ))}
                <button className={where === 'mine' ? 'seg on' : 'seg'} onClick={() => updateSettings({ source: 'mine' })}>
                  My tracks
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="muted page-intro">No music needed. Each starts with a short lesson, then a quiz.</p>
        )}
      {SKILLS.filter((sk) => inTab.some((d) => d.skill === sk)).map((sk) => (
        <section key={sk} className="skill-group">
          <h2>{sk}</h2>
          <div className="list">
            {inTab.filter((d) => d.skill === sk).map((d) => {
              // drills that play the picked audio show their best there; the rest have one best
              const scoped = hasWorlds(d.id) && (where !== 'mine' || d.audio === 'mine')
              const b = scoped ? bestIn(s, d.id, where) : best(s, d.id)
              const played = plays(s, d.id).length > 0
              const label = !played ? 'New' : scoped && !b ? '—' : b
              return (
                <Link key={d.id} to={`/train/${d.id}`} className="list-row">
                  <div>
                    <h3>{d.name}</h3>
                    <p>{d.blurb}</p>
                  </div>
                  <div className="meta">
                    {/* only the exceptions are labelled: drills that can't use the audio you picked */}
                    {where === 'mine' && d.audio === 'builtin' && <span className="tag">Built-in audio</span>}
                    <span className="row-meter">{played ? <DMeter value={b / 1000} label={scoped ? `Best on ${whereName}: ${b} of 1000` : `Best ${b} of 1000`} /> : null}</span>
                    <span className="row-best tabular" title={scoped && played ? `Best on ${whereName}` : undefined}>
                      <Value v={label} />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
      </Swap>
    </div>
  )
}
