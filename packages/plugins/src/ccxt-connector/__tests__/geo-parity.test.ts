// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The whole geolocation surface of the ccxt fleet, pinned.
 *
 * The terminal asks the user where they trade from and then routes on the
 * answer: which venues refuse, which host serves their candles, which host
 * their orders are signed for. None of that fails loudly when it drifts — a
 * wrong REST base returns real data from the wrong legal entity, a missing
 * refusal returns a 451 the region dialog never sees, and a geo error caught
 * one frame too deep comes back as an ordinary order rejection. Two such bugs
 * shipped in the first week of the ccxt migration.
 *
 * So this file asserts the OUTPUTS rather than the implementations:
 *
 *  1. **Refusals** — for every venue × country, which capabilities throw, with
 *     which error class, name, cross-bundle sentinel and message.
 *  2. **Host routing** — `applyUrls`/`applyPaperUrls` driven against a fake
 *     exchange whose `urls` table is ccxt's real one, read back as the REST
 *     bases, sockets and hostname a request would actually use. Public,
 *     trading and paper instances are probed separately, because on OKX they
 *     do not agree.
 *  3. **Ordering** — `platformCheck` before `geoCheck`; `geoCheck` before slot
 *     resolution; `tradeGeoCheck` after it.
 *  4. **Synchrony** — a geo refusal out of `subscribe` is thrown, not
 *     rejected. The region dialog is raised from the `catch` around the
 *     synchronous call; a rejected promise arrives after the chart has already
 *     drawn its empty state.
 *
 * Every table row names its venue and country so a failure reads as
 * "bybit/DE" rather than "expected 'a' to be 'b'".
 *
 * The legacy comparison is `git show 481dc64b~1:packages/plugins/src/<venue>-
 * market-connector/regions.ts` — the native connectors these numbers came from.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  isGeoRestrictedError,
  isPlatformRestrictedError,
} from '@pairlens/market-engine/errors'

import { enableCcxtSandbox, withGeoClassification } from '../exchange-host'
import { binanceCcxtVenue } from '../venues/binance'
import { bitfinexCcxtVenue } from '../venues/bitfinex'
import { bitgetCcxtVenue } from '../venues/bitget'
import { bitvavoCcxtVenue } from '../venues/bitvavo'
import { bybitCcxtVenue } from '../venues/bybit'
import { coinbaseCcxtVenue } from '../venues/coinbase'
import { cryptocomCcxtVenue } from '../venues/cryptocom'
import { gateCcxtVenue } from '../venues/gate'
import { htxCcxtVenue } from '../venues/htx'
import { krakenCcxtVenue } from '../venues/kraken'
import { kucoinCcxtVenue } from '../venues/kucoin'
import { KUCOIN_US_ERROR } from '../venues/kucoin-regions'
import { mexcCcxtVenue } from '../venues/mexc'
import { okxCcxtVenue } from '../venues/okx'
import { upbitCcxtVenue } from '../venues/upbit'
import {
  bybitMarketConnectorManifest,
  createBybitMarketConnectorPlugin,
  createMexcMarketConnectorPlugin,
  createOkxMarketConnectorPlugin,
  mexcMarketConnectorManifest,
  okxMarketConnectorManifest,
} from '../../index'
import { AUTHED_CTX, AUTHED_PAPER_CTX, PUBLIC_CTX } from './url-context'
import type {
  CcxtExchangeLike,
  CcxtUrlContext,
  CcxtVenueConfig,
} from '../types'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const g = globalThis as { window?: unknown }
const hadWindow = 'window' in g
const originalWindow = g.window

afterEach(() => {
  if (hadWindow) g.window = originalWindow
  else delete g.window
})

/** A production browser build: no dev proxy, plain `fetch`, CORS applies. */
function asHostedBrowser(): void {
  g.window = {}
}

/** The Tauri webview: REST rides the Rust client, so nothing is CORS-gated. */
function asDesktop(): void {
  g.window = { __TAURI_INTERNALS__: {} }
}

/** bun/CLI — no document at all. The default for every test here. */
function asHeadless(): void {
  delete g.window
}

/**
 * Every country the terminal's setting can realistically hold that any venue
 * in the fleet treats differently, plus the unset value.
 *
 * `''` is not a placeholder: it is what the setting holds until the user picks,
 * and a venue that refuses it would refuse every fresh profile.
 */
const COUNTRIES = [
  'US',
  'GB',
  'UK',
  'CA',
  'CN',
  'HK',
  'DE',
  'ES',
  'SG',
  'ID',
  'TH',
  'KR',
  '',
] as const

type Country = (typeof COUNTRIES)[number]

const MARKET_DATA_CAPS = [
  'market-data:candles',
  'market-data:ticker',
  'market-data:orderbook',
  'market-data:trades',
  'market-data:history',
  'market-data:ticker-snapshot',
] as const

const TRADING_CAPS = ['trading:orders', 'trading:balances'] as const

// ---------------------------------------------------------------------------
// 1. Refusals
// ---------------------------------------------------------------------------

/**
 * Which countries each venue's `geoCheck` refuses, and how widely.
 *
 * `scope: 'all'` means every capability including trading (ByBit, Bitvavo);
 * `'market-data'` means the trading path is gated separately, after slot
 * resolution (MEXC). A venue absent from this table declares no `geoCheck` at
 * all, which is asserted too — the refusal set is closed.
 */
const GEO_GATES: Array<{
  name: string
  venue: CcxtVenueConfig
  exchange: string
  blocked: Array<Country>
  scope: 'all' | 'market-data'
}> = [
  {
    name: 'bybit',
    venue: bybitCcxtVenue,
    exchange: 'ByBit',
    blocked: ['US'],
    scope: 'all',
  },
  {
    name: 'bitvavo',
    venue: bitvavoCcxtVenue,
    exchange: 'Bitvavo',
    blocked: ['US'],
    scope: 'all',
  },
  {
    name: 'mexc',
    venue: mexcCcxtVenue,
    exchange: 'MEXC',
    // The native's seven, `UK` included — the country setting is free-text
    // and users type both spellings.
    blocked: ['US', 'GB', 'UK', 'CA', 'CN', 'HK', 'SG'],
    scope: 'market-data',
  },
]

/** Venues that gate nothing on country. Deliberate, and verified per venue. */
const NO_GEO_GATE: Array<[string, CcxtVenueConfig]> = [
  ['okx', okxCcxtVenue],
  ['binance', binanceCcxtVenue],
  // KuCoin refuses the US, but from the URL resolver and as a PLAIN Error —
  // see the dedicated block below.
  ['kucoin', kucoinCcxtVenue],
  ['upbit', upbitCcxtVenue],
  ['gate', gateCcxtVenue],
  ['bitget', bitgetCcxtVenue],
  ['coinbase', coinbaseCcxtVenue],
  ['cryptocom', cryptocomCcxtVenue],
  ['kraken', krakenCcxtVenue],
  ['htx', htxCcxtVenue],
  ['bitfinex', bitfinexCcxtVenue],
]

