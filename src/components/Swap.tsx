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
export function Swap({
  k,
  children,
  inline,
  hold,
  className = '',
}: {
  k: string | number
  children: ReactNode
  inline?: boolean
  /** Never shrink while the content is replaced: keep the tallest height seen at this width. */
  hold?: boolean
  className?: string
}) {
  const box = useRef<HTMLElement>(null)
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

  useLayoutEffect(() => {
    const el = box.current
    if (!hold || !el) return
    const seen = { width: -1, max: 0 }
    // runs after layout and before paint, so a shorter replacement never shows at its own height
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width
      if (Math.abs(w - seen.width) > 0.5) {
        // a new width wraps differently: start again from the natural height
        seen.width = w
        seen.max = 0
        el.style.minHeight = ''
      }
      const h = el.getBoundingClientRect().height
      if (h > seen.max + 0.5) {
        seen.max = h
        el.style.minHeight = `${h}px`
      }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      el.style.minHeight = ''
    }
  }, [hold])

  const Tag = (inline ? 'span' : 'div') as 'div'
  return (
    <Tag ref={box as React.Ref<HTMLDivElement>} className={`swap ${inline ? 'inline' : ''} ${className}`}>
      <Tag ref={ghost as React.Ref<HTMLDivElement>} className="swap-ghost" aria-hidden="true" inert />
      <Tag key={k} ref={cur as React.Ref<HTMLDivElement>} className={entering.current === k ? 'swap-enter' : undefined}>
        {children}
      </Tag>
    </Tag>
  )
}

/**
 * A single value that dissolves when it changes; the surrounding label stays put.
 * `w` reserves that many digits, right-aligned, so a longer number does not push the label.
 */
export function Value({ v, w }: { v: string | number; w?: number }) {
  return (
    <Swap k={v} inline>
      {w ? <span style={{ display: 'inline-block', minWidth: `${w}ch`, textAlign: 'right' }}>{v}</span> : v}
    </Swap>
  )
}

/**
 * Keeps the space of `shape` while showing `children`: both sit in one grid cell and the shape is invisible,
 * so the slot is as big as the larger of them. Pass several shapes to reserve the largest of them all.
 */
export function Reserve({ shape, children, inline, className = '' }: { shape: ReactNode; children?: ReactNode; inline?: boolean; className?: string }) {
  const Tag = (inline ? 'span' : 'div') as 'div'
  const shapes = Array.isArray(shape) ? shape : [shape]
  return (
    <Tag className={`reserve ${inline ? 'inline' : ''} ${className}`}>
      {shapes.map((x, n) => (
        <Tag key={n} className="reserve-shape" aria-hidden="true" inert>
          {x}
        </Tag>
      ))}
      <Tag className="reserve-live">{children}</Tag>
    </Tag>
  )
}
