// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { scaleAmount, scaleAmountProduct } from '@pairlens/market-engine/amount'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { getViemChain } from './chains'
import { ERC20_ABI } from './swap-executor'
import { resolveToken } from './token-client'
import type { EvmChainConfig } from './chains'
import type { EvmToken } from './types'
import type { NormalizedOrderUpdate } from '@pairlens/market-engine/types'

// KyberSwap Limit Order (DSLO) API — keyless. Orders are signed EIP-712
// payloads resting off-chain; the maker only needs an ERC-20 allowance to
// the DSLO contract. https://docs.kyberswap.com/kyberswap-solutions/limit-order
const LO_API = 'https://limit-order.kyberswap.com'

type ExecuteResult = { success: boolean; orderId?: string; error?: string }

export type TypedDataPayload = {
  types: Record<string, Array<{ name: string; type: string }>>
  domain: Record<string, unknown>
  primaryType: string
  message: Record<string, unknown>
}

/** True when the payload's EIP-712 domain is pinned to `chainId`. */
function domainChainIdEquals(
  domain: Record<string, unknown>,
  chainId: number,
): boolean {
  const value = domain['chainId']
  if (value == null) return false
  try {
    return BigInt(value as string | number) === BigInt(chainId)
  } catch {
    return false
  }
}

/**
 * Fail-closed guard on the EIP-712 order payload the LO API asks us to
 * sign. The payload is untrusted input: a compromised API could substitute
 * a different maker, asset pair, or amounts, and our signature would
 * authorize that order instead of the user's. Every critical field must be
 * PRESENT and equal to the order the user requested — a missing field is a
 * rejection, not a pass. Non-critical fields (salt, receiver, allowedSender,
 * expiry, fee config) are accepted as-is; they cannot re-denominate the
 * trade asserted here, though a hostile `receiver`/fee config is residual
 * trust in the API (viem cannot know Kyber's full schema locally).
 *
 * Returns a description of the first mismatch, or null when safe to sign.
 */
export function validateOrderSignPayload(
  payload: TypedDataPayload,
  expected: {
    chainId: number
    maker: string
    makerAsset: string
    takerAsset: string
    makingAmount: bigint
    takingAmount: bigint
  },
): string | null {
  if (payload.primaryType !== 'Order') {
    return `unexpected primaryType '${payload.primaryType}'`
  }
  if (!domainChainIdEquals(payload.domain, expected.chainId)) {
    return `domain chainId ${String(payload.domain['chainId'])} != ${expected.chainId}`
  }
  const msg = payload.message
  const addressEquals = (value: unknown, want: string): boolean =>
    typeof value === 'string' && value.toLowerCase() === want.toLowerCase()
  const amountEquals = (value: unknown, want: bigint): boolean => {
    if (value == null) return false
    try {
      return BigInt(value as string | number) === want
    } catch {
      return false
    }
  }
  if (!addressEquals(msg['maker'], expected.maker)) {
    return `maker ${String(msg['maker'])} != ${expected.maker}`
  }
  if (!addressEquals(msg['makerAsset'], expected.makerAsset)) {
    return `makerAsset ${String(msg['makerAsset'])} != ${expected.makerAsset}`
  }
  if (!addressEquals(msg['takerAsset'], expected.takerAsset)) {
    return `takerAsset ${String(msg['takerAsset'])} != ${expected.takerAsset}`
  }
  if (!amountEquals(msg['makingAmount'], expected.makingAmount)) {
    return `makingAmount ${String(msg['makingAmount'])} != ${expected.makingAmount}`
  }
  if (!amountEquals(msg['takingAmount'], expected.takingAmount)) {
    return `takingAmount ${String(msg['takingAmount'])} != ${expected.takingAmount}`
  }
  return null
}

/**
 * The API serializes uint values as strings; viem's typed-data hashing
 * needs bigints. Coerce based on the declared field types.
 */
