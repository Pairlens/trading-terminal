// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * E2E connector connectivity harness.
 *
 * Connects to each bundled exchange for real and asserts that live market data
 * actually flows AND conforms to the canonical contract (epoch-ms timestamps,
 * sane OHLC, non-crossed books). This is the high-confidence answer to "are we
 * getting data for all markets, formatted correctly?".
 *
 * It hits live exchange endpoints, so it is NOT part of `bun test` — run it
 * manually or on a schedule:
 *
 *   bun apps/cli/src/e2e-connectors.ts
 *   bun apps/cli/src/e2e-connectors.ts --markets okx,binance --pair ETH-USDT
 *   bun apps/cli/src/e2e-connectors.ts --timeout 30000
 *
 * Exits non-zero if any connector fails a check (suitable for nightly CI).
 */

import {
  validateCandle,
  validateOrderbookSide,
  validateTicker,
} from '@pairlens/market-engine/validation'
import { createConnector } from './connector'
import type {
  Candle,
  CandleUpdate,
  OrderbookUpdate,
  TickerUpdate,
} from '@pairlens/market-engine/types'

// ── Args ──
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const PAIR = arg('pair', 'BTC-USDT')
const TIMEFRAME = arg('timeframe', '1h')
const TIMEOUT = Number(arg('timeout', '20000'))
const COUNTRY = arg('country', '')
const MARKETS = arg('markets', 'okx,binance,bybit')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

type CheckResult = { name: string; ok: boolean; detail: string; ms: number }

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label}: timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ])
}

async function checkMarket(market: string): Promise<Array<CheckResult>> {
  const manager = await createConnector(market, COUNTRY)
  manager.setContext({ market, pair: PAIR, timeframe: TIMEFRAME })

  type CapabilityId = Parameters<typeof manager.subscribe>[0]

  /** Subscribe, resolve with the first update passing `pick`, then unsubscribe. */
  function firstUpdate<T>(
    capability: CapabilityId,
    pick: (data: unknown) => T | null,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let unsub: (() => void) | undefined
      try {
        unsub = manager.subscribe(capability, { pair: PAIR }, (data) => {
          const v = pick(data)
          if (v !== null) {
            unsub?.()
            resolve(v)
          }
        })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  const results: Array<CheckResult> = []
  const time = async (name: string, fn: () => Promise<string>) => {
    const start = performance.now()
    try {
      const detail = await fn()
      results.push({
        name,
        ok: true,
        detail,
        ms: Math.round(performance.now() - start),
      })
    } catch (err) {
      results.push({
        name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        ms: Math.round(performance.now() - start),
      })
    }
  }

  // ── Live candles ──
  await time('candles(ws)', async () => {
    const candles = await withTimeout(
      firstUpdate<Array<Candle>>('market-data:candles', (data) => {
        const u = data as CandleUpdate
        return u?.candles?.length ? u.candles : null
      }),
      TIMEOUT,
      'candles',
    )
    const bad = candles.map((c) => validateCandle(c)).find((r) => !r.ok)
    if (bad) throw new Error(`invalid candle: ${bad.errors[0]}`)
    return `${candles.length} candles, all valid`
  })

  // ── Live ticker ──
  await time('ticker(ws)', async () => {
    const ticker = await withTimeout(
      firstUpdate('market-data:ticker', (data) => {
        const u = data as TickerUpdate
        return u?.ticker ?? null
      }),
      TIMEOUT,
      'ticker',
    )
    const r = validateTicker(ticker)
    if (!r.ok) throw new Error(r.errors[0])
    return `last=${ticker.last} change24h=${ticker.change24h.toFixed(2)}%`
  })

  // ── Live orderbook ──
  await time('orderbook(ws)', async () => {
    const book = await withTimeout(
      firstUpdate('market-data:orderbook', (data) => {
        const u = data as OrderbookUpdate
        return u?.bids?.length && u?.asks?.length ? u : null
      }),
      TIMEOUT,
      'orderbook',
    )
    const rb = validateOrderbookSide(book.bids, 'bids')
    const ra = validateOrderbookSide(book.asks, 'asks')
    if (!rb.ok) throw new Error(rb.errors[0])
    if (!ra.ok) throw new Error(ra.errors[0])
    const topBid = book.bids[0][0]
    const topAsk = book.asks[0][0]
    if (topBid >= topAsk) {
      throw new Error(`crossed top of book: ${topBid} >= ${topAsk}`)
    }
    return `${book.bids.length}x${book.asks.length} levels, spread ok`
  })

  // ── REST history backfill ──
  await time('history(rest)', async () => {
    const candles = (await withTimeout(
      manager.execute('market-data:history', {
        pair: PAIR,
        timeframe: TIMEFRAME,
        limit: 100,
      }),
      TIMEOUT,
      'history',
    )) as Array<Candle>
    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error('empty history')
    }
    const bad = candles.map((c) => validateCandle(c)).find((r) => !r.ok)
    if (bad) throw new Error(`invalid candle: ${bad.errors[0]}`)
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].ts <= candles[i - 1].ts) {
        throw new Error(`non-monotonic ts at index ${i}`)
      }
    }
    return `${candles.length} candles, monotonic & valid`
  })

  return results
}

async function main() {
  console.log(
    `\nE2E connector check — pair=${PAIR} timeframe=${TIMEFRAME} timeout=${TIMEOUT}ms\n`,
  )
  let anyFail = false
  for (const market of MARKETS) {
    console.log(`▸ ${market}`)
    const results = await checkMarket(market)
    for (const r of results) {
      const status = r.ok ? '  ✓' : '  ✗'
      console.log(
        `${status} ${r.name.padEnd(16)} ${String(r.ms).padStart(6)}ms  ${r.detail}`,
      )
      if (!r.ok) anyFail = true
    }
    console.log('')
  }

  console.log(
    anyFail
      ? '✗ FAIL — one or more checks failed'
      : '✓ PASS — all connectors healthy',
  )
  process.exit(anyFail ? 1 : 0)
}

main().catch((err) => {
  console.error('e2e-connectors crashed:', err)
  process.exit(1)
})
