// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  formatInstrumentRef,
  formatMarketRef,
  isVenueBoundClass,
  marketRefToPath,
  marketServesClass,
  normalizeInstrumentClass,
  normalizeInstrumentId,
  parseInstrumentRef,
  parseMarketRef,
  parseMarketRefPath,
  toInstrumentRef,
} from '../market-ref'

describe('class normalization absorbs three vocabularies', () => {
  test('the URL slugs are their own identity', () => {
    for (const slug of ['spot', 'perp', 'dex', 'stocks', 'prediction']) {
      expect(normalizeInstrumentClass(slug)).toBe(slug as never)
    }
  })

  test('AssetClass, as connectors declare it', () => {
    expect(normalizeInstrumentClass('crypto-spot')).toBe('spot')
    expect(normalizeInstrumentClass('crypto-perp')).toBe('perp')
    expect(normalizeInstrumentClass('stocks')).toBe('stocks')
  })

  test('InstrumentKind, as the discovery arms name it', () => {
    expect(normalizeInstrumentClass('cex-pair')).toBe('spot')
    expect(normalizeInstrumentClass('cex-derivative')).toBe('perp')
    expect(normalizeInstrumentClass('token')).toBe('dex')
    expect(normalizeInstrumentClass('equity')).toBe('stocks')
  })

  /**
   * The live drift this function exists for: the instruments index and the
   * plugin catalog emit `assetClass: 'crypto'` while the CEX connectors emit
   * `'crypto-spot'` from the same field, so a raw `.includes()` between them
   * never matched and the asset-class correction silently did nothing for
   * every crypto pair.
   */
  test("the drifted 'crypto' spelling resolves to the same class", () => {
    expect(normalizeInstrumentClass('crypto')).toBe('spot')
    expect(normalizeInstrumentClass('crypto')).toBe(
      normalizeInstrumentClass('crypto-spot')!,
    )
  })

  test('case and padding do not matter, unknown stays unknown', () => {
    expect(normalizeInstrumentClass('  CRYPTO-SPOT ')).toBe('spot')
    expect(normalizeInstrumentClass('futures')).toBeUndefined()
    expect(normalizeInstrumentClass('')).toBeUndefined()
    expect(normalizeInstrumentClass(undefined)).toBeUndefined()
  })

  test('marketServesClass normalizes BOTH sides', () => {
    // A connector declaring 'crypto-spot' serves the 'spot' class. Comparing
    // these two strings directly is the bug.
    expect(marketServesClass(['crypto-spot'], 'spot')).toBe(true)
    expect(marketServesClass(['crypto'], 'spot')).toBe(true)
    expect(marketServesClass(['stocks'], 'spot')).toBe(false)
    expect(marketServesClass(['crypto-spot', 'crypto-perp'], 'perp')).toBe(true)
    expect(marketServesClass([], 'spot')).toBe(false)
  })
})

describe('id normalization is per class', () => {
  test('pair-shaped ids uppercase and canonicalize separators', () => {
    expect(normalizeInstrumentId('spot', ' btc/usdt ')).toBe('BTC-USDT')
    expect(normalizeInstrumentId('spot', 'btc_usdt')).toBe('BTC-USDT')
    expect(normalizeInstrumentId('stocks', 'aapl')).toBe('AAPL')
  })

  /**
   * The trap this rule exists for. Base58 is case-sensitive, so upper-casing
   * a Solana mint produces a different string that is almost never a real
   * mint; the chart then resolves to nothing, or to whatever a symbol search
   * turns up. EVM addresses lose their checksum casing, which is recoverable
   * but noisy, so they are pinned to lowercase instead.
   */
  test('token addresses are NOT uppercased', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    expect(normalizeInstrumentId('dex', mint)).toBe(mint)
    expect(normalizeInstrumentId('dex', ` ${mint} `)).toBe(mint)

    const evm = '0x532F27101965dd16442E59d40670FaF5eBB142E4'
    expect(normalizeInstrumentId('dex', evm)).toBe(evm.toLowerCase())
  })

  test('a symbol-shaped dex id still canonicalizes', () => {
    expect(normalizeInstrumentId('dex', 'pepe/usdc')).toBe('PEPE-USDC')
  })

  test('prediction ids are preserved verbatim', () => {
    expect(normalizeInstrumentId('prediction', 'KXPRES-26~Yes')).toBe(
      'KXPRES-26~Yes',
    )
  })
})

