// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { scaleAmount, scaleAmountProduct } from '@pairlens/market-engine/amount'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { getKnownTokenByMint, resolveToken } from './token-registry'
import type { NormalizedOrderUpdate } from '@pairlens/market-engine/types'

// Jupiter Trigger API (formerly Limit Order API) — free "lite" tier.
// Resting on-chain limit orders: create/cancel return an unsigned
// transaction which we sign locally and submit via /execute.
// https://dev.jup.ag/docs/trigger-api
const TRIGGER_API = 'https://lite-api.jup.ag/trigger/v1'

const STABLE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
])

type ExecuteResult = { success: boolean; orderId?: string; error?: string }

/** Sign a base64 transaction with the wallet key and submit via /execute. */
async function signAndExecute(
  transaction: string,
  requestId: string,
  getPrivateKey: () => Promise<string | null>,
  orderId?: string,
): Promise<ExecuteResult> {
  const privateKey = await getPrivateKey()
  if (!privateKey) {
    return { success: false, error: 'Wallet private key not found' }
  }

  const { signBase64Transaction } = await import('./tx-signer')
  const { signedBase64 } = await signBase64Transaction(transaction, privateKey)

  const res = await fetch(`${TRIGGER_API}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      signedTransaction: signedBase64,
    }),
  })
  const json = (await res.json()) as {
    signature?: string
    status?: string
    error?: string
  }
  if (!res.ok || json.status === 'Failed') {
    return {
      success: false,
      error: json.error ?? `Trigger execute failed (${res.status})`,
    }
  }
  return { success: true, orderId: orderId ?? json.signature }
}

/**
 * Place a resting limit order. `size` is the BASE amount; `price` is quote
 * per base. A buy escrows quote (making) for base (taking); a sell the
 * reverse.
 */
export async function createTriggerOrder(opts: {
  pair: string
  side: 'buy' | 'sell'
  size: string
  price: string
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
}): Promise<ExecuteResult> {
  const { pair, side, size, price, walletAddress, getPrivateKey } = opts
  try {
    const [base, quote] = pair.split('-')
    if (!base || !quote)
      return { success: false, error: `Invalid pair: ${pair}` }

    const baseToken = await resolveToken(base)
    const quoteToken = await resolveToken(quote)
    if (!baseToken || !quoteToken) {
      return { success: false, error: `Cannot resolve pair: ${pair}` }
    }

    const baseUnits = scaleAmount(size, baseToken.decimals)
    const quoteUnits = scaleAmountProduct(size, price, quoteToken.decimals)
    if (baseUnits <= 0n || quoteUnits <= 0n) {
      return { success: false, error: 'Invalid size or price' }
    }

    const isBuy = side === 'buy'
    const body = {
      inputMint: isBuy ? quoteToken.address : baseToken.address,
      outputMint: isBuy ? baseToken.address : quoteToken.address,
      maker: walletAddress,
      payer: walletAddress,
      params: {
        makingAmount: (isBuy ? quoteUnits : baseUnits).toString(),
        takingAmount: (isBuy ? baseUnits : quoteUnits).toString(),
      },
      computeUnitPrice: 'auto',
    }

    const res = await fetch(`${TRIGGER_API}/createOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      code?: number
      requestId?: string
      order?: string
      transaction?: string
      error?: string
    }
    if (!res.ok || !json.transaction || !json.requestId) {
      return {
        success: false,
        error: json.error ?? `Trigger createOrder failed (${res.status})`,
      }
    }

    return signAndExecute(
      json.transaction,
      json.requestId,
      getPrivateKey,
      json.order,
    )
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Limit order failed',
    }
  }
}

