// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The wrong-tape cases, pinned. Each `describe` below is a real defect that
 * shipped, so these read as regressions rather than as coverage.
 */
import { describe, expect, test } from 'bun:test'

import {
  alternativeVenuesFor,
  crossClassVenuesFor,
  resolveMarketRef,
  venuesForClass,
} from '../resolve'
import { legacySymbolToInstrumentRef } from '../legacy'
import type { MarketOption } from '@/hooks/use-available-markets'

const market = (
  value: string,
  assetClasses: Array<string>,
  extra?: Partial<MarketOption>,
): MarketOption =>
  ({
    value,
    label: value,
    assetClasses,
    desktopOnly: false,
    credentialedMarketData: false,
    ...extra,
  }) as MarketOption

const OKX = market('okx', ['crypto-spot'])
const GATE = market('gate', ['crypto-spot'])
const ALPACA = market('alpaca', ['stocks'], { credentialedMarketData: true })
const BASE = market('base', ['dex'])
const SOLANA = market('solana', ['dex'])
const COINBASE = market('coinbase', ['crypto-spot'], { desktopOnly: true })
const KALSHI = market('kalshi', ['prediction'])
const POLYMARKET = market('polymarket', ['prediction'])
const BINANCE_FUTURES = market('binance-futures', ['crypto-perp'])
const KRAKEN_FUTURES = market('kraken-futures', ['crypto-perp'], {
  desktopOnly: true,
})
/** A venue listing both, the way Kraken and OKX do under one connector each. */
const BOTH = market('both', ['crypto-spot', 'crypto-perp'])

const ALL = [OKX, GATE, ALPACA, BASE, SOLANA]

describe('a crypto pair never resolves to the equities venue', () => {
  /**
   * The shipped bug. With Alpaca preferred, 'BTC-USDT' fell through to it,
   * `toAlpacaSymbol` reduced it to 'BTC', and that is a real NYSE Arca
   * spot-bitcoin ETF trading near $28. The strip showed an equity price under
   * a crypto pair's label.
   */
  test('preferred is substituted, not obeyed, when it cannot serve the class', () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'BTC-USDT' },
      { markets: ALL, preferred: 'alpaca' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reason).toBe('substituted')
    expect(result.ref.market).not.toBe('alpaca')
    expect(result.ref).toEqual({ cls: 'spot', market: 'okx', id: 'BTC-USDT' })
  })

  test('and the mirror image: an equity never resolves to a crypto venue', () => {
    const result = resolveMarketRef(
      { cls: 'stocks', id: 'AAPL' },
      { markets: ALL, preferred: 'okx' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ref.market).toBe('alpaca')
  })

  /**
   * The other half of the same defect. `resolveVenue` compared the index's
   * `'crypto'` against the connector's `'crypto-spot'` with a raw
   * `.includes()`, so no crypto venue ever matched and every crypto pair took
   * the fallback branch.
   */
  test("the index's 'crypto' spelling matches a 'crypto-spot' venue", () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'ETH-USDT' },
      { markets: ALL, preferred: 'gate' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Preferred is honoured because it genuinely serves the class. Before
    // normalization this returned 'substituted' with an arbitrary venue.
    expect(result.reason).toBe('preferred')
    expect(result.ref.market).toBe('gate')
  })
})

describe('refusing beats guessing', () => {
  test('no connected venue serves the class', () => {
    const result = resolveMarketRef(
      { cls: 'stocks', id: 'AAPL' },
      { markets: [OKX, GATE], preferred: 'okx' },
    )
    expect(result).toEqual({ ok: false, reason: 'no-venue', cls: 'stocks' })
  })

  test('during plugin boot there are no venues and no answer', () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'BTC-USDT' },
      { markets: [], preferred: 'okx' },
    )
    expect(result.ok).toBe(false)
  })

  /**
   * A browser cannot reach the four CORS-blocked venues. Resolving into one
   * would hand the user a chart that can never seed, so they are not
   * candidates even when preferred.
   */
  test('a desktop-only venue is not a candidate in a browser build', () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'BTC-USD' },
      { markets: [COINBASE, OKX], preferred: 'coinbase' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ref.market).toBe('okx')

    // And with nothing else connected, it refuses rather than seeding a dead
    // chart.
    expect(
      resolveMarketRef(
        { cls: 'spot', id: 'BTC-USD' },
        { markets: [COINBASE], preferred: 'coinbase' },
      ).ok,
    ).toBe(false)
  })
})

