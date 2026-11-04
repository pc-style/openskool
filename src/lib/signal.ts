/** Routines for Signal Flow: each step in order, with why it comes there. Shared by the lesson and the quiz. */
export interface Routine {
  title: string
  /** One line on what the routine is for. */
  about: string
  steps: { step: string; why: string }[]
}

export const ROUTINES: Routine[] = [
  {
    title: 'Channel signal path',
    about: 'The order a sound passes through one mixer channel, from the deck to the speakers.',
    steps: [
      { step: 'Trim', why: 'Sets how loud the track enters the channel. Everything after it works on this level, so it comes first.' },
      { step: 'EQ', why: 'Shapes the lows, mids and highs of that level-matched signal.' },
      { step: 'Filter', why: 'The colour FX knob, a sweep on top of the EQ. It sits after the EQ on most mixers.' },
      { step: 'Channel fader', why: 'How much of this channel goes into the mix.' },
      { step: 'Crossfader', why: 'Blends this side of the mixer against the other side.' },
      { step: 'Master out', why: 'All channels summed, sent to the speakers. Watch the master meter here.' },
    ],
  },
  {
    title: 'The rig, end to end',
    about: 'Where your music travels, from the files to the room.',
    steps: [
      { step: 'Library or USB', why: 'Your tracks, prepared in DJ software with grids and cues.' },
      { step: 'Deck', why: 'A CDJ or controller deck loads one track and plays it.' },
      { step: 'Mixer channel', why: 'Each deck is cabled into its own channel on the mixer.' },
      { step: 'Master bus', why: 'The mixer adds every channel together into one stereo signal.' },
      { step: 'PA and booth', why: 'The master feeds the house speakers; the booth output feeds your monitor.' },
    ],
  },
  {
    title: 'A clean blend',
    about: 'Bringing track B in under track A without anyone hearing a bump.',
    steps: [
      { step: 'Cue B in your headphones', why: 'You prepare B where only you can hear it.' },
      { step: 'Start B on a 1 of A', why: 'Launch B on a downbeat so the two kicks start roughly together.' },
      { step: 'Match tempo with the pitch fader', why: 'If the speeds differ, the kicks drift apart. Fix the speed first.' },
      { step: 'Nudge B into phase', why: 'With the speed right, push or drag B until the kicks land exactly together.' },
      { step: "Match B's trim to A's meter", why: 'Both tracks should peak at the same height before B is heard.' },
      { step: "Cut B's low EQ", why: 'Two basslines at once sound muddy, so B comes in without its bass.' },
      { step: "Raise B's fader on a phrase start", why: 'Changes land on phrase starts, so B arrives where the music expects something new.' },
      { step: 'Swap the lows', why: "On a later phrase start, bring B's low up and A's low down together." },
      { step: 'Fade A out', why: 'A is now only highs and mids; lower its fader over a phrase.' },
    ],
  },
  {
    title: 'An echo-out exit',
    about: 'Leaving a track with an echo instead of a fade, for a quick change.',
    steps: [
      { step: "Find A's last phrase", why: 'The exit lands on a phrase end, so B can start on the next 1.' },
      { step: 'Set echo to ½ or ¾ beat', why: 'Short, beat-synced repeats stay in time with B.' },
      { step: 'Turn echo on in the last bar', why: "The repeats need a bar of A's sound to feed on." },
      { step: "Cut A's fader on the 1", why: 'The dry signal stops, but the echo keeps repeating what it heard.' },
      { step: 'Start B on that 1', why: 'B begins under the echo tail, so the room never hears silence.' },
      { step: 'Let the echo fade out', why: 'Turn the echo off once the tail has died away under B.' },
    ],
  },
]
