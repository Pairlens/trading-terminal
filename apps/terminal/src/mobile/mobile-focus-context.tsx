// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Mobile shell state — three contexts from one provider, never one context.
 *
 * The split mirrors `ChartTerminalProvider`'s discipline and exists for the
 * same reason: the tab bar and context bar must not re-render because a
 * drawing tool changed, and nothing may re-render because a price ticked.
 *
 *   1. MobileFocusContext   — pair / venue. Changes rarely.
 *   2. MobileNavContext     — active tab + overlay stack. User interaction only.
 *   3. MobileActionsContext — stable callbacks. Identity never changes.
 *
 * `openPanel` from the design is DERIVED (`activeTab === 'chart' ? null : tab`),
 * never stored: two sources of truth for one fact eventually disagree.
 *
 * `focusedVenue` is not a fourth source of truth either — it *is*
 * `useChartConfig().market`, and `setFocusedVenue` is `useChartActions()
 * .setMarket`. This provider re-exposes it so chrome needs one hook, while the
 * store of record stays the chart terminal state. That is what keeps venue,
 * chart, trade ticket and copilot in agreement.
 *
 * Nesting note: the provider sits BELOW `ChartTerminalProvider` (the blueprint
 * sketches it above). Above the chart terminal it could not read the market at
 * all, and mirroring it into local state would create exactly the two-way sync
 * the "not a fourth source of truth" rule exists to prevent. Nothing above the
 * chart terminal consumes these contexts, so the move is invisible.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from '@tanstack/react-router'

