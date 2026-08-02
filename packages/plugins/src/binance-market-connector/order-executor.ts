// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { normalizePair } from './parser'
import { resolveBinanceTradingUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type BinanceCredentials = {
  apiKey: string
  apiSecret: string
}

// ── Signing ──────────────────────────────────────────────────────────

/**
 * Build a signed query string for Binance.
 * Appends `timestamp` and `signature` params.
 */
async function signQuery(
  params: Record<string, string>,
  credentials: BinanceCredentials,
): Promise<string> {
  const qs = new URLSearchParams({
    ...params,
    timestamp: Date.now().toString(),
  }).toString()

  const signature = await hmacSignHex(credentials.apiSecret, qs)
  return `${qs}&signature=${signature}`
}

/** Standard auth headers for Binance. */
function authHeaders(credentials: BinanceCredentials): Record<string, string> {
  return {
    'X-MBX-APIKEY': credentials.apiKey,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

// ── Status mapping ───────────────────────────────────────────────────

function mapBinanceStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'FILLED':
      return 'filled'
    case 'CANCELED':
    case 'EXPIRED':
    case 'REJECTED':
      return 'cancelled'
    case 'PARTIALLY_FILLED':
      return 'partially_filled'
    default:
      // NEW, PENDING_CANCEL, etc.
      return 'live'
  }
}

// ── Normalize a Binance order record ─────────────────────────────────

type BinanceOrderRecord = Record<string, unknown>

function normalizeBinanceOrder(d: BinanceOrderRecord): NormalizedOrderUpdate {
  const executedQty = Number(d['executedQty'] ?? 0)
  const cummulativeQuoteQty = Number(d['cummulativeQuoteQty'] ?? 0)
  const status = mapBinanceStatus(String(d['status'] ?? 'NEW'))

  const avgPrice =
    status === 'filled' && executedQty > 0
      ? (cummulativeQuoteQty / executedQty).toString()
      : String(d['price'] ?? '0')

  // STOP_LOSS[_LIMIT] / TAKE_PROFIT[_LIMIT] are trigger orders; their
  // execution style (market vs limit) is the _LIMIT suffix.
  const rawType = String(d['type'] ?? 'MARKET').toUpperCase()
  const isTrigger = rawType.startsWith('STOP_') || rawType.startsWith('TAKE_')
  const stopPrice = String(d['stopPrice'] ?? '')

  return {
    ...(isTrigger
      ? {
          triggerOrder: true,
          ...(stopPrice && Number(stopPrice) > 0
            ? { triggerPrice: stopPrice }
            : {}),
        }
      : {}),
    orderId: String(d['orderId'] ?? ''),
    pair: String(d['symbol'] ?? ''),
    side: String(d['side'] ?? 'BUY').toLowerCase() as 'buy' | 'sell',
    type: isTrigger
      ? rawType.endsWith('_LIMIT')
        ? 'limit'
        : 'market'
      : (rawType.toLowerCase() as 'market' | 'limit'),
    size: String(d['origQty'] ?? ''),
    price: String(d['price'] ?? ''),
    fillSize: String(d['executedQty'] ?? ''),
    avgPrice,
    status,
    fee: '',
    feeCcy: '',
    ts: Number(d['updateTime'] ?? d['time'] ?? Date.now()),
    createdAt: Number(d['time'] ?? Date.now()),
  }
}

// ── Place order ──────────────────────────────────────────────────────

/** Place a Binance spot order. */
export async function placeBinanceOrder(
  params: OrderParams,
  credentials: BinanceCredentials,
  country: string,
): Promise<OrderResult> {
  const urls = resolveBinanceTradingUrls(country, params.mode === 'paper')
  const symbol = normalizePair(params.pair)
  const side = params.side.toUpperCase()

  // Exchange-native trigger orders map to Binance's stop order types:
  // sl+market → STOP_LOSS, sl+limit → STOP_LOSS_LIMIT,
  // tp+market → TAKE_PROFIT, tp+limit → TAKE_PROFIT_LIMIT.
  const type = params.trigger
    ? `${params.trigger.triggerType === 'tp' ? 'TAKE_PROFIT' : 'STOP_LOSS'}${
        params.type === 'limit' ? '_LIMIT' : ''
      }`
    : params.type.toUpperCase()

  const body: Record<string, string> = {
    symbol,
    side,
    type,
  }

  // For plain market orders with tgtCcy === 'quote_ccy', use quoteOrderQty
  // instead of quantity (stop order types only accept base quantity)
  if (type === 'MARKET' && params.tgtCcy === 'quote_ccy') {
    body['quoteOrderQty'] = params.size
  } else {
    body['quantity'] = params.size
  }

  if (params.trigger) {
    body['stopPrice'] = params.trigger.triggerPrice
  }

  // Limit-execution orders require price + timeInForce
  if (params.type === 'limit') {
    if (params.price) body['price'] = params.price
    body['timeInForce'] = 'GTC'
  }

  // Idempotency key — Binance rejects a duplicate newClientOrderId.
  if (params.clientOrderId) {
    body['newClientOrderId'] = params.clientOrderId
  }

  try {
    const signedQs = await signQuery(body, credentials)
    const resp = await fetch(`${urls.restBase}/api/v3/order`, {
      method: 'POST',
      headers: authHeaders(credentials),
      body: signedQs,
    })

    const json = (await resp.json()) as BinanceOrderRecord

    if (!resp.ok) {
      const errorMsg =
        String(json['msg'] ?? '') || `Binance error ${resp.status}`
      console.warn(
        `[binance-order] rejected: ${errorMsg} (${urls.restBase}, paper=${params.mode === 'paper'})`,
      )
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId: String(json['orderId'] ?? '') }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ─────────────────────────────────────────────────────

/** Cancel a Binance spot order. */
export async function cancelBinanceOrder(
  orderId: string,
  pair: string,
  credentials: BinanceCredentials,
  country: string,
  mode: 'paper' | 'live',
): Promise<OrderResult> {
  const urls = resolveBinanceTradingUrls(country, mode === 'paper')
  const symbol = normalizePair(pair)

  try {
    const signedQs = await signQuery({ symbol, orderId }, credentials)
    const resp = await fetch(`${urls.restBase}/api/v3/order?${signedQs}`, {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    })

    const json = (await resp.json()) as Record<string, unknown>

    if (!resp.ok) {
      const errorMsg =
        String(json['msg'] ?? '') || `Binance error ${resp.status}`
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Fetch balances ───────────────────────────────────────────────────

/** Fetch account balances from Binance spot account. */
export async function fetchBinanceBalances(
  credentials: BinanceCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  const urls = resolveBinanceTradingUrls(country, paper)

  try {
    const signedQs = await signQuery({}, credentials)
    const resp = await fetch(`${urls.restBase}/api/v3/account?${signedQs}`, {
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    })

    if (!resp.ok) return []

    const json = (await resp.json()) as {
      balances: Array<{ asset: string; free: string; locked: string }>
    }

    return (json.balances ?? [])
      .filter((b) => {
        const total = Number(b.free) + Number(b.locked)
        return total > 0
      })
      .map((b) => ({
        currency: b.asset,
        available: b.free,
        frozen: b.locked,
        total: (Number(b.free) + Number(b.locked)).toString(),
      }))
  } catch {
    return []
  }
}

// ── Fetch open orders ────────────────────────────────────────────────

/** Fetch currently open (pending) orders. */
export async function fetchBinanceOpenOrders(
  credentials: BinanceCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedOrderUpdate>> {
  const urls = resolveBinanceTradingUrls(country, paper)

  try {
    const signedQs = await signQuery({}, credentials)
    const resp = await fetch(`${urls.restBase}/api/v3/openOrders?${signedQs}`, {
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    })

    if (!resp.ok) return []

    const json = (await resp.json()) as Array<BinanceOrderRecord>
    return json.map(normalizeBinanceOrder)
  } catch {
    return []
  }
}

// ── Fetch order history ──────────────────────────────────────────────

/** Fetch recent order history (last 50 orders for a given symbol). */
export async function fetchBinanceOrderHistory(
  credentials: BinanceCredentials,
  country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  // Binance /api/v3/allOrders requires a symbol parameter
  if (!pair) return []

  const urls = resolveBinanceTradingUrls(country, paper)
  const symbol = normalizePair(pair)

  try {
    const signedQs = await signQuery({ symbol, limit: '50' }, credentials)
    const resp = await fetch(`${urls.restBase}/api/v3/allOrders?${signedQs}`, {
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    })

    if (!resp.ok) return []

    const json = (await resp.json()) as Array<BinanceOrderRecord>
    return json.map(normalizeBinanceOrder)
  } catch {
    return []
  }
}
