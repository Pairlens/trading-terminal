// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The shell stack ⇄ browser history contract, as pure functions.
 *
 * On a phone the hardware back button is the dismiss gesture. The mobile shell
 * has no routes for its panels or overlays (tabs and overlays are local state
 * — see `use-mobile-route-sync.ts` for why), so back has nothing to pop unless
 * the shell puts something there: every step that COVERS the chart adds one
 * history entry stamped with the depth the stack reached, and back walks them
 * off. Two kinds of step qualify, and they are not symmetric:
 *
 *   - The first panel open (chart → Watchlist/Trade/Co-pilot/Discover) takes
 *     ONE entry. Switching from panel to panel takes none: the entry belongs
 *     to "a sheet is up", not to a tab, so however many times the user swaps
 *     panels there is exactly one entry to walk off. Back therefore dismisses
 *     the sheet to the bare chart, and the next back leaves the app.
 *   - Every overlay push takes one, stacking above the panel's.
 *
 * Three rules make that stable, and they are the reason this logic lives in a
 * module of its own with tests rather than inline in the provider:
 *
 *   1. A programmatic close (the chevron, a tab tap, tapping the chart, a
 *      drag-down dismiss) must CONSUME its entries. Leaving them behind means
 *      the forward button resurrects a dead sheet, and pressing back after
 *      closing walks a stack of no-ops. Consuming produces a popstate of our
 *      own making, which must not be mistaken for the user pressing back —
 *      hence the pending-event count.
 *   2. Entries are anonymous positions, not named screens: only their COUNT is
 *      stamped. That is what lets a tab tap over an open overlay re-use the
 *      entry it closes instead of consuming and pushing in the same tick — a
 *      `go(-1)` is asynchronous, so a push chasing it lands on the entry the
 *      traversal has not walked off yet and the stack tears.
 *   3. The entry we land on may name an older pair than the one in focus.
 *      `/pair/$pair` is rewritten with `replace: true` on every focus change,
 *      so a pair picked while a sheet was up replaces the SHEET's entry and
 *      leaves the one below it pointing at the previous pair. Adopting that
 *      URL would silently undo the user's pick, so a shell-driven history move
 *      latches "the next disagreement is stale" and the route sync re-asserts
 *      the canonical URL instead of adopting it.
 */

/** History-state key carrying the shell depth an entry represents. */
export const SHELL_DEPTH_KEY = '__plShellDepth'

/** The shell depth a history entry encodes; 0 for anything we did not stamp. */
export function shellDepthOf(state: unknown): number {
  if (!state || typeof state !== 'object') return 0
  const raw = (state as Record<string, unknown>)[SHELL_DEPTH_KEY]
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.floor(raw)
}

/**
 * What the shell currently owns on the history stack, as counts.
 *
 * `panel` is "the docked panel owns an entry", which is NOT the same question
 * as "is a panel docked". The screen the app OPENS on is not a step the user
 * took — a `/` deep link seeds Discover before the user has touched anything —
 * so it claims no entry and back leaves the app from it, the platform's own
 * rule for a first screen. It also must not claim one: that entry would sit
 * above the `/` entry the route sync replaces, and walking back onto `/` would
 * re-run the seed forever.
 */
export type ShellEntries = {
  panel: boolean
  overlays: number
}

/** The depth `entries` stamps on the topmost entry the shell owns. */
export function shellEntryCount(entries: ShellEntries): number {
  return (entries.panel ? 1 : 0) + entries.overlays
}

export type HistoryReconciliation =
  /** One of our own `go(-n)` echoes. Swallow it and leave the stack alone. */
  | { type: 'consumed' }
  /** The entry and the stack already agree. */
  | { type: 'settled' }
  /** The user moved through history: keep only this many shell entries. */
  | { type: 'truncate'; depth: number }

/**
 * What a popstate means for the shell stack.
 *
 * `entryDepth` above `shellDepth` is a FORWARD into an entry whose sheet was
 * already consumed — it settles rather than resurrecting it, which is the
 * whole point of consuming entries on a programmatic close.
 */
export function reconcileHistory(input: {
  pendingEvents: number
  entryDepth: number
  shellDepth: number
}): HistoryReconciliation {
  if (input.pendingEvents > 0) return { type: 'consumed' }
  const depth = Math.max(0, Math.min(input.entryDepth, input.shellDepth))
  if (depth === input.shellDepth) return { type: 'settled' }
  return { type: 'truncate', depth }
}

/** History entries to consume when the stack shrinks from `prev` to `next`. */
export function historyBackSteps(prevDepth: number, nextDepth: number): number {
  return Math.max(0, prevDepth - nextDepth)
}

export type ShellHistoryMove = {
  /** Depths to push, in order. Empty for a move that adds nothing. */
  push: Array<number>
  /** Entries to walk off, as one `go(-n)`. */
  back: number
}

/**
 * The one history operation a shell change implies — computed from the counts
 * BEFORE and AFTER, never from the individual actions that got us there.
 *
 * That is what makes panel↔panel free (1 → 1: nothing), and what makes a tab
 * tap over an open overlay free too (one overlay entry becomes the panel's
 * entry in place). Rule 2 in the file header is why it must work this way.
 */
export function planShellMove(
  prev: ShellEntries,
  next: ShellEntries,
): ShellHistoryMove {
  const from = shellEntryCount(prev)
  const to = shellEntryCount(next)
  const push: Array<number> = []
  for (let depth = from + 1; depth <= to; depth++) push.push(depth)
  return { push, back: historyBackSteps(from, to) }
}

export type ShellTruncation = ShellEntries & {
  /** The panel's own entry was walked off: dismiss the sheet to the chart. */
  dismissesPanel: boolean
}

/**
 * The shell state a back press lands on.
 *
 * The panel's entry is always the BOTTOM-most one the shell owns — a sheet is
 * up before anything can be stacked over it — so a shrinking depth eats
 * overlays first and the panel last. `dismissesPanel` is a separate answer
 * from `panel: false`, because a panel that never claimed an entry (the seeded
 * first screen) must survive a back press that empties the overlays above it.
 */
export function truncateShell(
  current: ShellEntries,
  depth: number,
): ShellTruncation {
  const clamped = Math.max(0, Math.min(depth, shellEntryCount(current)))
  const panel = current.panel && clamped >= 1
  return {
    panel,
    overlays: clamped - (panel ? 1 : 0),
    dismissesPanel: current.panel && !panel,
  }
}

/**
 * The stale-URL latch of rule 3. A one-shot flag with a short expiry: it is
 * consumed by the first disagreement the route sync sees, and it expires on
 * its own when a sheet closed without having changed the pair (the common
 * case), so it can never suppress a genuine navigation minutes later.
 */
const LATCH_TTL_MS = 800

let latchedAt: number | null = null

export function suppressPairAdoption(now: number = Date.now()): void {
  latchedAt = now
}

/** True exactly once per latch, and only while it is fresh. */
export function consumePairAdoptionSuppression(
  now: number = Date.now(),
): boolean {
  if (latchedAt === null) return false
  const fresh = now - latchedAt < LATCH_TTL_MS
  latchedAt = null
  return fresh
}

/** Test seam: drop any latch left behind by a previous case. */
export function resetPairAdoptionLatch(): void {
  latchedAt = null
}
