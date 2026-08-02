// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createConnector } from '../connector'
import type { Candle } from '@pairlens/shared/types'

export async function candles(args: {
  market: string
  pair: string
  timeframe: string
  limit: number
  country: string
  format: 'json' | 'csv'
}): Promise<void> {
  const manager = await createConnector(args.market, args.country)
  manager.setContext({
    market: args.market,
    pair: args.pair,
    timeframe: args.timeframe,
  })

  const result = (await manager.execute('market-data:history', {
    pair: args.pair,
    timeframe: args.timeframe,
    limit: args.limit,
  })) as Array<Candle>

  if (args.format === 'csv') {
    console.log('ts,open,high,low,close,volume')
    for (const c of result) {
      console.log(`${c.ts},${c.open},${c.high},${c.low},${c.close},${c.volume}`)
    }
  } else {
    console.log(JSON.stringify(result, null, 2))
  }

  process.exit(0)
}
