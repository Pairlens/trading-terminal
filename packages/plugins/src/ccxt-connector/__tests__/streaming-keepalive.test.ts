// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ccxt's keepalive policy, pinned per venue.
 *
 * `Client.onPingInterval` sends the exchange class's app-level `ping()` when
 * one exists — that keeps venues like KuCoin and OKX from dropping a quiet
 * socket, and their `handlePong` advances `lastPong`, so the stall detector is
 * honest. On a venue with NO `ping()` the same timer degrades to the runtime's
 * protocol PING: under bun the pong listener is never attached
 * (`isNode && !isBun` in WsClient), `lastPong` never advances, and ccxt kills
 * a perfectly healthy socket every `keepAlive × maxPingPongMisses`; in a
 * browser the fallthrough assigns `lastPong = now` and detects nothing at all.
 *
 * So the policy is: venues without an app-level ping turn the timer OFF
 * (liveness belongs to the hub's inbound-silence watchdog); venues with one
 * keep ccxt's default, because the ping itself is load-bearing. This table is
 * derived from the pinned ccxt 4.5.71 pro classes — re-derive it on a bump.
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

function keepAlive(venue: CcxtVenueConfig): unknown {
  const streaming = venue.options?.['streaming'] as
    | Record<string, unknown>
    | undefined
  return streaming?.['keepAlive']
}

/** No `ping()` in the pro class, nothing sets `client.lastPong`. */
const NO_APP_PING: Array<[string, CcxtVenueConfig]> = [
  ['binance', binanceCcxtVenue],
  ['bitvavo', bitvavoCcxtVenue],
  ['gate', gateCcxtVenue],
  ['coinbase', coinbaseCcxtVenue],
  ['htx', htxCcxtVenue],
  ['cryptocom', cryptocomCcxtVenue],
  ['bitfinex', bitfinexCcxtVenue],
  ['upbit', upbitCcxtVenue],
]

/** Real `ping()` + `handlePong` — ccxt's keepalive is load-bearing here. */
const APP_PING: Array<[string, CcxtVenueConfig]> = [
  ['okx', okxCcxtVenue],
  ['bybit', bybitCcxtVenue],
  ['mexc', mexcCcxtVenue],
  ['kucoin', kucoinCcxtVenue],
  ['kraken', krakenCcxtVenue],
  ['bitget', bitgetCcxtVenue],
]

describe('streaming keepalive policy', () => {
  for (const [name, venue] of NO_APP_PING) {
    it(`${name}: keepalive off — no app-level ping to send`, () => {
      expect(`${name}:${String(keepAlive(venue))}`).toBe(`${name}:0`)
    })
  }

  for (const [name, venue] of APP_PING) {
    it(`${name}: ccxt's keepalive kept — the app-level ping is load-bearing`, () => {
      expect(`${name}:${String(keepAlive(venue))}`).toBe(`${name}:undefined`)
    })
  }
})
