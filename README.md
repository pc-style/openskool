# openskool

Open-source ear training for DJs. Bring your own songs.

openskool is a free, local-first trainer for the skills DJ schools teach: hearing the 1, beatmatching
by ear, phrasing, EQ, filters, loops, FX, keys and set flow. Drop your own tracks in, and every
audio drill runs on your music. There is no account and no server: tracks and progress stay in your
browser.

## What's in it

- **19 drills** in seven skills: Feel the Time, Downbeat Tapper, BPM Math, Sync Check, Tempo Match,
  Tap Tempo, Drop Timing, Phrase In, EQ Detective, Filter Sweep, Gain Match, Bass Clash, Loop Lab,
  FX Spotter, Genre ID, Camelot Keys, Set Builder, Vocab Blitz and Signal Flow. Each is scored out of 1000
  and gets harder as the rounds go on.
- **Your tracks.** Files are decoded and analysed in a Web Worker: tempo (to 0.01 BPM), beat grid,
  downbeat, 8-bar phrase start, key (Camelot) and energy. A grid editor with a click track lets you fix
  anything the analysis gets wrong. Built-in synthesized grooves (house 124, techno 134, psytrance 145,
  hi-tech 185) cover you before you add anything.
- **An 8-week course** from counting bars to recording a final mix. Each week has lessons, missions
  (drill scores) and practice tasks for your own decks. All weeks are open.
- **A practice coach** that plans your next five days from your recent form per skill, the current
  course week and spaced review. It runs on your device and costs nothing.
- **Practice decks**: two decks with key lock, pitch ±8%, nudge, sync, hot cues, beat loops and a
  3-band EQ, filter, trim, fader and crossfader mixer.
- **Tap latency calibration**, so timing drills are fair on Bluetooth headphones too.
- XP, ranks, streaks and per-drill history. Export and import your progress as JSON.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # analysis tests
npm run build   # static site in dist/
```

The build is a static site with hash routing, so `dist/` deploys anywhere (GitHub Pages, Netlify,
Cloudflare Pages, any web server) with no rewrites.

## How it works

| Area | Where |
| --- | --- |
| Tempo, grid, phrase, key, energy analysis (pure, tested) | `src/audio/analyze.ts` |
| Built-in groove synthesizer (OfflineAudioContext) | `src/audio/synth.ts` |
| Playback, DJ EQ and filter, tap timing | `src/audio/engine.ts` |
| Library in IndexedDB, analysis worker | `src/lib/library.ts` |
| Drills | `src/drills/` |
| Course content | `src/lib/course.ts` |
| Coach | `src/lib/coach.ts` |

Tap timing uses the audio clock: a tap's time is mapped through `AudioContext.getOutputTimestamp()`
so it is compared against what you actually heard, then corrected by your calibration offset.

## Contributing

Drills are plain React components that receive a clip source and call `onDone(score)`. Most
listen-and-choose drills are a few lines on top of `ChoiceDrill` in `src/drills/common.tsx`. Course
weeks and lessons are data in `src/lib/course.ts`.

## License

MIT
