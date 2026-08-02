// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Normalize a user/route-supplied pair key to the canonical BASE-QUOTE form
 * connectors expect: trimmed, uppercased, with `/` and `_` separators
 * replaced by `-` (e.g. "btc/usdt" → "BTC-USDT").
 */
export function normalizePairKey(pairKey: string): string {
  return pairKey.trim().toUpperCase().replace(/[/_]/g, '-')
}
