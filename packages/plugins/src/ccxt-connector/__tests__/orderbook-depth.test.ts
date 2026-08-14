// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fleet-wide floor on `orderbookDepth`.
 *
 * ccxt caps the book it maintains at the depth the bridge asks for, and the
 * pane, the depth chart and the liquidity heatmap all bin whatever comes out of
 * that cap. Ask for too few levels and every one of them degrades the same way:
 * on a venue that quotes to the cent, twenty levels of BTC/USDT is a two-dollar
 * band whose best level holds most of the visible size, so the pane's
 * cumulative bars pin near full width and the ladder reads as a flat block
 * instead of a pyramid. Binance shipped at 20 and Bitget at 15; both were
 * measured against OKX's 400-level `books` on 2026-08-13 and moved.
 *
 * The floor is deliberately well under every current value — it is a guard
 * against the next venue landing with a top-of-book channel, not a tuning knob.
 * Venues that pass `undefined` are exempt on purpose: they either ignore the
 * argument (Coinbase, Upbit) or take ccxt's own full-book default (OKX,
 * Bitvavo, MEXC).
 */

import { describe, expect, it } from 'bun:test'

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
import { mexcCcxtVenue } from '../venues/mexc'
import { okxCcxtVenue } from '../venues/okx'
import { upbitCcxtVenue } from '../venues/upbit'
import type { CcxtVenueConfig } from '../types'

/**
 * Fewest levels a venue may ask for before the book stops being a book.
 *
 * 25 is Bitfinex's smaller enum value and the lowest any venue can legally
 * reach today; everything else sits at 50 or above.
 */
const MIN_BOOK_DEPTH = 25

const VENUES: Array<[string, CcxtVenueConfig]> = [
  ['binance', binanceCcxtVenue],
  ['bitfinex', bitfinexCcxtVenue],
  ['bitget', bitgetCcxtVenue],
  ['bitvavo', bitvavoCcxtVenue],
  ['bybit', bybitCcxtVenue],
  ['coinbase', coinbaseCcxtVenue],
  ['cryptocom', cryptocomCcxtVenue],
  ['gate', gateCcxtVenue],
  ['htx', htxCcxtVenue],
  ['kraken', krakenCcxtVenue],
  ['kucoin', kucoinCcxtVenue],
  ['mexc', mexcCcxtVenue],
  ['okx', okxCcxtVenue],
  ['upbit', upbitCcxtVenue],
]

describe('orderbook depth', () => {
  it('covers every bundled CEX venue', () => {
    expect(VENUES).toHaveLength(14)
  })

  it.each(VENUES)(
    '%s asks for enough levels to render a ladder',
    (_name, venue) => {
      if (venue.orderbookDepth === undefined) return
      expect(venue.orderbookDepth).toBeGreaterThanOrEqual(MIN_BOOK_DEPTH)
    },
  )

  it('keeps Binance deep enough to match OKX`s reference book', () => {
    // 500 is a legal `/api/v3/depth` limit (5|10|20|50|100|500|1000|5000) and
    // the one that reproduces OKX's band across the liquidity range; 1000
    // overshoots it on cheaper pairs.
    expect(binanceCcxtVenue.orderbookDepth).toBe(500)
    expect([5, 10, 20, 50, 100, 500, 1000, 5000]).toContain(
      binanceCcxtVenue.orderbookDepth as number,
    )
  })
})
