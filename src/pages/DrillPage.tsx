import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ac } from '../audio/engine'
import { Swap } from '../components/Swap'
import { Scope } from '../components/viz/fields'
import { DMeter, ScoreRing } from '../components/viz/meters'
import { GENRES, type Genre } from '../audio/synth'
import { DRILL_COMPONENTS, LEARN_COMPONENTS } from '../drills'
import type { RunDetail } from '../drills/common'
import { badges, isDailyRun, nextUp } from '../lib/coach'
import { currentWeek, isDrillMission, MISSION_XP, missionBest, missionDone, missionId, missionsDone, WEEKS } from '../lib/course'
import { drillById, hasWorlds } from '../lib/drills'
import { readyTracks, useTracks } from '../lib/library'
import { addResult, best, bestIn, FIRST_PLAY_XP, getState, plays, rankOf, scoreXp, updateSettings, useProgress, worldAt, WORLDS, xpOf, type SourceKind } from '../lib/progress'
import './shell.css'

// drills where seeing the audio can't give the answer away
const SCOPE_SAFE = new Set(['sync', 'downbeat', 'drop', 'phrase', 'tempomatch'])

/** How long a run is, shown on the intro. */
const LENGTH: Record<string, string> = {
  timefeel: '6 rounds · ~2 min',
  downbeat: '16 bars · ~1 min',
  bpmmath: '10 questions · ~2 min',
  sync: '6 rounds · ~2 min',
  tempomatch: '3 rounds · ~3 min',
  taptempo: '4 rounds · ~1 min',
  drop: '5 rounds · ~2 min',
  phrase: '4 rounds · ~2 min',
  eq: '6 rounds · ~2 min',
  filter: '6 rounds · ~2 min',
  gain: '6 rounds · ~2 min',
  clash: '6 rounds · ~2 min',
  loops: '8 rounds · ~2 min',
  fx: '8 rounds · ~2 min',
  genre: '8 rounds · ~2 min',
  camelot: '10 questions · ~2 min',
  setbuilder: 'One crate · ~2 min',
  vocab: '60 seconds',
  signal: '4 sequences · ~2 min',
}

interface RunResult {
  score: number
  prevBest: number
  detail?: RunDetail
  missions: string[]
  /** An open mission for this drill this week that the run did not finish. */
  progress?: { best: number; min: number; week: number }
  badges: string[]
  /** `world` is the extra XP from a faster tempo world, named by `worldName`. */
  xp: { score: number; world: number; worldName?: string; daily: number; first: number; missions: number }
  rank: { name: string; up: boolean; xp: number; from: number; next?: { xp: number; name: string } }
  next: { drill: string; why: string; genre?: Genre } | null
}

export function DrillPage() {
  const { id = '' } = useParams()
  // a fresh instance per drill, so moving between drills never carries over a running round
  return <Drill key={id} id={id} />
}

