// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { normalizePair } from './parser'
import { resolveBybitTestnetUrls, resolveBybitUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type BybitCredentials = {
  apiKey: string
  apiSecret: string
}

const RECV_WINDOW = '20000'

// ── URL resolution ────────────────────────────────────────────────────

function resolveRestBase(country: string, paper: boolean): string {
  if (paper) return resolveBybitTestnetUrls().restBase
  const urls = resolveBybitUrls(country)
  if (!urls) throw new Error('ByBit is not available in your region')
  return urls.restBase
}

// ── Signing ───────────────────────────────────────────────────────────

async function buildSignedHeaders(
  creds: BybitCredentials,
  method: 'GET' | 'POST',
  payload: string, // queryString for GET, JSON body for POST
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString()
  const prehash = `${timestamp}${creds.apiKey}${RECV_WINDOW}${payload}`
  const signature = await hmacSignHex(creds.apiSecret, prehash)

  return {
    'X-BAPI-API-KEY': creds.apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
  }
}

// ── Order status mapping ──────────────────────────────────────────────

function mapBybitStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'New':
      return 'live'
    case 'Filled':
      return 'filled'
    case 'Cancelled':
    case 'Canceled':
    case 'Deactivated':
    case 'Rejected':
      return 'cancelled'
    case 'PartiallyFilled':
    case 'PartiallyFilledCanceled':
      return 'partially_filled'
    default:
      return 'live'
  }
}

// ── Normalize ByBit order record ──────────────────────────────────────

type BybitOrderRecord = Record<string, string>

function normalizeBybitOrder(d: BybitOrderRecord): NormalizedOrderUpdate {
  // Spot TP/SL orders carry stopOrderType 'tpslOrder' + a triggerPrice
  // ('Untriggered' status maps to live via the default branch).
  const isTrigger =
    d['stopOrderType'] === 'tpslOrder' || Boolean(d['triggerPrice'])
  return {
    ...(isTrigger
      ? {
          triggerOrder: true,
          ...(d['triggerPrice'] ? { triggerPrice: d['triggerPrice'] } : {}),
        }
      : {}),
    orderId: d['orderId'] ?? '',
    pair: d['symbol'] ?? '',
    side: (d['side'] ?? 'Buy').toLowerCase() as 'buy' | 'sell',
    type: (d['orderType'] ?? 'Market').toLowerCase() as 'market' | 'limit',
    size: d['qty'] ?? '',
    price: d['price'] ?? '',
    fillSize: d['cumExecQty'] ?? '',
    avgPrice: d['avgPrice'] ?? '',
    status: mapBybitStatus(d['orderStatus'] ?? 'New'),
    fee: d['cumExecFee'] ?? '',
    feeCcy: d['feeCurrency'] ?? '',
    ts: Number(d['updatedTime'] ?? Date.now()),
    createdAt: Number(d['createdTime'] ?? Date.now()),
  }
}

// ── Place order ───────────────────────────────────────────────────────

