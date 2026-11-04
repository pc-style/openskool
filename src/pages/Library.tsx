import { useEffect, useRef, useState } from 'react'
import { ac, click, play, stopAll } from '../audio/engine'
import { Reserve, Swap } from '../components/Swap'
import { RippleField } from '../components/viz/fields'
import { DitherWave, DMeter } from '../components/viz/meters'
import { addFiles, decodeTrack, importShared, removeTrack, setGrid, useTracks, type TrackMeta } from '../lib/library'

declare global {
  interface Window {
    /** File Handling API: audio files opened with the installed app. */
    launchQueue?: { setConsumer(consumer: (params: { files?: FileSystemFileHandle[] }) => void): void }
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const busyLabel = (
  <>
    <strong>Analysing…</strong>
    <span>Tempo, beat grid, phrase, key and energy. A few seconds per track.</span>
  </>
)
const idleLabel = (
  <>
    <strong>Drop audio files here</strong>
    <span>or click to choose. MP3, WAV, FLAC, AAC, OGG.</span>
  </>
)

export function Library() {
  const tracks = useTracks()
  const [drag, setDrag] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const onFiles = (fl: FileList | null) => {
    if (fl?.length) void addFiles([...fl])
  }
  useEffect(() => {
    // audio shared to, or opened with, the installed app
    void importShared()
    window.launchQueue?.setConsumer(async ({ files = [] }) => {
      const picked = await Promise.all(files.map((h) => h.getFile()))
      if (picked.length) void addFiles(picked)
    })
  }, [])
  const busy = tracks.some((x) => x.status === 'analysing')
  const t = tracks.find((x) => x.id === editing)
  return (
    <div className="library">
      <h1>Library</h1>
      <p className="muted">
        Bring your own songs. Files are analysed here (tempo, beat grid, phrase, key, energy) and stored in this browser only. Nothing is uploaded. Check the grid before
        using a track for timing drills: the analysis is good, not perfect.
      </p>
      <div
        className={`drop ${drag ? 'over' : ''} ${busy ? 'busy' : ''}`}
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          onFiles(e.dataTransfer.files)
        }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          input.current?.click()
        }}
      >
        {(drag || busy) && (
          <div className="drop-art fade-in" aria-hidden="true">
            <RippleField className="absolute inset-0" />
          </div>
        )}
        {/* the label is as big as the larger of its two texts, so it does not resize when analysis starts */}
        <Reserve className="drop-label" shape={[busyLabel, idleLabel]}>
          <Swap k={busy ? 'busy' : 'idle'}>{busy ? busyLabel : idleLabel}</Swap>
        </Reserve>
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>
      {tracks.length === 0 && (
        <p className="muted small">Once openskool is installed (browser menu, Add to Home Screen), you can also share audio files to it from other apps.</p>
      )}
      {tracks.length > 0 && (
        <>
          <div className="section-head">
            <h2>Your tracks</h2>
            <span className="muted small">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <table className="tracks">
            <thead>
              <tr>
                <th>Track</th>
                <th className="r">BPM</th>
                <th>Key</th>
                <th className="energy-col">Energy</th>
                <th className="r">Length</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((tr) => (
                <tr key={tr.id} className={editing === tr.id ? 'editing' : ''}>
                  <td className="tname">
                    <span className="tname-text" title={tr.name}>
                      {tr.name}
                    </span>
                    {tr.edited && <span className="tag">Grid edited</span>}
                  </td>
                  {tr.status === 'ready' && tr.analysis ? (
                    <>
                      <td className="num r">{tr.analysis.bpm.toFixed(2)}</td>
                      <td className="key">
                        {tr.analysis.camelot ? (
                          <>
                            {tr.analysis.camelot}
                            <span className="muted keyname"> · {tr.analysis.keyName}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="energy-col">
                        <div className="energy-cell">
                          <DMeter value={tr.analysis.energy} height={6} label={`Energy ${Math.round(tr.analysis.energy * 100)} of 100`} />
                        </div>
                      </td>
                      <td className="num r">{fmt(tr.analysis.duration)}</td>
                      <td className="actions">
                        <button key="grid" className="small" aria-pressed={editing === tr.id} onClick={() => setEditing(editing === tr.id ? null : tr.id)}>
                          Grid
                        </button>
                        <button key="remove" className="ghost small icon" onClick={() => void removeTrack(tr.id)} aria-label={`Remove ${tr.name}`}>
                          ✕
                        </button>
                      </td>
                    </>
                  ) : tr.status === 'error' ? (
                    <>
                      <td colSpan={4} className="bad">
                        Could not read: {tr.error}
                      </td>
                      <td className="actions">
                        <button key="remove" className="ghost small icon" onClick={() => void removeTrack(tr.id)} aria-label={`Remove ${tr.name}`}>
                          ✕
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* the same cells as a ready row, so the columns do not change when analysis finishes */}
                      <td className="muted pending">Analysing…</td>
                      <td className="key" />
                      <td className="energy-col" />
                      <td className="num" />
                      <td className="actions">
                        <button key="remove" className="ghost small icon" onClick={() => void removeTrack(tr.id)} aria-label={`Remove ${tr.name}`}>
                          ✕
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {t?.analysis && <GridEditor key={t.id} track={t} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Bumps when the theme class on <html> changes or the element resizes, so the canvas can redraw. */
function useRedraw(el: React.RefObject<HTMLElement | null>) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const bump = () => setN((x) => x + 1)
    const mo = new MutationObserver(bump)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const ro = new ResizeObserver(bump)
    if (el.current) ro.observe(el.current)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [el])
  return n
}

function GridEditor({ track, onClose }: { track: TrackMeta; onClose: () => void }) {
  const a = track.analysis!
  const [bpm, setBpm] = useState(a.bpm)
  const [anchor, setAnchor] = useState(a.anchor)
  const [bar, setBar] = useState(() => Math.max(0, Math.min(16, Math.floor((a.duration - a.anchor) / (240 / a.bpm)) - 5)))
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  const [taps, setTaps] = useState<number[]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLElement>(null)
  const redraw = useRedraw(box)
  const VIEW = 4
  const bl = 240 / bpm
  const viewStart = anchor + bar * bl - bl * 0.25
  const viewDur = VIEW * bl + bl * 0.5

  useEffect(() => {
    let live = true
    void decodeTrack(track.id).then((b) => live && setBuf(b))
    return () => {
      live = false
      stopAll()
    }
  }, [track.id])

  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  useEffect(() => {
    const cv = canvas.current
    if (!cv || !buf) return
    const css = getComputedStyle(document.documentElement)
    const fg = css.getPropertyValue('--foreground').trim()
    const muted = css.getPropertyValue('--muted-foreground').trim()
    const lime = css.getPropertyValue('--lime').trim()
    const font = css.getPropertyValue('--font-ui').trim()
    const dpr = window.devicePixelRatio || 1
    const W = cv.clientWidth
    const H = cv.clientHeight
    cv.width = W * dpr
    cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, W, H)
    const d = buf.getChannelData(0)
    const sr = buf.sampleRate
    // full band, quiet
    g.fillStyle = muted
    g.globalAlpha = 0.4
    for (let x = 0; x < W; x++) {
      const t0 = viewStart + (x / W) * viewDur
      const t1 = viewStart + ((x + 1) / W) * viewDur
      let mn = 0
      let mx = 0
      for (let i = Math.max(0, Math.floor(t0 * sr)); i < Math.min(d.length, Math.floor(t1 * sr)); i += 2) {
        if (d[i] < mn) mn = d[i]
        if (d[i] > mx) mx = d[i]
      }
      g.fillRect(x, H / 2 - mx * H * 0.45, 1, Math.max(1, (mx - mn) * H * 0.45))
    }
    // low band (kick and bass) on top, so the transients the grid should sit on stand out
    const a1 = Math.exp((-2 * Math.PI * 150) / sr)
    let y = 0
    const i0 = Math.max(0, Math.floor(viewStart * sr) - Math.floor(sr * 0.05))
    const lowPx = new Float32Array(W)
    for (let i = i0; i < Math.min(d.length, Math.floor((viewStart + viewDur) * sr)); i++) {
      y = (1 - a1) * d[i] + a1 * y
      const x = Math.floor(((i / sr - viewStart) / viewDur) * W)
      if (x >= 0 && x < W) lowPx[x] = Math.max(lowPx[x], Math.abs(y))
    }
    const lmax = Math.max(1e-6, ...lowPx)
    g.fillStyle = fg
    g.globalAlpha = 0.85
    for (let x = 0; x < W; x++) {
      const h = (lowPx[x] / lmax) ** 3 * H * 0.42
      g.fillRect(x, H / 2 - h, 1, Math.max(1, 2 * h))
    }
    // the grid: faint beats, solid numbered bar starts, green phrase starts
    const beat = 60 / bpm
    const k0 = Math.ceil((viewStart - anchor) / beat)
    g.font = `500 11px ${font}`
    g.textBaseline = 'top'
    for (let k = k0; anchor + k * beat < viewStart + viewDur; k++) {
      const x = Math.round(((anchor + k * beat - viewStart) / viewDur) * W)
      const isBar = k % 4 === 0
      const isPhrase = k % 32 === 0
      g.fillStyle = isPhrase ? lime : isBar ? fg : muted
      g.globalAlpha = isPhrase ? 1 : isBar ? 0.7 : 0.45
      g.fillRect(x - (isBar ? 1 : 0), 0, isBar ? 2 : 1, H)
      if (isBar) {
        g.globalAlpha = 1
        g.fillText(`${Math.floor(k / 4)}${isPhrase ? '  phrase' : ''}`, x + 5, 6)
      }
    }
    g.globalAlpha = 1
  }, [buf, bpm, anchor, bar, viewStart, viewDur, redraw])

  const listen = () => {
    if (!buf) return
    stopAll()
    const at = ac().currentTime + 0.15
    const from = anchor + bar * bl
    play(buf, { from, dur: VIEW * bl, at, gain: 0.8 })
    for (let k = 0; k < VIEW * 4; k++) click(at + (k * 60) / bpm, k % 4 === 0, k % 4 === 0 ? 0.35 : 0.2)
  }

  const tap = () => {
    const now = performance.now() / 1000
    // a pause of 2 s starts a new tap run
    const recent = [...(taps.length && now - taps[taps.length - 1] < 2 ? taps : []), now].slice(-16)
    setTaps(recent)
    if (recent.length >= 4) setBpm(Math.round(((recent.length - 1) / (recent[recent.length - 1] - recent[0])) * 60 * 100) / 100)
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = viewStart + ((e.clientX - r.left) / r.width) * viewDur
    setAnchor(t - bar * bl)
  }

  return (
    <section ref={box} className="grid-editor" aria-label={`Beat grid for ${track.name}`}>
      <div className="ge-head">
        <div>
          <h2>Beat grid</h2>
          <p className="muted small">{track.name}</p>
        </div>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted small ge-help">
        Bar starts are the solid numbered lines, faint lines are beats, and green marks the start of an 8-bar phrase. Play with the click: if it flams, fix the BPM; if the
        accent is not on the 1, shift by a beat. Click the waveform to put the 1 of bar {bar} there.
      </p>
      <DitherWave
        peaks={a.peaks}
        height={36}
        window={[viewStart / a.duration, (viewStart + viewDur) / a.duration]}
        label={`Track overview, ${fmt(a.duration)}. Showing bars ${bar} to ${bar + VIEW - 1}. Click to move there.`}
        onSeek={(f) => setBar(Math.round((f * a.duration - anchor) / bl))}
      />
      {buf ? <canvas ref={canvas} className="wave" onClick={onCanvasClick} /> : <div className="wave loading">Decoding…</div>}
      <div className="ge-controls">
        <span className="ge-label">Position</span>
        <div className="ge-group">
          <div className="btn-group">
            <button onClick={() => setBar(bar - 8)} aria-label="Back 8 bars">
              « 8
            </button>
            <button onClick={() => setBar(bar - 1)} aria-label="Back 1 bar">
              ‹
            </button>
            <button onClick={() => setBar(bar + 1)} aria-label="Forward 1 bar">
              ›
            </button>
            <button onClick={() => setBar(bar + 8)} aria-label="Forward 8 bars">
              8 »
            </button>
          </div>
          <span className="num ge-bar">Bar {bar}</span>
          <div className="btn-group">
            <button className="primary" onClick={listen} disabled={!buf}>
              ▶ Play with click
            </button>
            <button onClick={stopAll} aria-label="Stop">
              ■
            </button>
          </div>
        </div>
        <span className="ge-label">Tempo</span>
        <div className="ge-group">
          <label className="ge-bpm">
            <input type="number" step={0.01} value={bpm} onChange={(e) => setBpm(Number(e.target.value) || bpm)} className="num" aria-label="BPM" />
            <span className="muted">BPM</span>
          </label>
          <div className="btn-group">
            <button onClick={() => setBpm(Math.round(bpm * 200) / 100)}>×2</button>
            <button onClick={() => setBpm(Math.round(bpm * 50) / 100)}>÷2</button>
          </div>
          <button onClick={tap}>Tap{taps.length >= 4 ? ` · ${taps.length}` : ''}</button>
        </div>
        <span className="ge-label">Shift grid</span>
        <div className="ge-group">
          <div className="btn-group">
            <button onClick={() => setAnchor(anchor - 0.005)}>−5 ms</button>
            <button onClick={() => setAnchor(anchor + 0.005)}>+5 ms</button>
          </div>
          <div className="btn-group">
            <button onClick={() => setAnchor(anchor - 60 / bpm)}>−1 beat</button>
            <button onClick={() => setAnchor(anchor + 60 / bpm)}>+1 beat</button>
          </div>
          <div className="btn-group">
            <button onClick={() => setAnchor(anchor - bl)}>−1 bar</button>
            <button onClick={() => setAnchor(anchor + bl)}>+1 bar</button>
          </div>
        </div>
      </div>
      <div className="ge-foot">
        <button
          className="primary"
          onClick={() => {
            let an = anchor
            const ph = 8 * bl
            while (an - ph >= -bl / 8) an -= ph
            while (an < -bl / 8) an += ph
            setGrid(track.id, bpm, an)
            onClose()
          }}
        >
          Save grid
        </button>
        <button
          className="ghost"
          onClick={() => {
            setBpm(a.bpm)
            setAnchor(a.anchor)
          }}
        >
          Revert
        </button>
      </div>
    </section>
  )
}
