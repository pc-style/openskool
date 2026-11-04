// Listen-and-choose drills. Most work on your tracks or the built-in grooves; Feel the Time and Genre ID are built-in only.
import { useRef, useState } from 'react'
import { ac, out, click, eq3, impulse, play, track } from '../audio/engine'
import { GENRES, type Feel, type Genre } from '../audio/synth'
import { DeckLights, type DeckTimes } from '../components/DeckLights'
import { barLen, barTime, beatLen, getClip, groove, partnerClip, pick, pickBar, shuffle, type Clip, type SourcePref } from '../lib/clips'
import { EqDiagram, FilterDiagram, LoopDiagram, SyncDiagram } from '../components/viz/diagrams'
import { ChoiceDrill, type ChoiceRound, type DrillProps, type RoundTiming } from './common'

const start = () => ac().currentTime + 0.15

/**
 * The answers for a whole run, stage by stage: each stage deals its options from a shuffled bag so
 * every option comes up equally often, and no answer ever appears three times in a row.
 */
function deal<T>(stages: [T[], number][], ok: (d: T[]) => boolean = () => true): T[] {
  let d: T[] = []
  for (let tries = 0; tries < 200; tries++) {
    d = stages.flatMap(([opts, n]) => {
      const bag: T[] = []
      while (bag.length < n) bag.push(...shuffle(opts))
      return bag.slice(0, n)
    })
    if (ok(d) && d.every((x, k) => k < 2 || x !== d[k - 1] || x !== d[k - 2])) break
  }
  return d
}

/** Picks clips and sections the earlier rounds have not used, so each round sounds different. */
function useFresh() {
  const last = useRef<string | undefined>(undefined)
  const used = useRef(new Map<string, [number, number][]>())
  const clip = async (source: SourcePref) => {
    const c = await getClip(source, last.current)
    last.current = c.id
    return c
  }
  const bar = (c: Clip, bars: number) => {
    const spans = used.current.get(c.id) ?? []
    let n = pickBar(c, bars)
    for (let k = 0; k < 12 && spans.some(([s, e]) => n < e && n + bars > s); k++) n = pickBar(c, bars)
    used.current.set(c.id, [...spans, [n, n + bars]])
    return n
  }
  return { clip, bar }
}

/** A seed (1–3) for a built-in groove that differs from the one used last time for the same key. */
function useSeeds() {
  const last = useRef(new Map<string, number>())
  return (key: string) => {
    const seeds = [1, 2, 3].filter((s) => s !== last.current.get(key))
    const s = pick(seeds)
    last.current.set(key, s)
    return s
  }
}

