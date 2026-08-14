// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which magnitude the order book's second column reports: the base size
 * resting at a price, or the quote-currency notional that size is worth
 * (price × size). Total, the depth bars and the pressure split all follow it.
 *
 * It lives here rather than in either book because both books answer to it and
 * neither owns it — the desktop pane, every other desktop pane, the phone's
 * full-screen book and a second terminal window are all reading the same
 * preference. `usePersistedState` is what makes that literal: one localStorage
 * key, a write bus that updates every mounted reader in lockstep, and cloud
 * hydration for signed-in users (the key is tier 1, so it rides the
 * `preferences` domain — see lib/sync/sync-domains.ts).
 *
 * Size is the default because it is what the venue publishes; value is derived.
 */
import { usePersistedState } from '@/hooks/use-persisted-state'

export type BookMetric = 'size' | 'value'

export const ORDERBOOK_METRIC_KEY = 'terminal.orderbookMetric'

export function useOrderbookMetric(): [
  BookMetric,
  (value: BookMetric | ((prev: BookMetric) => BookMetric)) => void,
] {
  return usePersistedState<BookMetric>(ORDERBOOK_METRIC_KEY, 'size')
}
