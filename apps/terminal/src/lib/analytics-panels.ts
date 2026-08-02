// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Workspace & panel observability: layout composition snapshots and
// per-pane-type dwell time, driven entirely from layout state — no
// per-component instrumentation. Everything funnels through the typed
// `track()` taxonomy, so nothing here fires without analytics consent.
//
// Dwell model: a pane type is "visible" while it is the active tab of some
// cell in the mounted layout AND the document itself is visible. Time is
// accumulated per type (a type showing in two cells at once still counts
// single-speed — the question is "was this panel on screen", not area) and
// flushed as one `panel_dwell` event per type: periodically, when the tab
// hides, and when the workspace or composition context changes.

import type { WorkspaceKind } from '@/lib/analytics-events'
import type { TerminalLayout } from '@/lib/layout/types'
import { track } from '@/lib/analytics-events'

const FLUSH_INTERVAL_MS = 5 * 60_000
const SNAPSHOT_DEBOUNCE_MS = 3_000
/** Below this, dwell is a tab flicked past — noise, not usage. */
const MIN_DWELL_MS = 1_000

/** Map a workspace storage key to its coarse kind (never ids or names). */
export function workspaceAnalyticsKind(storageKey: string): WorkspaceKind {
  if (storageKey.includes('discovery')) return 'discovery'
  if (storageKey.includes('workspace.')) return 'custom'
  return 'pair'
}

/** The pane type fronted in each cell — what is actually on screen. */
export function visiblePaneTypes(layout: TerminalLayout): Array<string> {
  const types: Array<string> = []
  for (const column of layout.columns) {
    for (const cell of column.cells) {
      const active = cell.panes[cell.activeTabIndex] ?? cell.panes[0]
      if (active) types.push(active.type)
    }
  }
  return types
}

// ── Dwell accounting ──────────────────────────────────────────────────

const accumulatedMs = new Map<string, number>()
let visibleTypes: Array<string> = []
let clockStart = 0
let currentWorkspace: WorkspaceKind = 'pair'
let engineStarted = false

function documentHidden(): boolean {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  )
}

/** Credit elapsed time to the visible set and restart (or stop) the clock. */
function settleClock(): void {
  const now = Date.now()
  if (clockStart > 0) {
    const elapsed = now - clockStart
    if (elapsed > 0) {
      for (const type of visibleTypes) {
        accumulatedMs.set(type, (accumulatedMs.get(type) ?? 0) + elapsed)
      }
    }
  }
  clockStart = visibleTypes.length > 0 && !documentHidden() ? now : 0
}

function flushDwell(): void {
  settleClock()
  for (const [type, ms] of accumulatedMs) {
    if (ms >= MIN_DWELL_MS) {
      track('panel_dwell', {
        pane_type: type,
        seconds: Math.round(ms / 1000),
        workspace: currentWorkspace,
      })
    }
  }
  accumulatedMs.clear()
}

function ensureEngineStarted(): void {
  if (engineStarted || typeof document === 'undefined') return
  engineStarted = true
  document.addEventListener('visibilitychange', () => {
    // hidden → credits the open interval and stops the clock;
    // visible → restarts it for the current set.
    settleClock()
  })
  // pagehide fires on both navigation-away and window close; posthog-js
  // delivers late captures via sendBeacon, so the final flush survives.
  window.addEventListener('pagehide', () => flushDwell())
  setInterval(() => flushDwell(), FLUSH_INTERVAL_MS)
}

/**
 * Report the currently visible pane types. Call on every layout change and
 * with `[]` on unmount; workspace switches flush the previous surface's
 * dwell so events never straddle two workspaces.
 */
export function reportVisiblePanes(
  workspace: WorkspaceKind,
  types: Array<string>,
): void {
  ensureEngineStarted()
  if (workspace !== currentWorkspace) {
    flushDwell()
    currentWorkspace = workspace
  } else {
    settleClock()
  }
  visibleTypes = [...new Set(types)]
  clockStart = visibleTypes.length > 0 && !documentHidden() ? Date.now() : 0
}

// ── Layout composition snapshots ──────────────────────────────────────

let snapshotTimer: ReturnType<typeof setTimeout> | null = null
const lastSignatureByWorkspace = new Map<WorkspaceKind, string>()

/**
 * Report the layout's composition, debounced and deduplicated so pure
 * resizes and drag churn stay silent — only real composition changes (and
 * the first sight of each workspace per session) produce an event.
 */
export function reportLayoutSnapshot(
  workspace: WorkspaceKind,
  layout: TerminalLayout,
): void {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null
    const counts: Record<string, number> = {}
    let paneCount = 0
    let cellCount = 0
    for (const column of layout.columns) {
      for (const cell of column.cells) {
        cellCount += 1
        for (const pane of cell.panes) {
          paneCount += 1
          counts[pane.type] = (counts[pane.type] ?? 0) + 1
        }
      }
    }
    const visible = [...new Set(visiblePaneTypes(layout))].sort()
    const signature = JSON.stringify([
      layout.columns.length,
      cellCount,
      counts,
      visible,
    ])
    if (lastSignatureByWorkspace.get(workspace) === signature) return
    lastSignatureByWorkspace.set(workspace, signature)
    track('layout_snapshot', {
      workspace,
      pane_count: paneCount,
      column_count: layout.columns.length,
      cell_count: cellCount,
      pane_types: Object.keys(counts).sort(),
      pane_type_counts: counts,
      visible_pane_types: visible,
    })
  }, SNAPSHOT_DEBOUNCE_MS)
}
