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
  useMemo,
  useState,
} from 'react'

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
  | { kind: 'connect'; market?: string }
  | { kind: 'news'; index: number }

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
  setActiveTab: (tab: MobileTab) => void
  /** Identical to `setActiveTab('chart')`. The tap-the-chart gesture. */
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

  const [activeTab, setTab] = useState<MobileTab>('chart')
  const [overlays, setOverlays] = useState<Array<MobileOverlay>>([])

  const setActiveTab = useCallback((tab: MobileTab) => {
    setTab((prev) => {
      if (prev === tab) return prev
      track('mobile_tab_changed', { tab })
      return tab
    })
  }, [])

  const dismissPanel = useCallback(() => {
    setTab((prev) => {
      if (prev === 'chart') return prev
      track('mobile_tab_changed', { tab: 'chart' })
      return 'chart'
    })
  }, [])

  const pushOverlay = useCallback((overlay: MobileOverlay) => {
    setOverlays((prev) => [...prev, overlay])
  }, [])

  const popOverlay = useCallback(() => {
    setOverlays((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)))
  }, [])

  const closeOverlays = useCallback(() => {
    setOverlays((prev) => (prev.length === 0 ? prev : []))
  }, [])

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
      dismissPanel,
      pushOverlay,
      popOverlay,
      closeOverlays,
    }),
    [
      onFocusPair,
      setMarket,
      setActiveTab,
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
