// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The parsers, over the payload shapes OpenSea actually publishes.
 *
 * Nothing here touches the network. What is pinned is the arithmetic and the
 * three asymmetries in OpenSea's own schemas that silently produce `undefined`
 * if you write one accessor for both sides of them.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyCollectionStats,
  chainFromVenue,
  isSettlementCurrency,
  mergeListingsIntoItems,
  parseCollectionDetail,
  parseFloorPoints,
  parseHoldings,
  parseListings,
  parseNftRecords,
  parseOfferAggregates,
  parseOffers,
  parseRankedCollections,
  parseSaleEvents,
  parseTraits,
  toMs,
  unitsFromDenominated,
  unitsFromRaw,
} from '../parsers'

import type { ParseContext } from '../parsers'

const ctx: ParseContext = {
  chain: 'ethereum',
  contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
  priceCurrency: 'ETH',
  usdRate: 2000,
}

describe('units', () => {
  test('scales a raw wei string without losing the price', () => {
    expect(unitsFromRaw('8100000000000000000', 18)).toBe(8.1)
  })

  test('never assumes 18: a USDC offer is six places', () => {
    expect(unitsFromRaw('1250000', 6)).toBe(1.25)
  })

  test('handles zero decimals and sub-unit amounts', () => {
    expect(unitsFromRaw('42', 0)).toBe(42)
    expect(unitsFromRaw('1', 18)).toBeCloseTo(1e-18, 24)
  })

  test('an amount past 2^53 still scales exactly', () => {
    // 12345.678901234567891 ETH: a double cannot hold the wei integer.
    expect(unitsFromRaw('12345678901234567891000', 18)).toBeCloseTo(
      12345.6789012345,
      9,
    )
  })

  test('refuses junk rather than returning zero', () => {
    expect(unitsFromRaw('', 18)).toBeUndefined()
    expect(unitsFromRaw('abc', 18)).toBeUndefined()
    expect(unitsFromRaw('100', undefined)).toBeUndefined()
  })

  test('an already-denominated price is not scaled again', () => {
    expect(unitsFromDenominated(8.148996)).toBe(8.148996)
    expect(unitsFromDenominated('8.1')).toBe(8.1)
    expect(unitsFromDenominated(undefined)).toBeUndefined()
  })
})

describe('timestamps', () => {
  test('seconds become ms, ms stay ms', () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(toMs('1700000000')).toBe(1_700_000_000_000)
  })

  test('an ISO date parses', () => {
    expect(toMs('2021-04-22')).toBe(Date.parse('2021-04-22'))
  })

  test('nothing is nothing', () => {
    expect(toMs(0)).toBeUndefined()
    expect(toMs(null)).toBeUndefined()
  })
})

describe('chains, currencies and marketplaces', () => {
  test("OpenSea's own chain slugs map back", () => {
    expect(chainFromVenue('matic')).toBe('polygon')
    expect(chainFromVenue('ethereum')).toBe('ethereum')
    expect(chainFromVenue('sui')).toBeUndefined()
  })

  test('a wrapped native token is the settlement currency', () => {
    expect(isSettlementCurrency('WETH', 'ETH')).toBe(true)
    expect(isSettlementCurrency('ETH', 'ETH')).toBe(true)
    expect(isSettlementCurrency('USDC', 'ETH')).toBe(false)
  })
})

const collectionDetail = {
  collection: 'boredapeyachtclub',
  name: 'Bored Ape Yacht Club',
  description: 'Ten thousand apes.',
  image_url: 'https://i2c.seadn.io/bayc.png',
  safelist_status: 'verified',
  opensea_url: 'https://opensea.io/collection/boredapeyachtclub',
  contracts: [
    { address: '0xBEEF', chain: 'base' },
    {
      address: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      chain: 'ethereum',
    },
  ],
  fees: [
    { fee: 1.0, recipient: '0x0000a26b', required: true },
    { fee: 2.5, recipient: '0xa858ddc0', required: false },
  ],
  total_supply: 9998,
  created_date: '2021-04-22',
  pricing_currencies: {
    listing_currency: { symbol: 'ETH', decimals: 18, usd_price: '2516.03' },
    offer_currency: { symbol: 'WETH', decimals: 18, usd_price: '2517.95' },
  },
}