function refusal(
  venue: CcxtVenueConfig,
  country: string,
  capability: string,
): unknown {
  try {
    venue.geoCheck?.(country, capability)
  } catch (error) {
    return error
  }
  return undefined
}

describe('geo refusals', () => {
  for (const gate of GEO_GATES) {
    const caps =
      gate.scope === 'all'
        ? [...MARKET_DATA_CAPS, ...TRADING_CAPS]
        : MARKET_DATA_CAPS

    it(`${gate.name}: refuses exactly ${gate.blocked.join(', ') || '(nothing)'}`, () => {
      // One object per venue so a drift names the country that moved.
      const actual: Record<string, boolean> = {}
      for (const country of COUNTRIES) {
        actual[country || '(unset)'] =
          refusal(gate.venue, country, 'market-data:candles') !== undefined
      }
      const expected: Record<string, boolean> = {}
      for (const country of COUNTRIES) {
        expected[country || '(unset)'] = gate.blocked.includes(country)
      }
      expect(actual).toEqual(expected)
    })

    for (const country of gate.blocked) {
      it(`${gate.name}/${country}: every gated capability throws the typed error`, () => {
        for (const capability of caps) {
          const thrown = refusal(gate.venue, country, capability)
          expect(`${capability}:${thrown === undefined}`).toBe(
            `${capability}:false`,
          )
          expect(isGeoRestrictedError(thrown)).toBe(true)
          // The terminal's guards never use `instanceof` — a connector and the
          // terminal can hold different bundled copies of the error module —
          // so the NAME and the SENTINEL are the contract, not the class.
          expect((thrown as Error).name).toBe('GeoRestrictedError')
          expect(
            (thrown as { __geoRestricted?: boolean }).__geoRestricted,
          ).toBe(true)
          expect((thrown as { exchange?: string }).exchange).toBe(gate.exchange)
          expect((thrown as { region?: string }).region).toBe(country)
          expect((thrown as Error).message).toBe(
            `${gate.exchange} is not available in your region (${country})`,
          )
        }
      })

      it(`${gate.name}/${country}: refuses the lowercase spelling too`, () => {
        const thrown = refusal(
          gate.venue,
          country.toLowerCase(),
          'market-data:candles',
        )
        expect(isGeoRestrictedError(thrown)).toBe(true)
      })
    }

    if (gate.scope === 'market-data') {
      for (const country of gate.blocked) {
        it(`${gate.name}/${country}: leaves trading to the post-slot gate`, () => {
          // Native parity: gating trading here would refuse a user whose real
          // problem is that they have no credentials at all.
          for (const capability of TRADING_CAPS) {
            expect(refusal(gate.venue, country, capability)).toBeUndefined()
          }
        })
      }
    }
  }

  for (const [name, venue] of NO_GEO_GATE) {
    it(`${name}: declares no geoCheck — nothing is refused on country`, () => {
      expect(venue.geoCheck).toBeUndefined()
    })
  }

  it('mexc is the only venue with a post-slot trading gate', () => {
    const withTradeGate = [
      ...GEO_GATES.map((gate) => [gate.name, gate.venue] as const),
      ...NO_GEO_GATE,
    ]
      .filter(([, venue]) => venue.tradeGeoCheck !== undefined)
      .map(([name]) => name)
    expect(withTradeGate).toEqual(['mexc'])
  })

  for (const country of ['US', 'GB', 'CA', 'CN', 'HK', 'SG'] as const) {
    it(`mexc/${country}: tradeGeoCheck throws on the SLOT's country`, () => {
      let thrown: unknown
      try {
        mexcCcxtVenue.tradeGeoCheck?.({
          id: 'x',
          credentials: { apiKey: 'k', apiSecret: 's' },
          mode: 'live',
          country,
          privateWsClient: null,
          orderCallback: null,
          balanceCallback: null,
          currentPair: '',
        })
      } catch (error) {
        thrown = error
      }
      expect(isGeoRestrictedError(thrown)).toBe(true)
      expect((thrown as Error).message).toBe(
        `MEXC is not available in your region (${country})`,
      )
    })
  }

  it('mexc: tradeGeoCheck lets a served region through', () => {
    expect(() =>
      mexcCcxtVenue.tradeGeoCheck?.({
        id: 'x',
        credentials: { apiKey: 'k', apiSecret: 's' },
        mode: 'live',
        country: 'DE',
        privateWsClient: null,
        orderCallback: null,
        balanceCallback: null,
        currentPair: '',
      }),
    ).not.toThrow()
  })

  it('an unset country is never a refusal', () => {
    // A fresh profile has no country. Refusing it would take every venue
    // offline until the user visits settings.
    for (const gate of GEO_GATES) {
      expect(refusal(gate.venue, '', 'market-data:candles')).toBeUndefined()
    }
  })

  /**
   * KuCoin's US refusal is a plain Error, not a GeoRestrictedError, so the
   * terminal shows it as an ordinary connector failure rather than raising the
   * region dialog. That is the native's behavior verbatim
   * (`kucoin-market-connector/regions.ts:85`) and it is preserved on purpose:
   * changing it would change UI behavior that has nothing to do with the
   * migration. Pinned here so the inconsistency stays a decision.
   */
  describe('kucoin US refusal', () => {
    it('throws a plain Error from the URL resolver, not a typed geo error', () => {
      let thrown: unknown
      try {
        kucoinCcxtVenue.applyUrls?.(kucoinSeed(), 'US', PUBLIC_CTX)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(Error)
      expect((thrown as Error).message).toBe(KUCOIN_US_ERROR)
      expect(isGeoRestrictedError(thrown)).toBe(false)
    })

    it('refuses the authed instance the same way', () => {
      expect(() =>
        kucoinCcxtVenue.applyUrls?.(kucoinSeed(), 'US', AUTHED_CTX),
      ).toThrow(KUCOIN_US_ERROR)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Host routing
// ---------------------------------------------------------------------------

type FakeExchange = {
  urls: Record<string, unknown>
  hostname?: string
  isSandboxModeEnabled?: boolean
  options: Record<string, unknown>
  setSandboxMode?: (enabled: boolean) => void
}

/**
 * A stand-in exchange carrying ccxt's real `urls` table for one venue, plus
 * ccxt's real `setSandboxMode`.
 *
 * Reproducing `setSandboxMode` rather than stubbing it is what makes the paper
 * probes worth anything: the base implementation replaces the WHOLE `urls.api`
 * subtree with `urls.test`, which is precisely how a venue loses the regional
 * base `applyUrls` installed a moment earlier. `applyPaperUrls` exists to put
 * it back, and this is the only way to prove it does.
 */
function fake(urls: Record<string, unknown>, hostname?: string): FakeExchange {
  const exchange: FakeExchange = {
    urls,
    options: {},
    ...(hostname === undefined ? {} : { hostname }),
  }
  exchange.setSandboxMode = (enabled: boolean) => {
    if (!enabled) return
    if (!('test' in exchange.urls)) {
      throw new Error('sandbox not supported')
    }
    exchange.urls['apiBackup'] = exchange.urls['api']
    // ccxt assigns `clone(this.urls['test'])`, and eight venues in the fleet
    // declare the key with an `undefined` value — which is exactly the trap
    // `enableCcxtSandbox` verifies against.
    exchange.urls['api'] = structuredClone(exchange.urls['test'])
    exchange.isSandboxModeEnabled = true
  }
  return exchange
}

/** ccxt's `implodeHostname`, for the venues whose URLs are templated. */
function implode(url: unknown, hostname: string): string {
  return String(url ?? '').replaceAll('{hostname}', hostname)
}

type Probe = Record<string, string>

type Harness = {
  name: string
  venue: CcxtVenueConfig
  seed: () => FakeExchange
  read: (exchange: FakeExchange) => Probe
}

/**
 * Route one instance and read back where its requests would actually go.
 *
 * The `paper` leg runs the REAL `enableCcxtSandbox`, so a venue whose sandbox
 * silently blanks `urls.api` is caught here rather than at runtime.
 */
function route(harness: Harness, country: string, ctx: CcxtUrlContext): Probe {
  const exchange = harness.seed()
  harness.venue.applyUrls?.(
    exchange as unknown as CcxtExchangeLike,
    country,
    ctx,
  )
  if (!ctx.paper) return harness.read(exchange)
  const active = enableCcxtSandbox(exchange as unknown as CcxtExchangeLike)
  if (active) {
    harness.venue.applyPaperUrls?.(
      exchange as unknown as CcxtExchangeLike,
      country,
      ctx,
    )
  }
  return { ...harness.read(exchange), paperActive: String(active) }
}

// ── OKX ────────────────────────────────────────────────────────────────────

/**
 * `urls.api.rest` is a `{hostname}` template on the base class and
 * `urls.api.ws` a hardcoded literal on the Pro one; `urls.test` carries both
 * again, which is why the paper leg needs `applyPaperUrls` for BOTH.
 */
const OKX: Harness = {
  name: 'okx',
  venue: okxCcxtVenue,
  seed: () =>
    fake(
      {
        api: { rest: 'https://{hostname}' },
        test: {
          rest: 'https://{hostname}',
          ws: 'wss://wspap.okx.com:8443/ws/v5',
        },
      },
      'www.okx.com',
    ),
  read: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    const hostname = exchange.hostname ?? ''
    const ws = String(api['ws'] ?? '')
    return {
      rest: implode(api['rest'], hostname),
      hostname,
      // `getUrl()` appends the access suffix to `urls.api.ws` per subscribe.
      wsPublic: `${ws}/public`,
      wsBusiness: `${ws}/business`,
      wsPrivate: `${ws}/private`,
    }
  },
}

describe('okx host routing', () => {
  const CASES: Array<[Country, string, string, string]> = [
    // country, rest origin, ws host, hostname
    ['US', 'https://us.okx.com', 'wsus.okx.com', 'us.okx.com'],
    ['DE', 'https://eea.okx.com', 'wseea.okx.com', 'eea.okx.com'],
    ['ES', 'https://eea.okx.com', 'wseea.okx.com', 'eea.okx.com'],
    ['GB', 'https://www.okx.com', 'ws.okx.com', 'www.okx.com'],
    ['SG', 'https://www.okx.com', 'ws.okx.com', 'www.okx.com'],
    ['KR', 'https://www.okx.com', 'ws.okx.com', 'www.okx.com'],
    ['', 'https://www.okx.com', 'ws.okx.com', 'www.okx.com'],
  ]

  for (const [country, rest, wsHost, hostname] of CASES) {
    it(`okx/${country || '(unset)'}: public and trading both ride the regional entity off-browser`, () => {
      asHeadless()
      const expected = {
        rest,
        hostname,
        wsPublic: `wss://${wsHost}:8443/ws/v5/public`,
        wsBusiness: `wss://${wsHost}:8443/ws/v5/business`,
        wsPrivate: `wss://${wsHost}:8443/ws/v5/private`,
      }
      expect(route(OKX, country, PUBLIC_CTX)).toEqual(expected)
      expect(route(OKX, country, AUTHED_CTX)).toEqual(expected)
    })
  }

  /**
   * The regression this file was written for.
   *
   * `eea.okx.com` and `us.okx.com` send no `Access-Control-Allow-Origin`, so
   * the hosted web terminal reads PUBLIC data from the CORS-enabled global
   * host — three legal entities, one matching engine, byte-identical candles.
   * Orders are the opposite case: `www.okx.com` does not know an EEA key and
   * answers `50119 API key doesn't exist`, which reads as a bad credential
   * rather than as the wrong platform. The native never let trading fall back
   * (`resolveOkxUrls().restBase`), and neither does this.
   */
  describe('under CORS (the hosted web terminal)', () => {
    // country, trading origin, hostname, regional WS host
    const REGIONAL: Array<[Country, string, string, string]> = [
      ['DE', 'https://eea.okx.com', 'eea.okx.com', 'wseea.okx.com'],
      ['ES', 'https://eea.okx.com', 'eea.okx.com', 'wseea.okx.com'],
      ['US', 'https://us.okx.com', 'us.okx.com', 'wsus.okx.com'],
    ]

    for (const [country, origin, hostname, wsHost] of REGIONAL) {
      it(`okx/${country}: public reads fall back to the global host`, () => {
        asHostedBrowser()
        const probe = route(OKX, country, PUBLIC_CTX)
        expect(probe['rest']).toBe('https://www.okx.com')
        expect(probe['hostname']).toBe('www.okx.com')
      })

      it(`okx/${country}: ORDERS never fall back — they stay on ${origin}`, () => {
        asHostedBrowser()
        const probe = route(OKX, country, AUTHED_CTX)
        expect(probe['rest']).toBe(origin)
        expect(probe['hostname']).toBe(hostname)
      })

      it(`okx/${country}: the socket stays regional on both instances`, () => {
        asHostedBrowser()
        // WebSockets are exempt from CORS, so the fallback was never about
        // them — a regional socket is correct in every build.
        for (const ctx of [PUBLIC_CTX, AUTHED_CTX]) {
          expect(route(OKX, country, ctx)['wsPublic']).toBe(
            `wss://${wsHost}:8443/ws/v5/public`,
          )
        }
      })
    }

    it('okx/SG: a global-region user is unaffected either way', () => {
      asHostedBrowser()
      for (const ctx of [PUBLIC_CTX, AUTHED_CTX]) {
        expect(route(OKX, 'SG', ctx)['rest']).toBe('https://www.okx.com')
      }
    })

    it('okx: desktop keeps every instance regional', () => {
      asDesktop()
      for (const ctx of [PUBLIC_CTX, AUTHED_CTX]) {
        expect(route(OKX, 'ES', ctx)['rest']).toBe('https://eea.okx.com')
      }
    })
  })

  /**
   * `setSandboxMode` swaps `urls.api` for `urls.test` — the GLOBAL demo socket
   * and a bare `{hostname}` REST template — so a paper instance loses both
   * halves of `applyUrls`. Demo keys are regional (an EEA key does not exist on
   * `wspap`, error 60032), so both have to come back.
   */
  describe('paper (demo trading)', () => {
    const PAPER_CASES: Array<[Country, string, string]> = [
      ['US', 'https://us.okx.com', 'wss://wsuspap.okx.com:8443/ws/v5'],
      ['DE', 'https://eea.okx.com', 'wss://wseeapap.okx.com:8443/ws/v5'],
      ['ES', 'https://eea.okx.com', 'wss://wseeapap.okx.com:8443/ws/v5'],
      ['SG', 'https://www.okx.com', 'wss://wspap.okx.com:8443/ws/v5'],
      ['', 'https://www.okx.com', 'wss://wspap.okx.com:8443/ws/v5'],
    ]

    for (const [country, rest, ws] of PAPER_CASES) {
      it(`okx/${country || '(unset)'}: demo REST and socket are both regional`, () => {
        asHeadless()
        const probe = route(OKX, country, AUTHED_PAPER_CTX)
        expect(probe['paperActive']).toBe('true')
        expect(probe['rest']).toBe(rest)
        expect(probe['wsPrivate']).toBe(`${ws}/private`)
      })
    }

    it('okx/ES: a demo instance in the browser keeps the regional REST base', () => {
      // Trading, so no CORS fallback — the same rule as live.
      asHostedBrowser()
      expect(route(OKX, 'ES', AUTHED_PAPER_CTX)['rest']).toBe(
        'https://eea.okx.com',
      )
    })
  })

  /**
   * The account-entity override (parity with 53cf500a). An OKX key exists on
   * exactly ONE regional entity — the one the account was registered with —
   * and the user's country is only a guess at it. A credential that declares
   * its home entity routes there regardless of where the user is trading
   * from; '' or absent keeps the by-country guess.
   */
  describe('account entity outranks country', () => {
    const ENTITY_CASES: Array<[string, Country, string, string]> = [
      // entity, country, rest origin, ws host
      ['eea', 'KR', 'https://eea.okx.com', 'wseea.okx.com'],
      ['eea', '', 'https://eea.okx.com', 'wseea.okx.com'],
      ['us', 'ES', 'https://us.okx.com', 'wsus.okx.com'],
      ['global', 'ES', 'https://www.okx.com', 'ws.okx.com'],
      ['', 'ES', 'https://eea.okx.com', 'wseea.okx.com'],
    ]

    for (const [entity, country, rest, wsHost] of ENTITY_CASES) {
      it(`okx entity=${entity || '(auto)'} country=${country || '(unset)'}: authed calls ride the account's entity`, () => {
        asHeadless()
        const probe = route(OKX, country, { ...AUTHED_CTX, entity })
        expect(probe['rest']).toBe(rest)
        expect(probe['wsPrivate']).toBe(`wss://${wsHost}:8443/ws/v5/private`)
      })
    }

    it('okx entity=eea: the demo socket is the ENTITY region, not the country', () => {
      // The scenario the authenticated demo E2E hit: an EEA demo key, a user
      // whose country setting says something else, and a global `wspap`
      // socket that answers 60032.
      asHeadless()
      const probe = route(OKX, 'KR', { ...AUTHED_PAPER_CTX, entity: 'eea' })
      expect(probe['paperActive']).toBe('true')
      expect(probe['rest']).toBe('https://eea.okx.com')
      expect(probe['wsPrivate']).toBe('wss://wseeapap.okx.com:8443/ws/v5/private')
    })

    it('okx entity=eea: no CORS fallback for an authed browser instance', () => {
      asHostedBrowser()
      const probe = route(OKX, 'KR', { ...AUTHED_CTX, entity: 'eea' })
      expect(probe['rest']).toBe('https://eea.okx.com')
    })
  })
})

// ── ByBit ──────────────────────────────────────────────────────────────────

const BYBIT: Harness = {
  name: 'bybit',
  venue: bybitCcxtVenue,
  seed: () =>
    fake(
      {
        api: {
          public: 'https://api.{hostname}',
          private: 'https://api.{hostname}',
          spot: 'https://api.{hostname}',
          ws: {
            public: { spot: 'wss://stream.{hostname}/v5/public/spot' },
            private: {
              spot: { unified: 'wss://stream.{hostname}/v5/private' },
            },
          },
        },
        test: {
          public: 'https://api-testnet.{hostname}',
          private: 'https://api-testnet.{hostname}',
          spot: 'https://api-testnet.{hostname}',
          ws: {
            public: { spot: 'wss://stream-testnet.{hostname}/v5/public/spot' },
            private: {
              spot: { unified: 'wss://stream-testnet.{hostname}/v5/private' },
            },
          },
        },
      },
      'bybit.com',
    ),
  read: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    const ws = api['ws'] as Record<string, Record<string, unknown>>
    const hostname = exchange.hostname ?? ''
    const priv = ws['private']?.['spot'] as Record<string, unknown>
    return {
      hostname,
      publicRest: implode(api['public'], hostname),
      tradingRest: implode(api['private'], hostname),
      wsPublic: implode(ws['public']?.['spot'], hostname),
      wsPrivate: implode(priv?.['unified'], hostname),
    }
  },
}

describe('bybit host routing', () => {
  const CASES: Array<[Country, string]> = [
    ['DE', 'bybit.nl'],
    ['ES', 'bybit.nl'],
    ['SG', 'bybit.com'],
    ['GB', 'bybit.com'],
    ['CA', 'bybit.com'],
    ['KR', 'bybit.com'],
    ['ID', 'bybit.com'],
    ['TH', 'bybit.com'],
    ['', 'bybit.com'],
  ]

  for (const [country, host] of CASES) {
    it(`bybit/${country || '(unset)'}: one hostname moves REST and both sockets`, () => {
      asHeadless()
      const expected = {
        hostname: host,
        publicRest: `https://api.${host}`,
        tradingRest: `https://api.${host}`,
        wsPublic: `wss://stream.${host}/v5/public/spot`,
        wsPrivate: `wss://stream.${host}/v5/private`,
      }
      expect(route(BYBIT, country, PUBLIC_CTX)).toEqual(expected)
      expect(route(BYBIT, country, AUTHED_CTX)).toEqual(expected)
    })
  }

  it('bybit/US: falls back to the global host rather than leaving urls half-built', () => {
    // `geoCheck` has already refused by the time anything reaches an instance;
    // blank URLs would turn that typed refusal into an opaque request failure.
    asHeadless()
    expect(route(BYBIT, 'US', PUBLIC_CTX)['hostname']).toBe('bybit.com')
  })

  it('bybit: the testnet is one global environment, not a regional pair', () => {
    // Native parity: `resolveBybitTestnetUrls()` takes no country at all.
    // Left to the hostname template an EU paper slot lands on
    // `api-testnet.bybit.nl`, which answers but is not where the native's
    // testnet keys live.
    asHeadless()
    for (const country of ['DE', 'ES', 'SG', ''] as const) {
      const probe = route(BYBIT, country, AUTHED_PAPER_CTX)
      expect(`${country || '(unset)'}:${probe['tradingRest']}`).toBe(
        `${country || '(unset)'}:https://api-testnet.bybit.com`,
      )
      expect(probe['wsPrivate']).toBe(
        'wss://stream-testnet.bybit.com/v5/private',
      )
      expect(probe['paperActive']).toBe('true')
    }
  })
})

// ── Binance ────────────────────────────────────────────────────────────────

const BINANCE: Harness = {
  name: 'binance',
  venue: binanceCcxtVenue,
  seed: () =>
    fake({
      api: {
        public: 'https://api.binance.com/api/v3',
        private: 'https://api.binance.com/api/v3',
        v1: 'https://api.binance.com/api/v1',
        sapi: 'https://api.binance.com/sapi/v1',
        ws: {
          spot: 'wss://stream.binance.com:9443/ws',
          margin: 'wss://stream.binance.com:9443/ws',
        },
      },
      test: {
        public: 'https://testnet.binance.vision/api/v3',
        private: 'https://testnet.binance.vision/api/v3',
        v1: 'https://testnet.binance.vision/api/v1',
        ws: {
          spot: 'wss://stream.testnet.binance.vision/ws',
          margin: 'wss://stream.testnet.binance.vision/ws',
        },
      },
    }),
  read: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    const ws = api['ws'] as Record<string, unknown>
    return {
      publicRest: String(api['public']),
      tradingRest: String(api['private']),
      wsSpot: String(ws['spot']),
    }
  },
}

describe('binance host routing', () => {
  it('binance/US: market data AND trading route to binance.us', () => {
    asHeadless()
    const expected = {
      publicRest: 'https://api.binance.us/api/v3',
      tradingRest: 'https://api.binance.us/api/v3',
      // 9443, not 443: `stream.binance.us` has nothing listening on 443
      // (immediate TCP refusal, measured 2026-08-11). `.com` keeps 443, which
      // is the firewall-safe port the fleet standardised on.
      wsSpot: 'wss://stream.binance.us:9443/ws',
    }
    expect(route(BINANCE, 'US', PUBLIC_CTX)).toEqual(expected)
    expect(route(BINANCE, 'US', AUTHED_CTX)).toEqual(expected)
  })

  for (const country of ['DE', 'ES', 'GB', 'CA', 'SG', 'KR', ''] as const) {
    it(`binance/${country || '(unset)'}: stays on the global host and port 443`, () => {
      asHeadless()
      const expected = {
        publicRest: 'https://api.binance.com/api/v3',
        tradingRest: 'https://api.binance.com/api/v3',
        wsSpot: 'wss://stream.binance.com/ws',
      }
      expect(route(BINANCE, country, PUBLIC_CTX)).toEqual(expected)
      expect(route(BINANCE, country, AUTHED_CTX)).toEqual(expected)
    })
  }

  it('binance: the testnet is region-free, US included', () => {
    // `resolveBinanceTradingUrls(country, paper)` ignores the country when
    // paper; ccxt's test table carries no `{hostname}`, so it cannot inherit
    // the split either. Both agree, and this proves it.
    asHeadless()
    for (const country of ['US', 'DE', ''] as const) {
      const probe = route(BINANCE, country, AUTHED_PAPER_CTX)
      expect(`${country || '(unset)'}:${probe['tradingRest']}`).toBe(
        `${country || '(unset)'}:https://testnet.binance.vision/api/v3`,
      )
      expect(probe['wsSpot']).toBe('wss://stream.testnet.binance.vision/ws')
    }
  })
})

// ── KuCoin ─────────────────────────────────────────────────────────────────

function kucoinSeed(): CcxtExchangeLike {
  return fake({
    api: {
      public: 'https://api.kucoin.com',
      private: 'https://api.kucoin.com',
      uta: 'https://api.kucoin.com',
      utaPrivate: 'https://api.kucoin.com',
      earn: 'https://api.kucoin.com',
    },
  }) as unknown as CcxtExchangeLike
}

const KUCOIN: Harness = {
  name: 'kucoin',
  venue: kucoinCcxtVenue,
  seed: () => kucoinSeed() as unknown as FakeExchange,
  read: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    return {
      publicRest: String(api['public']),
      utaRest: String(api['uta']),
      tradingRest: String(api['private']),
      utaTradingRest: String(api['utaPrivate']),
      earnRest: String(api['earn']),
    }
  },
}

describe('kucoin host routing', () => {
  /**
   * KuCoin is the one venue that splits public from authed on the SAME
   * instance: `api.kucoin.eu` answers null for a lot of market-data fields, so
   * reads stay global while MiCA moves the signed endpoints. The split is by
   * url KEY, which means it has to hold on the authed instance too — that is
   * the instance whose orders it governs.
   */
  const CASES: Array<[Country, string]> = [
    ['DE', 'https://api.kucoin.eu'],
    ['ES', 'https://api.kucoin.eu'],
    ['GB', 'https://api.kucoin.com'],
    ['SG', 'https://api.kucoin.com'],
    ['CA', 'https://api.kucoin.com'],
    ['KR', 'https://api.kucoin.com'],
    ['', 'https://api.kucoin.com'],
  ]

  for (const [country, trading] of CASES) {
    it(`kucoin/${country || '(unset)'}: reads global, signs ${trading}`, () => {
      asHeadless()
      const expected = {
        publicRest: 'https://api.kucoin.com',
        utaRest: 'https://api.kucoin.com',
        tradingRest: trading,
        utaTradingRest: trading,
        earnRest: trading,
      }
      // Both instances carry the same table — the authed one is the point.
      expect(route(KUCOIN, country, PUBLIC_CTX)).toEqual(expected)
      expect(route(KUCOIN, country, AUTHED_CTX)).toEqual(expected)
    })
  }
})

// ── MEXC ───────────────────────────────────────────────────────────────────

const MEXC: Harness = {
  name: 'mexc',
  venue: mexcCcxtVenue,
  seed: () =>
    fake({
      api: {
        spot: { public: '', private: '' },
        ws: { spot: '' },
      },
    }),
  read: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    const spot = api['spot'] as Record<string, unknown>
    const ws = api['ws'] as Record<string, unknown>
    return {
      publicRest: String(spot['public']),
      tradingRest: String(spot['private']),
      wsSpot: String(ws['spot']),
    }
  },
}

describe('mexc host routing', () => {
  for (const country of ['DE', 'ES', 'KR', 'ID', 'TH', ''] as const) {
    it(`mexc/${country || '(unset)'}: single global host, both instances`, () => {
      asHeadless()
      const expected = {
        publicRest: 'https://api.mexc.com',
        tradingRest: 'https://api.mexc.com',
        wsSpot: 'wss://wbs-api.mexc.com/ws',
      }
      expect(route(MEXC, country, PUBLIC_CTX)).toEqual(expected)
      expect(route(MEXC, country, AUTHED_CTX)).toEqual(expected)
    })
  }

  for (const country of ['US', 'GB', 'UK', 'CA', 'CN', 'HK', 'SG'] as const) {
    it(`mexc/${country}: refuses to build an instance at all`, () => {
      asHeadless()
      // Belt to `geoCheck`'s braces: even a path that skipped the capability
      // gate cannot end up with a working instance in a blocked region.
      expect(() => route(MEXC, country, PUBLIC_CTX)).toThrow(
        `MEXC is not available in your region (${country})`,
      )
      expect(() => route(MEXC, country, AUTHED_CTX)).toThrow(
        `MEXC is not available in your region (${country})`,
      )
    })
  }
})

// ── Upbit ──────────────────────────────────────────────────────────────────

const UPBIT: Harness = {
  name: 'upbit',
  venue: upbitCcxtVenue,
  seed: () =>
    fake(
      {
        api: {
          public: 'https://{hostname}',
          private: 'https://{hostname}',
          ws: 'wss://{hostname}/websocket/v1',
        },
      },
      // ccxt's default is the KOREAN exchange — a fourth market entirely.
      'api.upbit.com',
    ),
  read: (exchange) => {
    const api = exchange.urls['api'] as Record<string, unknown>
    const hostname = exchange.hostname ?? ''
    return {
      hostname,
      publicRest: implode(api['public'], hostname),
      tradingRest: implode(api['private'], hostname),
      ws: implode(api['ws'], hostname),
    }
  },
}

describe('upbit host routing', () => {
  const CASES: Array<[Country, string]> = [
    ['ID', 'id-api.upbit.com'],
    ['TH', 'th-api.upbit.com'],
    ['SG', 'sg-api.upbit.com'],
    // Upbit Global does not serve Korea from these hosts; KR falls to the
    // Singapore default rather than to ccxt's `api.upbit.com`, which is the
    // Korean exchange with KRW pairs a Pairlens user has never seen.
    ['KR', 'sg-api.upbit.com'],
    ['DE', 'sg-api.upbit.com'],
    ['US', 'sg-api.upbit.com'],
    ['', 'sg-api.upbit.com'],
  ]

  for (const [country, host] of CASES) {
    it(`upbit/${country || '(unset)'}: hostname moves REST and the socket together`, () => {
      asHeadless()
      const expected = {
        hostname: host,
        publicRest: `https://${host}`,
        tradingRest: `https://${host}`,
        ws: `wss://${host}/websocket/v1`,
      }
      expect(route(UPBIT, country, PUBLIC_CTX)).toEqual(expected)
      expect(route(UPBIT, country, AUTHED_CTX)).toEqual(expected)
    })
  }

  it('upbit: never falls back to ccxt default, the Korean exchange', () => {
    asHeadless()
    for (const country of COUNTRIES) {
      expect(
        `${country || '(unset)'}:${route(UPBIT, country, PUBLIC_CTX)['hostname']}`,
      ).not.toBe(`${country || '(unset)'}:api.upbit.com`)
    }
  })
})

// ── The country-free seven ─────────────────────────────────────────────────

describe('country-agnostic venues', () => {
  /**
   * These venues have one global API and the native connectors' `regions.ts`
   * say so in as many words. Rather than probe every country, the pin is
   * structural: their URL hook cannot read a country because it does not
   * accept one, and Kraken and HTX declare no hook at all.
   *
   * A future regional split therefore has to change this list, which is the
   * point — a silently-added `country` parameter is exactly how a venue starts
   * routing on a value nobody reviewed.
   */
  const COUNTRY_FREE: Array<[string, CcxtVenueConfig]> = [
    ['gate', gateCcxtVenue],
    ['bitget', bitgetCcxtVenue],
    ['coinbase', coinbaseCcxtVenue],
    ['cryptocom', cryptocomCcxtVenue],
    ['bitfinex', bitfinexCcxtVenue],
  ]

  for (const [name, venue] of COUNTRY_FREE) {
    it(`${name}: applyUrls takes no country argument`, () => {
      expect(`${name}:${venue.applyUrls?.length}`).toBe(`${name}:1`)
      expect(venue.geoCheck).toBeUndefined()
      expect(venue.tradeGeoCheck).toBeUndefined()
    })
  }

  for (const [name, venue] of [
    ['kraken', krakenCcxtVenue],
    ['htx', htxCcxtVenue],
  ] as Array<[string, CcxtVenueConfig]>) {
    it(`${name}: declares no URL hook at all — ccxt's single global host stands`, () => {
      expect(`${name}:${venue.applyUrls}`).toBe(`${name}:undefined`)
      expect(venue.geoCheck).toBeUndefined()
      expect(venue.tradeGeoCheck).toBeUndefined()
    })
  }

  it('every venue that reads a country is accounted for', () => {
    const regional = [
      ['okx', okxCcxtVenue],
      ['binance', binanceCcxtVenue],
      ['bybit', bybitCcxtVenue],
      ['bitvavo', bitvavoCcxtVenue],
      ['mexc', mexcCcxtVenue],
      ['kucoin', kucoinCcxtVenue],
      ['upbit', upbitCcxtVenue],
      ...COUNTRY_FREE,
      ['kraken', krakenCcxtVenue],
      ['htx', htxCcxtVenue],
    ] as Array<[string, CcxtVenueConfig]>
    const readsCountry = regional
      .filter(([, venue]) => (venue.applyUrls?.length ?? 0) >= 2)
      .map(([name]) => name)
      .sort()
    // Bitvavo is absent on purpose: it refuses the US outright and has one
    // global host, so there is nothing to route.
    expect(readsCountry).toEqual([
      'binance',
      'bybit',
      'kucoin',
      'mexc',
      'okx',
      'upbit',
    ])
  })
})

// ---------------------------------------------------------------------------
// 3 + 4. Ordering and synchrony, through the real plugin shell
// ---------------------------------------------------------------------------

function subscribeParams(
  market: string,
  country: string,
  capability: PluginExecuteParams['capability'] = 'market-data:candles',
): PluginExecuteParams {
  return {
    capability,
    params: { pair: 'BTC-USDT', timeframe: '15m' },
    context: {
      pair: 'BTC-USDT',
      market,
      timeframe: '15m',
      mode: 'paper' as const,
      country,
    },
  }
}

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('refusal ordering and synchrony', () => {
  let plugins: Array<PluginInstance> = []

  afterEach(async () => {
    await Promise.all(plugins.map((plugin) => plugin.destroy?.()))
    plugins = []
  })

  function bybit(): PluginInstance {
    const plugin = createBybitMarketConnectorPlugin(
      bybitMarketConnectorManifest,
    )
    plugins.push(plugin)
    return plugin
  }

  function mexc(): PluginInstance {
    const plugin = createMexcMarketConnectorPlugin(mexcMarketConnectorManifest)
    plugins.push(plugin)
    return plugin
  }

  /**
   * The terminal raises its region dialog from the `catch` around the
   * synchronous `subscribe()` call. A refusal that arrives as a rejected
   * promise — from inside a watch loop, say — lands after the chart has drawn
   * its empty state and is never classified at all.
   */
  it('bybit/US: subscribe throws SYNCHRONOUSLY, it does not return a rejected promise', () => {
    asHeadless()
    const plugin = bybit()
    let returned: unknown = 'not reached'
    const thrown = caught(() => {
      returned = plugin.subscribe?.(subscribeParams('bybit', 'US'), () => {})
    })
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect(returned).toBe('not reached')
  })

  for (const capability of [
    'market-data:candles',
    'market-data:ticker',
    'market-data:orderbook',
    'market-data:trades',
  ] as const) {
    it(`bybit/US: ${capability} refuses on subscribe`, () => {
      asHeadless()
      const thrown = caught(() =>
        bybit().subscribe?.(
          subscribeParams('bybit', 'US', capability),
          () => {},
        ),
      )
      expect(isGeoRestrictedError(thrown)).toBe(true)
    })
  }

  it('bybit/DE: subscribe is allowed through and returns a release function', () => {
    asHeadless()
    const release = bybit().subscribe?.(
      subscribeParams('bybit', 'DE'),
      () => {},
    )
    expect(typeof release).toBe('function')
    release?.()
  })

  it('mexc/US: subscribe throws synchronously on desktop too', () => {
    // On desktop the platform gate does not fire, so this isolates the geo one.
    asDesktop()
    const thrown = caught(() =>
      mexc().subscribe?.(subscribeParams('mexc', 'US'), () => {}),
    )
    expect(isGeoRestrictedError(thrown)).toBe(true)
  })

  it('mexc/US: in a browser the PLATFORM refusal wins — it is checked first', () => {
    // Parity item 18. Both gates would fire; the platform one is the accurate
    // message (the venue is unreachable from this build regardless of region)
    // and it is what routes the user to the desktop download.
    asHostedBrowser()
    const thrown = caught(() =>
      mexc().subscribe?.(subscribeParams('mexc', 'US'), () => {}),
    )
    expect(isPlatformRestrictedError(thrown)).toBe(true)
    expect(isGeoRestrictedError(thrown)).toBe(false)
  })

  it('okx/ES: nothing refuses OKX, in a browser or anywhere else', () => {
    // OKX is the venue the CORS work was done FOR: its regional hosts are
    // unreachable from a browser, and the answer was a public fallback, not a
    // desktop gate. A `requiresDesktop` or a geo gate creeping onto OKX would
    // take the original bug report's venue offline instead of fixing it.
    asHostedBrowser()
    const plugin = createOkxMarketConnectorPlugin(okxMarketConnectorManifest)
    plugins.push(plugin)
    expect(
      caught(() =>
        plugin.subscribe?.(subscribeParams('okx', 'ES'), () => {})?.(),
      ),
    ).toBeUndefined()
  })

  /**
   * Parity item 20, and the reason `tradeGeoCheck` exists as a separate hook.
   *
   * A user in a blocked region with no credentials has two problems, and the
   * one they can act on is the credentials. Reporting the geo block first
   * sends them to a region dialog that cannot help.
   */
  it('mexc/US: no credentials reports credentials, not the region', async () => {
    asDesktop()
    const plugin = mexc()
    const result = (await plugin.execute?.({
      capability: 'trading:orders',
      params: { action: 'place', pair: 'BTC-USDT', side: 'buy', size: '0.001' },
      context: {
        pair: 'BTC-USDT',
        market: 'mexc',
        timeframe: '15m',
        mode: 'live' as const,
        country: 'US',
      },
    })) as { success: boolean; error: string }
    expect(result).toEqual({
      success: false,
      error: 'No credentials configured',
    })
  })

  it('mexc/US: with credentials, the trading gate throws the typed geo error', async () => {
    asDesktop()
    const plugin = mexc()
    await plugin.initialize?.({
      apiKey: 'k',
      apiSecret: 's',
      country: 'US',
      mode: 'live',
    })
    let thrown: unknown
    try {
      await plugin.execute?.({
        capability: 'trading:orders',
        params: {
          action: 'place',
          pair: 'BTC-USDT',
          side: 'buy',
          size: '0.001',
        },
        context: {
          pair: 'BTC-USDT',
          market: 'mexc',
          timeframe: '15m',
          mode: 'live' as const,
          // The APP country is served; the SLOT's is not. The slot's is the
          // one that governs where an order goes.
          country: 'DE',
        },
      })
    } catch (error) {
      thrown = error
    }
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as Error).message).toBe(
      'MEXC is not available in your region (US)',
    )
  })

  it('mexc/DE: a served slot falls through the gate into the venue call', async () => {
    // Headless, not `asDesktop`: `restFetch` only re-routes through the Tauri
    // HTTP plugin when it sees a Tauri runtime, and the stub below has to be
    // the transport for the assertion to mean anything. MEXC's platform gate
    // is `requiresDesktop && isCorsConstrained()`, and headless is not CORS
    // constrained, so nothing refuses here either way.
    asHeadless()
    // Hermetic: the point is only that execution got PAST the gate, so the
    // venue call is stubbed off rather than left to reach api.mexc.com.
    const realFetch = globalThis.fetch
    let reached = false
    globalThis.fetch = (async () => {
      reached = true
      throw new Error('stubbed: no network in unit tests')
    }) as unknown as typeof fetch
    try {
      const plugin = mexc()
      await plugin.initialize?.({
        apiKey: 'k',
        apiSecret: 's',
        country: 'DE',
        mode: 'live',
      })
      const result = (await plugin
        .execute?.({
          capability: 'trading:orders',
          params: {
            action: 'place',
            pair: 'BTC-USDT',
            side: 'buy',
            size: '0.001',
          },
          context: {
            pair: 'BTC-USDT',
            market: 'mexc',
            timeframe: '15m',
            mode: 'live' as const,
            country: 'DE',
          },
        })
        .catch((error: unknown) => error)) as { success?: boolean }
      // Not a geo refusal, and the request actually left the gate behind.
      expect(isGeoRestrictedError(result)).toBe(false)
      expect(reached).toBe(true)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /**
   * The reactive half: a venue that refuses at the HTTP layer.
   *
   * The native connectors ran every public REST response through
   * `assertResponseOk`, which is where 451-and-403-with-evidence became a typed
   * geo error. ccxt collapses every HTTP failure into its own classes
   * (`451 → ExchangeNotAvailable`) and keeps the status only inside the
   * message, so the bridge recovers the signal by parsing it back out. These
   * pin that recovery against real responses, because "the regex still matches
   * ccxt's message format" is not something a type checker can hold.
   */
  describe('reactive classification', () => {
    // `primeSync` starts a market load that nobody awaits, so a plugin built
    // here can still be fetching after its test returns. The real transport is
    // therefore swapped out for the whole block rather than per test — a
    // per-test restore would let those stragglers reach the internet.
    const realFetch = globalThis.fetch
    const offline: typeof fetch = (async () => {
      throw new Error('offline: unit tests make no requests')
    }) as unknown as typeof fetch

    beforeEach(() => {
      globalThis.fetch = offline
    })

    afterAll(() => {
      globalThis.fetch = realFetch
    })

    function stubStatus(status: number, body: string, statusText: string) {
      globalThis.fetch = (async () =>
        new Response(body, { status, statusText })) as unknown as typeof fetch
      return () => {
        globalThis.fetch = offline
      }
    }

    async function historyError(country: string): Promise<unknown> {
      const plugin = bybit()
      try {
        await plugin.execute?.({
          capability: 'market-data:history',
          params: { pair: 'BTC-USDT', timeframe: '15m', limit: 10 },
          context: {
            pair: 'BTC-USDT',
            market: 'bybit',
            timeframe: '15m',
            mode: 'live' as const,
            country,
          },
        })
      } catch (error) {
        return error
      }
      return undefined
    }

    it('451 is unambiguous — it becomes a typed GeoRestrictedError', async () => {
      asHeadless()
      const restore = stubStatus(451, '{}', 'Unavailable For Legal Reasons')
      try {
        const thrown = await historyError('DE')
        expect(isGeoRestrictedError(thrown)).toBe(true)
        expect((thrown as { status?: number }).status).toBe(451)
        expect((thrown as { exchange?: string }).exchange).toBe('ByBit')
        expect((thrown as { region?: string }).region).toBe('DE')
      } finally {
        restore()
      }
    })

    it('403 counts only with body evidence', async () => {
      asHeadless()
      const restore = stubStatus(
        403,
        '{"msg":"service unavailable in your country"}',
        'Forbidden',
      )
      try {
        const thrown = await historyError('SG')
        expect(isGeoRestrictedError(thrown)).toBe(true)
        expect((thrown as { status?: number }).status).toBe(403)
      } finally {
        restore()
      }
    })

    it('403 with no evidence stays a plain error — it is usually a dead key', async () => {
      asHeadless()
      const restore = stubStatus(403, '{"retCode":10003}', 'Forbidden')
      try {
        const thrown = await historyError('SG')
        expect(thrown).toBeInstanceOf(Error)
        expect(isGeoRestrictedError(thrown)).toBe(false)
      } finally {
        restore()
      }
    })

    it('a 500 is never a geo block', async () => {
      asHeadless()
      const restore = stubStatus(500, 'upstream boom', 'Internal Server Error')
      try {
        expect(isGeoRestrictedError(await historyError('DE'))).toBe(false)
      } finally {
        restore()
      }
    })

    /**
     * The transport wrapper on its own. The end-to-end cases above prove it
     * fires; these prove it does not damage anything on the way past — a
     * consumed body would leave ccxt parsing an empty string and turn every
     * ordinary error into a mystery.
     */
    describe('withGeoClassification', () => {
      const transport = (status: number, body: string) =>
        withGeoClassification(
          async () => new Response(body, { status }),
          'OKX',
          () => 'ES',
        )

      it('leaves a 200 completely alone, body intact', async () => {
        const response = await transport(200, '{"ok":1}')('https://x/y')
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('{"ok":1}')
      })

      it('throws on 451 with the venue and region attached', async () => {
        let thrown: unknown
        try {
          await transport(451, '')('https://x/y')
        } catch (error) {
          thrown = error
        }
        expect(isGeoRestrictedError(thrown)).toBe(true)
        expect((thrown as Error).message).toBe(
          'OKX is not available in your region (ES)',
        )
      })

      it('returns a 403 with no evidence UNREAD, for ccxt to handle', async () => {
        const response = await transport(403, '{"code":"50111"}')('https://x/y')
        expect(response.status).toBe(403)
        // The marker check reads a clone; the original stream must survive.
        expect(await response.text()).toBe('{"code":"50111"}')
      })

      it('throws on a 403 whose body names a region', async () => {
        let thrown: unknown
        try {
          await transport(403, 'access restricted')('https://x/y')
        } catch (error) {
          thrown = error
        }
        expect(isGeoRestrictedError(thrown)).toBe(true)
        expect((thrown as { status?: number }).status).toBe(403)
      })

      it('does not read the body of any other failing status', async () => {
        const response = await transport(429, 'slow down')('https://x/y')
        expect(response.bodyUsed).toBe(false)
        expect(await response.text()).toBe('slow down')
      })
    })
  })

  it('bybit/US: trading is refused before slot resolution — geoCheck covers it', async () => {
    asHeadless()
    const plugin = bybit()
    let thrown: unknown
    try {
      await plugin.execute?.({
        capability: 'trading:orders',
        params: { action: 'list' },
        context: {
          pair: 'BTC-USDT',
          market: 'bybit',
          timeframe: '15m',
          mode: 'live' as const,
          country: 'US',
        },
      })
    } catch (error) {
      thrown = error
    }
    // Native parity: ByBit blocks the US for ALL capabilities, so the refusal
    // is the app-level `geoCheck` and it fires whether or not a slot exists.
    expect(isGeoRestrictedError(thrown)).toBe(true)
  })
})
