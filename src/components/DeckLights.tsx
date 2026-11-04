import { useEffect, useState } from 'react'
import { ac } from '../audio/engine'

/**
 * When each deck sounds, as [start, end) spans in AudioContext seconds. The round's play function
 * rewrites the spans on every (re)play, so the lights always follow what is actually playing.
 */
export type DeckTimes = Record<
  string,
  {
    name: string
    side: 'left' | 'right'
    spans: [number, number][]
    /** Replaces "left ear" / "right ear", e.g. when both decks play centred and take turns. */
    where?: string
  }
>

/** Two small deck indicators that light while each deck is audible, so you always know which is which. */
export function DeckLights({ times }: { times: DeckTimes }) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      // what is reaching the ears now, not what is being scheduled
      const c = ac()
      setNow(c.currentTime - (c.outputLatency || 0))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="decklights" aria-hidden="true">
      {Object.entries(times).map(([id, d]) => {
        const on = d.spans.some(([s, e]) => now >= s && now < e)
        return (
          <span key={id} className={`decklight ${d.side} ${on ? 'on' : ''}`}>
            <i />
            Deck {id.toUpperCase()} · {d.name} · {d.where ?? (d.side === 'left' ? 'left ear' : 'right ear')}
          </span>
        )
      })}
    </div>
  )
}
