// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Runs the shared private-WS lifecycle suite against every migrated venue.
 * Add a driver here as each connector moves onto ReconnectingWsSession.
 */

import { OkxPrivateWsClient } from '../okx-market-connector/private-ws'
import { BybitPrivateWsClient } from '../bybit-market-connector/private-ws'
import { BitgetPrivateWsClient } from '../bitget-market-connector/private-ws'
import { GatePrivateWsClient } from '../gate-market-connector/private-ws'
import { KrakenPrivateWsClient } from '../kraken-market-connector/private-ws'
import { CoinbasePrivateWsClient } from '../coinbase-market-connector/private-ws'
import { HtxPrivateWsClient } from '../htx-market-connector/private-ws'
import { CryptocomPrivateWsClient } from '../cryptocom-market-connector/private-ws'
import { BfxPrivateWsClient } from '../bitfinex-market-connector/private-ws'
import { UpbitPrivateWsClient } from '../upbit-market-connector/private-ws'
import { BitvavoPrivateWsClient } from '../bitvavo-market-connector/private-ws'
import { BinancePrivateWsClient } from '../binance-market-connector/private-ws'
import { MexcPrivateWsClient } from '../mexc-market-connector/private-ws'
import { KucoinPrivateWsClient } from '../kucoin-market-connector/private-ws'
import { describePrivateWsLifecycle } from '../test-utils/private-ws-conformance'
import type {
  FakePrivateSocket,
  PrivateWsDriver,
} from '../test-utils/private-ws-conformance'

const hasOp = (socket: FakePrivateSocket, op: string) =>
  socket.json().some((f) => f['op'] === op)

