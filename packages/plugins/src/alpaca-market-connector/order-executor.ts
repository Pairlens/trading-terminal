// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { parseTs, toAlpacaSymbol, toPairKey } from './parser'
import { resolveAlpacaTradingUrls } from './regions'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderParams,
  OrderResult,
} from '@pairlens/market-engine/types'
import type { AlpacaCredentials } from './rest-client'

// Alpaca auth is two plain headers over TLS — no HMAC signing.
function authHeaders(credentials: AlpacaCredentials): Record<string, string> {
  return {
    'APCA-API-KEY-ID': credentials.apiKey,
    'APCA-API-SECRET-KEY': credentials.apiSecret,
    'Content-Type': 'application/json',
  }
}

// ── Status mapping ───────────────────────────────────────────────────

function mapAlpacaStatus(status: string): NormalizedOrderUpdate['status'] {
  switch (status) {
    case 'filled':
      return 'filled'
    case 'partially_filled':
      return 'partially_filled'
    case 'canceled':
    case 'expired':
    case 'rejected':
    case 'done_for_day':
    case 'stopped':
    case 'suspended':
      return 'cancelled'
    default:
      // new, accepted, pending_new, pending_cancel, pending_replace, held...
      return 'live'
  }
}

// ── Normalize an Alpaca order record ─────────────────────────────────

type AlpacaOrderRecord = Record<string, unknown>

export function normalizeAlpacaOrder(
  d: AlpacaOrderRecord,
): NormalizedOrderUpdate {
  const status = mapAlpacaStatus(String(d['status'] ?? 'new'))
  const createdAt = parseTs(d['created_at']) ?? Date.now()
  const updatedAt = parseTs(d['updated_at']) ?? createdAt

  // stop / stop_limit are trigger orders; stop_price is the trigger.
  const rawType = String(d['type'] ?? d['order_type'] ?? 'market')
  const isTrigger = rawType.startsWith('stop')

  return {
    ...(isTrigger
      ? { triggerOrder: true, triggerPrice: String(d['stop_price'] ?? '') }
      : {}),
    orderId: String(d['id'] ?? ''),
    pair: toPairKey(String(d['symbol'] ?? '')),
    side: String(d['side'] ?? 'buy') as 'buy' | 'sell',
    type: isTrigger
      ? rawType === 'stop_limit'
        ? 'limit'
        : 'market'
      : rawType === 'limit'
        ? 'limit'
        : 'market',
    // Notional (dollar-amount) orders have qty=null until filled.
    size: String(d['qty'] ?? d['filled_qty'] ?? ''),
    price: String(d['limit_price'] ?? ''),
    fillSize: String(d['filled_qty'] ?? '0'),
    avgPrice: String(d['filled_avg_price'] ?? '0'),
    status,
    fee: '', // Alpaca is commission-free for US equities
    feeCcy: '',
    ts: updatedAt,
    createdAt,
  }
}

// ── Place order ──────────────────────────────────────────────────────

