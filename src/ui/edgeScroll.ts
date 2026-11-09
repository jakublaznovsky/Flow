import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** Height of the edge bands, in px, and how far one frame scrolls. */
const BAND = 32
const SPEED = 12

interface Box { left: number; right: number; top: number; bottom: number }

/**
 * How far the Week grid scrolls this frame for a pointer at (x, y): only with the pointer inside the
 * scroller, upward in the band just below the sticky strip row (`stripBottom`), downward in the band
 * above the scroller's bottom. Anywhere else (the drawer above, the strips, outside): 0.
 */
export function edgeStep(box: Box, stripBottom: number, x: number, y: number): number {
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return 0
  const top = Math.max(box.top, stripBottom)
  if (y >= top && y < top + BAND) return -SPEED
  if (y > box.bottom - BAND) return SPEED
  return 0
}

/**
 * Edge auto-scroll for drags over the Week grid. `update(x, y)` on every pointer move; while the
 * pointer stays in an edge band a frame loop keeps scrolling (and calls `onScroll`, so the drag can
 * re-measure under a still pointer). `stop()` on drop/cancel; it also stops on unmount.
 */
export function useEdgeScroll(scroller: RefObject<HTMLElement | null>, onScroll?: () => void) {
  const frame = useRef<number | null>(null)
  const at = useRef<{ x: number; y: number } | null>(null)
  const onScrollRef = useRef(onScroll)
  onScrollRef.current = onScroll

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    at.current = null
  }, [])

  const stepNow = useCallback((): number => {
    const el = scroller.current
    const p = at.current
    if (!el || !p) return 0
    const r = el.getBoundingClientRect()
    if (r.height === 0) return 0
    const strip = el.querySelector<HTMLElement>('.week-col-top')
    return edgeStep(r, strip ? strip.getBoundingClientRect().bottom : r.top, p.x, p.y)
  }, [scroller])

  const tick = useCallback(() => {
    frame.current = null
    const el = scroller.current
    const s = stepNow()
    if (!el || s === 0) return
    const before = el.scrollTop
    el.scrollTop += s
    if (el.scrollTop !== before) onScrollRef.current?.()
    frame.current = requestAnimationFrame(tick)
  }, [scroller, stepNow])

  const update = useCallback((x: number, y: number) => {
    at.current = { x, y }
    if (stepNow() === 0) {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    } else if (frame.current === null) {
      frame.current = requestAnimationFrame(tick)
    }
  }, [stepNow, tick])

  useEffect(() => stop, [stop])
  return { update, stop }
}
