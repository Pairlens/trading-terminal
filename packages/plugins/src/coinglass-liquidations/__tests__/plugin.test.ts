// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The capability surface: what the plugin claims, what it refuses, and the one
 * shape it is allowed to return.
 *
 * The refusal ORDER is asserted deliberately. A browser must be told it needs
 * the desktop app before anything touches the key or spends a paid request,
 * and an unknown venue must be answerable without a request at all — that is
 * what lets the pane say "no aggregate feed for this venue" for free.
 */
import { describe, expect, test } from 'bun:test'

import { isPlatformRestrictedError } from '@pairlens/market-engine/errors'
import { CoinglassApiError } from '../client'
import {
  clampWindowHours,
  coinglassLiquidationsManifest,
  createCoinglassLiquidationsPlugin,
  readMinLiquidationUsd,
} from '../index'
import { COINGLASS_RETENTION_MS, COINGLASS_VENUE_IDS } from '../venues'
import { ORDER_ROWS_MIXED, T0 } from './fixtures'
import type { CoinglassClient, CoinglassLiquidationOrder } from '../client'
import type {
  LiquidationClustersResponse,
  LiquidationsUnavailableResponse,
} from '@pairlens/shared/instrument-types'
import type { PluginContext } from '@pairlens/plugin-system/types'

const NOW = T0 + 3_600_000

const context: PluginContext = {
  pair: 'BTC-USDT-USDT',
  market: 'binance-futures',
  timeframe: '',
  mode: 'paper',
  country: 'ES',
}

type StubOptions = {
  exchanges?: Array<string>
  rows?: Array<CoinglassLiquidationOrder>
  onOrders?: () => never
  onExchanges?: () => never
}

function stubClient(options: StubOptions = {}): CoinglassClient {
  return {
    async exchangeNames() {
      options.onExchanges?.()
      return options.exchanges ?? ['Binance', 'Bybit', 'Kucoin']
    },
    async liquidationOrders() {
      options.onOrders?.()
      return options.rows ?? []
    },
    budget: () => ({ max: 300, used: 1 }),
  }
}

function makePlugin(
  options: {
    client?: CoinglassClient
    restBlocked?: boolean
  } = {},
) {
  return createCoinglassLiquidationsPlugin(coinglassLiquidationsManifest, {
    createClient: () => options.client ?? stubClient(),
    now: () => NOW,
    restBlocked: () => options.restBlocked ?? false,
  })
}

async function ready(options: Parameters<typeof makePlugin>[0] = {}) {
  const plugin = makePlugin(options)
  await plugin.initialize!({ apiKey: 'cg-key', minLiquidationUsd: 1_000 })
  return plugin
}

function ask(
  plugin: ReturnType<typeof makePlugin>,
  params: Record<string, unknown>,
) {
  return plugin.execute({
    capability: 'market-data:liquidations',
    params,
    context,
  })
}

describe('manifest', () => {
  test('claims exactly the four venues it can translate, never a wildcard', () => {
    const declaration = coinglassLiquidationsManifest.capabilities.find(
      (c) => c.id === 'market-data:liquidations',
    )
    expect(declaration).toBeDefined()
    expect(declaration!.markets).toEqual([...COINGLASS_VENUE_IDS])
    expect(declaration!.markets).not.toContain('*')
    expect(declaration!.markets).toContain('binance-futures')
    expect(declaration!.markets).toContain('bybit-futures')
  })

  test('sits behind the App Server collector where both answer', () => {
    // pairlens-intelligence declares priority 5 for the venues it collects.
    // Lower number wins, so this must be a larger number.
    const declaration = coinglassLiquidationsManifest.capabilities[0]
    expect(declaration.priority).toBeGreaterThan(5)
  })

  test('declares desktop-only and its family', () => {
    expect(coinglassLiquidationsManifest.metadata?.['requiresDesktop']).toBe(
      true,
    )
    expect(coinglassLiquidationsManifest.metadata?.['family']).toBe(
      'cex-futures',
    )
  })

  test('the API key is required config', () => {
    expect(coinglassLiquidationsManifest.config['apiKey']?.required).toBe(true)
    expect(coinglassLiquidationsManifest.config['apiKey']?.type).toBe('secret')
  })
})

describe('activation', () => {
  test('refuses to activate without a key', async () => {
    const plugin = makePlugin()
    await expect(plugin.initialize!({})).rejects.toThrow(
      /Coinglass API key required\. Add it in the plugin settings\./,
    )
    await expect(plugin.initialize!({ apiKey: '  ' })).rejects.toThrow()
  })

  test('activates with a key', async () => {
    const plugin = makePlugin()
    await expect(plugin.initialize!({ apiKey: 'cg' })).resolves.toBeUndefined()
  })
})

