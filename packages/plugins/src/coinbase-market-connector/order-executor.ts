// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase Order Executor — JWT-authenticated REST endpoints for trading.
 *
 * Coinbase uses ES256 JWT tokens (not HMAC) for authentication.
 * Each request generates a fresh JWT (120-second lifetime).
 *
 * Key differences from other exchanges:
 * - Market buy requires quote_size (not base_size)
 * - Cancel uses POST /orders/batch_cancel (not DELETE)
 * - Order config is nested in order_configuration object
 * - All numeric values are strings
 * - Sandbox doesn't require auth (paper mode)
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { createCoinbaseJwt } from './jwt-signer'
import { normalizePair } from './parser'
import {
  resolveCoinbasePublicRest,
  resolveCoinbaseTradingRest,
} from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type CoinbaseCredentials = {
  apiKey: string
  apiSecret: string
}

// ── Authenticated fetch helper ──

async function coinbaseFetch(
  path: string,
  method: string,
  credentials: CoinbaseCredentials,
  paper: boolean,
  body?: string,
): Promise<Response> {
  const restBase = resolveCoinbaseTradingRest(paper)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Sandbox doesn't require auth
  if (!paper) {
    const jwt = await createCoinbaseJwt(
      credentials.apiKey,
      credentials.apiSecret,
      method,
      `/api/v3/brokerage${path}`,
    )
    headers['Authorization'] = `Bearer ${jwt}`
  }

  return fetch(`${restBase}${path}`, {
    method,
    headers,
    body: method !== 'GET' ? body : undefined,
  })
}

// ── Place order ──

/** Limit price 1% beyond the trigger in the fill direction, formatted to
 * the trigger price's own decimal precision (respects quote increments). */
function protectiveLimitPrice(
  triggerPrice: string,
  side: 'buy' | 'sell',
): string {
  const decimals = triggerPrice.includes('.')
    ? triggerPrice.split('.')[1].length
    : 0
  const factor = side === 'sell' ? 0.99 : 1.01
  return (Number(triggerPrice) * factor).toFixed(decimals)
}

