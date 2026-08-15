// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Writing a whole step graph into a builder draft, the way a person would.
 *
 * Workflows and notification rules share one editing model: an open draft,
 * a running list of changes, and a commit bar that shows the diff and waits
 * for the user. The assistant has to write through THAT, not around it —
 * `setSteps`/`setEdges` would land the graph on the canvas while recording
 * no changes, so the commit bar would stay hidden and the work could never
 * be committed. So this diffs the desired graph against the draft and calls
 * the same granular actions the canvas calls when you drag a step in.
 *
 * The layout is ours too. Asking a model for pixel coordinates spends
 * tokens on something it cannot see; it gives us the shape (steps, edges)
 * and this lays it out top-down, one row per depth.
 */

export type GraphStep = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export type GraphEdge = {
  id: string
  source: string
  sourceHandle?: string
  target: string
}

/** A step as the model gives it: no position, ids it made up itself. */
export type DesiredStep = {
  id: string
  type: string
  data?: Record<string, unknown>
}

export type DesiredEdge = {
  source: string
  sourceHandle?: string
  target: string
}

/** The slice of a builder store this drives. Both stores already match. */
export type GraphDraftAccess = {
  getDraft: () => {
    currentSteps: Array<GraphStep>
    currentEdges: Array<GraphEdge>
  } | null
  addStep: (step: GraphStep) => void
  removeStep: (stepId: string) => void
  updateStepPosition: (
    stepId: string,
    position: { x: number; y: number },
  ) => void
  updateStepData: (stepId: string, data: Record<string, unknown>) => void
  addEdge: (edge: GraphEdge) => void
  removeEdge: (edgeId: string) => void
}

const ROW_HEIGHT = 150
const COLUMN_WIDTH = 280
const ORIGIN = { x: 250, y: 40 }

/**
 * Top-down layout: depth from the roots decides the row, position within
 * the row decides the column, and a row is centred on the origin so a
 * single chain reads as a straight line down the canvas.
 */
export function layoutGraph(
  steps: Array<DesiredStep>,
  edges: Array<DesiredEdge>,
): Map<string, { x: number; y: number }> {
  const incoming = new Map<string, number>()
  for (const step of steps) incoming.set(step.id, 0)
  for (const edge of edges) {
    if (!incoming.has(edge.target)) continue
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  }

  const depth = new Map<string, number>()
  // Roots first, in declaration order. A step nothing points at is a root,
  // and so is every step in a cycle we never reach (handled by the tail).
  const queue: Array<string> = steps
    .filter((step) => (incoming.get(step.id) ?? 0) === 0)
    .map((step) => step.id)
  for (const id of queue) depth.set(id, 0)

  const outgoing = new Map<string, Array<string>>()
  for (const edge of edges) {
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target,
    ])
  }

  // Index-walked rather than iterated: the queue grows as the walk finds
  // deeper steps, and stopping at today's length would stop at depth one.
  let head = 0
  while (head < queue.length) {
    const id = queue[head]
    head += 1
    const next = depth.get(id) ?? 0
    for (const child of outgoing.get(id) ?? []) {
      // Deepest wins, so a join sits below both of its inputs.
      if ((depth.get(child) ?? -1) >= next + 1) continue
      depth.set(child, next + 1)
      queue.push(child)
    }
  }
  // Anything unreachable (a cycle the validator will reject anyway) still
  // needs somewhere to sit rather than stacking on the origin.
  let orphanRow = 0
  for (const step of steps) {
    if (depth.has(step.id)) continue
    depth.set(step.id, (Math.max(0, ...depth.values()) || 0) + 1 + orphanRow)
    orphanRow += 1
  }

  const rows = new Map<number, Array<string>>()
  for (const step of steps) {
    const row = depth.get(step.id) ?? 0
    rows.set(row, [...(rows.get(row) ?? []), step.id])
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const [row, ids] of rows) {
    ids.forEach((id, index) => {
      positions.set(id, {
        x: ORIGIN.x + (index - (ids.length - 1) / 2) * COLUMN_WIDTH,
        y: ORIGIN.y + row * ROW_HEIGHT,
      })
    })
  }
  return positions
}

export type GraphApplyResult = {
  added: number
  removed: number
  updated: number
  edgesAdded: number
  edgesRemoved: number
}

/**
 * Canvases keep their own ReactFlow node state and only re-read the draft
 * when you switch to a different workflow — which is right for dragging, and
 * wrong for a rewrite that arrives from somewhere else. Without this the
 * assistant's edit would sit in the store, invisible, until the next drag
 * pushed the stale canvas back over it.
 */
const externalWriteListeners = new Set<() => void>()

export function onExternalGraphWrite(listener: () => void): () => void {
  externalWriteListeners.add(listener)
  return () => {
    externalWriteListeners.delete(listener)
  }
}

/**
 * Make the open draft match `steps` + `edges`, one granular store action at
 * a time. Positions of steps that already exist are kept: the user may have
 * dragged them, and a re-layout on every edit would fight them for it.
 */
export function applyGraphToDraft(
  store: GraphDraftAccess,
  steps: Array<DesiredStep>,
  edges: Array<DesiredEdge>,
): GraphApplyResult | { error: string } {
  const draft = store.getDraft()
  if (!draft) return { error: 'No draft is open to write into.' }

  const result: GraphApplyResult = {
    added: 0,
    removed: 0,
    updated: 0,
    edgesAdded: 0,
    edgesRemoved: 0,
  }

  const desiredIds = new Set(steps.map((step) => step.id))
  const existing = new Map(draft.currentSteps.map((step) => [step.id, step]))
  const layout = layoutGraph(steps, edges)

  // Edges first, and only the doomed ones: removing a step takes its edges
  // with it, so clearing the edge set up front keeps the counts honest.
  for (const edge of draft.currentEdges) {
    const stillWanted = edges.some(
      (want) =>
        want.source === edge.source &&
        want.target === edge.target &&
        (want.sourceHandle ?? null) === (edge.sourceHandle ?? null),
    )
    if (stillWanted) continue
    store.removeEdge(edge.id)
    result.edgesRemoved += 1
  }

  for (const step of draft.currentSteps) {
    if (desiredIds.has(step.id)) continue
    store.removeStep(step.id)
    result.removed += 1
  }

  for (const step of steps) {
    const current = existing.get(step.id)
    const data = step.data ?? {}
    if (!current) {
      store.addStep({
        id: step.id,
        type: step.type,
        position: layout.get(step.id) ?? { ...ORIGIN },
        data,
      })
      result.added += 1
      continue
    }
    if (JSON.stringify(current.data) !== JSON.stringify(data)) {
      store.updateStepData(step.id, data)
      result.updated += 1
    }
  }

  const afterRemoval = store.getDraft()
  for (const edge of edges) {
    const already = (afterRemoval?.currentEdges ?? []).some(
      (have) =>
        have.source === edge.source &&
        have.target === edge.target &&
        (have.sourceHandle ?? null) === (edge.sourceHandle ?? null),
    )
    if (already) continue
    store.addEdge({
      id: crypto.randomUUID(),
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    })
    result.edgesAdded += 1
  }

  for (const listener of [...externalWriteListeners]) listener()
  return result
}