import {
  SHELL_DEPTH_KEY,
  planShellMove,
  reconcileHistory,
  shellDepthOf,
  shellEntryCount,
  suppressPairAdoption,
  truncateShell,
} from './lib/mobile-history'
import type { ShellEntries } from './lib/mobile-history'
import type { AnyRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { SettingsNavId } from '@/components/user-settings-dialog'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { track } from '@/lib/analytics-events'

export type MobileTab = 'watchlist' | 'trade' | 'chart' | 'copilot' | 'discover'

/**
 * Settings sections reachable on mobile. `accounts` is synthetic — the phone
 * puts Accounts first in the list, which the desktop dialog does not have as
 * a nav id of its own.
 */
export type MobileSettingsSection = SettingsNavId | 'accounts'

export type MobileOverlay =
  | { kind: 'orderbook' }
  | { kind: 'pairPicker'; autoFocus?: boolean; mode?: 'focus' | 'watchlistAdd' }
  | { kind: 'venuePicker' }
  | { kind: 'settings'; section?: MobileSettingsSection }
  /**
   * `market` opens the API-key wizard for a CEX or broker; `chain` opens the
   * wallet dialog for a DEX venue. They are separate channels because they are
   * separate credentials — the desktop makes the same split in its
   * `?connect=` / `?connectChain=` search params, and collapsing them lands a
   * DEX user in a form asking for an exchange API key. Neither set means "the
   * user picked Add account", which starts at the type picker.
   */
  | { kind: 'connect'; market?: string; chain?: string }
  | { kind: 'news'; index: number }
  /** Discover's "All markets" — the full list as its own screen. */
  | { kind: 'markets' }
  /** One connected credential: rename, permissions, disconnect. */
  | { kind: 'accountDetail'; credentialId: string }

export type MobileOverlayKind = MobileOverlay['kind']

export type MobileFocusValue = {
  focusedPair: string
  focusedVenue: string
}

export type MobileNavValue = {
  activeTab: MobileTab
  overlays: Array<MobileOverlay>
}

export type MobileActionsValue = {
  setFocusedPair: (pairKey: string) => void
  setFocusedVenue: (market: string) => void
  /**
   * Sets the tab WITHOUT claiming a history entry — the seed path, for a URL
   * that names a screen the app should open on. Back from the screen an app
   * opened on leaves the app, which is the platform's own rule; user-driven
   * tab changes go through `selectTab` and are undoable with back.
   */
  setActiveTab: (tab: MobileTab) => void
  /**
   * The tab bar's own action: close whatever covers the app AND go to the
   * tab, as one move. Two calls would consume the overlays' history entries
   * and change the tab in separate commits, and the back button would then
   * step through a tab change that never had an entry of its own.
   *
   * The first panel this opens over the bare chart claims one history entry,
   * so back dismisses the sheet. Panel → panel claims nothing: the entry
   * belongs to "a sheet is up", not to a tab.
   */
  selectTab: (tab: MobileTab) => void
  /** Back to the bare chart: tap-the-chart, drag-down, a row that navigates. */
  dismissPanel: () => void
  pushOverlay: (overlay: MobileOverlay) => void
  popOverlay: () => void
  closeOverlays: () => void
}

const MobileFocusContext = createContext<MobileFocusValue | null>(null)
const MobileNavContext = createContext<MobileNavValue | null>(null)
const MobileActionsContext = createContext<MobileActionsValue | null>(null)

export function useMobileFocus(): MobileFocusValue {
  const ctx = useContext(MobileFocusContext)
  if (!ctx)
    throw new Error('useMobileFocus must be used within a MobileFocusProvider')
  return ctx
}

export function useMobileNav(): MobileNavValue {
  const ctx = useContext(MobileNavContext)
  if (!ctx)
    throw new Error('useMobileNav must be used within a MobileFocusProvider')
  return ctx
}

export function useMobileActions(): MobileActionsValue {
  const ctx = useContext(MobileActionsContext)
  if (!ctx)
    throw new Error(
      'useMobileActions must be used within a MobileFocusProvider',
    )
  return ctx
}

/** The panel currently docked over the chart, or null when the chart is bare. */
export function openPanelFor(
  tab: MobileTab,
): Exclude<MobileTab, 'chart'> | null {
  return tab === 'chart' ? null : tab
}

/** Stable identity, so closing an already-empty stack re-renders nothing. */
const NO_OVERLAYS: Array<MobileOverlay> = []

/**
 * One history entry per step that covers the chart, stamped with the depth it
 * represents.
 *
 * It goes through `router.history` rather than `window.history` so the router
 * keeps its own `__TSR_index` bookkeeping straight — a raw `pushState` leaves
 * the index unset and every later back/forward is then read as a `GO` of an
 * unknown distance. The href is the CURRENT one: neither a panel nor an
 * overlay is a route, and they must not change what a refresh or a share
 * resolves to.
 */
function pushShellEntry(router: AnyRouter, depth: number): void {
  const location = router.history.location
  router.history.push(location.href, {
    ...(location.state as Record<string, unknown> | undefined),
    [SHELL_DEPTH_KEY]: depth,
  })
}

/**
 * Put the depth back on an entry a URL rewrite stripped it from.
 *
 * `navigate({ replace: true })` builds the replacement entry's state from the
 * router's own bookkeeping and nothing else, so every focus change — picking a
 * pair from the watchlist while the sheet is up — silently blanks the stamp of
 * the entry the sheet is standing on. That entry then reads as the base, and
 * the next back press closes every sheet above it at once instead of one.
 * Measured, not theorised: pick a pair in the Watchlist, open Settings, press
 * back, and both the overlay and the panel used to vanish together.
 */
function restampShellEntry(router: AnyRouter, depth: number): void {
  const location = router.history.location
  router.history.replace(location.href, {
    ...(location.state as Record<string, unknown> | undefined),
    [SHELL_DEPTH_KEY]: depth,
  })
}

export function MobileFocusProvider({
  focusedPair,
  onFocusPair,
  children,
}: {
  focusedPair: string
  /** Owned by MobileTerminalRoot: sets the pair AND rewrites the URL. */
  onFocusPair: (pairKey: string) => void
  children: ReactNode
}) {
  const { market } = useChartConfig()
  const { setMarket } = useChartActions()
  const router = useRouter()

  const [activeTab, setTab] = useState<MobileTab>('chart')
  const [overlays, setOverlays] = useState<Array<MobileOverlay>>(NO_OVERLAYS)

  /**
   * Tab and stack are mirrored in refs because every shell action has to read
   * the current depth AND touch history in the same tick. Doing that inside a
   * `setState` updater would be a side effect in a function React is free to
   * run twice (it does, in StrictMode), and two history entries would appear
   * for one sheet.
   */
  const stackRef = useRef<Array<MobileOverlay>>(overlays)
  const tabRef = useRef<MobileTab>(activeTab)
  /**
   * Whether the docked panel owns a history entry — not the same question as
   * whether a panel is docked. See `ShellEntries` in lib/mobile-history: the
   * screen the app opens on claims nothing.
   */
  const panelEntryRef = useRef(false)
  /** popstate events we caused ourselves and must not read as a user back. */
  const pendingEventsRef = useRef(0)
  const disarmRef = useRef<number | undefined>(undefined)

  /** Walk `count` of our own entries off the stack, silently. */
  const consumeEntries = useCallback(
    (count: number) => {
      if (count <= 0) return
      pendingEventsRef.current += 1
      // The entry we land on may name the pair the user was on BEFORE they
      // picked one in a sheet — see the rule-3 note in lib/mobile-history.
      suppressPairAdoption()
      router.history.go(-count)
      // A traversal that never lands — two chevron taps the browser coalesces
      // into one pop, a history it refuses to walk — would leave the counter
      // armed and swallow the user's NEXT back press. Disarm on a timer: by
      // then the popstate has either arrived or is not coming.
      window.clearTimeout(disarmRef.current)
      disarmRef.current = window.setTimeout(() => {
        pendingEventsRef.current = 0
      }, 400)
    },
    [router],
  )

  const setTabState = useCallback((tab: MobileTab) => {
    if (tabRef.current === tab) return
    tabRef.current = tab
    setTab(tab)
    track('mobile_tab_changed', { tab })
  }, [])

  const currentEntries = useCallback(
    (): ShellEntries => ({
      panel: panelEntryRef.current,
      overlays: stackRef.current.length,
    }),
    [],
  )

  /**
   * The single place shell state and history move together: one commit, one
   * history operation, computed from the counts either side of it.
   *
   * Splitting it — close the overlays, then change the tab — would `go(-n)`
   * and `push` in the same tick, and the push lands on the entry the traversal
   * has not walked off yet.
   */
  const commitShell = useCallback(
    (next: {
      tab: MobileTab
      overlays: Array<MobileOverlay>
      panelEntry: boolean
    }) => {
      const move = planShellMove(currentEntries(), {
        panel: next.panelEntry,
        overlays: next.overlays.length,
      })
      panelEntryRef.current = next.panelEntry
      if (next.overlays !== stackRef.current) {
        stackRef.current = next.overlays
        setOverlays(next.overlays)
      }
      setTabState(next.tab)
      for (const depth of move.push) pushShellEntry(router, depth)
      consumeEntries(move.back)
    },
    [consumeEntries, currentEntries, router, setTabState],
  )

  const setActiveTab = useCallback(
    (tab: MobileTab) => {
      commitShell({
        tab,
        overlays: stackRef.current,
        // Never CREATES an entry (see the action's doc comment), but going
        // back to the bare chart still releases one the panel holds — a dead
        // entry would cost the user an extra back press to leave the app.
        panelEntry: tab !== 'chart' && panelEntryRef.current,
      })
    },
    [commitShell],
  )

  const dismissPanel = useCallback(() => {
    commitShell({ tab: 'chart', overlays: stackRef.current, panelEntry: false })
  }, [commitShell])

  const pushOverlay = useCallback(
    (overlay: MobileOverlay) => {
      commitShell({
        tab: tabRef.current,
        overlays: [...stackRef.current, overlay],
        panelEntry: panelEntryRef.current,
      })
    },
    [commitShell],
  )

  const popOverlay = useCallback(() => {
    if (stackRef.current.length === 0) return
    commitShell({
      tab: tabRef.current,
      overlays: stackRef.current.slice(0, -1),
      panelEntry: panelEntryRef.current,
    })
  }, [commitShell])

  const closeOverlays = useCallback(() => {
    if (stackRef.current.length === 0) return
    commitShell({
      tab: tabRef.current,
      overlays: NO_OVERLAYS,
      panelEntry: panelEntryRef.current,
    })
  }, [commitShell])

  const selectTab = useCallback(
    (tab: MobileTab) => {
      commitShell({
        tab,
        overlays: NO_OVERLAYS,
        // A panel the user opened is undoable with back, whether or not it is
        // the first one: an overlay's entry becomes the panel's in place, so
        // the count still says one sheet is up.
        panelEntry: tab !== 'chart',
      })
    },
    [commitShell],
  )

  // Hardware/browser back. `router.history` fires exactly one notification per
  // popstate, so the pending count is a count of events, not of entries.
  useEffect(() => {
    return router.history.subscribe(({ action }) => {
      if (action.type === 'PUSH') return
      const entries = currentEntries()
      if (action.type === 'REPLACE') {
        // Self-healing rather than a rule every caller of `navigate` has to
        // remember: the rewrite has already happened by the time we hear about
        // it, and re-stamping is one more REPLACE that then agrees with the
        // stack, so it cannot loop.
        const depth = shellEntryCount(entries)
        if (
          depth > 0 &&
          shellDepthOf(router.history.location.state) !== depth
        ) {
          restampShellEntry(router, depth)
        }
        return
      }
      const decision = reconcileHistory({
        pendingEvents: pendingEventsRef.current,
        entryDepth: shellDepthOf(router.history.location.state),
        shellDepth: shellEntryCount(entries),
      })
      if (decision.type === 'consumed') {
        pendingEventsRef.current -= 1
        return
      }
      if (decision.type === 'settled') return
      // The browser has already moved: apply the landing state, never push or
      // consume for it.
      const landing = truncateShell(entries, decision.depth)
      panelEntryRef.current = landing.panel
      const kept =
        landing.overlays === 0
          ? NO_OVERLAYS
          : stackRef.current.slice(0, landing.overlays)
      if (kept !== stackRef.current) {
        stackRef.current = kept
        setOverlays(kept)
      }
      if (landing.dismissesPanel) setTabState('chart')
      suppressPairAdoption()
    })
  }, [router, currentEntries, setTabState])

  useEffect(() => () => window.clearTimeout(disarmRef.current), [])

  const focus = useMemo<MobileFocusValue>(
    () => ({ focusedPair, focusedVenue: market }),
    [focusedPair, market],
  )

  const nav = useMemo<MobileNavValue>(
    () => ({ activeTab, overlays }),
    [activeTab, overlays],
  )

  // Every member is a stable callback, so this object is created once and the
  // whole chrome tree below never re-renders because of it.
  const actions = useMemo<MobileActionsValue>(
    () => ({
      setFocusedPair: onFocusPair,
      setFocusedVenue: setMarket,
      setActiveTab,
      selectTab,
      dismissPanel,
      pushOverlay,
      popOverlay,
      closeOverlays,
    }),
    [
      onFocusPair,
      setMarket,
      setActiveTab,
      selectTab,
      dismissPanel,
      pushOverlay,
      popOverlay,
      closeOverlays,
    ],
  )

  return (
    <MobileActionsContext value={actions}>
      <MobileFocusContext value={focus}>
        <MobileNavContext value={nav}>{children}</MobileNavContext>
      </MobileFocusContext>
    </MobileActionsContext>
  )
}