describe('serialization round-trips', () => {
  test('market refs', () => {
    const ref = { cls: 'spot' as const, market: 'okx', id: 'BTC-USDT' }
    expect(formatMarketRef(ref)).toBe('spot:okx:BTC-USDT')
    expect(parseMarketRef('spot:okx:BTC-USDT')).toEqual(ref)
  })

  test('venue-free instrument refs', () => {
    expect(formatInstrumentRef({ cls: 'spot', id: 'BTC-USDT' })).toBe(
      'spot:BTC-USDT',
    )
    expect(parseInstrumentRef('spot:BTC-USDT')).toEqual({
      cls: 'spot',
      id: 'BTC-USDT',
    })
    expect(parseInstrumentRef('stocks:AAPL')).toEqual({
      cls: 'stocks',
      id: 'AAPL',
    })
  })

  test('venue-bound arms carry the market in both forms', () => {
    const addr = '0x532f27101965dd16442e59d40670faf5ebb142e4'
    const token = { cls: 'dex' as const, market: 'base', id: addr }
    expect(formatInstrumentRef(token)).toBe(`dex:base:${addr}`)
    expect(parseInstrumentRef(`dex:base:${addr}`)).toEqual(token)
    expect(isVenueBoundClass('dex')).toBe(true)
    expect(isVenueBoundClass('spot')).toBe(false)
  })

  /**
   * A truncated or malformed address does not look like an address, so it
   * takes the symbol branch and gets upper-cased. That is the safe direction:
   * it will not resolve to a pool, rather than resolving to the wrong one.
   */
  test('a string that is not address-shaped is treated as a symbol', () => {
    expect(parseInstrumentRef('dex:base:0xabc')?.id).toBe('0XABC')
  })

  /**
   * The prediction arm is the reason the id is the LAST segment and keeps its
   * own separators: `marketId~outcome` rides in one segment, so no arm needs a
   * fourth. A parser that split on every separator would truncate it.
   */
  test('a prediction id survives its own separators', () => {
    const ref = parseMarketRef('prediction:kalshi:KXPRES-26~YES')
    expect(ref).toEqual({
      cls: 'prediction',
      market: 'kalshi',
      id: 'KXPRES-26~YES',
    })
  })

  test('malformed refs return null rather than a half-built ref', () => {
    expect(parseMarketRef('')).toBeNull()
    expect(parseMarketRef('spot')).toBeNull()
    expect(parseMarketRef('spot:okx')).toBeNull()
    expect(parseMarketRef('spot:okx:')).toBeNull()
    expect(parseMarketRef(':okx:BTC-USDT')).toBeNull()
    expect(parseMarketRef('futures:okx:BTC-USDT')).toBeNull()
  })
})

