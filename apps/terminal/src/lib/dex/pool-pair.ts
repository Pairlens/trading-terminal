// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pair key a selected pool resolves through.
 *
 * The pool resolvers accept `BASE-QUOTE` where the base is either an address
 * or a ticker, and they prefer the address arm — it pins the exact token the
 * row displayed rather than re-resolving a symbol that hundreds of tokens
 * share. So a selection carries its base address wherever the listing had one,
 * and only falls back to the ticker when it did not.
 *
 * Kept out of the discovery store because the pair route builds the same key
 * from the same rule, and two copies of it would eventually disagree about
 * which leg wins.
 */
import type { SelectedPool } from '@/lib/dex/discovery-store'

export function poolPairKey(pool: SelectedPool): string | undefined {
  const base = pool.baseAddress ?? pool.baseSymbol
  if (!base) return undefined
  return `${base}-${pool.quoteSymbol ?? 'USDC'}`
}