function Drill({ id }: { id: string }) {
  const meta = drillById(id)
  const s = useProgress()
  const allTracks = useTracks()
  const [phase, setPhase] = useState<'intro' | 'learn' | 'play' | 'done'>('intro')
  const [result, setResult] = useState<RunResult | null>(null)
  const [runKey, setRunKey] = useState(0)
  // mission links name a tempo world: ?genre=techno
  const [params] = useSearchParams()
  const askGenre = params.get('genre')
  useEffect(() => {
    if (askGenre && askGenre in GENRES) updateSettings({ source: 'builtin', genre: askGenre as Genre })
  }, [askGenre])
  // R restarts the run in place, from any round; on the results screen it plays again
  useEffect(() => {
    if (phase !== 'play' && phase !== 'done') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'r' && e.key !== 'R') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      setRunKey((k) => k + 1)
      setPhase('play')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])
  if (!meta) return <p>Unknown drill. <Link to="/train">Back to Train</Link></p>
  const Comp = DRILL_COMPONENTS[meta.id]
  const Learn = LEARN_COMPONENTS[meta.id]
  const mineCount = readyTracks().length
  // why "My tracks" is off, when it is
  const mineOff = !mineCount
    ? allTracks.length
      ? `My tracks is off: your ${allTracks.length === 1 ? 'track has' : `${allTracks.length} tracks have`} no tempo and grid yet${allTracks.some((t) => t.status === 'analysing') ? ' (still analysing)' : ''}.`
      : 'My tracks is off: there is no music in your Library yet.'
    : ''
  const kind: SourceKind = meta.audio === 'mine' && s.settings.source === 'mine' && mineCount ? 'mine' : 'builtin'
  const genre = s.settings.genre
  const picker = meta.audio !== 'none' && !meta.audioNote
  // best on the audio you are about to play
  const runs = plays(s, meta.id)
  const worlds = hasWorlds(meta.id)
  const sourceBest = runs.length ? bestIn(s, meta.id, kind === 'mine' ? 'mine' : genre) : 0
  const xpNow = xpOf(s, missionsDone(s))
  const multOf = (g: Genre) => WORLDS.find((w) => w.genre === g)?.mult ?? 1
  const worldMultNow = kind === 'builtin' && worlds ? multOf(genre) : 1
  // soft unlock: every world is open, faster ones are recommended from an XP level
  const worldTitle = (g: Genre) => {
    const w = WORLDS.find((x) => x.genre === g)!
    if (!worlds) return undefined
    return xpNow >= w.xp ? `${w.mult}× XP` : `Recommended from ${w.xp.toLocaleString()} XP (you have ${xpNow.toLocaleString()}). Open to try any time, ${w.mult}× XP.`
  }
  const aheadOfYou = kind === 'builtin' && worlds && worldAt(xpNow).index < WORLDS.findIndex((w) => w.genre === genre)
  const overall = best(s, meta.id)
  const sourceName = kind === 'mine' ? 'your tracks' : GENRES[genre].name
  const daily = isDailyRun(s, meta.id)

  const done = (score: number, detail?: RunDetail) => {
    // a run where every round was skipped isn't a result: nothing is saved and no XP is paid
    if (!score && detail?.misses?.length && detail.misses.every((m) => m.picked === 'Skipped')) {
      setPhase(Learn ? 'learn' : 'intro')
      return
    }
    const prev = getState()
    const prevBest = best(prev, meta.id)
    const isDaily = isDailyRun(prev, meta.id)
    const first = plays(prev, meta.id).length === 0
    const doneBefore = new Set(WEEKS.flatMap((w) => w.missions.filter((m) => missionDone(prev, m)).map((m) => missionId(w, m))))
    const badgesBefore = new Set(badges(prev).filter((b) => b.earned).map((b) => b.id))
    const xpBefore = xpOf(prev, missionsDone(prev))
    const week = currentWeek(prev)
    const run = {
      drill: meta.id,
      score,
      at: Date.now(),
      source: kind,
      genre: kind === 'builtin' && worlds ? genre : undefined,
      right: detail?.right,
      total: detail?.total,
      bestStreak: detail?.bestStreak,
      grades: detail?.grades,
      daily: isDaily || undefined,
    }
    addResult(run)
    const now = getState()
    const unlocked = WEEKS.flatMap((w) =>
      w.missions
        .filter(isDrillMission)
        .filter((m) => missionDone(now, m) && !doneBefore.has(missionId(w, m)))
        .map((m) => `Week ${w.n}: ${drillById(m.drill)?.name} ${m.min}+${m.genre ? ` in ${GENRES[m.genre].name}` : ''}`),
    )
    const open = week.missions.filter(isDrillMission).find((m) => m.drill === meta.id && !missionDone(now, m))
    const xpAfter = xpOf(now, missionsDone(now))
    const rBefore = rankOf(xpBefore)
    const rAfter = rankOf(xpAfter)
    const sx = Math.round(score / 10)
    setResult({
      score,
      prevBest,
      detail,
      missions: unlocked,
      progress: open && { best: missionBest(now, open), min: open.min, week: week.n },
      badges: badges(now)
        .filter((b) => b.earned && !badgesBefore.has(b.id))
        .map((b) => b.name),
      xp: {
        score: sx,
        world: scoreXp({ ...run, daily: false }) - sx,
        worldName: run.genre && worldMultNow > 1 ? `${GENRES[run.genre].name} ${worldMultNow}×` : undefined,
        daily: scoreXp(run) - scoreXp({ ...run, daily: false }),
        first: first ? FIRST_PLAY_XP : 0, missions: unlocked.length * MISSION_XP },
      rank: { name: rAfter.name, up: rAfter.index > rBefore.index, xp: xpAfter, from: rAfter.xp, next: rAfter.next },
      next: nextUp(now, meta.id),
    })
    setPhase('done')
  }

  const start = () => {
    ac()
    setPhase('play')
  }

  return (
    <div className="drill-page">
      <div className="crumbs">
        <Link to={meta.audio === 'none' ? '/train?tab=knowledge' : '/train'}>{meta.audio === 'none' ? 'Knowledge' : 'Train'}</Link> / {meta.skill}
      </div>
      <h1>{meta.name}</h1>
      <p className="drill-desc">{meta.blurb}</p>
      <Swap k={`${phase}-${runKey}`}>
        {phase === 'intro' && (
          <div className="intro">
            <p className="drill-facts muted small">
              {LENGTH[meta.id] ?? 'A few minutes'}
              {meta.audio !== 'none' && <> · Headphones on{meta.decks === 2 ? ': deck A plays left, B right' : ''}</>}
              {worldMultNow > 1 && <> · {worldMultNow}× XP in {GENRES[genre].name}</>}
              {daily && <> · <span className="fg">2× XP today</span></>}
            </p>
            <ul className="teach">
              {meta.teach.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {meta.audio !== 'none' && meta.audioNote && <p className="muted small">{meta.audioNote}</p>}
            {picker && (
              <div className="source">
                <span className="label">Audio</span>
                <div className="seg-group source-wide" role="group" aria-label="Audio source">
                  {meta.audio === 'mine' && (
                    <button className={kind === 'mine' ? 'seg on' : 'seg'} disabled={!mineCount} onClick={() => updateSettings({ source: 'mine' })} title={mineOff} aria-describedby={mineOff ? 'mine-off' : undefined}>
                      My tracks ({mineCount})
                    </button>
                  )}
                  {(Object.keys(GENRES) as Genre[]).map((g) => (
                    <button key={g} className={kind === 'builtin' && genre === g ? 'seg on' : 'seg'} onClick={() => updateSettings({ source: 'builtin', genre: g })} title={worldTitle(g)}>
                      {GENRES[g].name} {GENRES[g].bpm}
                      {worlds && multOf(g) > 1 && <span className="seg-mult"> {multOf(g)}×</span>}
                    </button>
                  ))}
                </div>
                {/* phones: the same choice folded into one control */}
                <select
                  className="source-compact"
                  aria-label="Audio source"
                  value={kind === 'mine' ? 'mine' : genre}
                  onChange={(e) => (e.target.value === 'mine' ? updateSettings({ source: 'mine' }) : updateSettings({ source: 'builtin', genre: e.target.value as Genre }))}
                >
                  {meta.audio === 'mine' && (
                    <option value="mine" disabled={!mineCount}>
                      My tracks ({mineCount})
                    </option>
                  )}
                  {(Object.keys(GENRES) as Genre[]).map((g) => (
                    <option key={g} value={g}>
                      {GENRES[g].name} {GENRES[g].bpm}
                      {worlds && multOf(g) > 1 ? ` · ${multOf(g)}× XP` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {meta.audio === 'mine' && !mineCount && (
              <p className="muted small mine-note" id="mine-off">
                {mineOff} <Link to="/library">{allTracks.length ? 'Open the Library' : 'Add your own tracks'}</Link> and every audio drill that offers My tracks runs on your music.
              </p>
            )}
            {meta.decks === 2 && kind === 'mine' && mineCount === 1 && (
              <p className="muted small">You have one track, so deck B will be a contrasting built-in groove played at your track's tempo.</p>
            )}
            {meta.needs && kind === 'mine' && <p className="muted small">{meta.needs}</p>}
            {aheadOfYou && (
              <p className="muted small">
                {GENRES[genre].name} {GENRES[genre].bpm} is ahead of where you are: it is recommended from {WORLDS.find((w) => w.genre === genre)!.xp.toLocaleString()} XP. Faster tempos leave less room for error, so expect lower
                scores at first.
              </p>
            )}
            <div className="row start-row">
              {Learn ? (
                <>
                  {/* learn first until you have taken the quiz once */}
                  <button className={runs.length ? 'big' : 'primary big'} onClick={() => setPhase('learn')}>
                    Learn
                  </button>
                  <button className={runs.length ? 'primary big' : 'big'} onClick={start}>
                    {runs.length ? 'Quiz' : 'Skip to quiz'}
                  </button>
                </>
              ) : (
                <button className="primary big" onClick={start}>
                  Start
                </button>
              )}
              <span className="muted small tabular">
                {picker ? (
                  <>
                    Best on {sourceName}: {sourceBest || '—'}
                    {overall > sourceBest && ` · ${overall} overall`}
                  </>
                ) : (
                  <>Best: {overall || '—'}</>
                )}
              </span>
            </div>
          </div>
        )}
        {phase === 'learn' && Learn && (
          <div className="learn-stage">
            <div className="stage-bar">
              <span className="muted small">Learn</span>
              <button className="ghost" onClick={start}>
                Skip to quiz
              </button>
            </div>
            <Learn onQuiz={start} />
          </div>
        )}
        {phase === 'play' && (
          <div className="stage">
            <div className="stage-bar">
              <button className="ghost" onClick={() => setPhase(Learn ? 'learn' : 'intro')}>
                {Learn ? '← Learn' : '← Intro'}
              </button>
              <button className="ghost" onClick={() => setRunKey((k) => k + 1)} title="Start this run again from round 1">
                ↺ Restart <kbd>R</kbd>
              </button>
            </div>
            {SCOPE_SAFE.has(meta.id) && (
              <div className="scope">
                <Scope className="absolute inset-0" palette={['--card', 'ink']} />
              </div>
            )}
            <Comp source={{ kind, genre }} onDone={done} />
          </div>
        )}
        {phase === 'done' && result && (
          <Results
            r={result}
            again={() => {
              setRunKey((k) => k + 1)
              setPhase('play')
            }}
            changeAudio={picker ? () => setPhase('intro') : undefined}
            learn={Learn ? () => setPhase('learn') : undefined}
          />
        )}
      </Swap>
    </div>
  )
}

function Results({ r, again, changeAudio, learn }: { r: RunResult; again: () => void; changeAudio?: () => void; learn?: () => void }) {
  const d = r.detail
  const g = d?.grades
  const total = r.xp.score + r.xp.world + r.xp.daily + r.xp.first + r.xp.missions
  const parts = [`score ${r.xp.score}`, r.xp.world && `${r.xp.worldName} +${r.xp.world}`, r.xp.daily && `daily 2× +${r.xp.daily}`, r.xp.first && `first play +${r.xp.first}`, r.xp.missions && `mission +${r.xp.missions}`].filter(Boolean)
  const next = r.next && drillById(r.next.drill)
  return (
    <div className="results">
      <ScoreRing score={r.score} />
      <div className="results-lines">
        {(d?.total !== undefined || d?.bestStreak !== undefined) && (
          <p className="tabular">
            {d.total !== undefined && `${d.right ?? 0}/${d.total} right`}
            {d.total !== undefined && d.bestStreak !== undefined && ' · '}
            {d.bestStreak !== undefined && `best streak ${d.bestStreak}`}
          </p>
        )}
        {g && (
          <p className="tabular muted">
            Perfect {g.perfect} · Good {g.good}
            {g.close !== undefined && ` · Close ${g.close}`} · Off {g.off}
            {g.miss > 0 && ` · Missed ${g.miss}`}
          </p>
        )}
        {r.score > r.prevBest && <p className="unlock">New best{r.prevBest > 0 && <span className="muted">, was {r.prevBest}</span>}</p>}
        {r.missions.map((m) => (
          <p key={m} className="unlock">
            Mission complete: {m}
          </p>
        ))}
        {r.progress && (
          <p className="muted tabular">
            <span className="fg">
              {r.progress.best} / {r.progress.min}
            </span>{' '}
            for the Week {r.progress.week} mission
          </p>
        )}
        {r.badges.map((b) => (
          <p key={b} className="unlock">
            Badge earned: {b}
          </p>
        ))}
      </div>

      <div className="xp-box">
        <p className="xp-total tabular">
          +{total} XP <span className="muted small">{parts.join(' · ')}</span>
        </p>
        {r.rank.up && <p className="unlock">Rank up: {r.rank.name}</p>}
        {r.rank.next ? (
          <div className="xp-rank">
            <DMeter value={(r.rank.xp - r.rank.from) / (r.rank.next.xp - r.rank.from)} label={`${r.rank.next.xp - r.rank.xp} XP to ${r.rank.next.name}`} />
            <span className="muted small tabular">
              {r.rank.name} · {(r.rank.next.xp - r.rank.xp).toLocaleString()} XP to {r.rank.next.name}
            </span>
          </div>
        ) : (
          <p className="muted small">{r.rank.name}, the top rank.</p>
        )}
      </div>

      <div className="row results-actions">
        {next && (
          <Link to={`/train/${next.id}${r.next!.genre ? `?genre=${r.next!.genre}` : ''}`} className="button primary" title={r.next!.why}>
            Next: {next.name}
          </Link>
        )}
        <button className={next ? '' : 'primary'} onClick={again}>
          Again <kbd>R</kbd>
        </button>
        {changeAudio && <button onClick={changeAudio}>Change audio</button>}
        {learn && <button onClick={learn}>Learn again</button>}
        <Link to="/" className="button">
          Today
        </Link>
      </div>

      {d?.misses && d.misses.length > 0 && (
        <section className="misses">
          <h3>Missed rounds</h3>
          <ul>
            {d.misses.map((m, k) => (
              <li key={k}>
                <span className="miss-prompt">{m.prompt}</span>
                <span className="muted small">
                  Your pick: <span className="bad">{m.picked}</span> · Answer: <span className="fg">{m.answer}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
