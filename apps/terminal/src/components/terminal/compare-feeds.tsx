// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'

import type { PluginCandle } from '@/hooks/use-candle-stream'
import type { CompareSymbol } from '@/hooks/use-chart-terminal-state'
import { useCandleStream } from '@/hooks/use-candle-stream'
import { compareSeriesId } from '@/hooks/use-chart-terminal-state'

type FeedCallbacks = {
  onSnapshot: (seriesId: string, candles: Array<PluginCandle>) => void
  onCandle: (seriesId: string, candle: PluginCandle) => void
}

/**
 * Headless candle subscription for one compare symbol. The REST snapshot
 * seeds the compare series (chart rebuild); every later candle refines the
 * forming bar imperatively through the chart engine, mirroring the main
 * series' live path.
 */
function CompareFeed({
  entry,
  timeframe,
  onSnapshot,
  onCandle,
}: {
  entry: CompareSymbol
  timeframe: string
} & FeedCallbacks) {
  const seriesId = compareSeriesId(entry)
  const { candles, hasSnapshot } = useCandleStream({
    market: entry.market,
    pairKey: entry.pairKey,
    timeframe,
    enabled: true,
  })

  const seededKeyRef = useRef<string | null>(null)
  const lastTsRef = useRef(0)
  const streamKey = `${seriesId}:${timeframe}`

  useEffect(() => {
    if (!hasSnapshot || candles.length === 0) return
    const latest = candles[candles.length - 1]
    if (!latest) return

    if (seededKeyRef.current !== streamKey) {
      seededKeyRef.current = streamKey
      lastTsRef.current = latest.ts
      onSnapshot(seriesId, candles)
      return
    }

    // Replay candles at or after the last applied one — a same-ts candle
    // refines the forming bar, a newer ts rolls a fresh aligned bar.
    for (const candle of candles) {
      if (candle.ts < lastTsRef.current) continue
      onCandle(seriesId, candle)
      lastTsRef.current = candle.ts
    }
  }, [candles, hasSnapshot, onCandle, onSnapshot, seriesId, streamKey])

  return null
}

/** Mounts one headless candle feed per active compare symbol. */
export function CompareFeeds({
  compareSymbols,
  timeframe,
  onSnapshot,
  onCandle,
}: {
  compareSymbols: Array<CompareSymbol>
  timeframe: string
} & FeedCallbacks) {
  return (
    <>
      {compareSymbols.map((entry) => (
        <CompareFeed
          key={compareSeriesId(entry)}
          entry={entry}
          timeframe={timeframe}
          onSnapshot={onSnapshot}
          onCandle={onCandle}
        />
      ))}
    </>
  )
}
