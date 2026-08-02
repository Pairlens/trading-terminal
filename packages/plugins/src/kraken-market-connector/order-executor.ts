// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken authenticated REST client — order execution, balances, history.
 *
 * Auth scheme (HMAC-SHA512):
 * 1. SHA256(nonce + postData)
 * 2. HMAC-SHA512(base64decode(secret), path + sha256hash)
 * 3. Base64-encode result → API-Sign header
 *
 * All private endpoints are POST.
 * Nonce must be strictly increasing per API key.
 *
 * Paper trading: Kraken has no public testnet.
 * Uses `validate: true` on AddOrder for dry-run order validation.
 */

import { restFetch as fetch } from '@pairlens/market-engine/http'
import { cleanAssetName, toRestPair } from './parser'
import { resolveKrakenRestBase } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'

type Credentials = {
  apiKey: string
  apiSecret: string
}

// ── Nonce: monotonically increasing, never repeats ──

let lastNonce = 0

function getNonce(): string {
  const now = Date.now()
  lastNonce = Math.max(lastNonce + 1, now)
  return lastNonce.toString()
}

// ── Kraken HMAC-SHA512 signer (Web Crypto API) ──

async function krakenSign(
  path: string,
  nonce: string,
  postData: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder()

  // 1. SHA256(nonce + postData)
  const sha256Hash = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(nonce + postData),
  )

  // 2. path bytes + SHA256 hash bytes
  const pathBytes = encoder.encode(path)
  const combined = new Uint8Array(pathBytes.length + sha256Hash.byteLength)
  combined.set(pathBytes, 0)
  combined.set(new Uint8Array(sha256Hash), pathBytes.length)

  // 3. HMAC-SHA512 with base64-decoded secret
  const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes.buffer,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, combined.buffer)

  // 4. Base64 encode
  let binary = ''
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b)
  return btoa(binary)
}

// ── Signed POST request helper ──

async function krakenPost(
  path: string,
  params: Record<string, string>,
  credentials: Credentials,
): Promise<unknown> {
  const base = resolveKrakenRestBase()
  const nonce = getNonce()
  params['nonce'] = nonce

  const postData = new URLSearchParams(params).toString()
  const apiSign = await krakenSign(
    `/0${path}`,
    nonce,
    postData,
    credentials.apiSecret,
  )

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'API-Key': credentials.apiKey,
      'API-Sign': apiSign,
    },
    body: postData,
  })

  if (!res.ok) throw new Error(`Kraken REST ${res.status}`)

  const json = (await res.json()) as { error: Array<string>; result: unknown }
  if (json.error?.length > 0) {
    const errors = json.error.filter((e: string) => e.startsWith('E'))
    if (errors.length > 0) throw new Error(errors[0])
  }

  return json.result
}

// ── Get WebSocket auth token ──

export async function getWsToken(credentials: Credentials): Promise<string> {
  const result = (await krakenPost(
    '/private/GetWebSocketsToken',
    {},
    credentials,
  )) as { token: string }
  return result.token
}

// ── Place order ──