describe('collection detail', () => {
  test('picks the contract for OUR chain, not the first listed', () => {
    const parsed = parseCollectionDetail(collectionDetail, 'ethereum')
    expect(parsed?.summary.contract).toBe(
      '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
    )
    const onBase = parseCollectionDetail(collectionDetail, 'base')
    expect(onBase?.summary.contract).toBe('0xBEEF')
  })

  test('the creator royalty excludes the marketplace fee', () => {
    const parsed = parseCollectionDetail(collectionDetail, 'ethereum')
    expect(parsed?.summary.royaltyRate).toBeCloseTo(0.025, 6)
  })

  test('the royalty is a RATE, so a 2.5% fee reads back as 2.5%', () => {
    // The field was called `royaltyBps` while carrying a fraction, and the
    // header pane divided by 100 a second time: every collection rendered
    // "0.00%". A fraction times 100 is the percentage, and nothing else is.
    const parsed = parseCollectionDetail(collectionDetail, 'ethereum')
    const rate = parsed?.summary.royaltyRate ?? 0
    expect((rate * 100).toFixed(2)).toBe('2.50')
  })

  test('carries the FX rates out for the rest of the connector', () => {
    const parsed = parseCollectionDetail(collectionDetail, 'ethereum')
    expect(parsed?.usdRates).toEqual([
      ['ETH', 2516.03],
      ['WETH', 2517.95],
    ])
  })

  test('a payload with no slug is not a collection', () => {
    expect(parseCollectionDetail({ name: 'nope' }, 'ethereum')).toBeNull()
  })
})

describe('collection stats', () => {
  const stats = {
    total: {
      volume: 1580178.13,
      sales: 57317,
      num_owners: 5593,
      floor_price: 8.148996,
      floor_price_symbol: 'ETH',
    },
    intervals: [
      { interval: 'one_day', volume: 175.2, sales: 21 },
      { interval: 'seven_day', volume: 426.53, sales: 50 },
      { interval: 'thirty_day', volume: 1679.99, sales: 193 },
    ],
  }

  test('market cap is floor times supply, in the settlement currency', () => {
    const base = parseCollectionDetail(collectionDetail, 'ethereum')!.summary
    const row = applyCollectionStats(base, stats, 2000)
    expect(row.floorPrice).toBe(8.148996)
    expect(row.marketCap).toBeCloseTo(8.148996 * 9998, 6)
    expect(row.marketCapUsd).toBeCloseTo(8.148996 * 9998 * 2000, 3)
    expect(row.volume24h).toBe(175.2)
    expect(row.sales24h).toBe(21)
    expect(row.volume7d).toBe(426.53)
    expect(row.ownerCount).toBe(5593)
  })

  test('no rate means no USD, never a zero', () => {
    const base = parseCollectionDetail(collectionDetail, 'ethereum')!.summary
    const row = applyCollectionStats(base, stats)
    expect(row.floorPriceUsd).toBeUndefined()
    expect(row.marketCapUsd).toBeUndefined()
  })

  test('a missing stats payload leaves the row untouched', () => {
    const base = parseCollectionDetail(collectionDetail, 'ethereum')!.summary
    expect(applyCollectionStats(base, null)).toEqual(base)
  })
})