describe('refusals', () => {
  test('a browser is refused before the key or any request', async () => {
    const plugin = await ready({
      restBlocked: true,
      client: stubClient({
        onExchanges: () => {
          throw new Error('must not reach the network in a browser')
        },
      }),
    })
    let thrown: unknown
    try {
      await ask(plugin, { venue: 'binance-futures', pair: 'BTC-USDT-USDT' })
    } catch (e) {
      thrown = e
    }
    expect(isPlatformRestrictedError(thrown)).toBe(true)
  })

  test('an unknown venue is not_tracked, and costs no request', async () => {
    const plugin = await ready({
      client: stubClient({
        onExchanges: () => {
          throw new Error('must not probe for a venue we do not map')
        },
      }),
    })
    const answer = (await ask(plugin, {
      venue: 'okx',
      pair: 'BTC-USDT-USDT',
    })) as LiquidationsUnavailableResponse
    expect(answer.error).toBe('liquidations_unavailable')
    expect(answer.reason).toBe('not_tracked')
  })

  test('a spot pair key is not_tracked rather than coerced', async () => {
    const plugin = await ready()
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT',
    })) as LiquidationsUnavailableResponse
    expect(answer.reason).toBe('not_tracked')
  })

  test('a venue Coinglass itself does not list is not_tracked', async () => {
    const plugin = await ready({
      client: stubClient({ exchanges: ['Binance'] }),
    })
    const answer = (await ask(plugin, {
      venue: 'kraken-futures',
      pair: 'BTC-USD-USD',
    })) as LiquidationsUnavailableResponse
    expect(answer.reason).toBe('not_tracked')
  })

  test('a plan refusal is the typed refusal, not an empty-bucket success', async () => {
    const plugin = await ready({
      client: stubClient({
        onOrders: () => {
          throw new CoinglassApiError(
            'plan_required',
            'Your Coinglass plan does not include /api/futures/liquidation/order. Liquidation orders start at the Standard plan.',
          )
        },
      }),
    })
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
    })) as LiquidationClustersResponse | LiquidationsUnavailableResponse

    // The failure this pins: a plan refusal that comes back as a response with
    // zero buckets reads as "nothing was liquidated" on a contract that was
    // liquidated plenty.
    expect('error' in answer).toBe(true)
    expect('buckets' in answer).toBe(false)
    const refusal = answer as LiquidationsUnavailableResponse
    expect(refusal.error).toBe('liquidations_unavailable')
    expect(refusal.reason).toBe('plan_required')
    expect(refusal.fetchedAt).toBe(new Date(NOW).toISOString())
    // Not a venue claim: 'not_tracked' would send the reader looking at the
    // exchange instead of at their own key.
    expect(refusal.reason).not.toBe('not_tracked')
  })

  test('a rejected key is the same typed refusal as a wrong plan', async () => {
    // Both are "fix it in the Plugin Store", and the pane has one sentence for
    // that. The distinction survives in the thrown message, not on the wire.
    const plugin = await ready({
      client: stubClient({
        onExchanges: () => {
          throw new CoinglassApiError(
            'key_invalid',
            'Coinglass rejected the API key. Check it in the plugin settings.',
          )
        },
      }),
    })
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
    })) as LiquidationsUnavailableResponse
    expect(answer.reason).toBe('plan_required')
  })

  test('a missing key is the same typed refusal', async () => {
    const plugin = await ready({
      client: stubClient({
        onExchanges: () => {
          throw new CoinglassApiError(
            'key_missing',
            'Coinglass received no API key. Add one in the plugin settings.',
          )
        },
      }),
    })
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
    })) as LiquidationsUnavailableResponse
    expect(answer.reason).toBe('plan_required')
  })

  test('a credential refusal on either call maps the same way', async () => {
    // The probe and the prints call are separate requests and either can be
    // the one that refuses; the pane must not care which.
    for (const stage of ['exchanges', 'orders'] as const) {
      const raise = () => {
        throw new CoinglassApiError('plan_required', 'plan too low')
      }
      const plugin = await ready({
        client: stubClient(
          stage === 'exchanges' ? { onExchanges: raise } : { onOrders: raise },
        ),
      })
      const answer = (await ask(plugin, {
        venue: 'binance-futures',
        pair: 'BTC-USDT-USDT',
      })) as LiquidationsUnavailableResponse
      expect(answer.reason).toBe('plan_required')
    }
  })

  test('transient and self-inflicted refusals still throw', async () => {
    // A refusal that the SAME request would survive later must not become a
    // durable statement the pane keeps showing.
    for (const reason of ['rate_limited', 'bad_request', 'upstream'] as const) {
      const plugin = await ready({
        client: stubClient({
          onOrders: () => {
            throw new CoinglassApiError(reason, `refused: ${reason}`)
          },
        }),
      })
      let thrown: unknown
      try {
        await ask(plugin, { venue: 'binance-futures', pair: 'BTC-USDT-USDT' })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(CoinglassApiError)
      expect((thrown as CoinglassApiError).reason).toBe(reason)
    }
  })

  test('a non-Coinglass failure is never dressed up as a plan problem', async () => {
    const plugin = await ready({
      client: stubClient({
        onOrders: () => {
          throw new TypeError('undefined is not a function')
        },
      }),
    })
    await expect(
      ask(plugin, { venue: 'binance-futures', pair: 'BTC-USDT-USDT' }),
    ).rejects.toThrow(TypeError)
  })

  test('another capability is refused outright', async () => {
    const plugin = await ready()
    await expect(
      plugin.execute({
        capability: 'market-data:candles',
        params: {},
        context,
      }),
    ).rejects.toThrow(/unsupported capability/)
  })

  test('a missing venue or pair is a bad request, not a silent empty', async () => {
    const plugin = await ready()
    await expect(ask(plugin, { venue: 'binance-futures' })).rejects.toThrow(
      /venue and a pair/,
    )
  })
})

