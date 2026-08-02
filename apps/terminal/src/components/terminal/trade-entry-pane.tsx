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

export function TradeEntryPane() {
  const activePair = usePanePair()
  const tickerData = useOptionalTickerData()
  const candleData = useOptionalCandleData()

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

  return (
    <TradeEntryPanel
      market={activePair.market}
      pairKey={activePair.pairKey}
      pricesRef={pricesRef}
    />
  )
}