// ---------- Feel the Time ----------
// Built-in only: the groove itself is reprogrammed as halftime, standard or double-time over the same click.
export function TimeFeel({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal<Feel>([[['half', 'standard', 'double'], 6]]))
  const seed = useSeeds()
  const make = async (i: number): Promise<ChoiceRound> => {
    const feel = plan[i]
    const g = source.genre
    const bpm = GENRES[g].bpm
    const buffer = await groove(g, seed(feel), feel, 4)
    const bl = 240 / bpm
    const playIt = (): RoundTiming => {
      const at = start()
      play(buffer, { from: 0, dur: 4 * bl, at, gain: 0.8 })
      const step = 60 / bpm
      for (let k = 0; k * step < 4 * bl - 0.01; k++) click(at + k * step, k % 4 === 0, 0.25)
      return { start: at, bpm, enableAt: at + bl, end: at + 4 * bl }
    }
    const names: Record<Feel, string> = { half: 'Halftime', standard: 'Standard', double: 'Double-time' }
    const hints: Record<Feel, string> = {
      half: 'one kick for every two clicks',
      standard: 'a kick on every click',
      double: 'two kicks for every click',
    }
    const felt = { half: bpm / 2, standard: bpm, double: bpm * 2 }[feel]
    const why: Record<Feel, string> = {
      half: 'Halftime: the kick hit only on 1 and the "and" of 3, with the clap on 3 instead of 2 and 4. Big gaps, half the click rate.',
      standard: 'Standard: the kick landed with the click on every beat.',
      double: 'Double-time: two kicks for every click, claps between the clicks. The groove ran at twice the grid.',
    }
    return {
      prompt: `The click is the grid (${bpm} BPM). How does the ${GENRES[g].name.toLowerCase()} groove feel against it?`,
      options: (['half', 'standard', 'double'] as Feel[]).map((f) => ({ id: f, label: names[f], hint: i < 2 ? hints[f] : undefined })),
      answer: feel,
      play: playIt,
      explain: `${why[feel]} At ${bpm} this feels like ${+felt.toFixed(1)}.`,
      tip:
        feel === 'standard'
          ? 'Most club tracks sit here: count four kicks to the bar and the grid and the groove agree.'
          : `A ${feel === 'half' ? 'halftime' : 'double-time'} track still mixes on the ${bpm} grid: beatmatch to the click, not to how the groove feels.`,
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- Sync Check ----------
const SYNC_OFFSETS = [0.06, 0.045, 0.034, 0.025, 0.018, 0.012]
export function SyncCheck({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal([[['early', 'sync', 'late'] as const, SYNC_OFFSETS.length]]))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const a = await fresh.clip(source)
    const b = await partnerClip(source, a)
    const rate = a.bpm / b.bpm
    const na = fresh.bar(a, 4)
    const nb = fresh.bar(b, 3)
    const kind = plan[i]
    const off = kind === 'sync' ? 0 : (kind === 'early' ? -1 : 1) * SYNC_OFFSETS[i]
    const times: DeckTimes = {
      a: { name: a.name, side: 'left', spans: [] },
      b: { name: b.name, side: 'right', spans: [] },
    }
    const playIt = (): RoundTiming => {
      const at = start()
      const bl = barLen(a)
      // A left, B right, like split cue: you always know which kick is which
      play(a.buffer, { from: barTime(a, na), dur: 4 * bl, at, gain: 0.65, pan: -0.7 })
      play(b.buffer, { from: barTime(b, nb), dur: 3 * barLen(b), at: at + bl + off, gain: 0.65, rate, pan: 0.7 })
      times.a.spans = [[at, at + 4 * bl]]
      times.b.spans = [[at + bl + off, at + 4 * bl + off]]
      return { start: at, bpm: a.bpm, enableAt: at + bl + Math.max(0, off), marks: [{ at: at + bl, text: 'Deck B in' }], end: at + 4 * bl }
    }
    const label = { early: 'Rushing (B early)', sync: 'In time', late: 'Dragging (B late)' }
    const hint = { early: 'flam starts on the right', sync: 'one solid kick', late: 'flam ends on the right' }
    const ms = Math.round(Math.abs(off) * 1000)
    const fix = {
      early: 'Fix: slow B down by touching the edge of its jog wheel (a light drag back) until the kicks lock, then lower its pitch a touch if it keeps rushing.',
      sync: 'Nothing to fix: leave the jog alone and start the blend.',
      late: 'Fix: give B a nudge forward by spinning the edge of its jog wheel until the kicks lock, then raise its pitch a touch if it keeps dragging.',
    }
    return {
      prompt: 'Deck B (right ear) drops in after one bar. Is it in time with A?',
      sub: `Offset this round: ${Math.round(SYNC_OFFSETS[i] * 1000)} ms, or none`,
      header: <DeckLights times={times} />,
      options: (['early', 'sync', 'late'] as const).map((k) => ({ id: k, label: label[k], hint: hint[k] })),
      answer: kind,
      play: playIt,
      visual: <SyncDiagram offsetMs={off * 1000} />,
      explain:
        kind === 'sync'
          ? 'Both kicks landed together: one solid thump.'
          : `B was ${ms} ms ${kind === 'early' ? 'ahead' : 'behind'}. ${kind === 'early' ? "B's kick (right) hits just before A's (left): the flam starts on the right." : "B's kick (right) trails A's (left): a gallop that ends on the right."}`,
      tip: fix[kind],
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- EQ Detective ----------
// Rounds 1–2: which band was killed. 3–4: kill or partial cut. 5–6: two bands drop, which one is left.
type Band = 'low' | 'mid' | 'high'
const BANDS: Band[] = ['low', 'mid', 'high']
const bandName = (b: Band) => b[0].toUpperCase() + b.slice(1)
const BAND_HINT: Record<Band, string> = { low: 'kick and bass', mid: 'stabs, vocals, snare', high: 'hats and air' }
const BAND_TIP: Record<Band, string> = {
  low: "In a mix the low is the band you swap: keep the incoming track's low cut, then trade lows in one move on a phrase line.",
  mid: 'Cut the mids of the incoming track so its synths and vocals stay out of the way, then bring them back slowly once it has taken over.',
  high: "Bring the incoming track's highs in first to tease it; turning the outgoing track's highs down pushes it into the background.",
}
const dbText = (db: number) => (db <= -30 ? 'kill' : `−${-db} dB`)
export function EqDetective({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal<string>([[BANDS, 2], [['kill', 'cut'], 2], [BANDS, 2]]))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await fresh.clip(source)
    const n = fresh.bar(c, 4)
    const stage = i < 2 ? 0 : i < 4 ? 1 : 2
    // the bands that drop, and by how much
    let cuts: { band: Band; db: number }[]
    if (stage === 0) cuts = [{ band: plan[i] as Band, db: [-40, -24][i] }]
    else if (stage === 1) cuts = [{ band: pick(BANDS), db: plan[i] === 'kill' ? -40 : [-12, -9][i - 2] }]
    else cuts = BANDS.filter((b) => b !== plan[i]).map((band) => ({ band, db: [-30, -24][i - 4] }))
    const playIt = (): RoundTiming => {
      const ctx = ac()
      const eq = eq3(ctx)
      eq.output.connect(out())
      const at = start()
      const bl = barLen(c)
      const cut = at + 2 * bl
      play(c.buffer, { from: barTime(c, n), dur: 4 * bl, at, to: eq.input })
      // a knob turned fast, not a click: about 40 ms from full to the cut
      for (const { band, db } of cuts) {
        eq[band].gain.setValueAtTime(0, at)
        eq[band].gain.setValueAtTime(0, cut)
        eq[band].gain.linearRampToValueAtTime(db, cut + 0.04)
      }
      return { start: at, bpm: c.bpm, enableAt: cut + 0.5 * beatLen(c), marks: [{ at: cut, text: 'Cut' }], end: at + 4 * bl }
    }
    const what = {
      low: 'the kick lost its weight and the bassline disappeared',
      mid: `the body went hollow: ${c.source === 'builtin' ? 'chord stabs, synths and claps' : 'synths, vocals and snare'} got scooped out`,
      high: 'hats and air vanished; the track went dull but still thumped',
    }
    const bandOptions = BANDS.map((b) => ({ id: b, label: bandName(b), hint: BAND_HINT[b] }))
    if (stage === 0) {
      const { band, db } = cuts[0]
      return {
        prompt: 'Two bars full, then one band drops. Which knob moved?',
        sub: `Cut depth: ${dbText(db)}`,
        options: bandOptions,
        answer: band,
        play: playIt,
        visual: <EqDiagram band={band} cutDb={db} />,
        explain: `${bandName(band)} at ${dbText(db)}: ${what[band]}.`,
        tip: BAND_TIP[band],
      }
    }
    if (stage === 1) {
      const { band, db } = cuts[0]
      const partial = [-12, -9][i - 2]
      return {
        prompt: `Two bars full, then the ${band} knob turns down. All the way, or part of the way?`,
        sub: `A partial cut this round is −${-partial} dB`,
        options: [
          { id: 'kill', label: 'Kill (all the way)', hint: 'the band is gone' },
          { id: 'cut', label: 'Partial cut', hint: 'quieter, still there' },
        ],
        answer: plan[i],
        play: playIt,
        visual: <EqDiagram band={band} cutDb={db} />,
        explain:
          plan[i] === 'kill'
            ? `A full ${band} kill: ${what[band]}, completely.`
            : `A partial cut of ${-db} dB: the ${band} band got quieter but never went away.`,
        tip: 'Kills are for swaps and drops. Partial cuts of 6–12 dB make room while both tracks play.',
      }
    }
    const left = plan[i] as Band
    return {
      prompt: 'Two bars full, then two knobs turn down. Which band is left standing?',
      sub: `Two bands down ${-cuts[0].db} dB`,
      options: bandOptions,
      answer: left,
      play: playIt,
      explain: `${cuts.map((x) => bandName(x.band)).join(' and ')} went down ${-cuts[0].db} dB; only the ${left} band kept its level.`,
      tip: BAND_TIP[left],
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- Filter Sweep ----------
// Rounds 1–2: low-pass, high-pass or nothing. 3–4: closing in or opening out. 5–6: plain or resonant.
type FilterKind = 'lp' | 'hp'
const FILTER_NAME: Record<FilterKind, string> = { lp: 'low-pass', hp: 'high-pass' }
/** Cutoff for a filter turned `v` of the way (0 open, 1 fully closed), on the same curve as the mixer's filter knob. */
const cutoff = (kind: FilterKind, v: number) => (kind === 'lp' ? 20000 * Math.pow(100 / 20000, v) : 20 * Math.pow(6000 / 20, v))
const hz = (f: number) => `${Math.round(f / (f >= 1000 ? 100 : 10)) * (f >= 1000 ? 100 : 10)} Hz`.replace(/^(\d)(\d{3}) /, '$1,$2 ')

export function FilterSweep({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal<string>([[['lp', 'hp', 'none'], 2], [['in', 'out'], 2], [['plain', 'res'], 2]]))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await fresh.clip(source)
    const n = fresh.bar(c, 4)
    const stage = i < 2 ? 0 : i < 4 ? 1 : 2
    const answer = plan[i]
    const kind: FilterKind | 'none' = stage === 0 ? (answer as FilterKind | 'none') : pick(['lp', 'hp'] as const)
    const opening = stage === 1 && answer === 'out'
    const resonant = stage === 2 && answer === 'res'
    const depth = stage === 0 ? [0.85, 0.7][i] : 0.7
    const playIt = (): RoundTiming => {
      const ctx = ac()
      const f = ctx.createBiquadFilter()
      f.type = kind === 'hp' ? 'highpass' : 'lowpass'
      f.Q.value = resonant ? 9 : 1.2
      const g = ctx.createGain()
      g.gain.value = resonant ? 0.6 : 1
      f.connect(g).connect(out())
      const at = start()
      const bl = barLen(c)
      play(c.buffer, { from: barTime(c, n), dur: 4 * bl, at, to: f })
      // one bar still, the sweep over bars 2–3, one bar holding where it ended
      const k = kind === 'none' ? 'lp' : kind
      const from = cutoff(k, kind === 'none' || !opening ? 0 : depth)
      const to = cutoff(k, kind === 'none' || opening ? 0 : depth)
      f.frequency.setValueAtTime(from, at)
      f.frequency.setValueAtTime(from, at + bl)
      f.frequency.exponentialRampToValueAtTime(to, at + 3 * bl)
      return { start: at, bpm: c.bpm, enableAt: at + bl + 3 * beatLen(c), marks: [{ at: at + bl, text: 'Listen' }], end: at + 4 * bl }
    }
    const visual = <FilterDiagram kind={kind} />
    const far = kind === 'none' ? 0 : cutoff(kind, depth)
    if (stage === 0) {
      const why = {
        lp: `Low-pass: the highs closed down to ${hz(far)} and it went muffled.`,
        hp: `High-pass: the lows thinned out up to ${hz(far)} and the kick lost its body.`,
        none: 'Nothing moved. Good DJs know when not to touch the filter.',
      }
      const tip = {
        lp: 'A low-pass is the gentle way out: close it over 8 or 16 bars while the next track takes over.',
        hp: 'A high-pass thins a track before a drop or a swap: let the kick go, then open it again on the 1.',
        none: 'Reach for the filter with a purpose: a build, a mix-out or hiding a clash.',
      }
      return {
        prompt: 'Listen through the sweep. What happened?',
        options: [
          { id: 'lp', label: 'Low-pass', hint: 'muffled, highs go' },
          { id: 'hp', label: 'High-pass', hint: 'thin, lows go' },
          { id: 'none', label: 'Nothing', hint: 'no change' },
        ],
        answer,
        play: playIt,
        visual,
        explain: why[kind],
        tip: tip[kind],
      }
    }
    const k = kind as FilterKind
    const lost = k === 'lp' ? 'highs' : 'lows'
    if (stage === 1) {
      return {
        prompt: 'A filter moves over bars 2 and 3. Is it closing in or opening out?',
        options: [
          { id: 'in', label: 'Closing (sweep in)', hint: 'starts full' },
          { id: 'out', label: 'Opening (sweep out)', hint: 'ends full' },
        ],
        answer,
        play: playIt,
        visual,
        explain: opening
          ? `A ${FILTER_NAME[k]} opening out from ${hz(far)}: it started ${k === 'lp' ? 'muffled' : 'thin'} and the ${lost} came back. That is how you bring a filtered track into the mix.`
          : `A ${FILTER_NAME[k]} closing in to ${hz(far)}: it started full and the ${lost} were taken away. That is how you push a track out of the mix.`,
        tip: opening
          ? 'Time the opening so the filter is fully open on the 1 of a new phrase.'
          : 'Close it over a whole phrase so the exit sounds intended, not like a mistake.',
      }
    }
    return {
      prompt: `A ${FILTER_NAME[k]} closes in. Plain filter, or resonant?`,
      options: [
        { id: 'plain', label: 'Plain', hint: 'just fades' },
        { id: 'res', label: 'Resonant', hint: 'whistles at the cutoff' },
      ],
      answer,
      play: playIt,
      visual,
      explain: resonant
        ? `Resonant: a whistling, squelchy peak rode on the cutoff as it moved down to ${hz(far)}. That is the resonance knob turned up.`
        : `Plain: the ${lost} just faded away down to ${hz(far)}, with no whistling peak at the cutoff.`,
      tip: resonant
        ? 'Resonance adds tension on a build; turn it down before the drop so the track does not whistle.'
        : 'A plain filter is the safest mixing tool: it moves the sound without drawing attention.',
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- Gain Match ----------
// Rounds 1–3: which one is louder. 4–6: a third answer, matched, with smaller differences.
const GAIN_DB = [6, 4, 3, 2, 1.5, 1]
const GAIN_BARS = 8
export function GainMatch({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal<string>([[['a', 'b'], 3], [['a', 'b', 'same'], 3]]))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await fresh.clip(source)
    const n = fresh.bar(c, 1)
    const louder = plan[i]
    const db = louder === 'same' ? 0 : GAIN_DB[i]
    const lin = 10 ** (-db / 20)
    const times: DeckTimes = {
      a: { name: c.name, side: 'left', spans: [], where: 'bars 1, 3, 5, 7' },
      b: { name: c.name, side: 'right', spans: [], where: 'bars 2, 4, 6, 8' },
    }
    const playIt = (): RoundTiming => {
      const at = start()
      const bl = barLen(c)
      times.a.spans = []
      times.b.spans = []
      // the same bar, A then B, back to back with no gaps
      for (let k = 0; k < GAIN_BARS; k++) {
        const which = k % 2 ? 'b' : 'a'
        const t = at + k * bl
        play(c.buffer, { from: barTime(c, n), dur: bl, at: t, gain: 0.8 * (louder === 'same' || which === louder ? 1 : lin) })
        times[which].spans.push([t, t + bl])
      }
      return { start: at, bpm: c.bpm, enableAt: at + 2 * bl, end: at + GAIN_BARS * bl }
    }
    const options = [
      { id: 'a', label: 'A (odd bars)' },
      { id: 'b', label: 'B (even bars)' },
    ]
    return {
      prompt: i < 3 ? 'A and B take turns, one bar each. Which is louder?' : 'A and B take turns, one bar each. Which is louder, or are they matched?',
      sub: i < 3 ? `Level difference: ${db} dB` : `Level difference: ${GAIN_DB[i]} dB, or none`,
      header: <DeckLights times={times} />,
      options: i < 3 ? options : [...options, { id: 'same', label: 'Matched' }],
      answer: louder,
      play: playIt,
      explain:
        louder === 'same'
          ? 'Both were at exactly the same level. Nothing to trim: leave the gain alone.'
          : `${louder.toUpperCase()} was ${db} dB louder. Match trims before the blend so neither track wins on volume alone.`,
      tip: 'Set each channel’s gain so both meters peak at the same level before the blend; then the faders, not the trims, do the mixing.',
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- Bass Clash ----------
// Rounds 1–3: which of two blends has both basses. 4–6: one blend, whose bass is carrying it.
const SWAP_TIP = "Never leave both lows up. Do the bass swap on a phrase line: on the 1 of a new 8- or 16-bar phrase, cut A's low and bring B's low up in one move."
export function BassClash({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal<string>([[['1', '2'], 3], [['a', 'b'], 3]]))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const a = await fresh.clip(source)
    const b = await partnerClip(source, a)
    const na = fresh.bar(a, 4)
    const nb = fresh.bar(b, 4)
    const rate = a.bpm / b.bpm
    const answer = plan[i]
    const times: DeckTimes = {
      a: { name: a.name, side: 'left', spans: [] },
      b: { name: b.name, side: 'right', spans: [] },
    }
    // both decks through their own EQ, A left and B right like split cue; B starts `bDelay` bars in
    const blend = (at: number, bars: number, lowB: number, bDelay = 0) => {
      const ctx = ac()
      const eqA = eq3(ctx)
      const eqB = eq3(ctx)
      eqA.output.connect(out())
      eqB.output.connect(out())
      eqB.low.gain.value = lowB
      const bl = barLen(a)
      const bIn = at + bDelay * bl
      play(a.buffer, { from: barTime(a, na), dur: bars * bl, at, gain: 0.6, pan: -0.7, to: eqA.input })
      play(b.buffer, { from: barTime(b, nb), dur: (bars - bDelay) * barLen(b), at: bIn, gain: 0.6, rate, pan: 0.7, to: eqB.input })
      times.a.spans.push([at, at + bars * bl])
      times.b.spans.push([bIn, at + bars * bl])
      return { eqA, bIn }
    }
    const header = <DeckLights times={times} />
    if (i < 3) {
      const playIt = (): RoundTiming => {
        const at = start()
        const bl = barLen(a)
        times.a.spans = []
        times.b.spans = []
        // two bars each, a bar of silence between, so the beat strip stays on the grid
        blend(at, 2, answer === '1' ? 0 : -40)
        const v2 = at + 3 * bl
        blend(v2, 2, answer === '2' ? 0 : -40)
        return {
          start: at,
          bpm: a.bpm,
          enableAt: v2 + 2 * beatLen(a),
          marks: [
            { at, text: 'Version 1' },
            { at: v2, text: 'Version 2' },
          ],
          end: at + 5 * bl,
        }
      }
      return {
        prompt: 'Two versions of the same blend. Which one has both basses fighting?',
        header,
        options: [
          { id: '1', label: 'First', hint: 'bars 1–2' },
          { id: '2', label: 'Second', hint: 'bars 4–5' },
        ],
        answer,
        play: playIt,
        explain: `Version ${answer} had both lows up: boomy and smeared. The clean one cut deck B's low, which is the bass swap.`,
        tip: SWAP_TIP,
      }
    }
    const playIt = (): RoundTiming => {
      const at = start()
      const bl = barLen(a)
      times.a.spans = []
      times.b.spans = []
      // A plays alone for a bar; when B comes in the lows are already set one way or the other
      const { eqA, bIn } = blend(at, 4, answer === 'b' ? 0 : -40, 1)
      if (answer === 'b') {
        eqA.low.gain.setValueAtTime(0, bIn)
        eqA.low.gain.linearRampToValueAtTime(-40, bIn + 0.04)
      }
      return { start: at, bpm: a.bpm, enableAt: bIn + 2 * beatLen(a), marks: [{ at: bIn, text: 'Track 2 in' }], end: at + 4 * bl }
    }
    return {
      prompt: 'Deck B comes in after a bar, and one low gets cut. Whose bass is carrying the blend?',
      header,
      options: [
        { id: 'a', label: 'Deck A (left)', hint: 'bass stays left' },
        { id: 'b', label: 'Deck B (right)', hint: 'bass moves right' },
      ],
      answer,
      play: playIt,
      explain:
        answer === 'a'
          ? "Deck A's bass (left) stayed up and B came in with its low cut: the swap hasn't happened yet."
          : "Deck B's bass (right) took over and A's low was cut as B came in: the bass swap is done.",
      tip: SWAP_TIP,
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- Loop Lab ----------
// Rounds 1–4: 1, 2, 4 or 8 beats. 5–8: shorter loops, ½, 1, 2 or 4 beats.
// A quiet bell rings a different note on each of 8 beats in the source, so a loop repeats its notes.
const BELL_STEPS = [0, 2, 4, 5, 7, 9, 11, 12]
function bell(ctx: AudioContext, at: number, degree: number) {
  const f = 523.25 * 2 ** (BELL_STEPS[degree % 8] / 12)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(0.06, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
  g.connect(out())
  const partial = ctx.createGain()
  partial.gain.value = 0.25
  partial.connect(g)
  for (const [mul, to] of [
    [1, g],
    [2.76, partial],
  ] as const) {
    const o = track(ctx.createOscillator())
    o.frequency.value = f * mul
    o.connect(to)
    o.start(at)
    o.stop(at + 0.65)
  }
}

export function LoopLab({ source, onDone }: DrillProps) {
  const [plan] = useState(() => deal([[[1, 2, 4, 8], 4], [[0.5, 1, 2, 4], 4]]))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await fresh.clip(source)
    const n = fresh.bar(c, 4)
    const choices = i < 4 ? [1, 2, 4, 8] : [0.5, 1, 2, 4]
    const beats = plan[i]
    const playIt = (): RoundTiming => {
      const ctx = ac()
      const beat = beatLen(c)
      const bl = barLen(c)
      const len = beats * beat
      const src = track(ctx.createBufferSource())
      src.buffer = c.buffer
      // two bars play through, then the loop engages on the bar line
      const loopStart = barTime(c, n + 2)
      src.loop = true
      src.loopStart = loopStart
      src.loopEnd = loopStart + len
      src.connect(out())
      const at = start()
      const on = at + 2 * bl
      // the same length for every answer in a stage, so the round's length gives nothing away
      const end = on + (i < 4 ? 4 : 2) * bl
      src.start(at, barTime(c, n))
      src.stop(end)
      for (let k = 0; k < 8; k++) bell(ctx, at + k * beat, k)
      for (let t = on; t < end - 1e-3; t += len) for (let j = 0; j * beat < len - 1e-3 && t + j * beat < end - 1e-3; j++) bell(ctx, t + j * beat, j)
      return { start: at, bpm: c.bpm, enableAt: on + bl, marks: [{ at: on, text: 'Loop on' }], end }
    }
    const label = (b: number) => (b === 0.5 ? '½ beat' : `${b} beat${b > 1 ? 's' : ''}`)
    const hint: Record<number, string> = { 0.5: 'half a note, a roll', 1: 'one note', 2: 'two notes', 4: 'one bar', 8: 'two bars' }
    const notes: Record<number, string> = {
      0.5: 'the first half of one note, retriggered',
      1: 'one note over and over',
      2: 'two notes back and forth',
      4: 'four notes, a whole bar',
      8: 'all eight notes, two bars',
    }
    const purpose = (b: number) =>
      b >= 4
        ? 'Long loops keep the groove: good for extending an intro or outro.'
        : b === 0.5
          ? 'A ½-beat loop is a fast stutter (a roll): a build-up tool, use sparingly.'
          : 'Short loops stutter: a build-up tool, use sparingly.'
    return {
      prompt: i < 4 ? 'Two bars play, then a loop engages. How long is it?' : 'Shorter loops now. Two bars play, then a loop engages. How long is it?',
      sub: 'Each beat rings its own note; count the notes that repeat',
      options: choices.map((b) => ({ id: String(b), label: label(b), hint: hint[b] })),
      answer: String(beats),
      play: playIt,
      visual: <LoopDiagram beats={beats} />,
      explain: `${label(beats)} loop: ${notes[beats]}. ${purpose(beats)}`,
      tip: 'Loop rolls build tension: hold 8 beats, then 4, 2 and 1 as the build peaks, and let go on the drop. With slip on, the track keeps running underneath and comes back in time.',
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- FX Spotter ----------
// Rounds 1–4: echo, reverb, flanger or phaser. 5–8: trans (a rhythmic gate) joins as a fifth option.
// The effect gets quieter round by round (wet 80% down to 35%), and the echo length changes.
type Fx = 'echo' | 'reverb' | 'flanger' | 'phaser' | 'trans'
const FX4: Fx[] = ['echo', 'reverb', 'flanger', 'phaser']
const FX5: Fx[] = [...FX4, 'trans']
const FX_ROUNDS = 8
const fxWet = (i: number) => 0.8 - (0.45 * i) / (FX_ROUNDS - 1)
const ECHO_BEATS = [0.5, 0.75, 1]
const beatsText = (b: number) => (b === 0.5 ? '½ beat' : b === 0.75 ? '¾ beat' : '1 beat')
function fxChain(ctx: AudioContext, fx: Fx, bpm: number, onAt: number, until: number, mix: number, echoBeats: number) {
  const input = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  input.connect(dry).connect(out())
  wet.gain.setValueAtTime(0, 0)
  wet.gain.setValueAtTime(fx === 'reverb' ? Math.min(1, mix * 1.15) : mix, onAt)
  wet.connect(out())
  const lfos: OscillatorNode[] = []
  if (fx === 'echo') {
    const d = ctx.createDelay(2)
    d.delayTime.value = (60 / bpm) * echoBeats
    const fb = ctx.createGain()
    fb.gain.value = 0.5
    input.connect(d).connect(fb).connect(d)
    d.connect(wet)
  } else if (fx === 'reverb') {
    const conv = ctx.createConvolver()
    conv.buffer = impulse(ctx, 2.8, 2.5)
    input.connect(conv).connect(wet)
  } else if (fx === 'trans') {
    // the sound cut on and off on every 8th note: on for a 16th, silent for a 16th
    const gate = ctx.createGain()
    const s16 = 60 / bpm / 4
    gate.gain.setValueAtTime(1, 0)
    for (let t = onAt; t < until; t += 2 * s16) {
      gate.gain.setValueAtTime(1, t)
      gate.gain.setValueAtTime(0, t + s16)
    }
    input.connect(gate).connect(wet)
    dry.gain.setValueAtTime(1, 0)
    dry.gain.setValueAtTime(1 - mix, onAt)
  } else if (fx === 'flanger') {
    const d = ctx.createDelay(0.02)
    d.delayTime.value = 0.004
    const lfo = track(ctx.createOscillator())
    lfo.frequency.value = 0.3
    const depth = ctx.createGain()
    depth.gain.value = 0.003
    lfo.connect(depth).connect(d.delayTime)
    const fb = ctx.createGain()
    fb.gain.value = 0.7
    input.connect(d).connect(fb).connect(d)
    d.connect(wet)
    dry.gain.setValueAtTime(1, 0)
    dry.gain.setValueAtTime(0.7, onAt)
    lfos.push(lfo)
  } else {
    let node: AudioNode = input
    const lfo = track(ctx.createOscillator())
    lfo.frequency.value = 0.4
    const depth = ctx.createGain()
    depth.gain.value = 900
    lfo.connect(depth)
    for (let k = 0; k < 6; k++) {
      const ap = ctx.createBiquadFilter()
      ap.type = 'allpass'
      ap.frequency.value = 1100
      ap.Q.value = 0.8
      depth.connect(ap.frequency)
      node.connect(ap)
      node = ap
    }
    node.connect(wet)
    dry.gain.setValueAtTime(1, 0)
    dry.gain.setValueAtTime(0.75, onAt)
    lfos.push(lfo)
  }
  return { input, lfos }
}

const FX_TIP: Record<Fx, string> = {
  echo: 'Echo out: on the last bar of a phrase turn the echo on and pull the fader down, so the track leaves on repeats that stay in time.',
  reverb: 'A reverb wash hides an exit: ride it up on the outgoing track as you cut its low, then turn it off on the next 1.',
  flanger: 'A slow flanger sweep over 8 bars lifts a build; keep it off vocals and turn it off on the drop.',
  phaser: 'A phaser is subtler than a flanger: it keeps a long blend moving without changing the groove.',
  trans: 'Use trans for short fills: a beat or two before a drop, then off on the 1.',
}

export function FxSpotter({ source, onDone }: DrillProps) {
  // the new option always comes up at least once in the second half
  const [plan] = useState(() => deal<Fx>([[FX4, 4], [FX5, 4]], (d) => d.slice(4).includes('trans')))
  const fresh = useFresh()
  const make = async (i: number): Promise<ChoiceRound> => {
    const c = await fresh.clip(source)
    const n = fresh.bar(c, 3)
    const fx = plan[i]
    const mix = fxWet(i)
    const echoBeats = pick(ECHO_BEATS)
    const playIt = (): RoundTiming => {
      const ctx = ac()
      const at = start()
      const bl = barLen(c)
      const ch = fxChain(ctx, fx, c.bpm, at + bl, at + 3 * bl, mix, echoBeats)
      for (const l of ch.lfos) {
        l.start(at)
        l.stop(at + 3 * bl + 3)
      }
      play(c.buffer, { from: barTime(c, n), dur: 3 * bl, at, to: ch.input, gain: 0.8 })
      return { start: at, bpm: c.bpm, enableAt: at + bl + 2 * beatLen(c), marks: [{ at: at + bl, text: 'FX on' }], end: at + 3 * bl }
    }
    const wetText = `${Math.round(mix * 100)}% wet`
    const why: Record<Fx, string> = {
      echo: `Echo: distinct repeats locked to the beat, here ${beatsText(echoBeats)} apart.`,
      reverb: 'Reverb: no distinct repeats, a smeared room tail behind everything.',
      flanger: 'Flanger: a sweeping metallic jet-plane whoosh from a very short modulated delay.',
      phaser: 'Phaser: a softer, hollow swirl as notches move through the spectrum.',
      trans: 'Trans: the sound chopped on and off in time, an 8th-note gate with silence between the chops. No tail, no swirl.',
    }
    const hint: Record<Fx, string> = {
      echo: 'repeats in time',
      reverb: 'a room tail',
      flanger: 'metallic whoosh',
      phaser: 'soft swirl',
      trans: 'chopped on and off',
    }
    const options = i < 4 ? FX4 : FX5
    return {
      prompt: i < 4 ? 'One bar dry, then an effect. Which one?' : 'One bar dry, then an effect. Trans is in the mix now. Which one?',
      sub: `Effect level: ${wetText}`,
      options: options.map((f) => ({ id: f, label: f[0].toUpperCase() + f.slice(1), hint: hint[f] })),
      answer: fx,
      play: playIt,
      explain: `${why[fx]} The effect ran at ${wetText}.`,
      tip: FX_TIP[fx],
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}

// ---------- Genre ID ----------
// Rounds 1–6 at a random tempo inside each genre's range. 7–8 all at one tempo, so only the groove gives it away.
const SAME_BPM = 140
const GENRE_RANGE: Record<Genre, [number, number]> = { house: [120, 128], techno: [128, 138], psy: [140, 148], hitech: [175, 190] }
const GENRE_TIP: Record<Genre, string> = {
  house: 'Told apart from techno by the warm chord stabs, the clap on 2 and 4 and a bass that bounces between the kicks.',
  techno: 'Told apart from house by the ride cymbal and the rumbling kick tail where house would have a bouncy bassline.',
  psy: 'Told apart from hi-tech by tempo and space: the kick–bass–bass–bass roll still has room around it.',
  hitech: 'Above 175 BPM with metallic 16th percussion: the bass rolls so fast it blurs into one tone.',
}
export function GenreId({ onDone }: DrillProps) {
  const genres = Object.keys(GENRES) as Genre[]
  const [plan] = useState(() => deal([[genres, 6], [genres, 2]]))
  const seed = useSeeds()
  const make = async (i: number): Promise<ChoiceRound> => {
    const g = plan[i]
    const [lo, hi] = GENRE_RANGE[g]
    const same = i >= 6
    const bpm = same ? SAME_BPM : lo + Math.floor(Math.random() * (hi - lo + 1))
    const buf = await groove(g, seed(g), 'standard', 8, bpm)
    const bl = 240 / bpm
    const playIt = (): RoundTiming => {
      const at = start()
      play(buf, { from: 0, dur: 4 * bl, at, gain: 0.85 })
      return { start: at, bpm, enableAt: at + bl, end: at + 4 * bl }
    }
    return {
      prompt: same ? `Every genre plays at ${SAME_BPM} BPM now, so tempo won't help. Which genre is this?` : 'Which genre is this?',
      options: shuffle(genres).map((x) => ({ id: x, label: GENRES[x].name })),
      answer: g,
      play: playIt,
      explain: same
        ? `${GENRES[g].name}, usually ${lo}–${hi} BPM, played at ${bpm} here. ${GENRES[g].about}`
        : `${GENRES[g].name} at ${bpm} BPM (it usually sits at ${lo}–${hi}). ${GENRES[g].about}`,
      tip: GENRE_TIP[g],
    }
  }
  return <ChoiceDrill rounds={plan.length} make={make} onDone={onDone} />
}
