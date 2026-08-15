// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which tab, if any, an open overlay belongs to.
 *
 * The tab bar answers one question: "where am I?". While a full-screen
 * overlay owns the display the honest answer is usually "nowhere in the tab
 * bar" — Settings is not a tab, the pair picker is not a tab — so the bar
 * shows no active item and dims itself rather than pointing at the screen the
 * user left. Keeping the old tab lit reads as a lie, which is exactly the
 * report this table answers.
 *
 * The order book is the deliberate exception, and it is the design's: it is
 * opened from the Trade ticket, it is part of trading, and
 * `full-screen-overlay.tsx` documents that it keeps `Trade` lit. That is why
 * ownership is per overlay kind and not a blanket rule.
 */
import type {
  MobileOverlay,
  MobileOverlayKind,
  MobileTab,
} from '../mobile-focus-context'

/** The tab an overlay conceptually belongs to, or null for "none of them". */
export const OVERLAY_OWNING_TAB: Record<MobileOverlayKind, MobileTab | null> = {
  orderbook: 'trade',
  pairPicker: null,
  venuePicker: null,
  settings: null,
  connect: null,
  news: null,
  // Same logic as the order book: opened from Discover, still browsing markets.
  markets: 'discover',
  events: 'discover',
  predictionEvent: 'discover',
  // Both Discover cards open out into a screen that is still Discover: the
  // user tapped a tile on that panel and the way back is the panel they came
  // from, so dimming the bar would be the lie this table exists to prevent.
  fearGreed: 'discover',
  pnl: 'discover',
  accountDetail: null,
}

/**
 * The tab the bar should light up: the active one when nothing covers the app,
 * otherwise whatever the TOP overlay claims. Top of the stack, because that is
 * the screen the user is actually looking at — an order book behind a connect
 * wizard no longer describes where they are.
 */
export function litTab(
  activeTab: MobileTab,
  overlays: ReadonlyArray<MobileOverlay>,
): MobileTab | null {
  const top = overlays[overlays.length - 1]
  if (!top) return activeTab
  return OVERLAY_OWNING_TAB[top.kind]
}
