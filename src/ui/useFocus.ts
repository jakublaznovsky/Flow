import { useCallback, useEffect, useRef, useState } from 'react'

export interface FocusState {
  ref: string; title: string; minutes: number
  startedAt: number; pausedAt: number | null; pausedMs: number; finished: boolean
}

export const DEFAULT_MINUTES = 25
const MINUTE = 60_000

function elapsedMs(s: FocusState, at: number): number {
  return Math.max(0, (s.pausedAt ?? at) - s.startedAt - s.pausedMs)
}

/**
 * One in-memory focus session at a time. Whole minutes are logged through `onLog` exactly once
 * per session: when it finishes, when it is stopped (if at least a minute), or when it is replaced.
 */
export function useFocus(onLog: (ref: string, minutes: number) => void, now: () => Date) {
  const [state, setState] = useState<FocusState | null>(null)
  const [, setTick] = useState(0)
  const live = useRef<FocusState | null>(null)
  const log = useRef(onLog)
  log.current = onLog
  const clock = useRef(now)
  clock.current = now

  const commit = useCallback((s: FocusState | null) => { live.current = s; setState(s) }, [])

  /** Log a running session's whole minutes (never more than its length). */
  const settle = useCallback((s: FocusState) => {
    if (s.finished) return
    const whole = Math.min(s.minutes, Math.floor(elapsedMs(s, clock.current().getTime()) / MINUTE))
    if (whole >= 1) log.current(s.ref, whole)
  }, [])

  /** Mark finished (and log) when the elapsed time has reached the session length. */
  const finishIfDone = useCallback((s: FocusState): FocusState => {
    if (s.finished || elapsedMs(s, clock.current().getTime()) < s.minutes * MINUTE) return s
    log.current(s.ref, s.minutes)
    return { ...s, finished: true }
  }, [])

  const running = !!state && !state.finished && state.pausedAt === null
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const cur = live.current
      if (cur) {
        const next = finishIfDone(cur)
        if (next !== cur) commit(next)
      }
      setTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [running, finishIfDone, commit])

  const begin = (ref: string, title: string, minutes: number): FocusState =>
    ({ ref, title, minutes, startedAt: clock.current().getTime(), pausedAt: null, pausedMs: 0, finished: false })

  const start = useCallback((ref: string, title: string, minutes = DEFAULT_MINUTES) => {
    if (live.current) settle(live.current)
    commit(begin(ref, title, minutes))
  }, [commit, settle])

  const setMinutes = useCallback((m: number) => {
    const cur = live.current
    if (!cur || cur.finished) return
    commit(finishIfDone({ ...cur, minutes: m }))
  }, [commit, finishIfDone])

  const pause = useCallback(() => {
    const cur = live.current
    if (!cur || cur.finished || cur.pausedAt !== null) return
    commit({ ...cur, pausedAt: clock.current().getTime() })
  }, [commit])

  const resume = useCallback(() => {
    const cur = live.current
    if (!cur || cur.finished || cur.pausedAt === null) return
    commit({ ...cur, pausedAt: null, pausedMs: cur.pausedMs + (clock.current().getTime() - cur.pausedAt) })
  }, [commit])

  const stop = useCallback(() => {
    if (live.current) settle(live.current)
    commit(null)
  }, [commit, settle])

  /** Clear a finished session (already logged); also the "Another round" reset for a finished one. */
  const close = useCallback(() => commit(null), [commit])

  const again = useCallback(() => {
    const cur = live.current
    if (cur) commit(begin(cur.ref, cur.title, cur.minutes))
  }, [commit])

  const remainingMs = state
    ? state.finished ? 0 : Math.max(0, state.minutes * MINUTE - elapsedMs(state, now().getTime()))
    : 0
  return { state, remainingMs, start, setMinutes, pause, resume, stop, close, again }
}
