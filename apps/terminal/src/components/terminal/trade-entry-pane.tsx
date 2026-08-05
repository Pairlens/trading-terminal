// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useRef } from 'react'
import { usePanePair } from '@pairlens/plugin-sdk'
import { TradeEntryPanel } from './trade-entry-panel'
import type { LivePrices } from './trade-entry-panel'
import {
  useOptionalCandleData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { usePairUnavailable } from '@/stores/pair-availability-store'

export function TradeEntryPane() {
  const activePair = usePanePair()
  const tickerData = useOptionalTickerData()
  const candleData = useOptionalCandleData()
  const unavailable = usePairUnavailable(
    activePair?.market ?? '',
    activePair?.pairKey ?? '',
  )

  // Latest prices live in a stable ref: this pane re-renders on every tick
  // (it is intentionally tiny), while the memoized TradeEntryPanel below
  // bails out. The panel's submit handlers read fresh prices from the ref;
  // its limit-price field subscribes to the tick contexts itself.
  const pricesRef = useRef<LivePrices>({
    latestPrice: undefined,
    bestBid: null,
    bestAsk: null,
  })
  pricesRef.current.latestPrice = candleData?.latestCandle?.close
  pricesRef.current.bestBid = tickerData?.bestBid ?? null
  pricesRef.current.bestAsk = tickerData?.bestAsk ?? null

  if (!tickerData || !candleData || !activePair) {
    return <PanePairPicker />
  }

  // The venue doesn't list the pair, so there is no price to quote against and
  // any order routed here would be rejected. Say so instead of presenting a
  // ticket that looks perfectly ordinary right up to submission.
  if (unavailable) {
    return (
      <PaneDataUnavailable
        compact
        pairKey={activePair.pairKey}
        market={activePair.market}
      />
    )
  }

  return (
    <TradeEntryPanel
      market={activePair.market}
      pairKey={activePair.pairKey}
      pricesRef={pricesRef}
    />
  )
}