export async function placeKrakenOrder(
  params: OrderParams,
  credentials: Credentials,
): Promise<OrderResult> {
  const pair = toRestPair(params.pair)
  const isPaper = params.mode === 'paper'

  // Trigger (TP/SL) orders map to Kraken's native conditional order
  // types. For those, `price` is the trigger price and `price2` the
  // post-trigger limit price ('-limit' variants only).
  const trigger = params.trigger
  const ordertype = trigger
    ? `${trigger.triggerType === 'sl' ? 'stop-loss' : 'take-profit'}${
        params.type === 'limit' ? '-limit' : ''
      }`
    : params.type

  const body: Record<string, string> = {
    pair,
    type: params.side,
    ordertype,
    volume: params.size,
  }

  if (trigger) {
    body['price'] = trigger.triggerPrice
    if (params.type === 'limit' && params.price) {
      body['price2'] = params.price
    }
  } else if (params.type === 'limit' && params.price) {
    body['price'] = params.price
  }

  // Paper mode: validate-only (dry run)
  if (isPaper) {
    body['validate'] = 'true'
  }

  try {
    const result = (await krakenPost(
      '/private/AddOrder',
      body,
      credentials,
    )) as { txid?: Array<string>; descr?: { order: string } }

    if (isPaper) {
      // Validate mode returns description but no txid
      return {
        success: true,
        orderId: `paper-${Date.now()}`,
      }
    }

    return {
      success: true,
      orderId: result.txid?.[0] ?? '',
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Cancel order ──

export async function cancelKrakenOrder(
  orderId: string,
  credentials: Credentials,
): Promise<OrderResult> {
  try {
    await krakenPost('/private/CancelOrder', { txid: orderId }, credentials)
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Fetch balances ──

export async function fetchKrakenBalances(
  credentials: Credentials,
): Promise<Array<NormalizedBalance>> {
  // BalanceEx returns `balance` + `hold_trade` (amount locked in open orders)
  // per asset, so we can report the frozen vs available split accurately.
  // The plain /Balance endpoint only returns the total, forcing frozen to 0.
  const result = (await krakenPost(
    '/private/BalanceEx',
    {},
    credentials,
  )) as Record<string, { balance?: string; hold_trade?: string }>

  const balances: Array<NormalizedBalance> = []
  for (const [rawAsset, info] of Object.entries(result)) {
    const currency = cleanAssetName(rawAsset)
    if (!currency) continue

    const total = Number(info?.balance ?? 0)
    if (total === 0) continue

    const frozen = Number(info?.hold_trade ?? 0)
    const available = total - frozen

    balances.push({
      currency,
      available: String(available),
      frozen: String(frozen),
      total: String(total),
    })
  }

  return balances
}

// ── Fetch open orders ──

export async function fetchKrakenOpenOrders(
  credentials: Credentials,
): Promise<Array<NormalizedOrderUpdate>> {
  const result = (await krakenPost(
    '/private/OpenOrders',
    { trades: 'true' },
    credentials,
  )) as { open: Record<string, KrakenOrder> }

  return Object.entries(result.open ?? {}).map(([id, o]) =>
    mapKrakenOrder(id, o),
  )
}

// ── Fetch closed/history orders ──

export async function fetchKrakenOrderHistory(
  credentials: Credentials,
): Promise<Array<NormalizedOrderUpdate>> {
  const result = (await krakenPost(
    '/private/ClosedOrders',
    { trades: 'true' },
    credentials,
  )) as { closed: Record<string, KrakenOrder> }

  return Object.entries(result.closed ?? {}).map(([id, o]) =>
    mapKrakenOrder(id, o),
  )
}

// ── Internal types and helpers ──

type KrakenOrder = {
  status: string
  opentm: number
  closetm?: number
  descr: {
    pair: string
    type: string
    ordertype: string
    price: string
    order: string
  }
  vol: string
  vol_exec: string
  cost: string
  fee: string
  price: string
  misc: string
}

function mapKrakenOrder(
  orderId: string,
  o: KrakenOrder,
): NormalizedOrderUpdate {
  // stop-loss / take-profit (-limit) are trigger orders; descr.price is
  // the trigger price for those, and the '-limit' suffix marks limit
  // execution. Kraken cancels them via the normal CancelOrder endpoint.
  const isTrigger = /^(stop-loss|take-profit)/.test(o.descr.ordertype)
  return {
    ...(isTrigger ? { triggerOrder: true, triggerPrice: o.descr.price } : {}),
    orderId,
    pair: o.descr.pair,
    side: o.descr.type as 'buy' | 'sell',
    type: isTrigger
      ? o.descr.ordertype.endsWith('-limit')
        ? 'limit'
        : 'market'
      : o.descr.ordertype === 'limit'
        ? 'limit'
        : 'market',
    size: o.vol,
    price: o.descr.price || '0',
    fillSize: o.vol_exec,
    avgPrice: o.price || '0',
    status: mapStatus(o.status),
    fee: o.fee,
    feeCcy: '',
    ts: (o.closetm ?? o.opentm) * 1000,
    createdAt: o.opentm * 1000,
  }
}

function mapStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'closed':
    case 'filled':
      return 'filled'
    case 'canceled':
    case 'expired':
      return 'cancelled'
    case 'partially_filled':
      return 'partially_filled'
    default:
      return 'live'
  }
}