/** Cancel a resting limit order by its order account address. */
export async function cancelTriggerOrder(opts: {
  order: string
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
}): Promise<ExecuteResult> {
  try {
    const res = await fetch(`${TRIGGER_API}/cancelOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maker: opts.walletAddress,
        order: opts.order,
        computeUnitPrice: 'auto',
      }),
    })
    const json = (await res.json()) as {
      requestId?: string
      transaction?: string
      error?: string
    }
    if (!res.ok || !json.transaction || !json.requestId) {
      return {
        success: false,
        error: json.error ?? `Trigger cancelOrder failed (${res.status})`,
      }
    }
    return signAndExecute(
      json.transaction,
      json.requestId,
      opts.getPrivateKey,
      opts.order,
    )
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Cancel failed',
    }
  }
}

type RawTriggerOrder = {
  orderKey?: string
  order?: string
  inputMint?: string
  outputMint?: string
  makingAmount?: string
  takingAmount?: string
  remainingMakingAmount?: string
  status?: string
  createdAt?: string
  updatedAt?: string
}

function mintSymbol(mint: string): string {
  return getKnownTokenByMint(mint)?.symbol ?? mint.slice(0, 6)
}

/**
 * Map a trigger order to the normalized order shape. Amounts from the
 * Trigger API are UI-denominated strings. Side is inferred from which leg
 * is the stable/quote mint: escrowing a stable means buying the other leg.
 */
export function toNormalizedTriggerOrder(
  raw: RawTriggerOrder,
): NormalizedOrderUpdate | null {
  const orderId = raw.orderKey ?? raw.order
  if (!orderId || !raw.inputMint || !raw.outputMint) return null

  const making = Number(raw.makingAmount) || 0
  const taking = Number(raw.takingAmount) || 0
  const isBuy = STABLE_MINTS.has(raw.inputMint)
  const baseMint = isBuy ? raw.outputMint : raw.inputMint
  const quoteMint = isBuy ? raw.inputMint : raw.outputMint
  const baseAmount = isBuy ? taking : making
  const quoteAmount = isBuy ? making : taking

  const status =
    raw.status === 'Completed'
      ? 'filled'
      : raw.status === 'Cancelled'
        ? 'cancelled'
        : 'live'

  const remaining = Number(raw.remainingMakingAmount)
  const filledRatio =
    status === 'filled'
      ? 1
      : making > 0 && Number.isFinite(remaining)
        ? 1 - remaining / making
        : 0

  const ts = raw.updatedAt ? Date.parse(raw.updatedAt) : Date.now()
  const createdAt = raw.createdAt ? Date.parse(raw.createdAt) : ts

  return {
    orderId,
    pair: `${mintSymbol(baseMint)}-${mintSymbol(quoteMint)}`,
    side: isBuy ? 'buy' : 'sell',
    type: 'limit',
    size: String(baseAmount),
    price: baseAmount > 0 ? String(quoteAmount / baseAmount) : '0',
    fillSize: (baseAmount * Math.max(0, Math.min(1, filledRatio))).toString(),
    avgPrice: baseAmount > 0 ? String(quoteAmount / baseAmount) : '0',
    status,
    fee: '0',
    feeCcy: '',
    ts: Number.isFinite(ts) ? ts : Date.now(),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  }
}

/** List a wallet's trigger orders, mapped to the normalized order shape. */
export async function listTriggerOrders(walletAddress: string): Promise<{
  open: Array<NormalizedOrderUpdate>
  history: Array<NormalizedOrderUpdate>
}> {
  const fetchPage = async (
    status: 'active' | 'history',
  ): Promise<Array<NormalizedOrderUpdate>> => {
    try {
      const res = await fetch(
        `${TRIGGER_API}/getTriggerOrders?user=${walletAddress}&orderStatus=${status}&page=1`,
      )
      if (!res.ok) return []
      const json = (await res.json()) as { orders?: Array<RawTriggerOrder> }
      return (json.orders ?? [])
        .map(toNormalizedTriggerOrder)
        .filter((o): o is NormalizedOrderUpdate => o !== null)
    } catch {
      return []
    }
  }

  const [open, history] = await Promise.all([
    fetchPage('active'),
    fetchPage('history'),
  ])
  return { open, history }
}
