// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  computeSignalsWithRegime,
  findRecentSignal,
} from '@pairlens/strategy-engine/compute'
import { createConnector } from '../connector'
import type { Candle } from '@pairlens/shared/types'

export async function signals(args: {
  market: string
  pair: string
  timeframe: string
  country: string
  lookback: number
}): Promise<void> {
  const manager = await createConnector(args.market, args.country)
  manager.setContext({
    market: args.market,
    pair: args.pair,
    timeframe: args.timeframe,
  })

  const candles = (await manager.execute('market-data:history', {
    pair: args.pair,
    timeframe: args.timeframe,
    limit: 300,
  })) as Array<Candle>

  console.log(
    `Loaded ${candles.length} candles for ${args.pair} (${args.timeframe}) on ${args.market.toUpperCase()}`,
  )

  // Current signal
  const [regime, currentSignal] = computeSignalsWithRegime(candles)
  console.log(`\nRegime: ${regime ?? 'unknown'}`)

  if (currentSignal) {
    console.log(`\nCurrent Signal:`)
    console.log(JSON.stringify(currentSignal, null, 2))
  } else {
    console.log('\nNo signal on latest candle.')
  }

  // Recent signals (scan lookback)
  const recent = findRecentSignal(candles, args.lookback)
  if (recent && recent !== currentSignal) {
    console.log(`\nMost recent signal (within last ${args.lookback} candles):`)
    console.log(JSON.stringify(recent, null, 2))
  }

  process.exit(0)
}