export function coerceTypedMessage(
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...message }
  for (const field of types[primaryType] ?? []) {
    const value = out[field.name]
    if (value == null) continue
    if (/^u?int\d*$/.test(field.type) && typeof value !== 'bigint') {
      out[field.name] = BigInt(value as string | number)
    } else if (/^u?int\d*\[\]$/.test(field.type) && Array.isArray(value)) {
      out[field.name] = value.map((v) =>
        typeof v === 'bigint' ? v : BigInt(v as string | number),
      )
    }
  }
  return out
}

async function getLoContractAddress(chainId: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${LO_API}/read-ks/api/v1/configs/contract-address?chainId=${chainId}`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { latest?: string } }
    return json.data?.latest ?? null
  } catch {
    return null
  }
}

export async function signTypedPayload(
  payload: TypedDataPayload,
  privateKey: string,
): Promise<`0x${string}`> {
  const { privateKeyToAccount } = await import('viem/accounts')
  const account = privateKeyToAccount(
    (privateKey.startsWith('0x')
      ? privateKey
      : `0x${privateKey}`) as `0x${string}`,
  )
  // viem derives the domain hash itself — EIP712Domain must not be in types.
  // The payload comes from the API at runtime, so it can't satisfy viem's
  // compile-time typed-data generics; cast the parameter object as a whole.
  const { EIP712Domain: _domain, ...types } = payload.types
  return account.signTypedData({
    domain: payload.domain,
    types,
    primaryType: payload.primaryType,
    message: coerceTypedMessage(
      payload.types,
      payload.primaryType,
      payload.message,
    ),
  } as unknown as Parameters<typeof account.signTypedData>[0])
}

/**
 * Place a resting limit order. `size` is the BASE amount; `price` is quote
 * per base. A buy escrows quote (maker asset) for base; a sell the reverse.
 */
export async function createLimitOrder(opts: {
  chain: EvmChainConfig
  pair: string
  side: 'buy' | 'sell'
  size: string
  price: string
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
  rpcUrl: string
}): Promise<ExecuteResult> {
  const {
    chain,
    pair,
    side,
    size,
    price,
    walletAddress,
    getPrivateKey,
    rpcUrl,
  } = opts
  try {
    const [base, quote] = pair.split('-')
    if (!base || !quote)
      return { success: false, error: `Invalid pair: ${pair}` }

    const baseToken = await resolveToken(chain, base)
    const quoteToken = await resolveToken(chain, quote)
    if (!baseToken || !quoteToken) {
      return { success: false, error: `Cannot resolve pair: ${pair}` }
    }

    const isBuy = side === 'buy'
    const makerToken = isBuy ? quoteToken : baseToken
    const takerToken = isBuy ? baseToken : quoteToken
    const baseUnits = scaleAmount(size, baseToken.decimals)
    const quoteUnits = scaleAmountProduct(size, price, quoteToken.decimals)
    const makingAmount = isBuy ? quoteUnits : baseUnits
    const takingAmount = isBuy ? baseUnits : quoteUnits
    if (makingAmount <= 0n || takingAmount <= 0n) {
      return { success: false, error: 'Invalid size or price' }
    }

    const loContract = await getLoContractAddress(chain.chainId)
    if (!loContract) {
      return {
        success: false,
        error: `Limit orders unavailable on ${chain.displayName}`,
      }
    }

    const privateKey = await getPrivateKey()
    if (!privateKey) {
      return { success: false, error: 'Wallet private key not found' }
    }

    // Ensure the DSLO contract can pull the maker asset when filled
    const { createPublicClient, createWalletClient, http } =
      await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const viemChain = await getViemChain(chain.market)
    const account = privateKeyToAccount(
      (privateKey.startsWith('0x')
        ? privateKey
        : `0x${privateKey}`) as `0x${string}`,
    )
    if (account.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return { success: false, error: 'Private key does not match wallet' }
    }
    const transport = http(rpcUrl)
    const publicClient = createPublicClient({ chain: viemChain, transport })
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport,
    })

    const allowance = await publicClient.readContract({
      address: makerToken.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, loContract as `0x${string}`],
    })
    if (allowance < makingAmount) {
      const approveHash = await walletClient.writeContract({
        address: makerToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [loContract as `0x${string}`, makingAmount],
      })
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      })
      if (receipt.status !== 'success') {
        return { success: false, error: 'Token approval failed' }
      }
    }

    // Build → sign → submit the order
    const expiredAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600
    const orderBody = {
      chainId: String(chain.chainId),
      makerAsset: makerToken.address,
      takerAsset: takerToken.address,
      maker: walletAddress,
      makingAmount: makingAmount.toString(),
      takingAmount: takingAmount.toString(),
      expiredAt,
    }

    const signRes = await fetch(`${LO_API}/write/api/v1/orders/sign-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderBody),
    })
    const signJson = (await signRes.json()) as {
      code?: number
      message?: string
      data?: TypedDataPayload
    }
    if (!signRes.ok || signJson.code !== 0 || !signJson.data) {
      return {
        success: false,
        error: `Limit order build failed: ${signJson.message ?? signRes.status}`,
      }
    }

    // Never blind-sign: the payload must encode exactly the order the
    // user requested, on this chain, or we refuse.
    const payloadError = validateOrderSignPayload(signJson.data, {
      chainId: chain.chainId,
      maker: walletAddress,
      makerAsset: makerToken.address,
      takerAsset: takerToken.address,
      makingAmount,
      takingAmount,
    })
    if (payloadError) {
      return {
        success: false,
        error: `Refusing to sign limit order payload: ${payloadError}`,
      }
    }

    const signature = await signTypedPayload(signJson.data, privateKey)

    const createRes = await fetch(`${LO_API}/write/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...signJson.data.message,
        ...orderBody,
        signature,
      }),
    })
    const createJson = (await createRes.json()) as {
      code?: number
      message?: string
      data?: { id?: number | string }
    }
    if (!createRes.ok || createJson.code !== 0) {
      return {
        success: false,
        error: `Limit order submit failed: ${createJson.message ?? createRes.status}`,
      }
    }
    return { success: true, orderId: String(createJson.data?.id ?? '') }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Limit order failed',
    }
  }
}

/** Gasless cancel: sign a CancelOrder payload and submit it off-chain. */
export async function cancelLimitOrder(opts: {
  chain: EvmChainConfig
  orderId: string
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
}): Promise<ExecuteResult> {
  const { chain, orderId, walletAddress, getPrivateKey } = opts
  try {
    const privateKey = await getPrivateKey()
    if (!privateKey) {
      return { success: false, error: 'Wallet private key not found' }
    }

    const cancelBody = {
      chainId: String(chain.chainId),
      maker: walletAddress,
      orderIds: [Number(orderId)],
    }
    const signRes = await fetch(`${LO_API}/write/api/v1/orders/cancel-sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelBody),
    })
    const signJson = (await signRes.json()) as {
      code?: number
      message?: string
      data?: TypedDataPayload
    }
    if (!signRes.ok || signJson.code !== 0 || !signJson.data) {
      return {
        success: false,
        error: `Cancel build failed: ${signJson.message ?? signRes.status}`,
      }
    }

    // The cancel path must never sign an Order payload — a malicious
    // response could otherwise turn "cancel" into "create order" — and the
    // domain must be pinned to this chain. We cannot verify the orderIds
    // inside the payload beyond this (schema is API-defined); a forged
    // cancel signature can at worst cancel the maker's own orders.
    if (
      signJson.data.primaryType === 'Order' ||
      !domainChainIdEquals(signJson.data.domain, chain.chainId)
    ) {
      return {
        success: false,
        error: 'Refusing to sign cancel payload: unexpected type or chain',
      }
    }

    const signature = await signTypedPayload(signJson.data, privateKey)

    const cancelRes = await fetch(`${LO_API}/write/api/v1/orders/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cancelBody, signature }),
    })
    const cancelJson = (await cancelRes.json()) as {
      code?: number
      message?: string
    }
    if (!cancelRes.ok || cancelJson.code !== 0) {
      return {
        success: false,
        error: `Cancel failed: ${cancelJson.message ?? cancelRes.status}`,
      }
    }
    return { success: true, orderId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Cancel failed',
    }
  }
}

type RawLimitOrder = {
  id?: number | string
  makerAsset?: string
  takerAsset?: string
  makingAmount?: string
  takingAmount?: string
  filledMakingAmount?: string
  status?: string
  createdAt?: number
}

/**
 * Map a KyberSwap limit order to the normalized order shape. Amounts are
 * raw token units — scale them down via each leg's decimals.
 */
export async function toNormalizedLimitOrder(
  chain: EvmChainConfig,
  raw: RawLimitOrder,
): Promise<NormalizedOrderUpdate | null> {
  if (raw.id == null || !raw.makerAsset || !raw.takerAsset) return null

  const isBuy =
    raw.makerAsset.toLowerCase() === chain.quote.address.toLowerCase()
  const baseAddress = isBuy ? raw.takerAsset : raw.makerAsset
  const quoteAddress = isBuy ? raw.makerAsset : raw.takerAsset

  const baseToken: EvmToken = (await resolveToken(chain, baseAddress)) ?? {
    address: baseAddress,
    symbol: baseAddress.slice(0, 6),
    name: baseAddress,
    decimals: 18,
  }
  const quoteToken: EvmToken = (await resolveToken(chain, quoteAddress)) ?? {
    address: quoteAddress,
    symbol: quoteAddress.slice(0, 6),
    name: quoteAddress,
    decimals: 18,
  }

  const toUi = (rawAmount: string | undefined, decimals: number): number => {
    const n = Number(rawAmount)
    return Number.isFinite(n) ? n / 10 ** decimals : 0
  }

  const making = toUi(
    raw.makingAmount,
    isBuy ? quoteToken.decimals : baseToken.decimals,
  )
  const taking = toUi(
    raw.takingAmount,
    isBuy ? baseToken.decimals : quoteToken.decimals,
  )
  const filledMaking = toUi(
    raw.filledMakingAmount,
    isBuy ? quoteToken.decimals : baseToken.decimals,
  )

  const baseAmount = isBuy ? taking : making
  const quoteAmount = isBuy ? making : taking
  const fillRatio = making > 0 ? Math.min(1, filledMaking / making) : 0

  const status =
    raw.status === 'filled'
      ? 'filled'
      : raw.status === 'cancelled' || raw.status === 'cancelling'
        ? 'cancelled'
        : fillRatio > 0
          ? 'partially_filled'
          : 'live'

  const ts =
    typeof raw.createdAt === 'number' ? raw.createdAt * 1000 : Date.now()

  return {
    orderId: String(raw.id),
    pair: `${baseToken.symbol}-${quoteToken.symbol}`,
    side: isBuy ? 'buy' : 'sell',
    type: 'limit',
    size: String(baseAmount),
    price: baseAmount > 0 ? String(quoteAmount / baseAmount) : '0',
    fillSize: String(baseAmount * fillRatio),
    avgPrice: baseAmount > 0 ? String(quoteAmount / baseAmount) : '0',
    status,
    fee: '0',
    feeCcy: '',
    ts,
    createdAt: ts,
  }
}

/** List a maker's limit orders, mapped to the normalized order shape. */
export async function listLimitOrders(
  chain: EvmChainConfig,
  maker: string,
): Promise<{
  open: Array<NormalizedOrderUpdate>
  history: Array<NormalizedOrderUpdate>
}> {
  const fetchStatus = async (status: string): Promise<Array<RawLimitOrder>> => {
    try {
      const res = await fetch(
        `${LO_API}/read-ks/api/v1/orders?chainId=${chain.chainId}&maker=${maker}&status=${status}`,
      )
      if (!res.ok) return []
      const json = (await res.json()) as {
        data?: { orders?: Array<RawLimitOrder> }
      }
      return json.data?.orders ?? []
    } catch {
      return []
    }
  }

  const [active, closed] = await Promise.all([
    fetchStatus('active'),
    fetchStatus('closed'),
  ])

  const mapAll = async (orders: Array<RawLimitOrder>) => {
    const mapped = await Promise.all(
      orders.map((o) => toNormalizedLimitOrder(chain, o)),
    )
    return mapped.filter((o): o is NormalizedOrderUpdate => o !== null)
  }

  return { open: await mapAll(active), history: await mapAll(closed) }
}