describe('url paths', () => {
  test('the canonical chart path is three segments', () => {
    expect(
      marketRefToPath({ cls: 'spot', market: 'okx', id: 'BTC-USDT' }),
    ).toBe('/spot/okx/BTC-USDT')
    expect(
      marketRefToPath({ cls: 'stocks', market: 'alpaca', id: 'AAPL' }),
    ).toBe('/stocks/alpaca/AAPL')
  })

  test('a path round-trips back to the same ref', () => {
    for (const ref of [
      { cls: 'spot' as const, market: 'okx', id: 'BTC-USDT' },
      { cls: 'stocks' as const, market: 'alpaca', id: 'AAPL' },
      {
        cls: 'dex' as const,
        market: 'solana',
        id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
    ]) {
      expect(parseMarketRefPath(marketRefToPath(ref))).toEqual(ref)
    }
  })

  test('non-chart paths are not chart paths', () => {
    expect(parseMarketRefPath('/accounts')).toBeNull()
    expect(parseMarketRefPath('/plugins')).toBeNull()
    expect(parseMarketRefPath('/workspace/abc')).toBeNull()
    expect(parseMarketRefPath('/spot/okx')).toBeNull()
    expect(parseMarketRefPath('/spot/okx/BTC-USDT/extra')).toBeNull()
    // The old route shape must not read as a chart path, or the legacy
    // redirect would never fire.
    expect(parseMarketRefPath('/pair/BTC-USDT')).toBeNull()
  })
})

describe('instrument rows become refs', () => {
  test('a CEX pair is venue-free', () => {
    expect(
      toInstrumentRef({ kind: 'cex-pair', symbol: 'BTC-USDT', market: 'okx' }),
    ).toEqual({ cls: 'spot', id: 'BTC-USDT' })
  })

  test('a token binds chain and address, never its symbol', () => {
    expect(
      toInstrumentRef({
        kind: 'token',
        symbol: 'PEPE',
        market: 'base',
        chain: 'base',
        address: '0x532F27101965dd16442E59d40670FaF5eBB142E4',
      }),
    ).toEqual({
      cls: 'dex',
      market: 'base',
      id: '0x532f27101965dd16442e59d40670faf5ebb142e4-USDC',
    })
  })

  test('a token row without an address is not routable', () => {
    // Better to refuse than to emit a symbol-keyed token ref, which is the
    // identity the TokenInstrument contract forbids.
    expect(
      toInstrumentRef({ kind: 'token', symbol: 'PEPE', market: 'base' }),
    ).toBeNull()
  })

  test('an equity drops the MIC, which the broker resolves itself', () => {
    expect(
      toInstrumentRef({
        kind: 'equity',
        symbol: 'AAPL',
        market: 'alpaca',
        mic: 'XNAS',
      }),
    ).toEqual({ cls: 'stocks', id: 'AAPL' })
  })

  test('a linear perp stays short, an inverse perp carries its settle', () => {
    expect(
      toInstrumentRef({
        kind: 'cex-derivative',
        symbol: 'BTC-USDT',
        market: 'bybit',
        settle: 'USDT',
        contract: 'perp',
      }),
    ).toEqual({ cls: 'perp', id: 'BTC-USDT' })

    expect(
      toInstrumentRef({
        kind: 'cex-derivative',
        symbol: 'BTC-USD',
        market: 'bybit',
        settle: 'BTC',
        contract: 'perp',
      }),
    ).toEqual({ cls: 'perp', id: 'BTC-USD-BTC' })
  })

  test('an unknown kind is not routable', () => {
    expect(
      toInstrumentRef({ kind: 'warrant', symbol: 'X', market: 'y' }),
    ).toBeNull()
  })
})

/**
 * The dex arm's id is `address-quote`, and the two legs cannot share a
 * normalization rule. Getting this wrong is not cosmetic: the pool resolvers
 * split the key and look up the base by address, so an upper-cased Solana mint
 * resolves to nothing, and a key with no quote leg is rejected outright before
 * any lookup happens.
 */
describe('dex ids keep an address intact and a quote leg attached', () => {
  const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  const EVM = '0x532F27101965dd16442E59d40670FaF5eBB142E4'

  test('a base58 mint survives its quote leg', () => {
    expect(normalizeInstrumentId('dex', `${MINT}-usdc`)).toBe(`${MINT}-USDC`)
  })

  test('an EVM address lowercases while its quote leg uppercases', () => {
    expect(normalizeInstrumentId('dex', `${EVM}-weth`)).toBe(
      `${EVM.toLowerCase()}-WETH`,
    )
  })

  test('the row builds address-quote, not a bare address', () => {
    const ref = toInstrumentRef({
      kind: 'token',
      symbol: 'PEPE',
      market: 'base',
      quote: 'WETH',
      chain: 'base',
      address: EVM,
    })
    expect(ref).toEqual({
      cls: 'dex',
      market: 'base',
      id: `${EVM.toLowerCase()}-WETH`,
    })
  })

  test('a row with no quote still gets one, since the resolvers require it', () => {
    const ref = toInstrumentRef({
      kind: 'token',
      symbol: 'WIF',
      market: 'solana',
      chain: 'solana',
      address: MINT,
    })
    expect(ref?.id).toBe(`${MINT}-USDC`)
  })

  test('a path round-trips a token ref without mangling the mint', () => {
    const ref = { cls: 'dex' as const, market: 'solana', id: `${MINT}-USDC` }
    expect(parseMarketRefPath(marketRefToPath(ref))).toEqual(ref)
  })
})
