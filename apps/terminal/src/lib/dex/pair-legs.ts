// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A DEX pair key split back into its two legs.
 *
 * The base may be a contract address, and an address contains no separator on
 * either chain family, so the split is on the LAST dash: the quote is always a
 * plain ticker. Same rule `normalizeInstrumentId` applies when it builds the
 * key, restated here because reading it back with `split('-')[0]` truncates
 * nothing on Solana and everything on a pair whose base ticker contains one.
 */
export type PairLegs = { base: string; quote: string }

export function splitPairKey(pairKey: string | undefined): PairLegs | null {
  if (!pairKey) return null
  const at = pairKey.lastIndexOf('-')
  if (at <= 0 || at === pairKey.length - 1) return null
  return { base: pairKey.slice(0, at), quote: pairKey.slice(at + 1) }
}