describe('venue-bound arms skip resolution entirely', () => {
  const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

  test('a token IS its chain plus address, whatever the preference says', () => {
    const result = resolveMarketRef(
      { cls: 'dex', market: 'solana', id: MINT },
      { markets: ALL, preferred: 'okx' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reason).toBe('bound')
    expect(result.ref).toEqual({ cls: 'dex', market: 'solana', id: MINT })
  })

  /**
   * The same address is routinely deployed at the same bytes on Ethereum,
   * Base, Arbitrum, BSC and Polygon, sometimes deliberately. The chain is
   * identity, so it is never substituted for another dex venue.
   */
  test('a chain is never swapped for another chain that also serves dex', () => {
    const result = resolveMarketRef(
      { cls: 'dex', market: 'base', id: '0xaaa' },
      { markets: [SOLANA, BASE], preferred: 'solana' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ref.market).toBe('base')
  })

  test('a chain whose connector is not installed refuses', () => {
    const result = resolveMarketRef(
      { cls: 'dex', market: 'arbitrum', id: '0xaaa' },
      { markets: [SOLANA, BASE], preferred: 'base' },
    )
    expect(result).toEqual({ ok: false, reason: 'venue-missing', cls: 'dex' })
  })
})

describe('the instruments index narrows but never grounds a negative', () => {
  test('a listing narrows the field to the venue that lists it', () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'NICHE-USDT' },
      { markets: ALL, preferred: 'okx', listedOn: ['gate'] },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reason).toBe('substituted')
    expect(result.ref.market).toBe('gate')
  })

  test('preferred wins when the index confirms it lists the pair', () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'BTC-USDT' },
      { markets: ALL, preferred: 'okx', listedOn: ['okx', 'gate'] },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reason).toBe('listed')
    expect(result.ref.market).toBe('okx')
  })

  /**
   * Snapshot absence is "unknown", never "not listed" — the contract is
   * explicit. So an index naming only venues we cannot reach falls back to the
   * full candidate set instead of refusing, or an incomplete sweep would black
   * out working charts.
   */
  test('an index naming only unreachable venues does not refuse', () => {
    const result = resolveMarketRef(
      { cls: 'spot', id: 'BTC-USDT' },
      { markets: ALL, preferred: 'okx', listedOn: ['bitfinex'] },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ref.market).toBe('okx')
  })
})

