// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The exchange host's construction-time decisions, driven against a recording
 * fake class: what lands in the ccxt constructor config, and what the venue's
 * capture/seed hooks are allowed to carry across the discard-and-rebuild
 * lifecycle.
 */

import { describe, expect, it } from 'bun:test'
import { CcxtExchangeHost } from '../exchange-host'
import type {
  CcxtExchangeCtor,
  CcxtExchangeLike,
  CcxtVenueConfig,
} from '../types'

function recordingVenue(overrides: Partial<CcxtVenueConfig> = {}): {
  venue: CcxtVenueConfig
  configs: Array<Record<string, unknown>>
  instances: Array<CcxtExchangeLike>
} {
  const configs: Array<Record<string, unknown>> = []
  const instances: Array<CcxtExchangeLike> = []
  class FakeExchange {
    id = 'fakex'
    has: Record<string, unknown> = {}
    timeframes: Record<string, string> = {}
    urls: Record<string, unknown> = { api: {} }
    options: Record<string, unknown> = {}
    fetchImplementation?: unknown
    constructor(config: Record<string, unknown>) {
      configs.push(config)
      instances.push(this as unknown as CcxtExchangeLike)
    }
    async close() {}
  }
  const venue: CcxtVenueConfig = {
    exchangeId: 'fakex',
    marketId: 'fakex',
    displayName: 'Fakex',
    credentialKeys: [
      { key: 'apiKey', required: true },
      { key: 'apiSecret', required: true },
    ],
    defaultMode: 'live',
    maxHistoryLimit: 100,
    loadExchangeClass: async () =>
      FakeExchange as unknown as CcxtExchangeCtor,
    ...overrides,
  }
  return { venue, configs, instances }
}

const CREDENTIALS = { apiKey: 'KEY-0123456789', secret: 'SECRET-0123456789' }

describe('public fetchCurrencies', () => {
  it('is disabled on a public instance — nothing reads exchange.currencies', async () => {
    const { venue, configs } = recordingVenue()
    const host = new CcxtExchangeHost({ venue })
    await host.acquire()
    expect(configs[0]?.['has']).toEqual({ fetchCurrencies: false })
    await host.destroy()
  })

  it('stays enabled on an authed instance', async () => {
    const { venue, configs } = recordingVenue()
    const host = new CcxtExchangeHost({ venue, credentials: CREDENTIALS })
    await host.acquire()
    expect(configs[0]?.['has']).toBeUndefined()
    await host.destroy()
  })

  it('stays enabled where the venue declares it load-bearing (Kraken)', async () => {
    const { venue, configs } = recordingVenue({ needsPublicCurrencies: true })
    const host = new CcxtExchangeHost({ venue })
    await host.acquire()
    expect(configs[0]?.['has']).toBeUndefined()
    await host.destroy()
  })
})

describe('ws cache caps', () => {
  it('bounds ccxt trade and OHLCV retention the bridge never reads', async () => {
    const { venue, configs } = recordingVenue()
    const host = new CcxtExchangeHost({ venue })
    await host.acquire()
    const options = configs[0]?.['options'] as Record<string, unknown>
    expect(options['tradesLimit']).toBe(200)
    expect(options['OHLCVLimit']).toBe(60)
    await host.destroy()
  })

  it('lets a venue override the caps through its own options', async () => {
    const { venue, configs } = recordingVenue({
      options: { options: { OHLCVLimit: 10 } },
    })
    const host = new CcxtExchangeHost({ venue })
    await host.acquire()
    const options = configs[0]?.['options'] as Record<string, unknown>
    expect(options['OHLCVLimit']).toBe(10)
    expect(options['tradesLimit']).toBe(200)
    await host.destroy()
  })
})

describe('capture and seed across rebuilds', () => {
  it('hands the venue-captured state to the next instance for the same country', async () => {
    const captured: Array<unknown> = []
    const seeded: Array<unknown> = []
    const { venue } = recordingVenue({
      captureOptions: (exchange) => {
        captured.push(exchange)
        return { token: 'bullet-1' }
      },
      seedOptions: (_exchange, value) => {
        seeded.push(value)
      },
    })
    const host = new CcxtExchangeHost({ venue })
    host.setCountry('DE')
    await host.acquire()
    await host.close()
    host.setCountry('DE')
    await host.acquire()
    expect(captured).toHaveLength(1)
    expect(seeded).toEqual([{ token: 'bullet-1' }])
    await host.destroy()
  })

  it('drops the capture when the country changed — endpoints move with it', async () => {
    const seeded: Array<unknown> = []
    const { venue } = recordingVenue({
      captureOptions: () => ({ token: 'bullet-1' }),
      seedOptions: (_exchange, value) => {
        seeded.push(value)
      },
    })
    const host = new CcxtExchangeHost({ venue })
    host.setCountry('DE')
    await host.acquire()
    await host.close()
    host.setCountry('US')
    await host.acquire()
    expect(seeded).toHaveLength(0)
    await host.destroy()
  })

  it('a throwing capture never breaks the close, and seeds nothing', async () => {
    const seeded: Array<unknown> = []
    const { venue } = recordingVenue({
      captureOptions: () => {
        throw new Error('capture broke')
      },
      seedOptions: (_exchange, value) => {
        seeded.push(value)
      },
    })
    const host = new CcxtExchangeHost({ venue })
    await host.acquire()
    await host.close()
    await host.acquire()
    expect(seeded).toHaveLength(0)
    await host.destroy()
  })
})
