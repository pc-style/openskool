import { best, type State } from './progress'

export interface Mission {
  drill: string
  min: number
}

export interface Week {
  n: number
  title: string
  goal: string
  lessons: { title: string; body: string }[]
  missions: Mission[]
  /** Away-from-the-app practice, ticked off by hand. */
  practice: { id: string; text: string }[]
}

export const WEEKS: Week[] = [
  {
    n: 1,
    title: 'Beats, bars and your first blend',
    goal: 'Hear the 1, understand the signal path and blend two tracks without a train wreck.',
    lessons: [
      {
        title: 'Counting in 4/4',
        body: 'Nearly all club music is in 4/4: four beats to a bar, and the first beat of each bar (the downbeat, or the 1) is where things change. Count out loud, "1-2-3-4, 2-2-3-4, 3-2-3-4, 4-2-3-4", and you are counting bars as well as beats. If you can count, you can mix.',
      },
      {
        title: 'Library → decks → mixer → master',
        body: 'DJ software and hardware share one layout: a library feeds the decks, each deck feeds a mixer channel, and the channels sum into the master output. Inside each channel the signal runs trim/gain → EQ → filter → channel fader → crossfader → master. Learn that order once and every mixer you meet will make sense.',
      },
      {
        title: 'The two-channel blend',
        body: 'Cue track B in your headphones, start it on a 1, match its tempo, then bring the channel fader up with its low EQ cut. When the moment comes (a phrase start) swap the lows: B\'s bass in, A\'s bass out. Then fade A away.',
      },
    ],
    missions: [
      { drill: 'downbeat', min: 600 },
      { drill: 'signal', min: 700 },
      { drill: 'sync', min: 700 },
    ],
    practice: [
      { id: 'w1-count', text: 'Put on any track and count bars out loud for a full minute without losing the 1.' },
      { id: 'w1-blend', text: 'Do five blends between two tracks at the same tempo. Bass cut on the incoming track, every time.' },
    ],
  },
  {
    n: 2,
    title: 'Beatmatching by ear',
    goal: 'Match tempo and phase with ears only, and hear when you drift.',
    lessons: [
      {
        title: 'Speed vs. phase',
        body: 'Two separate problems. Tempo (speed) is fixed with the pitch fader. Phase (are the kicks lined up right now) is fixed with a nudge or jog wheel. Fix the speed first, otherwise you will be nudging forever.',
      },
      {
        title: 'Rushing and dragging',
        body: 'When the kicks flam, ask which one comes first. If the incoming track is ahead it is rushing: slow it down a touch and nudge it back. If it is behind it is dragging. A galloping sound means you are 20–60 ms out; one fat kick means you are locked.',
      },
      {
        title: 'Turn the BPM display off',
        body: 'Sync buttons and displays are fine tools, but a DJ who can only use them is lost the first time an analysis is wrong or a track has a live drummer. Practise with the numbers hidden.',
      },
    ],
    missions: [
      { drill: 'sync', min: 800 },
      { drill: 'tempomatch', min: 600 },
      { drill: 'taptempo', min: 700 },
    ],
    practice: [
      { id: 'w2-nosync', text: 'Mix for 20 minutes with sync off and BPM displays covered.' },
      { id: 'w2-drift', text: 'Let two tracks drift on purpose, then fix them with pitch and nudge only.' },
    ],
  },
  {
    n: 3,
    title: 'EQ and gain staging',
    goal: 'Know what each EQ band holds and keep levels honest.',
    lessons: [
      {
        title: 'What lives where',
        body: 'Low: kick and bass, the energy you feel. Mid: vocals, synths, the snare\'s body, where most melodies clash. High: hats, cymbals and air. Two lows at once is mud; two busy mids is a mess; two highs is usually fine.',
      },
      {
        title: 'Gain first, faders second',
        body: 'Set each channel\'s trim so both tracks hit the same level with faders all the way up. Then the faders are for mixing, not for fixing loudness. A track that is just 2 dB louder will fool you into thinking it is the better one.',
      },
      {
        title: 'The bass swap',
        body: 'Bring B in with its low killed. On the phrase, in one move, bring B\'s low up and A\'s low down. It is the most useful single move in four-to-the-floor mixing.',
      },
    ],
    missions: [
      { drill: 'eq', min: 700 },
      { drill: 'gain', min: 700 },
      { drill: 'clash', min: 800 },
    ],
    practice: [{ id: 'w3-swap', text: 'Record a 3-track mix using only bass swaps (no filter, no FX). Listen back on headphones.' }],
  },
  {
    n: 4,
    title: 'Phrasing and structure',
    goal: 'Count phrases and line up the structure of two tracks.',
    lessons: [
      {
        title: '8-bar phrases',
        body: 'Producers build tracks in blocks of 8 bars (sometimes 16 or 32). A new element, a breakdown or a drop nearly always lands on the first bar of a block. Mixing on a phrase start means both tracks change together, which sounds intentional.',
      },
      {
        title: 'Intro over outro',
        body: 'The classic move: start B\'s intro on the first bar of A\'s outro phrase. Both are DJ-friendly, beat-only sections, so you have 16–32 bars to blend before either track does something big.',
      },
      {
        title: 'Counting through breakdowns',
        body: 'When the drums vanish keep counting. You will know the drop is coming because you counted to it, not because you guessed from the riser.',
      },
    ],
    missions: [
      { drill: 'phrase', min: 700 },
      { drill: 'drop', min: 700 },
      { drill: 'downbeat', min: 800 },
    ],
    practice: [{ id: 'w4-map', text: 'Map the structure of three of your tracks: intro, breakdowns, drops, outro, in bars.' }],
  },
  {
    n: 5,
    title: 'Filters, loops and FX',
    goal: 'Use filters, loops and beat FX by ear and with restraint.',
    lessons: [
      {
        title: 'Filters as transitions',
        body: 'A slow high-pass on the outgoing track lets the new one take the low end without a hard cut. A low-pass on the incoming track keeps it in the background until you open it on the phrase.',
      },
      {
        title: 'Loops buy time',
        body: 'Loop a clean 4 or 8-beat section of an outro when the next track needs longer to come in. Release the loop on a phrase boundary, never in the middle of a bar.',
      },
      {
        title: 'Beat FX',
        body: 'Echo and reverb are exit tools: throw an echo on the last beat of a phrase and pull the fader for a clean disappearance. Flanger and phaser are colour: short, on builds. If people notice the effect more than the music, it is too much.',
      },
    ],
    missions: [
      { drill: 'filter', min: 800 },
      { drill: 'loops', min: 700 },
      { drill: 'fx', min: 700 },
    ],
    practice: [{ id: 'w5-exit', text: 'Practise an echo-out exit ten times until the echo lands on the beat every time.' }],
  },
  {
    n: 6,
    title: 'Keys and harmonic mixing',
    goal: 'Mix between compatible keys and know when to break the rules.',
    lessons: [
      {
        title: 'The Camelot wheel',
        body: 'Camelot gives every key a number and letter. Same code, one step either way (7A ↔ 8A ↔ 9A) or the same number across letters (8A ↔ 8B) will sound in key. Two steps up is a lift in energy; jumping across the wheel clashes in long blends.',
      },
      {
        title: 'Trust ears over tags',
        body: 'Key detection (including openskool\'s) is wrong sometimes. Use it to shortlist, then listen: if the mids fight during a blend, keep it short or EQ the mids out.',
      },
    ],
    missions: [
      { drill: 'camelot', min: 700 },
      { drill: 'genre', min: 700 },
    ],
    practice: [{ id: 'w6-keys', text: 'Find three pairs in your library that blend in key for a 32-bar overlap.' }],
  },
  {
    n: 7,
    title: 'Programming a set',
    goal: 'Choose and order tracks so the energy tells a story.',
    lessons: [
      {
        title: 'Energy, not just BPM',
        body: 'A set is a journey: a warm-up builds, peak time holds, a closer comes down. Move tempo in small steps (2–3 BPM at a time) and give the floor a breather every few tracks.',
      },
      {
        title: 'Know your room',
        body: 'Opening slot? Do not play the headliner\'s bangers. Your job is to make the room ready, not to empty the crate. Prepare more tracks than you need and read the floor.',
      },
    ],
    missions: [
      { drill: 'setbuilder', min: 750 },
      { drill: 'tempomatch', min: 800 },
      { drill: 'bpmmath', min: 800 },
    ],
    practice: [{ id: 'w7-plan', text: 'Plan a 1-hour set on paper with BPM, key and an energy curve, then play it.' }],
  },
  {
    n: 8,
    title: 'Performance and final mix',
    goal: 'Record a full mix you would send to a promoter.',
    lessons: [
      {
        title: 'Recording',
        body: 'Record every practice session. Listen back the next day, not straight away, and write down the three worst moments. That list is next week\'s practice.',
      },
      {
        title: 'Final project',
        body: 'Record a 45–60 minute mix: clean beatmatching, phrased transitions, sensible EQ, a clear energy curve and no clipping. Then share it with someone whose taste you trust.',
      },
    ],
    missions: [
      { drill: 'vocab', min: 700 },
      { drill: 'phrase', min: 850 },
      { drill: 'eq', min: 850 },
    ],
    practice: [
      { id: 'w8-record', text: 'Record your 45–60 minute final mix.' },
      { id: 'w8-review', text: 'Listen back the next day and write down your three weakest transitions.' },
    ],
  },
]

export const missionId = (w: Week, m: Mission) => `w${w.n}:${m.drill}:${m.min}`
export const missionDone = (s: State, m: Mission) => best(s, m.drill) >= m.min

export function missionsDone(s: State): number {
  let n = 0
  for (const w of WEEKS) for (const m of w.missions) if (missionDone(s, m)) n++
  return n
}

/** The first week with unfinished missions or practice. */
export function currentWeek(s: State): Week {
  return WEEKS.find((w) => w.missions.some((m) => !missionDone(s, m)) || w.practice.some((p) => !s.tasks.includes(p.id))) ?? WEEKS[WEEKS.length - 1]
}
