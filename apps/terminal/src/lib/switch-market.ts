// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { emitWrite } from '@/lib/sync/sync-channel'

const MARKET_KEY = 'terminal.market'

/**
 * Switch the active chart connector from anywhere (outside React).
 *
 * `terminal.market` is a synced persisted value (usePersistedState): writing it
 * through the sync channel updates every mounted chart instance, and the
 * localStorage write keeps the choice across reloads. This mirrors exactly what
 * usePersistedState's own setter does, so a global action (e.g. the
 * geo-restriction dialog's "switch connector" CTA) stays consistent with the
 * chart's connector dropdown.
 */
export function switchActiveMarket(market: string): void {
  try {
    localStorage.setItem(`pairlens:${MARKET_KEY}`, JSON.stringify(market))
  } catch {
    // Ignore storage errors (quota, private browsing)
  }
  emitWrite(MARKET_KEY, market)
}
