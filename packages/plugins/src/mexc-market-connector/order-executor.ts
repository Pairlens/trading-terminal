// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { normalizePair } from './parser'
import { resolveMexcUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type MexcCredentials = {
  apiKey: string
  apiSecret: string
}

// ── Signing ─────────────────────────────────────────────────────────

/**
 * Build a signed query string for MEXC.
 * MEXC uses the same signing as Binance: HMAC-SHA256 hex over the query string,
 * appended as &signature=<hex>.
 */
async function signQueryString(
  queryString: string,
  secret: string,
): Promise<string> {
  const signature = await hmacSignHex(secret, queryString)
  return `${queryString}&signature=${signature}`
}

function resolveRestBase(country: string): string {
  const urls = resolveMexcUrls(country)
  if (!urls) throw new Error('MEXC is not available in your region')
  return urls.restBase
}

// ── Place order ─────────────────────────────────────────────────────

/** Place an order on MEXC spot. */
export async function placeMexcOrder(
  params: OrderParams,
  credentials: MexcCredentials,
  country: string,
): Promise<OrderResult> {
  // MEXC does not support paper trading
  if (params.mode === 'paper') {
    return { success: false, error: 'MEXC does not support paper trading' }
  }

  const restBase = resolveRestBase(country)
  const symbol = normalizePair(params.pair)
  const timestamp = Date.now()

  const queryParts: Array<string> = [
    `symbol=${symbol}`,
    `side=${params.side.toUpperCase()}`,
    `type=${params.type.toUpperCase()}`,
    `timestamp=${timestamp}`,
  ]

  // For market orders with quote currency sizing, use quoteOrderQty
  if (params.type === 'market' && params.tgtCcy === 'quote_ccy') {
    queryParts.push(`quoteOrderQty=${params.size}`)
  } else {
    queryParts.push(`quantity=${params.size}`)
  }

  // For limit orders, add price (MEXC does not use timeInForce)
  if (params.type === 'limit' && params.price) {
    queryParts.push(`price=${params.price}`)
  }

  const queryString = queryParts.join('&')

  try {
    const signedQuery = await signQueryString(
      queryString,
      credentials.apiSecret,
    )

    const resp = await fetch(`${restBase}/api/v3/order?${signedQuery}`, {
      method: 'POST',
      headers: {
        'X-MEXC-APIKEY': credentials.apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!resp.ok) {
      const errorJson = (await resp.json().catch(() => ({}))) as {
        msg?: string
        code?: number
      }
      const errorMsg =
        errorJson.msg || `MEXC order rejected: HTTP ${resp.status}`
      console.warn(`[mexc-order] rejected: ${errorMsg} (${restBase})`)
      return { success: false, error: errorMsg }
    }

    const json = (await resp.json()) as { orderId?: string; symbol?: string }
    return {
      success: true,
      orderId: json.orderId ? String(json.orderId) : undefined,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ────────────────────────────────────────────────────

/** Cancel an order on MEXC spot. */
export async function cancelMexcOrder(
  orderId: string,
  pair: string,
  credentials: MexcCredentials,
  country: string,
  mode: 'paper' | 'live',
): Promise<OrderResult> {
  if (mode === 'paper') {
    return { success: false, error: 'MEXC does not support paper trading' }
  }

  const restBase = resolveRestBase(country)
  const symbol = normalizePair(pair)
  const timestamp = Date.now()

  const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`

  try {
    const signedQuery = await signQueryString(
      queryString,
      credentials.apiSecret,
    )

    const resp = await fetch(`${restBase}/api/v3/order?${signedQuery}`, {
      method: 'DELETE',
      headers: {
        'X-MEXC-APIKEY': credentials.apiKey,
      },
    })

    if (!resp.ok) {
      const errorJson = (await resp.json().catch(() => ({}))) as {
        msg?: string
      }
      return {
        success: false,
        error: errorJson.msg || `Cancel failed: HTTP ${resp.status}`,
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

// ── Fetch balances ──────────────────────────────────────────────────

/** Fetch account balances from MEXC spot. */
export async function fetchMexcBalances(
  credentials: MexcCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  if (paper) return [] // No paper trading on MEXC

  const restBase = resolveRestBase(country)
  const timestamp = Date.now()
  const queryString = `timestamp=${timestamp}`

  try {
    const signedQuery = await signQueryString(
      queryString,
      credentials.apiSecret,
    )

    const resp = await fetch(`${restBase}/api/v3/account?${signedQuery}`, {
      headers: {
        'X-MEXC-APIKEY': credentials.apiKey,
      },
    })

    if (!resp.ok) return []

    const json = (await resp.json()) as {
      balances?: Array<{ asset: string; free: string; locked: string }>
    }

    return (json.balances ?? [])
      .filter((b) => Number(b.free) > 0 || Number(b.locked) > 0)
      .map((b) => ({
        currency: b.asset,
        available: b.free,
        frozen: b.locked,
        total: String(Number(b.free) + Number(b.locked)),
      }))
  } catch {
    return []
  }
}

// ── Fetch open orders ───────────────────────────────────────────────

/** Fetch open (pending) orders from MEXC spot. */
export async function fetchMexcOpenOrders(
  credentials: MexcCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedOrderUpdate>> {
  if (paper) return []

  const restBase = resolveRestBase(country)
  const timestamp = Date.now()
  const queryString = `timestamp=${timestamp}`

  try {
    const signedQuery = await signQueryString(
      queryString,
      credentials.apiSecret,
    )

    const resp = await fetch(`${restBase}/api/v3/openOrders?${signedQuery}`, {
      headers: {
        'X-MEXC-APIKEY': credentials.apiKey,
      },
    })

    if (!resp.ok) return []

    const json = (await resp.json()) as Array<MexcOrderRecord>
    return json.map(normalizeMexcOrder)
  } catch {
    return []
  }
}

// ── Fetch order history ─────────────────────────────────────────────

/** Fetch recent order history from MEXC spot (requires symbol). */
export async function fetchMexcOrderHistory(
  credentials: MexcCredentials,
  country: string,
  paper: boolean,
  pair?: string,
): Promise<Array<NormalizedOrderUpdate>> {
  if (paper) return []
  // MEXC /api/v3/allOrders requires a symbol parameter
  if (!pair) return []

  const restBase = resolveRestBase(country)
  const symbol = normalizePair(pair)
  const timestamp = Date.now()
  const queryString = `symbol=${symbol}&timestamp=${timestamp}&limit=50`

  try {
    const signedQuery = await signQueryString(
      queryString,
      credentials.apiSecret,
    )

    const resp = await fetch(`${restBase}/api/v3/allOrders?${signedQuery}`, {
      headers: {
        'X-MEXC-APIKEY': credentials.apiKey,
      },
    })

    if (!resp.ok) return []

    const json = (await resp.json()) as Array<MexcOrderRecord>
    return json.map(normalizeMexcOrder)
  } catch {
    return []
  }
}

// ── Normalization helpers ───────────────────────────────────────────

type MexcOrderRecord = {
  orderId?: string | number
  symbol?: string
  side?: string
  type?: string
  origQty?: string
  price?: string
  executedQty?: string
  cummulativeQuoteQty?: string
  status?: string
  time?: number
  updateTime?: number
}

function mapMexcStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'FILLED':
      return 'filled'
    case 'CANCELED':
      return 'cancelled'
    case 'PARTIALLY_FILLED':
      return 'partially_filled'
    default:
      return 'live'
  }
}

function normalizeMexcOrder(d: MexcOrderRecord): NormalizedOrderUpdate {
  const executedQty = Number(d.executedQty ?? 0)
  const cummulativeQuoteQty = Number(d.cummulativeQuoteQty ?? 0)
  const avgPrice =
    executedQty > 0 ? String(cummulativeQuoteQty / executedQty) : '0'

  return {
    orderId: String(d.orderId ?? ''),
    pair: d.symbol ?? '',
    side: (d.side?.toLowerCase() ?? 'buy') as 'buy' | 'sell',
    type: (d.type?.toLowerCase() ?? 'market') as 'market' | 'limit',
    size: d.origQty ?? '0',
    price: d.price ?? '0',
    fillSize: d.executedQty ?? '0',
    avgPrice,
    status: mapMexcStatus(d.status ?? ''),
    fee: '0', // MEXC does not return fee in order list responses
    feeCcy: '',
    ts: d.updateTime ?? Date.now(),
    createdAt: d.time ?? Date.now(),
  }
}
