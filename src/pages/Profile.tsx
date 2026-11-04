import { useRef, useState } from 'react'
import { ac, click, stopAll } from '../audio/engine'
import { TapPad, useTaps } from '../drills/common'
import { missionsDone } from '../lib/course'
import { DRILLS } from '../lib/drills'
import { getSettings, importState, plays, rankOf, resetProgress, streak, updateSettings, useProgress, xpOf } from '../lib/progress'

export function Profile() {
  const s = useProgress()
  const xp = xpOf(s, missionsDone(s))
  const file = useRef<HTMLInputElement>(null)
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `openskool-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  return (
    <div className="profile">
      <h1>Profile</h1>
      <div className="grid3">
        <div className="card stat">
          <b>{xp.toLocaleString()}</b>XP · {rankOf(xp).name}
        </div>
        <div className="card stat">
          <b>{streak(s)}</b>day streak
        </div>
        <div className="card stat">
          <b>{s.results.length}</b>drills played · {missionsDone(s)} missions
        </div>
      </div>
      <section className="card">
        <label>
          Name <input value={s.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} placeholder="DJ name" />
        </label>
      </section>
      <Calibrate />
      <section>
        <h2>History</h2>
        <div className="history">
          {DRILLS.filter((d) => plays(s, d.id).length).map((d) => {
            const r = plays(s, d.id).slice(-30)
            return (
              <div key={d.id} className="hist-row">
                <span>{d.name}</span>
                <svg viewBox={`0 0 ${Math.max(1, r.length - 1) * 10} 100`} preserveAspectRatio="none" className="spark" aria-label={`${d.name} last ${r.length} scores`}>
                  <polyline fill="none" stroke="#d4ff3a" strokeWidth={2} vectorEffect="non-scaling-stroke" points={r.map((x, i) => `${i * 10},${100 - x.score / 10}`).join(' ')} />
                </svg>
                <b>{r[r.length - 1].score}</b>
              </div>
            )
          })}
          {!s.results.length && <p className="muted">Play a drill and your scores show up here.</p>}
        </div>
      </section>
      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">Progress lives in this browser. Export it to back up or move to another device.</p>
        <div className="row">
          <button onClick={exportIt}>Export progress</button>
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
          <button className="ghost danger" onClick={() => confirm('Delete all scores and course progress?') && resetProgress()}>
            Reset progress
          </button>
        </div>
      </section>
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
  const start = () => {
    stopAll()
    const at = ac().currentTime + 0.3
    clicks.current = Array.from({ length: 20 }, (_, k) => at + k * 0.5)
    for (const t of clicks.current) click(t, false, 0.5)
    taps.current = []
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
  }, running)
  return (
    <section className="card">
      <h2>Tap latency</h2>
      <p className="muted small">
        Headphones, Bluetooth and keyboards add delay. Tap along with 20 clicks and timing drills will compensate. Current offset: {s.settings.latencyMs} ms.
      </p>
      {running ? (
        <TapPad onPointerDown={onPad} label="Tap each click" flash={flash} />
      ) : (
        <button className="primary" onClick={start}>
          Calibrate
        </button>
      )}
      {msg && <p>{msg}</p>}
    </section>
  )
}
