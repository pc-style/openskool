import { useCallback, useEffect, useRef, useState } from 'react'
import { heardTime, stopAll } from '../audio/engine'
import type { SourcePref } from '../lib/clips'

export interface DrillProps {
  source: SourcePref
  onDone: (score: number) => void
}

export interface ChoiceRound {
  prompt: string
  options: { id: string; label: string }[]
  answer: string
  play?: () => void | Promise<void>
  explain: string
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export { clamp }

/** Listen-and-choose (or quiz) drill: N rounds, keyboard 1–4 to answer, R to replay, Enter for next. */
export function ChoiceDrill({
  rounds,
  make,
  onDone,
  timed,
}: {
  rounds: number
  make: (i: number) => Promise<ChoiceRound> | ChoiceRound
  onDone: (score: number) => void
  /** Seconds on the clock: endless rounds, score from correct and wrong answers. */
  timed?: number
}) {
  const [i, setI] = useState(0)
  const [round, setRound] = useState<ChoiceRound | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [right, setRight] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [left, setLeft] = useState(timed ?? 0)
  const finished = useRef(false)

  const finish = useCallback(
    (r: number, w: number) => {
      if (finished.current) return
      finished.current = true
      stopAll()
      onDone(timed ? clamp(r * 60 - w * 30, 0, 1000) : Math.round((r / rounds) * 1000))
    },
    [onDone, rounds, timed],
  )

  useEffect(() => {
    let live = true
    setRound(null)
    setPicked(null)
    stopAll()
    Promise.resolve(make(i)).then((r) => {
      if (!live) return
      setRound(r)
      void r.play?.()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  useEffect(() => () => stopAll(), [])

  useEffect(() => {
    if (!timed) return
    const id = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(id)
  }, [timed])
  useEffect(() => {
    if (timed && left <= 0) finish(right, wrong)
  }, [left, timed, right, wrong, finish])

  const choose = useCallback(
    (id: string) => {
      if (!round || picked) return
      setPicked(id)
      const ok = id === round.answer
      const r = right + (ok ? 1 : 0)
      const w = wrong + (ok ? 0 : 1)
      setRight(r)
      setWrong(w)
      if (timed) setTimeout(() => setI((x) => x + 1), ok ? 250 : 900)
    },
    [round, picked, right, wrong, timed],
  )

  const next = useCallback(() => {
    if (!picked) return
    if (!timed && i + 1 >= rounds) finish(right, wrong)
    else setI((x) => x + 1)
  }, [picked, i, rounds, right, wrong, finish, timed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!round) return
      const n = Number(e.key)
      if (n >= 1 && n <= round.options.length) choose(round.options[n - 1].id)
      else if (e.key === 'Enter') next()
      else if ((e.key === 'r' || e.key === 'R') && round.play) {
        stopAll()
        void round.play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [round, choose, next])

  return (
    <div className="choice">
      <div className="drill-meta">
        {timed ? (
          <span className={left <= 10 ? 'hot' : ''}>{Math.max(0, left)}s</span>
        ) : (
          <span>
            Round {Math.min(i + 1, rounds)} / {rounds}
          </span>
        )}
        <span>
          {right} right · {wrong} wrong
        </span>
      </div>
      {!round ? (
        <div className="loading">Preparing audio…</div>
      ) : (
        <>
          <h2 className="prompt">{round.prompt}</h2>
          <div className={`options n${round.options.length}`}>
            {round.options.map((o, k) => {
              const state = picked ? (o.id === round.answer ? 'right' : o.id === picked ? 'wrong' : 'dim') : ''
              return (
                <button key={o.id} className={`option ${state}`} onClick={() => choose(o.id)} disabled={!!picked}>
                  <kbd>{k + 1}</kbd>
                  {o.label}
                </button>
              )
            })}
          </div>
          <div className="row">
            {round.play && (
              <button
                className="ghost"
                onClick={() => {
                  stopAll()
                  void round.play!()
                }}
              >
                ↻ Replay <kbd>R</kbd>
              </button>
            )}
            {picked && !timed && (
              <button className="primary" onClick={next} autoFocus>
                {i + 1 >= rounds ? 'Finish' : 'Next'} <kbd>↵</kbd>
              </button>
            )}
          </div>
          {picked && !timed && (
            <p className={`explain ${picked === round.answer ? 'good' : 'bad'}`}>
              <strong>{picked === round.answer ? 'Correct. ' : 'Not quite. '}</strong>
              {round.explain}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Space bar or pad taps, with the time the user heard (context clock). */
export function useTaps(onTap: (t: number) => void, enabled: boolean) {
  const cb = useRef(onTap)
  cb.current = onTap
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      cb.current(heardTime(e.timeStamp))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
  return (e: React.PointerEvent) => {
    if (enabled) cb.current(heardTime(e.timeStamp))
  }
}

export function TapPad({ onPointerDown, label, flash }: { onPointerDown: (e: React.PointerEvent) => void; label: string; flash: number }) {
  return (
    <button className="tappad" onPointerDown={onPointerDown} key={flash} data-flash={flash > 0}>
      <span>{label}</span>
      <small>Space bar or tap here</small>
    </button>
  )
}

export const ms = (s: number) => `${s >= 0 ? '+' : '−'}${Math.round(Math.abs(s) * 1000)} ms`
