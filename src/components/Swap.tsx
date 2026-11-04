import { useLayoutEffect, useRef, type ReactNode } from 'react'

// App sets `reduce-motion` / `full-motion` on <html> from the motion setting; the OS preference is the fallback
const reduced = () => {
  if (typeof document === 'undefined') return false
  const html = document.documentElement.classList
  if (html.contains('reduce-motion')) return true
  if (html.contains('full-motion')) return false
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Replaces content in place with a soft dissolve: the outgoing content is a frozen, inert copy that
 * fades out and softens while the new content fades in and sharpens. The new state is live
 * immediately, a newer change replaces an unfinished one, and reduced motion swaps instantly.
 * The first render never animates.
 */
export function Swap({ k, children, inline, className = '' }: { k: string | number; children: ReactNode; inline?: boolean; className?: string }) {
  const cur = useRef<HTMLElement>(null)
  const ghost = useRef<HTMLElement>(null)
  const last = useRef(k)
  const pending = useRef<Node | null>(null)
  const changed = last.current !== k
  // remembered so later re-renders with the same key don't strip the class mid-fade
  const entering = useRef<string | number | null>(null)
  if (changed && !reduced()) entering.current = k

  // Read the outgoing DOM during render, before React replaces it.
  if (changed && cur.current && !reduced()) {
    const copy = cur.current.cloneNode(true) as HTMLElement
    copy.classList.remove('swap-enter')
    pending.current = copy
  }

  useLayoutEffect(() => {
    if (last.current === k) return
    last.current = k
    const g = ghost.current
    const copy = pending.current
    pending.current = null
    if (!g) return
    g.replaceChildren()
    if (!copy) return
    g.appendChild(copy)
    // restart the fade for rapid successive changes
    g.style.animation = 'none'
    void g.offsetWidth
    g.style.animation = ''
    const clear = () => g.replaceChildren()
    const t = window.setTimeout(clear, 360)
    return () => window.clearTimeout(t)
  }, [k])

  const Tag = (inline ? 'span' : 'div') as 'div'
  return (
    <Tag className={`swap ${inline ? 'inline' : ''} ${className}`}>
      <Tag ref={ghost as React.Ref<HTMLDivElement>} className="swap-ghost" aria-hidden="true" inert />
      <Tag key={k} ref={cur as React.Ref<HTMLDivElement>} className={entering.current === k ? 'swap-enter' : undefined}>
        {children}
      </Tag>
    </Tag>
  )
}

/** A single value that dissolves when it changes; the surrounding label stays put. */
export function Value({ v }: { v: string | number }) {
  return (
    <Swap k={v} inline>
      {v}
    </Swap>
  )
}
