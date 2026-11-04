import { moveStep } from '../model/steps'
import type { Change, FlowData } from '../model/types'

/**
 * Drop of a dragged checklist step (pointer or Alt+Arrow): moves the step at `activeIndex` to
 * `overIndex` in task `ref`. A drop on itself or outside the list (-1) is ignored.
 * Returns whether a move was applied.
 */
export function handleStepDrop(
  { ref, activeIndex, overIndex }: { ref: string; activeIndex: number; overIndex: number },
  apply: (fn: (d: FlowData) => Change) => void,
): boolean {
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return false
  apply((d) => moveStep(d, ref, activeIndex, overIndex))
  return true
}

/** Sortable ids for steps: text plus occurrence, so a step keeps its id when the list is reordered. */
export function stepIds(steps: readonly { text: string }[]): string[] {
  const seen = new Map<string, number>()
  return steps.map(({ text }) => {
    const n = seen.get(text) ?? 0
    seen.set(text, n + 1)
    return `${text}#${n}`
  })
}
