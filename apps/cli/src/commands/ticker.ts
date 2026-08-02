// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createConnector } from '../connector'
import type { TickerUpdate } from '@pairlens/market-engine/types'

export async function ticker(args: {
  market: string
  pair: string
  country: string
  watch: boolean
}): Promise<void> {
  const manager = await createConnector(args.market, args.country)
  manager.setContext({ market: args.market, pair: args.pair })

  if (!args.watch) {
    // One-shot: subscribe, get first update, print, exit
    await new Promise<void>((resolve) => {
      manager.subscribe('market-data:ticker', { pair: args.pair }, (data) => {
        const update = data as TickerUpdate
        if (update?.ticker) {
          console.log(JSON.stringify(update.ticker, null, 2))
          resolve()
        }
      })
    })
    process.exit(0)
  }

  // Watch mode: stream ticker updates
  manager.subscribe('market-data:ticker', { pair: args.pair }, (data) => {
    const update = data as TickerUpdate
    if (update?.ticker) {
      const t = update.ticker
      process.stdout.write(
        `\r${args.pair} ${t.last.toFixed(2)} | bid ${t.bid.toFixed(2)} ask ${t.ask.toFixed(2)} | 24h ${t.change24h >= 0 ? '+' : ''}${t.change24h.toFixed(2)}%`,
      )
    }
  })

  // Keep alive until Ctrl+C
  process.on('SIGINT', () => {
    console.log('')
    process.exit(0)
  })
  await new Promise(() => {})
}
