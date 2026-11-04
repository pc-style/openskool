import { Link } from 'react-router-dom'
import { form } from '../lib/coach'
import { DRILLS, SKILLS } from '../lib/drills'
import { best, plays, useProgress } from '../lib/progress'

const AUDIO_TAG = { mine: 'your tracks', builtin: 'built-in audio', none: 'no audio' }

export function Train() {
  const s = useProgress()
  return (
    <div>
      <h1>Train</h1>
      <p className="muted">Nineteen drills, grouped by skill. Every audio drill except Genre ID runs on your own tracks.</p>
      {SKILLS.map((sk) => (
        <section key={sk}>
          <h2>{sk}</h2>
          <div className="drills">
            {DRILLS.filter((d) => d.skill === sk).map((d) => {
              const b = best(s, d.id)
              const f = form(s, d.id)
              return (
                <Link key={d.id} to={`/train/${d.id}`} className="card drill">
                  <h3>{d.name}</h3>
                  <p>{d.blurb}</p>
                  <div className="foot">
                    <span className="tag">{AUDIO_TAG[d.audio]}</span>
                    <span className="muted">
                      {plays(s, d.id).length ? `best ${b} · form ${Math.round(f!)}` : 'new'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
