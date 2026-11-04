export type Skill = 'Rhythm & time' | 'Beatmatching' | 'Phrasing' | 'Mixing & EQ' | 'FX & loops' | 'Sets & keys' | 'Words & routines'

export const SKILLS: Skill[] = ['Rhythm & time', 'Beatmatching', 'Phrasing', 'Mixing & EQ', 'FX & loops', 'Sets & keys', 'Words & routines']

/** mine = works on your tracks or built-in grooves; builtin = synthesized audio only; none = no audio. */
export type AudioUse = 'mine' | 'builtin' | 'none'

export interface DrillMeta {
  id: string
  name: string
  blurb: string
  skill: Skill
  audio: AudioUse
  /** What it trains and how to listen — shown before you play. */
  teach: string[]
  /** Your-track requirement beyond a grid. */
  needs?: string
}

export const DRILLS: DrillMeta[] = [
  {
    id: 'timefeel',
    name: 'Feel the Time',
    blurb: 'Halftime, standard or double-time against the grid?',
    skill: 'Rhythm & time',
    audio: 'mine',
    teach: [
      'A click marks the grid. Decide how the music moves against it.',
      'Standard: the kick lands on every click. Halftime: the music breathes at half the click rate (snare on 3, not 2 and 4). Double-time: twice as many hits as clicks.',
      'This is how 87 BPM and 174 BPM tracks mix together, and why a 140 dubstep track can sit on a 70 BPM grid.',
    ],
  },
  {
    id: 'downbeat',
    name: 'Downbeat Tapper',
    blurb: 'Tap the 1 of every bar.',
    skill: 'Rhythm & time',
    audio: 'mine',
    teach: [
      'Music in 4/4 groups beats into bars of four. The first beat, the 1, is where things change: a new bass note, a chord, a crash.',
      'Tap Space (or the pad) on every 1. Off-beat taps and taps on 2, 3 or 4 cost points.',
      'Listen for what changes, not just for the kick. Every kick sounds the same; the 1 is where the music turns over.',
    ],
  },
  {
    id: 'bpmmath',
    name: 'BPM Math',
    blurb: 'Halftime, pitch %, beat lengths and phrase timing in your head.',
    skill: 'Rhythm & time',
    audio: 'none',
    teach: [
      'One beat lasts 60 / BPM seconds. A bar is 4 beats, a phrase is usually 8 bars (32 beats).',
      'Pitch % to match tempos is (target / current − 1) × 100. 124 → 128 is +3.2%.',
      'Halftime halves the number, double-time doubles it: 87 and 174 are the same grid.',
    ],
  },
  {
    id: 'sync',
    name: 'Sync Check',
    blurb: 'Deck B drops in. In time, rushing or dragging?',
    skill: 'Beatmatching',
    audio: 'mine',
    teach: [
      'Deck A plays, then deck B comes in on top. If both kicks land together you hear one solid kick.',
      'Rushing: B lands a hair early, you hear a flam with B in front. Dragging: B lands late, a galloping "ka-boom".',
      'Rounds get harder: the offset shrinks from 60 ms to 12 ms.',
    ],
  },
  {
    id: 'tempomatch',
    name: 'Tempo Match',
    blurb: 'Ride the pitch fader until both kicks lock.',
    skill: 'Beatmatching',
    audio: 'mine',
    teach: [
      'Deck B runs at the wrong tempo. Use the pitch fader until the kicks stop drifting apart.',
      'If B keeps creeping ahead it is too fast; if it falls behind it is too slow. Nudge to fix the phase, pitch to fix the speed.',
      'Hit Lock it when you think they match. Scored on the tempo error and how long it took. No BPM display: ears only.',
    ],
  },
  {
    id: 'taptempo',
    name: 'Tap Tempo',
    blurb: 'Tap along and land within one BPM.',
    skill: 'Beatmatching',
    audio: 'mine',
    teach: [
      'Tap Space on every beat for at least 8 taps. Your tempo is fitted from all taps, so steadiness matters more than any single tap.',
      'Your own tracks are randomly sped up or slowed down, so you cannot rely on knowing them.',
      'Within 0.5 BPM is perfect; more than 5 BPM scores nothing.',
    ],
  },
  {
    id: 'drop',
    name: 'Drop Timing',
    blurb: 'The music cuts out. Count the bars and hit the 1 when it comes back.',
    skill: 'Phrasing',
    audio: 'mine',
    teach: [
      'The track plays, then fades into silence while you keep counting. Tap exactly when the next phrase would hit.',
      'Count bars on your fingers: 1-2-3-4, 2-2-3-4… Breakdowns and builds are always a whole number of bars.',
      'Scored in milliseconds. Hitting the wrong bar scores nothing.',
    ],
  },
  {
    id: 'phrase',
    name: 'Phrase In',
    blurb: 'Start track B exactly on the next 8-bar phrase.',
    skill: 'Phrasing',
    audio: 'mine',
    teach: [
      'Dance music is built in phrases of 8 bars (32 beats). Elements enter and leave on phrase boundaries.',
      'Track A starts somewhere in a phrase. Press Start B on the 1 of the next phrase, so both tracks change together.',
      'Starting on a bar that is not a phrase start is the most common phrasing mistake: the mix will feel off even when beatmatched.',
    ],
    needs: 'For your own tracks this relies on the phrase start in the grid. Check it in the Library.',
  },
  {
    id: 'eq',
    name: 'EQ Detective',
    blurb: 'One EQ band gets cut. Name the knob.',
    skill: 'Mixing & EQ',
    audio: 'mine',
    teach: [
      'Low (below ~200 Hz) is kick and bass weight. Mid (~200 Hz–3 kHz) is vocals, synths, snare body. High (above ~3.5 kHz) is hats, air and sparkle.',
      'The music plays full for two bars, then one band drops. Later rounds cut less, so it gets subtle.',
    ],
  },
  {
    id: 'filter',
    name: 'Filter Sweep',
    blurb: 'Low-pass, high-pass or nothing?',
    skill: 'Mixing & EQ',
    audio: 'mine',
    teach: [
      'Low-pass removes highs: the music goes muffled and dark, like hearing the club from the toilets.',
      'High-pass removes lows: the music thins out and loses its kick, like a phone speaker.',
      'Sometimes nothing happens. Do not invent a sweep.',
    ],
  },
  {
    id: 'gain',
    name: 'Gain Match',
    blurb: 'A and B alternate. Which one is louder?',
    skill: 'Mixing & EQ',
    audio: 'mine',
    teach: [
      'Before you bring a track in, match its gain to what is playing. A louder track always sounds "better", which fools you during a mix.',
      'The difference starts at 6 dB and shrinks to 1 dB.',
    ],
  },
  {
    id: 'clash',
    name: 'Bass Clash',
    blurb: 'Two tracks together: which mix has the mud?',
    skill: 'Mixing & EQ',
    audio: 'mine',
    teach: [
      'Two kick-and-bass lines on top of each other make the low end muddy and boomy, and it pumps the limiter.',
      'The fix is the bass swap: cut the incoming low, then swap lows on a phrase.',
      'You hear two versions of the same blend. Pick the one where both basses play.',
    ],
  },
  {
    id: 'loops',
    name: 'Loop Lab',
    blurb: 'A loop engages: 1, 2, 4 or 8 beats?',
    skill: 'FX & loops',
    audio: 'mine',
    teach: [
      'Count the beats between repeats. 1-beat loops stutter, 2 beats bounce, 4 beats repeat a bar, 8 beats repeat two bars.',
      'Loops are how you extend an intro or outro when the next track is not ready.',
    ],
  },
  {
    id: 'fx',
    name: 'FX Spotter',
    blurb: 'Echo, reverb, flanger or phaser?',
    skill: 'FX & loops',
    audio: 'mine',
    teach: [
      'Echo repeats the sound in time with the beat. Reverb smears it into a room. Flanger is a jet-plane whoosh. Phaser is a softer, swirling notch.',
      'The effect comes in after one bar dry.',
    ],
  },
  {
    id: 'genre',
    name: 'Genre ID',
    blurb: 'House, techno, psy or hi-tech?',
    skill: 'Sets & keys',
    audio: 'builtin',
    teach: [
      'Tempo is a clue but not the whole story. Listen to the bass pattern: offbeat bounce (house), rumble (techno), rolling 16ths (psy, hi-tech).',
      'Each round plays a short built-in groove; after you answer you get the defining features.',
    ],
  },
  {
    id: 'camelot',
    name: 'Camelot Keys',
    blurb: 'Harmonic mixing on the Camelot wheel.',
    skill: 'Sets & keys',
    audio: 'none',
    teach: [
      'Each key has a Camelot code: a number (1–12) and A (minor) or B (major).',
      'Safe moves: same code, ±1 on the number, or switch A↔B on the same number. +2 is an "energy boost"; +7 is a semitone up.',
    ],
  },
  {
    id: 'setbuilder',
    name: 'Set Builder',
    blurb: 'Order tracks into a set that flows: tempo, key, energy.',
    skill: 'Sets & keys',
    audio: 'none',
    teach: [
      'A good set changes tempo gradually, moves between compatible keys and builds energy with a few breathers.',
      'Uses your analysed tracks when you have 5 or more; otherwise a sample crate. Scored against the best possible order.',
    ],
  },
  {
    id: 'vocab',
    name: 'Vocab Blitz',
    blurb: '60 seconds of DJ terms against the clock.',
    skill: 'Words & routines',
    audio: 'none',
    teach: ['Match the term to its meaning. Quick answers score more; wrong answers cost time.'],
  },
  {
    id: 'signal',
    name: 'Signal Flow',
    blurb: 'Put the signal path and mixing routines in order.',
    skill: 'Words & routines',
    audio: 'none',
    teach: [
      'Every mixer follows the same path: trim/gain → EQ → filter → channel fader → crossfader → master.',
      'Then: the steps of a clean blend, from cueing in headphones to swapping the bass.',
    ],
  },
]

export const drillById = (id: string) => DRILLS.find((d) => d.id === id)