describe('ranked collections', () => {
  test('rows carry identity and no invented numbers', () => {
    const { rows } = parseRankedCollections({
      collections: [
        collectionDetail,
        { ...collectionDetail, is_disabled: true },
      ],
      next: 'cursor-1',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.floorPrice).toBeUndefined()
    expect(rows[0]?.volume24h).toBeUndefined()
  })

  test('the rankings cursor rides out', () => {
    const parsed = parseRankedCollections({ collections: [], next: 'abc' })
    expect(parsed.cursor).toBe('abc')
  })
})

describe('listings', () => {
  const listing = {
    order_hash: '0xorder',
    chain: 'ethereum',
    type: 'basic',
    status: 'ACTIVE',
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395',
    price: {
      current: { currency: 'ETH', decimals: 18, value: '8100000000000000000' },
    },
    protocol_data: {
      parameters: {
        offerer: '0xseller',
        endTime: '1700000000',
        offer: [
          {
            itemType: 2,
            token: '0xbc4c',
            identifierOrCriteria: '1234',
            startAmount: '1',
          },
        ],
        consideration: [],
      },
    },
  }

  test('reads the price from `price.current`, not `price`', () => {
    const { listings } = parseListings({ listings: [listing] }, ctx)
    expect(listings).toHaveLength(1)
    expect(listings[0]?.price).toBe(8.1)
    expect(listings[0]?.priceUsd).toBe(16200)
    expect(listings[0]?.tokenId).toBe('1234')
    expect(listings[0]?.seller).toBe('0xseller')
    expect(listings[0]?.orderId).toBe('0xorder')
    expect(listings[0]?.expiresMs).toBe(1_700_000_000_000)
  })

  test('an order off OpenSea is an OpenSea order, not `unknown`', () => {
    // `protocol_address` is a Seaport CONTRACT, which matches no venue name.
    // Reading it as a label badged every row of every book `unknown`.
    const { listings } = parseListings({ listings: [listing] }, ctx)
    expect(listings[0]?.marketplace).toBe('opensea')
  })

  test('the ladder is cheapest first', () => {
    const cheaper = {
      ...listing,
      order_hash: '0xb',
      price: {
        current: {
          currency: 'ETH',
          decimals: 18,
          value: '2000000000000000000',
        },
      },
    }
    const { listings } = parseListings({ listings: [listing, cheaper] }, ctx)
    expect(listings.map((l) => l.price)).toEqual([2, 8.1])
  })

  test('an inactive order is not on the book', () => {
    const { listings } = parseListings(
      { listings: [{ ...listing, status: 'CANCELLED' }] },
      ctx,
    )
    expect(listings).toHaveLength(0)
  })

  test('a non-settlement currency gets no USD from our rate', () => {
    const usdc = {
      ...listing,
      price: { current: { currency: 'USDC', decimals: 6, value: '5000000' } },
    }
    const { listings } = parseListings({ listings: [usdc] }, ctx)
    expect(listings[0]?.price).toBe(5)
    expect(listings[0]?.priceUsd).toBeUndefined()
  })
})

describe('offers', () => {
  const offer = (
    hash: string,
    value: string,
    quantity: number,
    trait?: { type: string; value: string },
  ) => ({
    order_hash: hash,
    chain: 'ethereum',
    status: 'ACTIVE',
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395',
    // Flat, where a listing nests under `.current`. Getting this wrong is a
    // silent empty bid side.
    price: { currency: 'WETH', decimals: 18, value },
    remaining_quantity: quantity,
    criteria: trait ? { traits: [trait] } : {},
    protocol_data: {
      parameters: {
        offerer: '0xbidder',
        endTime: '1700000000',
        offer: [],
        consideration: [
          {
            itemType: 4,
            token: '0xbc4c',
            identifierOrCriteria: '0',
            startAmount: String(quantity),
          },
        ],
      },
    },
  })

  test('a multi-item offer prices PER ITEM', () => {
    // 15 WETH for any 5 tokens is a 3 WETH bid, not a 15 WETH one.
    const { offers } = parseOffers(
      { offers: [offer('0x1', '15000000000000000000', 5)] },
      ctx,
    )
    expect(offers[0]?.price).toBe(3)
    expect(offers[0]?.quantity).toBe(5)
  })

  test('a bid off OpenSea is an OpenSea bid, not `unknown`', () => {
    const { offers } = parseOffers(
      { offers: [offer('0x1', '3000000000000000000', 1)] },
      ctx,
    )
    expect(offers[0]?.marketplace).toBe('opensea')
  })

  test('two orders at one price are one level with real size', () => {
    const { offers } = parseOffers(
      {
        offers: [
          offer('0x1', '15000000000000000000', 5),
          offer('0x2', '6000000000000000000', 2),
        ],
      },
      ctx,
    )
    expect(offers).toHaveLength(1)
    expect(offers[0]?.quantity).toBe(7)
    // The larger order is the one a seller is routed into first.
    expect(offers[0]?.orderId).toBe('0x1')
  })

  test('a trait-scoped bid is its own level', () => {
    const { offers } = parseOffers(
      {
        offers: [
          offer('0x1', '3000000000000000000', 1),
          offer('0x2', '3000000000000000000', 1, {
            type: 'Fur',
            value: 'Gold',
          }),
        ],
      },
      ctx,
    )
    expect(offers).toHaveLength(2)
    expect(offers.some((o) => o.trait?.value === 'Gold')).toBe(true)
  })

  test('the ladder is highest bid first', () => {
    const { offers } = parseOffers(
      {
        offers: [
          offer('0x1', '1000000000000000000', 1),
          offer('0x2', '4000000000000000000', 1),
        ],
      },
      ctx,
    )
    expect(offers.map((o) => o.price)).toEqual([4, 1])
  })
})

describe('offer aggregates', () => {
  test('a level sums its bidders into real executable size', () => {
    const { offers } = parseOfferAggregates(
      {
        offer_aggregates: [
          {
            offer_price: {
              chain: 'ethereum',
              symbol: 'WETH',
              token_unit: 7.85,
              usd_price: '19750.5',
            },
            total_offers: 3,
            total_value: {
              chain: 'ethereum',
              token_unit: 39.25,
              usd_price: '98752.5',
            },
            bidders: [
              { address: '0xa', quantity: 3 },
              { address: '0xb', quantity: 2 },
            ],
          },
        ],
      },
      ctx,
    )
    expect(offers[0]?.price).toBe(7.85)
    expect(offers[0]?.quantity).toBe(5)
    expect(offers[0]?.priceUsd).toBe(19750.5)
    // Two bidders is a level, not a bidder.
    expect(offers[0]?.bidder).toBeUndefined()
  })

  test('a level with one bidder names them', () => {
    const { offers } = parseOfferAggregates(
      {
        offer_aggregates: [
          {
            offer_price: {
              chain: 'ethereum',
              token_unit: 3,
              usd_price: '6000',
            },
            total_offers: 1,
            bidders: [{ address: '0xsolo', quantity: 1 }],
          },
        ],
      },
      ctx,
    )
    expect(offers[0]?.bidder).toBe('0xsolo')
  })
})

describe('the tape', () => {
  const sale = {
    event_type: 'sale',
    chain: 'ethereum',
    closing_date: 1_700_000_000,
    quantity: 1,
    seller: '0xseller',
    buyer: '0xbuyer',
    transaction: '0xtx',
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395',
    nft: {
      identifier: '1234',
      collection: 'boredapeyachtclub',
      contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      name: 'Bored Ape #1234',
      display_image_url: 'https://i2c.seadn.io/1234.png',
    },
    payment: {
      quantity: '8100000000000000000',
      token_address: '0x0',
      decimals: 18,
      symbol: 'ETH',
    },
  }

  test('a sale reads its token from `nft`', () => {
    const { sales } = parseSaleEvents({ asset_events: [sale] }, ctx)
    expect(sales).toHaveLength(1)
    expect(sales[0]?.tokenId).toBe('1234')
    expect(sales[0]?.price).toBe(8.1)
    expect(sales[0]?.priceUsd).toBe(16200)
    expect(sales[0]?.timestampMs).toBe(1_700_000_000_000)
    expect(sales[0]?.txHash).toBe('0xtx')
    expect(sales[0]?.chain).toBe('ethereum')
    expect(sales[0]?.contract).toBe(
      '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
    )
  })

  test('a print off OpenSea is an OpenSea print, not `unknown`', () => {
    // The tape only sees a `sale` OpenSea brokered: a fill elsewhere arrives as
    // a bare `transfer` and never reaches this parser.
    const { sales } = parseSaleEvents({ asset_events: [sale] }, ctx)
    expect(sales[0]?.marketplace).toBe('opensea')
  })

  test('an ERC-1155 print of five is priced per item', () => {
    const { sales } = parseSaleEvents(
      { asset_events: [{ ...sale, quantity: 5 }] },
      ctx,
    )
    expect(sales[0]?.price).toBeCloseTo(1.62, 9)
  })

  test('order events in the same feed are not prints', () => {
    // An OrderEvent nests its token under `asset`, so reading it as a sale
    // would produce a row with no token id and a listing price on the tape.
    const orderEvent = {
      event_type: 'order',
      order_type: 'listing',
      chain: 'ethereum',
      event_timestamp: 1_700_000_100,
      asset: { identifier: '9999' },
      payment: { quantity: '1000000000000000000', decimals: 18, symbol: 'ETH' },
    }
    const { sales } = parseSaleEvents({ asset_events: [sale, orderEvent] }, ctx)
    expect(sales).toHaveLength(1)
    expect(sales[0]?.tokenId).toBe('1234')
  })

  test('newest print first', () => {
    const older = {
      ...sale,
      closing_date: 1_600_000_000,
      nft: { ...sale.nft, identifier: '1' },
    }
    const { sales } = parseSaleEvents({ asset_events: [older, sale] }, ctx)
    expect(sales.map((s) => s.tokenId)).toEqual(['1234', '1'])
  })

  test('a market-wide row names its own collection', () => {
    const { sales } = parseSaleEvents(
      { asset_events: [sale] },
      {
        chain: 'ethereum',
        priceCurrency: 'ETH',
      },
    )
    expect(sales[0]?.collectionName).toBe('boredapeyachtclub')
  })
})

describe('items and holdings', () => {
  const nft = {
    identifier: '1234',
    collection: 'boredapeyachtclub',
    contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
    name: 'Bored Ape #1234',
    image_url: 'https://i2c.seadn.io/1234.png',
    traits: [
      { trait_type: 'Fur', value: 'Gold' },
      { trait_type: 'Rank', value: 12 },
    ],
  }

  test('an item carries its traits and no invented rarity', () => {
    const { items } = parseNftRecords({ nfts: [nft] }, ctx)
    expect(items[0]?.traits).toEqual([
      { key: 'Fur', value: 'Gold' },
      { key: 'Rank', value: '12' },
    ])
    expect(items[0]?.rarityRank).toBeUndefined()
    expect(items[0]?.owner).toBeUndefined()
  })

  test('the cheapest ask for a token becomes its list price', () => {
    const { items } = parseNftRecords({ nfts: [nft] }, ctx)
    const merged = mergeListingsIntoItems(items, [
      {
        tokenId: '1234',
        price: 9,
        priceCurrency: 'ETH',
        marketplace: 'opensea',
      },
      {
        tokenId: '1234',
        price: 8.1,
        priceCurrency: 'ETH',
        marketplace: 'opensea',
      },
    ])
    expect(merged[0]?.listPrice).toBe(8.1)
  })

  test('holdings scope to one contract when asked', () => {
    const other = { ...nft, identifier: '7', contract: '0xdead' }
    const scoped = parseHoldings(
      { nfts: [nft, other] },
      'ethereum',
      '0xBC4CA0EDA7647A8AB7C2061C2E118A18A936F13D',
    )
    expect(scoped.holdings).toHaveLength(1)
    expect(scoped.holdings[0]?.tokenId).toBe('1234')
    const all = parseHoldings({ nfts: [nft, other] }, 'ethereum')
    expect(all.holdings).toHaveLength(2)
  })
})

describe('traits', () => {
  const traits = {
    categories: { Background: 'string', Fur: 'string' },
    counts: {
      Background: { Gray: 1170, Aquamarine: 1265 },
      Fur: { Gold: 46 },
    },
  }

  test('rarity is a share of supply, and a floor is never invented', () => {
    const rows = parseTraits(traits, 10_000)
    const gold = rows.find((row) => row.value === 'Gold')
    expect(gold?.count).toBe(46)
    expect(gold?.rarity).toBeCloseTo(0.0046, 9)
    expect(gold?.floorPrice).toBeUndefined()
    expect(rows).toHaveLength(3)
  })

  test('no supply means no rarity, not a divide by zero', () => {
    const rows = parseTraits(traits)
    expect(rows.every((row) => row.rarity === undefined)).toBe(true)
  })
})

describe('floor history', () => {
  test('points arrive oldest first, denominated, in ms', () => {
    const points = parseFloorPoints({
      floor_prices: [
        {
          chain: 'ethereum',
          symbol: 'ETH',
          time: 1_700_000_600,
          token_unit: 8.2,
          usd_price: '20500',
        },
        {
          chain: 'ethereum',
          symbol: 'ETH',
          time: 1_700_000_000,
          token_unit: 8.1,
          usd_price: '20250',
        },
        { chain: 'ethereum', time: 0 },
      ],
    })
    expect(points).toEqual([
      { timestampMs: 1_700_000_000_000, floorPrice: 8.1 },
      { timestampMs: 1_700_000_600_000, floorPrice: 8.2 },
    ])
  })
})
