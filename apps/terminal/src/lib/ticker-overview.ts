// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which ticker an instrument's overview is filed under.
 *
 * Asset metadata is a property of the ASSET, not of the tape: a perp on MNT
 * and MNT-USDT on any of eleven venues describe the same coin, so both ask
 * under the base leg. Two classes ask for nothing at all. A token has hundreds
 * of namesakes and a symbol lookup would answer for whichever of them the
 * provider ranked first, which is the same see-what-you-trade rule that keeps
 * token identity on the address. A prediction outcome's name is a question,
 * and no provider files one.
 */
import { isTokenAddress } from '@pairlens/shared/market-ref'
import type { InstrumentRef } from '@pairlens/shared/market-ref'

import { splitPairAssets } from '@/lib/pairs'

/** What the App Server's `/api/ticker-overview` is asked for. */
export type TickerOverviewTarget = {
  ticker: string
  assetClass: 'crypto' | 'stocks'
}

/** The target for one instrument, or null when it has no overview to fetch. */
export function tickerOverviewTarget(
  ref: InstrumentRef,
): TickerOverviewTarget | null {
  if (ref.cls === 'dex' || ref.cls === 'prediction') return null

  if (ref.cls === 'stocks') {
    // 'AAPL', or 'AAPL-USD' as the equities connector spells its own pairs.
    const ticker = ref.id.split('-')[0]
    return ticker
      ? { ticker: ticker.toUpperCase(), assetClass: 'stocks' }
      : null
  }

  // A spot pair or a linear perp. An address in the base leg means the class
  // was guessed from a dash rather than recorded, and it is not a CEX pair.
  const { base } = splitPairAssets(ref.id)
  if (!base || isTokenAddress(base)) return null
  return { ticker: `X:${base.toUpperCase()}USD`, assetClass: 'crypto' }
}