/** Place an Alpaca stock order (paper or live, by params.mode). */
export async function placeAlpacaOrder(
  params: OrderParams,
  credentials: AlpacaCredentials,
): Promise<OrderResult> {
  const urls = resolveAlpacaTradingUrls(params.mode === 'paper')
  const symbol = toAlpacaSymbol(params.pair)

  // Trigger (TP/SL) orders: stop-losses use Alpaca's native stop /
  // stop_limit types. Take-profits have no standalone type on equities —
  // a resting GTC limit at the trigger price carries the same semantics
  // (the exit price is on the far side of the market, so it rests).
  const trigger = params.trigger
  const alpacaType = trigger
    ? trigger.triggerType === 'sl'
      ? params.type === 'limit'
        ? 'stop_limit'
        : 'stop'
      : 'limit'
    : params.type

  const body: Record<string, unknown> = {
    symbol,
    side: params.side,
    type: alpacaType,
  }

  // Sizing: base-denominated size maps to share qty; quote-denominated maps
  // to notional dollars (market orders only, per Alpaca rules — trigger
  // orders always size in shares).
  if (params.type === 'market' && params.tgtCcy === 'quote_ccy' && !trigger) {
    body['notional'] = params.size
  } else {
    body['qty'] = params.size
  }

  if (trigger) {
    if (trigger.triggerType === 'sl') {
      body['stop_price'] = trigger.triggerPrice
      if (params.type === 'limit' && params.price) {
        body['limit_price'] = params.price
      }
    } else {
      body['limit_price'] = params.price ?? trigger.triggerPrice
    }
    body['time_in_force'] = 'gtc'
  } else if (params.type === 'limit') {
    if (params.price) body['limit_price'] = params.price
    body['time_in_force'] = 'gtc'
  } else {
    // Fractional/notional market orders require 'day'.
    body['time_in_force'] = 'day'
  }

  // Idempotency key — Alpaca dedupes on client_order_id.
  if (params.clientOrderId) {
    body['client_order_id'] = params.clientOrderId
  }

  try {
    const resp = await fetch(`${urls.restBase}/v2/orders`, {
      method: 'POST',
      headers: authHeaders(credentials),
      body: JSON.stringify(body),
    })

    const json = (await resp.json()) as AlpacaOrderRecord

    if (!resp.ok) {
      const errorMsg =
        String(json['message'] ?? '') || `Alpaca error ${resp.status}`
      console.warn(
        `[alpaca-order] rejected: ${errorMsg} (paper=${params.mode === 'paper'})`,
      )
      return { success: false, error: errorMsg }
    }

    return { success: true, orderId: String(json['id'] ?? '') }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ── Cancel order ─────────────────────────────────────────────────────

export async function cancelAlpacaOrder(
  orderId: string,
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
): Promise<OrderResult> {
  const urls = resolveAlpacaTradingUrls(mode === 'paper')

  try {
    const resp = await fetch(
      `${urls.restBase}/v2/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'DELETE',
        headers: authHeaders(credentials),
      },
    )

    // 204 No Content on success
    if (!resp.ok) {
      let errorMsg = `Alpaca error ${resp.status}`
      try {
        const json = (await resp.json()) as Record<string, unknown>
        errorMsg = String(json['message'] ?? '') || errorMsg
      } catch {
        // No body — keep the status message
      }
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

/**
 * Balances for a stock account = cash (USD) + one entry per position, so the
 * trade panel can size orders exactly like it does for CEX base/quote
 * balances ('AAPL' shares to sell, 'USD' to buy with).
 */
export async function fetchAlpacaBalances(
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
): Promise<Array<NormalizedBalance>> {
  const urls = resolveAlpacaTradingUrls(mode === 'paper')
  const headers = authHeaders(credentials)

  try {
    const [accountResp, positionsResp] = await Promise.all([
      fetch(`${urls.restBase}/v2/account`, { headers }),
      fetch(`${urls.restBase}/v2/positions`, { headers }),
    ])

    if (!accountResp.ok) return []

    const account = (await accountResp.json()) as Record<string, unknown>
    const positions = positionsResp.ok
      ? ((await positionsResp.json()) as Array<Record<string, unknown>>)
      : []

    const balances: Array<NormalizedBalance> = []

    // Cash: `cash` is the settled dollar balance. Buying power can exceed it
    // on margin accounts — the conservative cash figure keeps order sizing
    // honest.
    const cash = Number(account['cash'] ?? 0)
    if (Number.isFinite(cash)) {
      balances.push({
        currency: 'USD',
        available: String(cash),
        frozen: '0',
        total: String(cash),
      })
    }

    for (const pos of positions) {
      const qty = Number(pos['qty'] ?? 0)
      const qtyAvailable = Number(pos['qty_available'] ?? qty)
      if (!Number.isFinite(qty) || qty === 0) continue
      balances.push({
        currency: String(pos['symbol'] ?? ''),
        available: String(qtyAvailable),
        frozen: String(Math.max(0, qty - qtyAvailable)),
        total: String(qty),
      })
    }

    return balances
  } catch {
    return []
  }
}

// ── Fetch orders ─────────────────────────────────────────────────────

export async function fetchAlpacaOpenOrders(
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
): Promise<Array<NormalizedOrderUpdate>> {
  return fetchAlpacaOrders(credentials, mode, 'open')
}

export async function fetchAlpacaOrderHistory(
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
): Promise<Array<NormalizedOrderUpdate>> {
  return fetchAlpacaOrders(credentials, mode, 'closed')
}

async function fetchAlpacaOrders(
  credentials: AlpacaCredentials,
  mode: 'paper' | 'live',
  status: 'open' | 'closed',
): Promise<Array<NormalizedOrderUpdate>> {
  const urls = resolveAlpacaTradingUrls(mode === 'paper')

  try {
    const resp = await fetch(
      `${urls.restBase}/v2/orders?status=${status}&limit=100&direction=desc`,
      { headers: authHeaders(credentials) },
    )

    if (!resp.ok) return []

    const json = (await resp.json()) as Array<AlpacaOrderRecord>
    return json.map(normalizeAlpacaOrder)
  } catch {
    return []
  }
}
