import { useRef, useState } from 'react'
import { ac, click, stopAll } from '../audio/engine'
import { rateTap, TapPad, useTaps, type TapRating } from '../drills/common'
import { Swap, Value } from '../components/Swap'
import { DitherSpark, DMeter } from '../components/viz/meters'
import { badges } from '../lib/coach'
import { missionsDone } from '../lib/course'
import { DRILLS } from '../lib/drills'
import { getSettings, importState, plays, RANKS, rankOf, resetProgress, streak, updateSettings, useProgress, xpOf, type Motion, type Theme } from '../lib/progress'
import './shell.css'

const THEMES: [Theme, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]
const MOTIONS: [Motion, string][] = [
  ['system', 'System'],
  ['reduced', 'Reduced'],
  ['full', 'Full'],
]

export function Profile() {
  const s = useProgress()
  const xp = xpOf(s, missionsDone(s))
  const st = streak(s)
  const file = useRef<HTMLInputElement>(null)
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `openskool-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const played = DRILLS.filter((d) => plays(s, d.id).length)
  const rank = rankOf(xp)
  // accuracy and best streak only count runs whose drill reported them
  const counted = s.results.filter((r) => r.total)
  const right = counted.reduce((n, r) => n + (r.right ?? 0), 0)
  const rounds = counted.reduce((n, r) => n + (r.total ?? 0), 0)
  const bestStreak = s.results.reduce((b, r) => Math.max(b, r.bestStreak ?? 0), 0)
  const bs = badges(s)
  return (
    <div className="profile">
      <h1>Profile</h1>
      <div className="grid3 stats-grid">
        <div className="stat">
          <b>
            <Value v={xp.toLocaleString()} />
          </b>
          XP · {rankOf(xp).name}
        </div>
        <div className="stat">
          <b>
            <Value v={st} />
          </b>
          {st === 1 ? 'day' : 'days'} streak
        </div>
        <div className="stat">
          <b>
            <Value v={s.results.length} />
          </b>
          drills played · {missionsDone(s)} missions
        </div>
      </div>
      {(rounds > 0 || bestStreak > 0) && (
        <p className="muted small tabular extra-stats">
          {rounds > 0 && (
            <>
              Accuracy <span className="fg">{Math.round((right / rounds) * 100)}%</span> ({right.toLocaleString()} of {rounds.toLocaleString()} rounds)
            </>
          )}
          {rounds > 0 && bestStreak > 0 && ' · '}
          {bestStreak > 0 && (
            <>
              Best streak <span className="fg">{bestStreak}</span> in a row
            </>
          )}
        </p>
      )}

      <div className="section-head">
        <h2>Rank</h2>
        <span className="muted small tabular">{rank.next ? `${(rank.next.xp - xp).toLocaleString()} XP to ${rank.next.name}` : 'Top rank'}</span>
      </div>
      <ol className="list ladder">
        {RANKS.map((r, k) => {
          const here = k === rank.index
          const next = RANKS[k + 1]
          return (
            <li key={r.name} className={here ? 'here' : k < rank.index ? 'passed' : ''} aria-current={here ? 'step' : undefined}>
              <span className="ladder-name">{r.name}</span>
              <span className="ladder-bar">{here && next && <DMeter value={(xp - r.xp) / (next.xp - r.xp)} height={6} label={`${xp - r.xp} of ${next.xp - r.xp} XP through ${r.name}`} />}</span>
              <span className="muted small tabular">{here ? `You · ${xp.toLocaleString()} XP` : `${r.xp.toLocaleString()} XP`}</span>
            </li>
          )
        })}
      </ol>

      <div className="section-head">
        <h2>Badges</h2>
        <span className="muted small tabular">
          {bs.filter((b) => b.earned).length} of {bs.length}
        </span>
      </div>
      <ul className="badges">
        {bs.map((b) => (
          <li key={b.id} className={b.earned ? 'earned' : ''}>
            <b>{b.name}</b>
            <span>{b.how}</span>
          </li>
        ))}
      </ul>

      <h2>Settings</h2>
      <div className="list settings">
        <div className="setting">
          <div>
            <h3>Name</h3>
            <p>Used to greet you on Today.</p>
          </div>
          <input value={s.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} placeholder="DJ name" aria-label="Name" />
        </div>
        <div className="setting">
          <div>
            <h3>Appearance</h3>
            <p>System follows your device's light or dark setting.</p>
          </div>
          <div className="seg-group" role="radiogroup" aria-label="Appearance">
            {THEMES.map(([v, label]) => (
              <button key={v} role="radio" aria-checked={s.settings.theme === v} className={s.settings.theme === v ? 'seg on' : 'seg'} onClick={() => updateSettings({ theme: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div>
            <h3>Motion</h3>
            <p>How content changes. Reduced swaps it instantly; System follows your device.</p>
          </div>
          <div className="seg-group" role="radiogroup" aria-label="Motion">
            {MOTIONS.map(([v, label]) => (
              <button key={v} role="radio" aria-checked={s.settings.motion === v} className={s.settings.motion === v ? 'seg on' : 'seg'} onClick={() => updateSettings({ motion: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div>
            <h3>Vibrate on taps</h3>
            <p>A short buzz on each tap in the timing drills, on phones that support it.</p>
          </div>
          <div className="seg-group" role="radiogroup" aria-label="Vibrate on taps">
            {([true, false] as const).map((v) => (
              <button key={String(v)} role="radio" aria-checked={s.settings.haptics === v} className={s.settings.haptics === v ? 'seg on' : 'seg'} onClick={() => updateSettings({ haptics: v })}>
                {v ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
        <Calibrate />
      </div>

      <div className="section-head">
        <h2>History</h2>
        {played.length > 0 && <span className="muted small">Last 30 scores per drill</span>}
      </div>
      {played.length ? (
        <div className="list history">
          {played.map((d) => {
            const r = plays(s, d.id).slice(-30)
            return (
              <div key={d.id} className="hist-row">
                <span className="hist-name">{d.name}</span>
                <DitherSpark values={r.map((x) => x.score)} label={`${d.name}, last ${r.length} scores`} />
                <b>
                  <Value v={r[r.length - 1].score} />
                </b>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="muted">Play a drill and your scores show up here.</p>
      )}

      <h2>Your data</h2>
      <div className="list">
        <div className="setting">
          <div>
            <h3>Progress</h3>
            <p>Lives in this browser. Export it to back up or move to another device.</p>
          </div>
          <div className="setting-actions">
            <button onClick={exportIt}>Export</button>
            <button onClick={() => file.current?.click()}>Import…</button>
            <input
              ref={file}
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  importState(await f.text())
                } catch (err) {
                  alert((err as Error).message)
                }
              }}
            />
          </div>
        </div>
        <div className="setting">
          <div>
            <h3>Reset</h3>
            <p>Deletes all scores and course progress. Your tracks stay.</p>
          </div>
          <button className="danger" onClick={() => confirm('Delete all scores and course progress?') && resetProgress()}>
            Reset progress
          </button>
        </div>
      </div>
    </div>
  )
}

function Calibrate() {
  const s = useProgress()
  const [running, setRunning] = useState(false)
  const [flash, setFlash] = useState(0)
  const clicks = useRef<number[]>([])
  const taps = useRef<number[]>([])
  const [msg, setMsg] = useState('')
  const [rating, setRating] = useState<TapRating | null>(null)
  const start = () => {
    stopAll()
    const at = ac().currentTime + 0.3
    clicks.current = Array.from({ length: 20 }, (_, k) => at + k * 0.5)
    for (const t of clicks.current) click(t, false, 0.5)
    taps.current = []
    setRating(null)
    setRunning(true)
    setMsg('')
    setTimeout(finish, 10600)
  }
  const finish = () => {
    setRunning(false)
    // undo the offset already applied, skip the first 4 clicks while you lock in
    const cur = getSettings().latencyMs / 1000
    const devs = taps.current
      .map((t) => t + cur)
      .map((t) => {
        const c = clicks.current.slice(4).reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), Infinity)
        return t - c
      })
      .filter((d) => Math.abs(d) < 0.2)
      .sort((a, b) => a - b)
    if (devs.length < 8) {
      setMsg('Not enough steady taps. Try again and tap every click.')
      return
    }
    const med = devs[Math.floor(devs.length / 2)]
    const ms = Math.round(med * 1000) || 1
    updateSettings({ latencyMs: ms })
    setMsg(`Saved: your taps land ${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'} on this device. Timing drills now correct for it.`)
  }
  const onPad = useTaps((t) => {
    taps.current.push(t)
    setFlash((f) => f + 1)
    setRating((r) => rateTap(t, clicks.current, 0.25, r, 'not on a click'))
  }, running)
  return (
    <div className="setting calibrate">
      <div>
        <h3>Tap latency</h3>
        <p>
          Headphones, Bluetooth and keyboards add delay. Tap along with 20 clicks and timing drills will compensate. Current offset:{' '}
          <span className="tabular fg">
            <Value v={`${s.settings.latencyMs} ms`} />
          </span>
          .
        </p>
        {msg && <p className="calib-msg fade-in">{msg}</p>}
      </div>
      <Swap k={running ? 'run' : 'idle'} className="calib-action">
        {running ? (
          <TapPad onPointerDown={onPad} label="Tap each click" flash={flash} rating={rating} />
        ) : (
          <button onClick={start}>{s.settings.latencyMs ? 'Recalibrate' : 'Calibrate'}</button>
        )}
      </Swap>
    </div>
  )
}
