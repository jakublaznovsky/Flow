import { useCallback, useEffect, useRef, useState } from 'react'
import type { Change, FlowData, ISODate } from '../model/types'
import type { ColumnOrder } from '../model/board'
import { localDate } from '../model/dates'
import type { FileStore } from '../storage/fileStore'
import { ensureFolder, loadFlow, reloadPaths, saveFlow } from '../storage/flowRepo'
import type { Settings } from './settings'

/** Copy one reloaded path from `from` into `into` (a fresh copy of the current data). */
function mergePath(into: FlowData, from: FlowData, path: string): FlowData {
  const out: FlowData = { ...into, projects: { ...into.projects }, days: { ...into.days }, skipped: into.skipped.filter((s) => s !== path) }
  if (from.skipped.includes(path)) out.skipped.push(path)
  const proj = /^projects\/(.+)\.md$/.exec(path)?.[1]
  const day = /^days\/(.+)\.md$/.exec(path)?.[1]
  if (path === 'inbox.md') out.inbox = from.inbox
  else if (path === 'notes.md') out.notes = from.notes
  else if (proj) { if (from.projects[proj]) out.projects[proj] = from.projects[proj]; else delete out.projects[proj] }
  else if (day) { if (from.days[day]) out.days[day] = from.days[day]; else delete out.days[day] }
  return out
}

export function useFlow(store: FileStore, settings: Settings, now: () => Date = () => new Date()) {
  const nowRef = useRef(now)
  nowRef.current = now
  const dataRef = useRef<FlowData | null>(null)
  const applyLog = useRef<{ n: number; paths: string[] }[]>([])
  const applyCount = useRef(0)
  const todayRef = useRef<ISODate>(localDate(now()))
  // Paths still to be written (failed writes stay here until a later save succeeds).
  const pending = useRef(new Set<string>())
  // All saves run one after another so two writes to the same file never overlap.
  const saving = useRef<Promise<void>>(Promise.resolve())
  const [data, setData] = useState<FlowData | null>(null)
  const [today, setToday] = useState<ISODate>(todayRef.current)
  const [filter, setFilter] = useState<string | null>(null)
  const [order, setOrderState] = useState<ColumnOrder>({})
  const [lastProject, setLastProject] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unwatch: (() => void) | undefined
    ;(async () => {
      await ensureFolder(store)
      const loaded = await loadFlow(store, todayRef.current)
      const savedOrder = await settings.get<ColumnOrder>('columnOrder')
      const savedLast = await settings.get<string>('lastProject')
      if (cancelled) return
      dataRef.current = loaded
      setData(loaded)
      if (savedOrder) setOrderState(savedOrder)
      if (savedLast) setLastProject(savedLast)
      const un = await store.watch((paths) => {
        const cur = dataRef.current
        if (!cur) return
        const start = applyCount.current
        void reloadPaths(store, cur, paths, todayRef.current).then((next) => {
          if (cancelled) return
          // Keep local changes made while the reload was in flight: merge only the
          // reloaded paths, skipping those a local apply touched since (they are newer).
          const dirty = new Set(applyLog.current.filter((e) => e.n > start).flatMap((e) => e.paths))
          let merged = dataRef.current ?? next
          for (const path of paths) if (!dirty.has(path)) merged = mergePath(merged, next, path)
          dataRef.current = merged
          setData(merged)
        })
      })
      if (cancelled) un()
      else unwatch = un
    })()
    return () => {
      cancelled = true
      unwatch?.()
    }
  }, [store, settings])

  useEffect(() => {
    const id = setInterval(() => {
      const t = localDate(nowRef.current())
      todayRef.current = t
      setToday(t)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const setOrder = useCallback((o: ColumnOrder) => {
    setOrderState(o)
    void settings.set('columnOrder', o)
  }, [settings])

  const remember = useCallback((slug: string) => {
    setLastProject(slug)
    void settings.set('lastProject', slug)
  }, [settings])

  const apply = useCallback((fn: (d: FlowData) => Change) => {
    const cur = dataRef.current
    if (!cur) return
    const change = fn(cur)
    if (change.changed.length === 0) return
    applyLog.current.push({ n: ++applyCount.current, paths: change.changed })
    if (applyLog.current.length > 50) applyLog.current.shift()
    dataRef.current = change.data
    setData(change.data)
    for (const path of change.changed) pending.current.add(path)
    saving.current = saving.current.then(async () => {
      const latest = dataRef.current
      if (!latest || pending.current.size === 0) return
      const paths = [...pending.current]
      pending.current.clear()
      const failed = await saveFlow(store, latest, paths).catch(() => paths)
      for (const path of failed) pending.current.add(path)
    })
  }, [store])

  return { data, today, filter, setFilter, order, setOrder, lastProject, remember, apply }
}
