// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createConnector } from '../connector'
import type { OrderbookUpdate } from '@pairlens/market-engine/types'

export async function orderbook(args: {
  market: string
  pair: string
  country: string
  levels: number
  watch: boolean
}): Promise<void> {
  const manager = await createConnector(args.market, args.country)
  manager.setContext({ market: args.market, pair: args.pair })

  const printBook = (update: OrderbookUpdate) => {
    const bids = update.bids.slice(0, args.levels)
    const asks = update.asks.slice(0, args.levels)

    if (args.watch) {
      // Clear screen for live view
      process.stdout.write('\x1b[2J\x1b[H')
      console.log(`${args.pair} Order Book (${args.market.toUpperCase()})`)
      console.log('─'.repeat(50))
    }

    console.log('\nASKS (sells)')
    console.log(`${'Price'.padEnd(16)}${'Size'.padEnd(16)}`)
    for (const [price, size] of [...asks].reverse()) {
      console.log(
        `\x1b[31m${price.toFixed(2).padEnd(16)}\x1b[0m${size.toFixed(6).padEnd(16)}`,
      )
    }

    console.log(`${'─'.repeat(32)}`)

    console.log('BIDS (buys)')
    for (const [price, size] of bids) {
      console.log(
        `\x1b[32m${price.toFixed(2).padEnd(16)}\x1b[0m${size.toFixed(6).padEnd(16)}`,
      )
    }
  }

  if (!args.watch) {
    await new Promise<void>((resolve) => {
      manager.subscribe(
        'market-data:orderbook',
        { pair: args.pair },
        (data) => {
          const update = data as OrderbookUpdate
          if (update?.bids?.length) {
            printBook(update)
            resolve()
          }
        },
      )
    })
    process.exit(0)
  }

  // Watch mode
  manager.subscribe('market-data:orderbook', { pair: args.pair }, (data) => {
    const update = data as OrderbookUpdate
    if (update?.bids?.length) {
      printBook(update)
    }
  })

  process.on('SIGINT', () => {
    console.log('')
    process.exit(0)
  })
  await new Promise(() => {})
}