describe('legacy symbols upgrade without losing rows', () => {
  test('the recorded asset class wins', () => {
    expect(legacySymbolToInstrumentRef('AAPL', { AAPL: 'stocks' })).toEqual({
      cls: 'stocks',
      id: 'AAPL',
    })
    // The drifted spelling the pickers actually wrote.
    expect(
      legacySymbolToInstrumentRef('BTC-USDT', { 'BTC-USDT': 'crypto' }),
    ).toEqual({ cls: 'spot', id: 'BTC-USDT' })
  })

  test('a non-USD quote leg proves crypto on its own', () => {
    expect(legacySymbolToInstrumentRef('SOL-USDT')).toEqual({
      cls: 'spot',
      id: 'SOL-USDT',
    })
  })

  test('an unproven symbol defaults to spot and stays resolvable', () => {
    // 'BTC-USD' is a real crypto pair AND a real ETF ticker, so nothing about
    // the string settles it. The default cannot produce a wrong price: the
    // resolver refuses rather than substituting a venue off-class.
    const ref = legacySymbolToInstrumentRef('BTC-USD')
    expect(ref.cls).toBe('spot')
    const result = resolveMarketRef(ref, { markets: ALL, preferred: 'alpaca' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ref.market).not.toBe('alpaca')
  })

  test('keys are canonicalized before the map is consulted', () => {
    expect(legacySymbolToInstrumentRef('aapl', { AAPL: 'stocks' })).toEqual({
      cls: 'stocks',
      id: 'AAPL',
    })
  })
})

/**
 * The equities connector spells its pairs `TICKER-USD`, which the shape rule
 * reads as crypto because of the dash. Left alone, the recents strip asked a
 * crypto exchange for AAPL on a loop — visible in the console as
 * `okx does not have market symbol AAPL/USD`.
 */
describe('a USD-quoted equity key inherits its base leg', () => {
  const MAP = { AAPL: 'stocks', 'BTC-USDT': 'crypto' }

  test("'AAPL-USD' is the stock the map already recorded", () => {
    const ref = legacySymbolToInstrumentRef('AAPL-USD', MAP)
    expect(ref.cls).toBe('stocks')
    const result = resolveMarketRef(ref, { markets: ALL, preferred: 'okx' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ref.market).toBe('alpaca')
  })

  // Only a RECORDED answer, never an invented one: with nothing about ETH the
  // shape rule still applies, and a crypto venue is right.
  test('an unrecorded base leg is not promoted to stocks', () => {
    expect(legacySymbolToInstrumentRef('ETH-USD', MAP).cls).toBe('spot')
  })

  test('a non-USD quote leg never consults the base', () => {
    expect(legacySymbolToInstrumentRef('AAPL-USDT', MAP).cls).toBe('spot')
  })
})

/**
 * The venue picker used to list all twenty-two connectors whatever was on the
 * chart, and so did every "try another venue" empty state under it. Picking
 * Polymarket while charting BTC-USDT, or Bitget while charting an event
 * contract, navigated to an address no connector could answer: the panes went
 * dark with no way back except the URL.
 */
describe('a recovery venue is never one from another asset class', () => {
  test('a spot venue offers the other spot venues', () => {
    expect(alternativeVenuesFor(OKX, ALL).map((m) => m.value)).toEqual(['gate'])
  })

  test('an equities venue offers nothing crypto', () => {
    expect(alternativeVenuesFor(ALPACA, ALL)).toEqual([])
  })

  test('a venue-bound class offers nothing at all', () => {
    // Two DEX venues are connected and neither is an alternative: the same
    // pool address on another chain is a different asset.
    expect(alternativeVenuesFor(BASE, ALL)).toEqual([])
    expect(alternativeVenuesFor(KALSHI, [...ALL, KALSHI, POLYMARKET])).toEqual(
      [],
    )
  })

  test('a venue this build cannot reach is never the recovery', () => {
    expect(
      alternativeVenuesFor(OKX, [...ALL, COINBASE]).map((m) => m.value),
    ).toEqual(['gate'])
  })

  test('an unknown venue resolves to no class, so it suggests nothing', () => {
    expect(alternativeVenuesFor(undefined, ALL)).toEqual([])
  })
})

describe('the venue picker offers only what can serve the chart', () => {
  const CONNECTED = [...ALL, COINBASE, KALSHI, POLYMARKET]

  test('a spot chart never lists a prediction venue', () => {
    expect(
      venuesForClass('spot', 'okx', CONNECTED).map((m) => m.value),
    ).toEqual(['okx', 'gate', 'coinbase'])
  })

  // Not even the other prediction venue: Kalshi has never heard of a
  // Polymarket outcome id, so "same class" is not a tight enough rule here.
  test('an event contract lists its own venue and nothing else', () => {
    expect(
      venuesForClass('prediction', 'polymarket', CONNECTED).map((m) => m.value),
    ).toEqual(['polymarket'])
  })

  test('a token lists its own chain and nothing else', () => {
    expect(
      venuesForClass('dex', 'base', CONNECTED).map((m) => m.value),
    ).toEqual(['base'])
  })

  // Unreachable is not incompatible: those rows stay, carrying their mark.
  test('a desktop-only venue of the right class is still listed', () => {
    expect(venuesForClass('spot', 'okx', CONNECTED)).toContain(COINBASE)
  })

  test('the venue in use is listed even if it declares another class', () => {
    expect(
      venuesForClass('stocks', 'okx', CONNECTED).map((m) => m.value),
    ).toEqual(['okx', 'alpaca'])
  })
})

describe('the picker also offers the same asset under another class', () => {
  const CONNECTED = [
    ...ALL,
    COINBASE,
    KALSHI,
    POLYMARKET,
    BINANCE_FUTURES,
    KRAKEN_FUTURES,
  ]

  test('a spot pair reaches the perp venues, under its contract key', () => {
    expect(
      crossClassVenuesFor({ cls: 'spot', id: 'BTC-USDT' }, CONNECTED),
    ).toEqual([
      {
        cls: 'perp',
        id: 'BTC-USDT-USDT',
        options: [BINANCE_FUTURES, KRAKEN_FUTURES],
      },
    ])
  })

  test('and a contract reaches the spot venues, under the pair key', () => {
    const [section] = crossClassVenuesFor(
      { cls: 'perp', id: 'BTC-USDT-USDT' },
      CONNECTED,
    )
    expect(section.cls).toBe('spot')
    expect(section.id).toBe('BTC-USDT')
    expect(section.options.map((m) => m.value)).toEqual([
      'okx',
      'gate',
      'coinbase',
    ])
  })

  // It is already in the primary list, where the checkmark and the id on
  // screen are. Twice would offer one row under two different instruments.
  test('a venue serving both classes is not listed a second time', () => {
    expect(
      crossClassVenuesFor({ cls: 'spot', id: 'BTC-USDT' }, [
        OKX,
        BOTH,
        BINANCE_FUTURES,
      ])[0].options.map((m) => m.value),
    ).toEqual(['binance-futures'])
  })

  test('a stock has no contract, so the section never appears', () => {
    expect(
      crossClassVenuesFor({ cls: 'stocks', id: 'AAPL' }, CONNECTED),
    ).toEqual([])
  })

  test('a token is its chain, so there is nothing to offer', () => {
    expect(
      crossClassVenuesFor(
        { cls: 'dex', id: '0XDAC17F958D2EE523A2206206994597C13D831EC7-USDC' },
        CONNECTED,
      ),
    ).toEqual([])
  })

  test('no perp venue connected, no section', () => {
    expect(crossClassVenuesFor({ cls: 'spot', id: 'BTC-USDT' }, ALL)).toEqual(
      [],
    )
  })
})