const DRIVERS: Array<PrivateWsDriver> = [
  {
    name: 'okx',
    create: (options) => new OkxPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's', passphrase: 'p' },
    acceptAuth: (s) => s.push({ event: 'login', code: '0' }),
    rejectAuth: (s) =>
      s.push({ event: 'login', code: '60009', msg: 'Login failed.' }),
    sentAuth: (s) => hasOp(s, 'login'),
    sentSubscribe: (s) => hasOp(s, 'subscribe'),
  },
  {
    name: 'bybit',
    create: (options) => new BybitPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's' },
    acceptAuth: (s) => s.push({ op: 'auth', success: true }),
    rejectAuth: (s) =>
      s.push({ op: 'auth', success: false, ret_msg: 'bad key' }),
    sentAuth: (s) => hasOp(s, 'auth'),
    sentSubscribe: (s) => hasOp(s, 'subscribe'),
  },
  {
    name: 'bitget',
    create: (options) => new BitgetPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's', passphrase: 'p' },
    acceptAuth: (s) => s.push({ event: 'login', code: '0' }),
    rejectAuth: (s) =>
      s.push({ event: 'error', code: '30012', msg: 'bad key' }),
    sentAuth: (s) => hasOp(s, 'login'),
    sentSubscribe: (s) => hasOp(s, 'subscribe'),
  },
  // Gate, Kraken and Coinbase carry their credentials inside the subscribe
  // frame — there is no separate auth round-trip to accept or reject, so the
  // suite skips the handshake-ordering cases for them.
  {
    name: 'gate',
    create: (options) => new GatePrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's' },
    sentSubscribe: (s) =>
      s.json().some((f) => f['event'] === 'subscribe' && f['auth'] != null),
  },
  {
    name: 'kraken',
    create: (options) =>
      new KrakenPrivateWsClient({
        ...options,
        fetchWsToken: async () => 'test-ws-token',
      }),
    credentials: { apiKey: 'k', apiSecret: 's' },
    sentSubscribe: (s) => s.json().some((f) => f['method'] === 'subscribe'),
  },
  {
    name: 'coinbase',
    create: (options) =>
      new CoinbasePrivateWsClient({
        ...options,
        signJwt: async () => 'test-jwt',
        fetchBalances: async () => [],
      }),
    credentials: { apiKey: 'k', apiSecret: 's' },
    sentSubscribe: (s) =>
      s
        .json()
        .some((f) => f['type'] === 'subscribe' && f['channel'] === 'user'),
  },
  {
    name: 'htx',
    create: (options) => new HtxPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's' },
    acceptAuth: (s) => s.push({ action: 'req', ch: 'auth', code: 200 }),
    rejectAuth: (s) =>
      s.push({ action: 'req', ch: 'auth', code: 2002, message: 'bad key' }),
    sentAuth: (s) => s.json().some((f) => f['ch'] === 'auth'),
    sentSubscribe: (s) => s.json().some((f) => f['action'] === 'sub'),
  },
  {
    name: 'cryptocom',
    create: (options) => new CryptocomPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's' },
    acceptAuth: (s) => s.push({ id: 1, method: 'public/auth', code: 0 }),
    rejectAuth: (s) => s.push({ id: 1, method: 'public/auth', code: 10002 }),
    sentAuth: (s) => s.json().some((f) => f['method'] === 'public/auth'),
    sentSubscribe: (s) => s.json().some((f) => f['method'] === 'subscribe'),
  },
  {
    // Bitfinex authenticates and subscribes in one frame — its `filter`
    // names the channels — so auth IS the subscribe here.
    name: 'bitfinex',
    create: (options) => new BfxPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's' },
    acceptAuth: (s) => s.push({ event: 'auth', status: 'OK' }),
    rejectAuth: (s) =>
      s.push({ event: 'auth', status: 'FAILED', msg: 'bad key' }),
    sentSubscribe: (s) => s.json().some((f) => f['event'] === 'auth'),
  },
  {
    name: 'upbit',
    create: (options) => new UpbitPrivateWsClient(options),
    credentials: { apiKey: 'k', apiSecret: 's' },
    sentSubscribe: (s) => s.sent.some((f) => f.includes('"type":"myOrder"')),
  },
  {
    name: 'bitvavo',
    create: (options) => {
      const client = new BitvavoPrivateWsClient(options)
      // The account channel follows a market, which placeOrder normally sets.
      client.setMarket('BTC-EUR')
      return client
    },
    credentials: { apiKey: 'k', apiSecret: 's' },
    acceptAuth: (s) => s.push({ event: 'authenticate', authenticated: true }),
    rejectAuth: (s) => s.push({ event: 'authenticate', authenticated: false }),
    sentAuth: (s) => s.json().some((f) => f['action'] === 'authenticate'),
    sentSubscribe: (s) => s.json().some((f) => f['action'] === 'subscribe'),
  },
  {
    // Binance/MEXC select the user stream with a listenKey in the URL, and
    // KuCoin with a bullet token, so there is no auth frame on the wire.
    name: 'binance',
    create: (options) =>
      new BinancePrivateWsClient({
        ...options,
        fetchListenKey: async () => 'test-listen-key',
      }),
    credentials: { apiKey: 'k', apiSecret: 's' },
    // No subscribe frame either — the URL is the subscription.
    sentSubscribe: () => true,
  },
  {
    name: 'mexc',
    create: (options) =>
      new MexcPrivateWsClient({
        ...options,
        fetchListenKey: async () => 'test-listen-key',
      }),
    credentials: { apiKey: 'k', apiSecret: 's' },
    sentSubscribe: () => true,
  },
  {
    name: 'kucoin',
    create: (options) =>
      new KucoinPrivateWsClient({
        ...options,
        fetchPrivateToken: async () => ({
          token: 't',
          endpoint: 'wss://fake.kucoin/priv',
          pingInterval: 18_000,
        }),
      }),
    credentials: { apiKey: 'k', apiSecret: 's', passphrase: 'p' },
    sentSubscribe: (s) => s.json().some((f) => f['type'] === 'subscribe'),
  },
]

for (const driver of DRIVERS) describePrivateWsLifecycle(driver)
