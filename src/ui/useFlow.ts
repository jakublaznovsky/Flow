import { useCallback, useEffect, useRef, useState } from 'react'
import type { Change, FlowData, ISODate } from '../model/types'
import type { ColumnOrder } from '../model/board'
import { localDate } from '../model/dates'
import type { FileStore } from '../storage/fileStore'
import { ensureFolder, loadFlow, reloadPaths, saveFlow } from '../storage/flowRepo'
import type { Settings } from './settings'

export function useFlow(store: FileStore, settings: Settings, now: () => Date = () => new Date()) {
  const nowRef = useRef(now)
  nowRef.current = now
  const dataRef = useRef<FlowData | null>(null)
  const todayRef = useRef<ISODate>(localDate(now()))
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
        void reloadPaths(store, cur, paths, todayRef.current).then((next) => {
          if (cancelled) return
          dataRef.current = next
          setData(next)
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
    dataRef.current = change.data
    setData(change.data)
    void saveFlow(store, change.data, change.changed)
  }, [store])

  return { data, today, filter, setFilter, order, setOrder, lastProject, remember, apply }
}