export async function placeCoinbaseOrder(
  params: OrderParams,
  credentials: CoinbaseCredentials,
  _country: string,
): Promise<OrderResult> {
  const paper = params.mode === 'paper'
  const productId = normalizePair(params.pair)
  const clientOrderId = crypto.randomUUID()

  // Build order_configuration based on type
  let orderConfig: Record<string, unknown>

  if (params.trigger) {
    // Trigger (TP/SL) orders: Coinbase spot has stop-LIMIT only (no
    // stop-market config), with an explicit trigger direction. When the
    // step asked for market execution, rest a limit 1% beyond the trigger
    // in the adverse direction — fills like a market order on trigger
    // while capping slippage at 1%.
    const trigger = params.trigger
    const crossesDown =
      (trigger.triggerType === 'sl') === (params.side === 'sell')
    const limitPrice =
      params.type === 'limit' && params.price
        ? params.price
        : protectiveLimitPrice(trigger.triggerPrice, params.side)
    orderConfig = {
      stop_limit_stop_limit_gtc: {
        base_size: params.size,
        limit_price: limitPrice,
        stop_price: trigger.triggerPrice,
        stop_direction: crossesDown
          ? 'STOP_DIRECTION_STOP_DOWN'
          : 'STOP_DIRECTION_STOP_UP',
      },
    }
  } else if (params.type === 'market') {
    if (params.side === 'buy') {
      // Coinbase market buy requires quote_size (amount of quote currency to spend).
      // If tgtCcy is 'quote_ccy', size is already in quote currency.
      // Otherwise, convert base_size to quote_size using current price.
      if (params.tgtCcy === 'quote_ccy') {
        orderConfig = { market_market_ioc: { quote_size: params.size } }
      } else {
        const price = await fetchCurrentPrice(productId)
        if (price <= 0) {
          return {
            success: false,
            error: 'Could not determine current price for market buy',
          }
        }
        const quoteSize = (Number(params.size) * price).toFixed(2)
        orderConfig = { market_market_ioc: { quote_size: quoteSize } }
      }
    } else {
      orderConfig = { market_market_ioc: { base_size: params.size } }
    }
  } else {
    // Limit GTC
    orderConfig = {
      limit_limit_gtc: {
        base_size: params.size,
        limit_price: params.price ?? '0',
        post_only: false,
      },
    }
  }

  const orderBody = {
    client_order_id: clientOrderId,
    product_id: productId,
    side: params.side.toUpperCase(),
    order_configuration: orderConfig,
  }

  try {
    const resp = await coinbaseFetch(
      '/orders',
      'POST',
      credentials,
      paper,
      JSON.stringify(orderBody),
    )

    const json = (await resp.json()) as Record<string, unknown>

    if (json['success'] === false) {
      const failure = json['failure_response'] as
        | Record<string, string>
        | undefined
      return {
        success: false,
        error: failure?.['message'] ?? failure?.['error'] ?? 'Order failed',
      }
    }

    const success = json['success_response'] as
      | Record<string, string>
      | undefined
    return {
      success: true,
      orderId: success?.['order_id'] ?? clientOrderId,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ──

export async function cancelCoinbaseOrder(
  orderId: string,
  _pair: string,
  credentials: CoinbaseCredentials,
  _country: string,
  mode: 'paper' | 'live',
): Promise<OrderResult> {
  const paper = mode === 'paper'

  try {
    const resp = await coinbaseFetch(
      '/orders/batch_cancel',
      'POST',
      credentials,
      paper,
      JSON.stringify({ order_ids: [orderId] }),
    )

    const json = (await resp.json()) as Record<string, unknown>
    const results = json['results'] as
      | Array<Record<string, unknown>>
      | undefined

    if (results && results.length > 0) {
      const first = results[0]
      if (first['success'] === false) {
        return {
          success: false,
          error: String(first['failure_reason'] ?? 'Cancel failed'),
        }
      }
    }

    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Fetch balances ──

export async function fetchCoinbaseBalances(
  credentials: CoinbaseCredentials,
  _country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  try {
    const resp = await coinbaseFetch(
      '/accounts?limit=250',
      'GET',
      credentials,
      paper,
    )
    const json = (await resp.json()) as {
      accounts?: Array<Record<string, unknown>>
    }
    if (!json.accounts) return []

    const balances: Array<NormalizedBalance> = []
    for (const acct of json.accounts) {
      const available = acct['available_balance'] as
        | { value?: string; currency?: string }
        | undefined
      const hold = acct['hold'] as
        | { value?: string; currency?: string }
        | undefined

      const currency = available?.currency ?? String(acct['currency'] ?? '')
      const avail = Number(available?.value ?? 0)
      const frozen = Number(hold?.value ?? 0)

      if (avail > 0 || frozen > 0) {
        balances.push({
          currency,
          available: String(avail),
          frozen: String(frozen),
          total: String(avail + frozen),
        })
      }
    }

    return balances
  } catch {
    return []
  }
}

// ── Fetch open orders ──

export async function fetchCoinbaseOpenOrders(
  credentials: CoinbaseCredentials,
  _country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  try {
    let path = '/orders/historical/batch?order_status=OPEN&limit=100'
    if (pair) path += `&product_ids=${normalizePair(pair)}`

    const resp = await coinbaseFetch(path, 'GET', credentials, paper)
    const json = (await resp.json()) as {
      orders?: Array<Record<string, unknown>>
    }
    if (!json.orders) return []

    return json.orders.map(normalizeCoinbaseOrder)
  } catch {
    return []
  }
}

// ── Fetch order history ──

export async function fetchCoinbaseOrderHistory(
  credentials: CoinbaseCredentials,
  _country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  try {
    let path = '/orders/historical/batch?limit=50'
    if (pair) path += `&product_ids=${normalizePair(pair)}`

    const resp = await coinbaseFetch(path, 'GET', credentials, paper)
    const json = (await resp.json()) as {
      orders?: Array<Record<string, unknown>>
    }
    if (!json.orders) return []

    return json.orders.map(normalizeCoinbaseOrder)
  } catch {
    return []
  }
}

// ── Helpers ──

async function fetchCurrentPrice(productId: string): Promise<number> {
  const restBase = resolveCoinbasePublicRest()
  try {
    const resp = await fetch(`${restBase}/market/products/${productId}`)
    if (!resp.ok) return 0
    const json = (await resp.json()) as Record<string, string>
    return Number(json['price'] ?? 0)
  } catch {
    return 0
  }
}

function normalizeCoinbaseOrder(
  d: Record<string, unknown>,
): NormalizedOrderUpdate {
  const config = d['order_configuration'] as Record<string, unknown> | undefined
  let size = '0'
  let price = '0'
  let stopPrice = ''

  // Extract size and price from the nested order_configuration
  if (config) {
    for (const val of Object.values(config)) {
      const cfg = val as Record<string, string> | undefined
      if (cfg) {
        if (cfg['base_size']) size = cfg['base_size']
        if (cfg['limit_price']) price = cfg['limit_price']
        if (cfg['quote_size'] && size === '0') size = cfg['quote_size']
        if (cfg['stop_price']) stopPrice = cfg['stop_price']
        if (cfg['stop_trigger_price'] && !stopPrice)
          stopPrice = cfg['stop_trigger_price']
      }
    }
  }

  return {
    ...(stopPrice ? { triggerOrder: true, triggerPrice: stopPrice } : {}),
    orderId: String(d['order_id'] ?? ''),
    pair: String(d['product_id'] ?? ''),
    side: String(d['order_side'] ?? d['side'] ?? 'BUY').toLowerCase() as
      | 'buy'
      | 'sell',
    type: mapCoinbaseOrderType(String(d['order_type'] ?? '')),
    size,
    price,
    fillSize: String(d['cumulative_quantity'] ?? d['filled_size'] ?? '0'),
    avgPrice: String(d['average_filled_price'] ?? '0'),
    status: mapCoinbaseStatus(String(d['status'] ?? '')),
    fee: String(d['total_fees'] ?? '0'),
    feeCcy: '',
    ts: parseCoinbaseTs(
      d['last_fill_time'] ?? d['created_time'] ?? d['creation_time'],
    ),
    createdAt: parseCoinbaseTs(d['created_time'] ?? d['creation_time']),
  }
}

function mapCoinbaseOrderType(type: string): 'market' | 'limit' {
  return type.toUpperCase() === 'MARKET' ? 'market' : 'limit'
}

function mapCoinbaseStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status.toUpperCase()) {
    case 'FILLED':
      return 'filled'
    case 'CANCELLED':
    case 'EXPIRED':
    case 'FAILED':
      return 'cancelled'
    default:
      return 'live'
  }
}

function parseCoinbaseTs(value: unknown): number {
  if (!value || value === '0001-01-01T00:00:00Z') return Date.now()
  const t = new Date(String(value)).getTime()
  return Number.isNaN(t) ? Date.now() : t
}
