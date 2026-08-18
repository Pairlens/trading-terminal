// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `ccxt-futures-connector/listings` is a LEAF, and this test is what keeps it
 * one.
 *
 * The terminal's instrument index and its contract-size map want the cached
 * perp listings and nothing else, on the main bundle's critical path. Reaching
 * them through the connector barrel pulls the whole futures runtime in with
 * them — the CEX shell, the exchange host, the watch driver, the private
 * stream, ccxt's REST helpers — which is precisely the code a deployment that
 * excludes the `cex-futures` family ships none of, and which a bundler cannot
 * shake out of a module graph that statically references it.
 *
 * So the read side is its own module with its own package export, and its
 * transitive closure is asserted here rather than hoped for. If this fails, the
 * fix is to move whatever was added back into `futures-markets.ts` — not to
 * widen the ban list.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'bun:test'
import {
  CCXT_FUTURES_VENUE_IDS,
  futuresMarketsCacheKey,
  memoryFuturesMarketsStorage,
  readCachedFuturesListings,
} from '../listings'

const SRC = resolve(import.meta.dir, '..', '..')
const ENTRY = join(SRC, 'ccxt-futures-connector', 'listings.ts')

/**
 * Modules that carry the runtime. Each one is either a socket, a signed REST
 * client, or the plugin shell that hosts them.
 */
const BANNED = [
  'ccxt-connector/exchange-host',
  'ccxt-connector/watch-driver',
  'ccxt-connector/private-stream',
  'ccxt-connector/rest',
  'ccxt-connector/index',
  'cex-connector/index',
  'ccxt-futures-connector/index',
  'ccxt-futures-connector/futures-markets',
  'ccxt-futures-connector/futures-orders',
]

/** VALUE imports only — a `import type` line is erased and costs nothing. */
const VALUE_IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm

/** Extensionless specifier → the file it means, directory index included. */
function moduleFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (candidate.endsWith('.ts') && existsSync(candidate)) return candidate
  }
  return null
}

function closureOf(entry: string): Array<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(VALUE_IMPORT)) {
      const specifier = match[1]
      if (specifier === undefined || !specifier.startsWith('.')) continue
      const resolved = moduleFile(resolve(dirname(file), specifier))
      if (resolved) queue.push(resolved)
    }
  }
  return [...seen].map((file) => relative(SRC, file).replace(/\.ts$/, ''))
}

describe('listings module graph', () => {
  it('reaches no runtime module, so the family can be excluded wholesale', () => {
    const closure = closureOf(ENTRY)
    // Sanity: the walker actually walked something.
    expect(closure).toContain('ccxt-connector/markets')
    for (const banned of BANNED) {
      expect(closure).not.toContain(banned)
    }
  })

  it('is a real saving — the barrel pulls all of it', () => {
    // Without this the test above could pass against a broken walker forever.
    const barrel = closureOf(join(SRC, 'ccxt-futures-connector', 'index.ts'))
    expect(barrel).toContain('ccxt-connector/watch-driver')
    expect(barrel).toContain('ccxt-connector/private-stream')
    expect(barrel).toContain('cex-connector/index')
  })

  it('exports everything a read-only consumer needs', async () => {
    // The terminal imports exactly these; a missing one sends it back to the
    // barrel and undoes the split.
    const storage = memoryFuturesMarketsStorage()
    await storage.set(futuresMarketsCacheKey('kucoinfutures'), {
      savedAt: 1_700_000_000_000,
      markets: [
        {
          id: 'XBTUSDTM',
          symbol: 'BTC/USDT:USDT',
          base: 'BTC',
          quote: 'USDT',
          settle: 'USDT',
          type: 'swap',
          spot: false,
          swap: true,
          future: false,
          option: false,
          margin: false,
          index: false,
          contract: true,
          linear: true,
          inverse: false,
          active: true,
          contractSize: 0.001,
        },
      ],
    })

    const [table] = await readCachedFuturesListings(
      [{ exchangeId: 'kucoinfutures', marketId: 'kucoin-futures' }],
      storage,
    )
    expect(table?.venue).toBe('kucoin-futures')
    expect(table?.listings[0]).toMatchObject({
      symbol: 'BTC-USDT-USDT',
      contractSize: 0.001,
    })
    expect(CCXT_FUTURES_VENUE_IDS.map((v) => v.marketId)).toEqual([
      'binance-futures',
      'bybit-futures',
      'okx-futures',
      'kucoin-futures',
      'kraken-futures',
    ])
  })
})