export async function placeBybitOrder(
  params: OrderParams,
  credentials: BybitCredentials,
  country: string,
): Promise<OrderResult> {
  const restBase = resolveRestBase(country, params.mode === 'paper')
  const path = '/v5/order/create'

  const side = params.side === 'buy' ? 'Buy' : 'Sell'
  const orderType = params.type === 'market' ? 'Market' : 'Limit'

  const bodyObj: Record<string, string> = {
    category: 'spot',
    symbol: normalizePair(params.pair),
    side,
    orderType,
    qty: params.size,
  }

  // Exchange-native trigger (TP/SL) order — rests on ByBit and activates
  // when the last price crosses triggerPrice (spot infers the trigger
  // direction from triggerPrice vs the current market price).
  if (params.trigger) {
    bodyObj['orderFilter'] = 'tpslOrder'
    bodyObj['triggerPrice'] = params.trigger.triggerPrice
  }

  if (params.type === 'limit' && params.price) {
    bodyObj['price'] = params.price
    bodyObj['timeInForce'] = 'GTC'
  }

  if (params.type === 'market') {
    if (params.tgtCcy === 'quote_ccy') {
      bodyObj['marketUnit'] = 'quoteCoin'
    } else if (params.trigger) {
      // Spot market BUY qty defaults to quote units on ByBit — trigger
      // order sizes are always base, so pin the unit explicitly.
      bodyObj['marketUnit'] = 'baseCoin'
    }
  }

  // Idempotency key — ByBit rejects a duplicate orderLinkId.
  if (params.clientOrderId) {
    bodyObj['orderLinkId'] = params.clientOrderId
  }

  const body = JSON.stringify(bodyObj)
  const headers = await buildSignedHeaders(credentials, 'POST', body)

  try {
    const resp = await fetch(`${restBase}${path}`, {
      method: 'POST',
      headers,
      body,
    })

    const json = (await resp.json()) as {
      retCode: number
      retMsg: string
      result: { orderId?: string }
    }

    if (json.retCode !== 0) {
      const errorMsg = json.retMsg || `ByBit error ${json.retCode}`
      console.warn(
        `[bybit-order] rejected: ${errorMsg} (${restBase}, paper=${params.mode === 'paper'})`,
      )
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId: json.result?.orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ──────────────────────────────────────────────────────

export async function cancelBybitOrder(
  orderId: string,
  pair: string,
  credentials: BybitCredentials,
  country: string,
  mode: 'paper' | 'live',
  opts?: { trigger?: boolean },
): Promise<OrderResult> {
  const restBase = resolveRestBase(country, mode === 'paper')
  const path = '/v5/order/cancel'

  // Spot trigger orders sit behind orderFilter 'tpslOrder' — cancelling
  // without it targets the regular order book and misses them.
  const body = JSON.stringify({
    category: 'spot',
    symbol: normalizePair(pair),
    orderId,
    ...(opts?.trigger ? { orderFilter: 'tpslOrder' } : {}),
  })

  const headers = await buildSignedHeaders(credentials, 'POST', body)

  try {
    const resp = await fetch(`${restBase}${path}`, {
      method: 'POST',
      headers,
      body,
    })

    const json = (await resp.json()) as {
      retCode: number
      retMsg: string
    }

    if (json.retCode !== 0) {
      return { success: false, error: `${json.retCode}: ${json.retMsg}` }
    }
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Fetch balances ────────────────────────────────────────────────────

export async function fetchBybitBalances(
  credentials: BybitCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedBalance>> {
  const restBase = resolveRestBase(country, paper)
  const path = '/v5/account/wallet-balance'
  const queryString = 'accountType=UNIFIED'
  const headers = await buildSignedHeaders(credentials, 'GET', queryString)

  try {
    const resp = await fetch(`${restBase}${path}?${queryString}`, { headers })
    const json = (await resp.json()) as {
      retCode: number
      result: {
        list: Array<{
          coin: Array<{
            coin: string
            availableToWithdraw: string
            locked: string
            walletBalance: string
            availableToTrade?: string
          }>
        }>
      }
    }
    if (json.retCode !== 0) return []

    const coins = json.result?.list?.[0]?.coin ?? []
    return coins
      .filter((c) => Number(c.walletBalance ?? 0) > 0)
      .map((c) => ({
        currency: c.coin ?? '',
        available: c.availableToTrade ?? c.availableToWithdraw ?? '0',
        frozen: c.locked ?? '0',
        total: c.walletBalance ?? '0',
      }))
  } catch {
    return []
  }
}

// ── Fetch open orders ─────────────────────────────────────────────────

export async function fetchBybitOpenOrders(
  credentials: BybitCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveRestBase(country, paper)
  const path = '/v5/order/realtime'

  const fetchList = async (
    queryString: string,
  ): Promise<Array<BybitOrderRecord>> => {
    const headers = await buildSignedHeaders(credentials, 'GET', queryString)
    const resp = await fetch(`${restBase}${path}?${queryString}`, { headers })
    const json = (await resp.json()) as {
      retCode: number
      result: { list: Array<BybitOrderRecord> }
    }
    return json.retCode === 0 ? (json.result?.list ?? []) : []
  }

  try {
    // Spot TP/SL orders may be filtered out of the default listing on
    // classic accounts — query orderFilter=tpslOrder explicitly and
    // de-dup by orderId (unified accounts return everything unfiltered).
    const [regular, tpsl] = await Promise.all([
      fetchList('category=spot'),
      fetchList('category=spot&orderFilter=tpslOrder').catch(
        () => [] as Array<BybitOrderRecord>,
      ),
    ])
    const seen = new Set(regular.map((d) => d['orderId']))
    const merged = [...regular, ...tpsl.filter((d) => !seen.has(d['orderId']))]
    return merged.map(normalizeBybitOrder)
  } catch {
    return []
  }
}

// ── Fetch order history ───────────────────────────────────────────────

export async function fetchBybitOrderHistory(
  credentials: BybitCredentials,
  country: string,
  paper: boolean,
): Promise<Array<NormalizedOrderUpdate>> {
  const restBase = resolveRestBase(country, paper)
  const path = '/v5/order/history'
  const queryString = 'category=spot&limit=50'
  const headers = await buildSignedHeaders(credentials, 'GET', queryString)

  try {
    const resp = await fetch(`${restBase}${path}?${queryString}`, { headers })
    const json = (await resp.json()) as {
      retCode: number
      result: { list: Array<BybitOrderRecord> }
    }
    if (json.retCode !== 0) return []
    return (json.result?.list ?? []).map(normalizeBybitOrder)
  } catch {
    return []
  }
}
