#!/usr/bin/env bun
// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pairlens CLI — interact with markets from the command line.
 *
 * Usage:
 *   bun apps/cli/src/index.ts candles --market okx --pair BTC-USDT --timeframe 1h --limit 100
 *   bun apps/cli/src/index.ts ticker --market okx --pair BTC-USDT
 *   bun apps/cli/src/index.ts ticker --market okx --pair BTC-USDT --watch
 *   bun apps/cli/src/index.ts orderbook --market okx --pair BTC-USDT --levels 10
 *   bun apps/cli/src/index.ts signals --market okx --pair BTC-USDT --timeframe 1h
 *   bun apps/cli/src/index.ts order --market okx --pair BTC-USDT --side buy --size 0.001 --mode paper
 */

import { candles } from './commands/candles'
import { ticker } from './commands/ticker'
import { orderbook } from './commands/orderbook'
import { signals } from './commands/signals'
import { order } from './commands/order'
import { getAvailableMarkets } from './connector'

function parseArgs(argv: Array<string>): {
  command: string
  flags: Record<string, string>
} {
  const [command = 'help', ...rest] = argv
  const flags: Record<string, string> = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = 'true'
      }
    }
  }
  return { command, flags }
}

function flag(
  flags: Record<string, string>,
  key: string,
  fallback?: string,
): string {
  const val = flags[key]
  if (val === undefined) {
    if (fallback !== undefined) return fallback
    console.error(`Missing required flag: --${key}`)
    process.exit(1)
  }
  return val
}

const HELP = `
Pairlens CLI: interact with markets from the command line.

Commands:
  candles     Fetch historical OHLCV candles
  ticker      Get current price (or stream with --watch)
  orderbook   Get order book snapshot (or stream with --watch)
  signals     Compute trading signals from historical data
  order       Place a trade order
  markets     List available market connectors

Common flags:
  --market    Exchange (okx, binance, bybit)     [default: okx]
  --pair      Trading pair (e.g. BTC-USDT)       [required]
  --country   ISO country code (e.g. US, DE)     [default: ""]

Examples:
  bun apps/cli/src/index.ts candles --market okx --pair BTC-USDT --timeframe 1h --limit 100
  bun apps/cli/src/index.ts candles --market okx --pair BTC-USDT --format csv
  bun apps/cli/src/index.ts ticker --market okx --pair ETH-USDT --watch
  bun apps/cli/src/index.ts orderbook --market binance --pair BTC-USDT --levels 20
  bun apps/cli/src/index.ts signals --market okx --pair SOL-USDT --timeframe 4h
  bun apps/cli/src/index.ts order --market okx --pair BTC-USDT --side buy --size 0.001 --mode paper
`

async function main() {
  const { command, flags: f } = parseArgs(process.argv.slice(2))

  switch (command) {
    case 'candles':
      return candles({
        market: flag(f, 'market', 'okx'),
        pair: flag(f, 'pair'),
        timeframe: flag(f, 'timeframe', '1h'),
        limit: Number(flag(f, 'limit', '100')),
        country: flag(f, 'country', ''),
        format: flag(f, 'format', 'json') as 'json' | 'csv',
      })

    case 'ticker':
      return ticker({
        market: flag(f, 'market', 'okx'),
        pair: flag(f, 'pair'),
        country: flag(f, 'country', ''),
        watch: f['watch'] === 'true',
      })

    case 'orderbook':
      return orderbook({
        market: flag(f, 'market', 'okx'),
        pair: flag(f, 'pair'),
        country: flag(f, 'country', ''),
        levels: Number(flag(f, 'levels', '10')),
        watch: f['watch'] === 'true',
      })

    case 'signals':
      return signals({
        market: flag(f, 'market', 'okx'),
        pair: flag(f, 'pair'),
        timeframe: flag(f, 'timeframe', '1h'),
        country: flag(f, 'country', ''),
        lookback: Number(flag(f, 'lookback', '20')),
      })

    case 'order':
      return order({
        market: flag(f, 'market', 'okx'),
        pair: flag(f, 'pair'),
        side: flag(f, 'side') as 'buy' | 'sell',
        type: flag(f, 'type', 'market') as 'market' | 'limit',
        size: flag(f, 'size'),
        price: f['price'],
        mode: flag(f, 'mode', 'paper') as 'paper' | 'live',
        country: flag(f, 'country', ''),
        apiKey: flag(f, 'api-key', process.env.OKX_API_KEY ?? ''),
        apiSecret: flag(f, 'api-secret', process.env.OKX_API_SECRET ?? ''),
        passphrase: flag(f, 'passphrase', process.env.OKX_PASSPHRASE ?? ''),
      })

    case 'markets':
      console.log('Available markets:', getAvailableMarkets().join(', '))
      process.exit(0)
      break

    case 'help':
    case '--help':
    case '-h':
      console.log(HELP)
      process.exit(0)
      break

    default:
      console.error(`Unknown command: ${command}`)
      console.log(HELP)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