describe('clusters', () => {
  test('prints become a wire response the pane can draw', async () => {
    const plugin = await ready({
      client: stubClient({ rows: ORDER_ROWS_MIXED }),
    })
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
      hours: 24,
    })) as LiquidationClustersResponse

    expect(answer.venue).toBe('binance-futures')
    expect(answer.pairKey).toBe('BTC-USDT-USDT')
    expect(answer.resolutionMs).toBe(60_000)
    expect(answer.retentionMs).toBe(COINGLASS_RETENTION_MS)
    // Honest: nothing older than the retention floor exists to serve.
    expect(answer.trackedSince).toBe(NOW - COINGLASS_RETENTION_MS)
    expect(answer.bucketWidth).toBe(5)
    expect(answer.buckets).toHaveLength(5)
    expect(answer.fetchedAt).toBe(new Date(NOW).toISOString())
    // Binance's stream is sampled upstream and the read is thresholded, so a
    // 'complete' claim would be wrong twice over.
    expect(answer.completeness).toBe('sampled')
  })

  test('buckets arrive ordered by time then price', async () => {
    const plugin = await ready({
      client: stubClient({ rows: ORDER_ROWS_MIXED }),
    })
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
    })) as LiquidationClustersResponse
    const ordered = [...answer.buckets].sort(
      (a, b) => a.ts - b.ts || a.price - b.price,
    )
    expect(answer.buckets).toEqual(ordered)
  })

  test('an empty window is a real answer with no invented grid', async () => {
    const plugin = await ready({ client: stubClient({ rows: [] }) })
    const answer = (await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
    })) as LiquidationClustersResponse | LiquidationsUnavailableResponse
    // Nothing was liquidated is DATA. It must not come back as a refusal.
    expect('error' in answer).toBe(false)
    const clusters = answer as LiquidationClustersResponse
    expect(clusters.buckets).toEqual([])
    expect(clusters.bucketWidth).toBe(0)
  })

  test('the requested coin, not the pair, is what Coinglass is asked for', async () => {
    let seenSymbol = ''
    let seenExchange = ''
    const plugin = await ready({
      client: {
        ...stubClient(),
        async liquidationOrders(query) {
          seenSymbol = query.symbol
          seenExchange = query.exchange
          return []
        },
      },
    })
    await ask(plugin, { venue: 'bybit-futures', pair: 'ETH-USDT-USDT' })
    expect(seenSymbol).toBe('ETH')
    // The live spelling from exchange-list, not our table's guess.
    expect(seenExchange).toBe('Bybit')
  })

  test('the window never reaches past the 7-day retention', async () => {
    const windows: Array<[number, number]> = []
    const plugin = await ready({
      client: {
        ...stubClient(),
        async liquidationOrders(query) {
          windows.push([query.startTime, query.endTime])
          return []
        },
      },
    })
    // Ask for a year. The floor is retention, not the request.
    await ask(plugin, {
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
      hours: 24 * 365,
    })
    expect(windows[0][0]).toBe(NOW - COINGLASS_RETENTION_MS)
  })
})

describe('config parsing', () => {
  test('window hours clamp to what retention can serve', () => {
    expect(clampWindowHours(undefined)).toBe(24)
    expect(clampWindowHours('nonsense')).toBe(24)
    expect(clampWindowHours(0)).toBe(24)
    expect(clampWindowHours(1)).toBe(1)
    expect(clampWindowHours(72)).toBe(72)
    expect(clampWindowHours(10_000)).toBe(168)
  })

  test('the threshold falls back rather than becoming a negative filter', () => {
    expect(readMinLiquidationUsd(undefined)).toBe(1_000)
    expect(readMinLiquidationUsd(-5)).toBe(1_000)
    expect(readMinLiquidationUsd('nope')).toBe(1_000)
    expect(readMinLiquidationUsd(0)).toBe(0)
    expect(readMinLiquidationUsd(25_000)).toBe(25_000)
  })
})
