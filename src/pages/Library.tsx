import { useEffect, useRef, useState } from 'react'
import { ac, click, play, stopAll } from '../audio/engine'
import { addFiles, decodeTrack, removeTrack, setGrid, useTracks, type TrackMeta } from '../lib/library'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function Library() {
  const tracks = useTracks()
  const [drag, setDrag] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const onFiles = (fl: FileList | null) => {
    if (fl?.length) void addFiles([...fl])
  }
  const t = tracks.find((x) => x.id === editing)
  return (
    <div className="library">
      <h1>Library</h1>
      <p className="muted">
        Bring your own songs. Files are analysed here (tempo, beat grid, phrase, key, energy) and stored in this browser only. Nothing is uploaded. Check the grid before
        using a track for timing drills: the analysis is good, not perfect.
      </p>
      <div
        className={`drop ${drag ? 'over' : ''}`}
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
      >
        <strong>Drop audio files here</strong> or click to choose. MP3, WAV, FLAC, AAC, OGG.
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>
      {t?.analysis && <GridEditor track={t} onClose={() => setEditing(null)} />}
      {tracks.length > 0 && (
        <table className="tracks">
          <thead>
            <tr>
              <th>Track</th>
              <th>BPM</th>
              <th>Key</th>
              <th>Energy</th>
              <th>Length</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tracks.map((tr) => (
              <tr key={tr.id}>
                <td>
                  {tr.name} {tr.edited && <span className="tag">grid edited</span>}
                </td>
                {tr.status === 'ready' && tr.analysis ? (
                  <>
                    <td className="num">{tr.analysis.bpm.toFixed(2)}</td>
                    <td>{tr.analysis.camelot ? `${tr.analysis.camelot} · ${tr.analysis.keyName}` : '—'}</td>
                    <td>
                      <span className="energy">
                        <i style={{ width: `${tr.analysis.energy * 100}%` }} />
                      </span>
                    </td>
                    <td className="num">{fmt(tr.analysis.duration)}</td>
                    <td className="actions">
                      <button onClick={() => setEditing(tr.id)}>Grid</button>
                      <button className="ghost" onClick={() => void removeTrack(tr.id)} aria-label={`Remove ${tr.name}`}>
                        ✕
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td colSpan={4} className="muted">
                      {tr.status === 'error' ? `Could not read: ${tr.error}` : 'Analysing…'}
                    </td>
                    <td className="actions">
                      <button className="ghost" onClick={() => void removeTrack(tr.id)}>
                        ✕
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function GridEditor({ track, onClose }: { track: TrackMeta; onClose: () => void }) {
  const a = track.analysis!
  const [bpm, setBpm] = useState(a.bpm)
  const [anchor, setAnchor] = useState(a.anchor)
  const [bar, setBar] = useState(() => Math.max(0, Math.min(16, Math.floor((a.duration - a.anchor) / (240 / a.bpm)) - 5)))
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  const [taps, setTaps] = useState<number[]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
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
    const cv = canvas.current
    if (!cv || !buf) return
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
    g.fillStyle = '#3a414d'
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
    g.fillStyle = '#e8eaed'
    for (let x = 0; x < W; x++) {
      const h = (lowPx[x] / lmax) ** 3 * H * 0.42
      g.fillRect(x, H / 2 - h, 1, Math.max(1, 2 * h))
    }
    const beat = 60 / bpm
    const k0 = Math.ceil((viewStart - anchor) / beat)
    for (let k = k0; anchor + k * beat < viewStart + viewDur; k++) {
      const x = ((anchor + k * beat - viewStart) / viewDur) * W
      const isBar = k % 4 === 0
      const isPhrase = k % 32 === 0
      g.fillStyle = isPhrase ? '#d4ff3a' : isBar ? '#ff7a45' : 'rgba(255,255,255,0.25)'
      g.fillRect(x, 0, isPhrase ? 3 : isBar ? 2 : 1, H)
      if (isBar) {
        g.font = '11px ui-monospace, monospace'
        g.fillText(`${Math.floor(k / 4)}${isPhrase ? ' ◆ phrase' : ''}`, x + 4, 12)
      }
    }
  }, [buf, bpm, anchor, bar, viewStart, viewDur])

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
    <div className="card grid-editor">
      <div className="row between">
        <h2>Grid · {track.name}</h2>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted small">
        Orange lines are bar starts (the 1), green is the start of an 8-bar phrase. Play with the click: if it flams, fix the BPM; if the accent is not on the 1, shift by a
        beat; click the waveform to put the 1 of bar {bar} there.
      </p>
      <Overview peaks={a.peaks} duration={a.duration} pos={(anchor + bar * bl) / a.duration} onSeek={(f) => setBar(Math.round((f * a.duration - anchor) / bl))} />
      {buf ? <canvas ref={canvas} className="wave" onClick={onCanvasClick} /> : <div className="wave loading">Decoding…</div>}
      <div className="row wrap">
        <button onClick={() => setBar(bar - 8)}>« 8</button>
        <button onClick={() => setBar(bar - 1)}>‹ bar</button>
        <span className="num">bar {bar}</span>
        <button onClick={() => setBar(bar + 1)}>bar ›</button>
        <button onClick={() => setBar(bar + 8)}>8 »</button>
        <button className="primary" onClick={listen}>
          ▶ Play with click
        </button>
        <button onClick={stopAll}>■</button>
      </div>
      <div className="row wrap">
        <label>
          BPM <input type="number" step={0.01} value={bpm} onChange={(e) => setBpm(Number(e.target.value) || bpm)} className="num" />
        </label>
        <button onClick={() => setBpm(Math.round(bpm * 200) / 100)}>×2</button>
        <button onClick={() => setBpm(Math.round(bpm * 50) / 100)}>÷2</button>
        <button onClick={tap}>Tap{taps.length >= 4 ? ` (${taps.length})` : ''}</button>
        <span className="sep" />
        Shift
        <button onClick={() => setAnchor(anchor - 0.005)}>−5 ms</button>
        <button onClick={() => setAnchor(anchor + 0.005)}>+5 ms</button>
        <button onClick={() => setAnchor(anchor - 60 / bpm)}>−1 beat</button>
        <button onClick={() => setAnchor(anchor + 60 / bpm)}>+1 beat</button>
        <button onClick={() => setAnchor(anchor - bl)}>−1 bar</button>
        <button onClick={() => setAnchor(anchor + bl)}>+1 bar</button>
      </div>
      <div className="row">
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
    </div>
  )
}

function Overview({ peaks, duration, pos, onSeek }: { peaks: number[]; duration: number; pos: number; onSeek: (f: number) => void }) {
  return (
    <svg
      className="overview"
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onSeek((e.clientX - r.left) / r.width)
      }}
      aria-label={`Track overview, ${fmt(duration)}`}
    >
      <path d={peaks.map((p, i) => `M${i} ${50 - p * 48}V${50 + p * 48}`).join('')} stroke="#4b5563" strokeWidth={1} />
      <rect x={pos * peaks.length} width={Math.max(2, peaks.length / 80)} height={100} fill="#d4ff3a" opacity={0.8} />
    </svg>
  )
}
