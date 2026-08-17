// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pair route for a provider's pool row.
 *
 * One definition, because it encodes the see-what-you-trade rule and a second
 * copy is how that rule drifts: the id is `address-QUOTE` whenever the listing
 * carried a base address, and only falls back to the ticker when it did not.
 * A discovery board is exactly where two tokens with the same symbol turn up
 * next to each other, and a symbol-keyed link is how somebody ends up charting
 * the wrong one.
 *
 * Null when the row named neither an address nor a ticker — the caller renders
 * an unclickable row rather than a link that opens nothing.
 */
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'
import type { PoolListingEntry } from '@pairlens/shared/instrument-types'
import { chartLinkProps } from '@/lib/market-ref/link'

export function poolChartTarget(
  pool: Pick<PoolListingEntry, 'baseAddress' | 'baseSymbol' | 'quoteSymbol'>,
  market: string,
): ReturnType<typeof chartLinkProps> | null {
  const base = pool.baseAddress ?? pool.baseSymbol
  if (!base) return null
  return chartLinkProps({
    cls: 'dex',
    market,
    id: normalizeInstrumentId('dex', `${base}-${pool.quoteSymbol ?? 'USDC'}`),
  })
}
