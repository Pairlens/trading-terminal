// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `GET /v1/quote`, parsed, and anchored to the request that asked for it.
 *
 * The response is untrusted input on the read path and load-bearing on the
 * signing path, so the parse and the anchor are one step. Anchoring means the
 * quote is only accepted when the aggregator echoed back the SAME two chains,
 * the SAME two tokens, the SAME amount and the SAME two addresses the connector
 * asked about. Everything downstream (the fee shown, the floor a transfer is
 * checked against, the transaction that gets signed) then describes the
 * transfer the user is looking at rather than whatever the API felt like
 * answering.
 *
 * Two addresses, not one, since Solana joined. An EVM-to-EVM transfer sends to
 * itself and both ends are the same key, but a Solana leg is a different key
 * with a different address, so `fromAddress` and `toAddress` are anchored
 * separately and each is compared the way its own chain compares addresses:
 * EVM hex is case-insensitive, Solana base58 is NOT, and lowercasing a base58
 * pubkey before comparing it would let a different address pass.
 *
 * The transaction comes back in one of two shapes and the parse commits to
 * which one BEFORE reading it, from the anchored source family rather than from
 * whatever fields the response happens to carry. An EVM leg is
 * `{to, data, value, chainId}`; a Solana leg is a base64 serialized
 * `VersionedTransaction` in `transactionRequest.data` and nothing else. A
 * response that answers in the other family's shape is a mismatch, not
 * something to reinterpret.
 *
 * The parse is a pure function over the raw JSON: it is the piece worth testing
 * against recorded fixtures, and it must never reach for the network or the
 * clock (`quotedAt` is passed in).
 */
import { scaleAmount } from '@pairlens/market-engine/amount'
import { LIFI_PROVIDER, lifiFetch } from './rate-limiter'
import { LIFI_NATIVE_ADDRESS, LIFI_SOLANA_NATIVE_ADDRESS } from './tokens'
import { refuse } from './routes'
import type { BridgeChain, BridgeChainFamily } from './chains'
import type { BridgeToken } from './tokens'
import type {
  BridgeQuote,
  BridgeRouteRefused,
} from '@pairlens/shared/instrument-types'

/** The subset of a LI.FI quote step this connector reads. */
export type LifiQuoteRaw = {
  tool?: unknown
  action?: {
    fromChainId?: unknown
    toChainId?: unknown
    fromAmount?: unknown
    fromAddress?: unknown
    toAddress?: unknown
    fromToken?: { address?: unknown; symbol?: unknown; decimals?: unknown }
    toToken?: { address?: unknown; symbol?: unknown; decimals?: unknown }
  }
  estimate?: {
    approvalAddress?: unknown
    toAmount?: unknown
    toAmountMin?: unknown
    fromAmount?: unknown
    executionDuration?: unknown
    feeCosts?: Array<{ amountUSD?: unknown; included?: unknown }>
    gasCosts?: Array<{ amountUSD?: unknown }>
  }
  transactionRequest?: {
    to?: unknown
    data?: unknown
    value?: unknown
    chainId?: unknown
    from?: unknown
  }
}

/** What the request pinned. Every field here is re-checked in the response. */
export type QuoteAnchor = {
  fromChain: BridgeChain
  toChain: BridgeChain
  fromToken: BridgeToken
  toToken: BridgeToken
  /** Raw source-token units the connector asked to send. */
  fromAmountRaw: bigint
  /** Sender on the source chain, as the connector asked for it. */
  fromAddress: string
  /** Recipient on the destination chain. The same key only within a family. */
  toAddress: string
  /** Epoch ms to stamp the quote with. Injected so the parse stays pure. */
  quotedAt: number
}

/**
 * The transaction a route wants signed, in the shape of the chain that signs it.
 *
 * Discriminated rather than optional-everything so a Solana leg can never reach
 * the EVM validator with three nulls and pass whichever checks happen to be
 * written as "if present".
 */
export type LifiTransaction =
  | {
      kind: 'evm'
      to: string
      data: string
      /** As the API sent it: hex or decimal string. Validated before signing. */
      value: string | null
      chainId: number | null
    }
  | {
      kind: 'svm'
      /** base64 `VersionedTransaction`, exactly as the aggregator serialized it. */
      serializedTransaction: string
    }

/**
 * A parsed route: the part a pane may see, and the part only the signing path
 * may. They are separated here rather than downstream because a transaction
 * that travels through React state is a transaction that can be swapped between
 * the confirm and the send.
 */
export type LifiRoute = {
  quote: BridgeQuote
  tx: LifiTransaction
  /**
   * The spender an ERC-20 allowance would name. Null on a Solana source leg:
   * Solana has no allowance model, and LI.FI still fills the field with an EVM
   * address that means nothing there. Carrying it would be an invitation to
   * approve something on the wrong chain.
   */
  approvalAddress: string | null
  fromToken: BridgeToken
  fromAmountRaw: bigint
}

export type ParseResult = { route: LifiRoute } | { problem: string }

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Address equality, by the rules of the chain the address belongs to.
 *
 * EVM addresses are hex and case carries only a checksum, so they compare
 * case-insensitively. Solana addresses are base58, whose alphabet contains both
 * cases as DISTINCT symbols: `case`-folding one before comparing would make
 * two different pubkeys look equal, which on the signing path is the difference
 * between sending to the user and sending to somebody else.
 */
export function addressesMatch(
  family: BridgeChainFamily,
  a: unknown,
  b: string,
): boolean {
  if (typeof a !== 'string') return false
  return family === 'evm' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Token identity, compared the same way addresses on that chain are. */
function sameToken(family: BridgeChainFamily, a: unknown, b: string): boolean {
  return addressesMatch(family, a, b)
}

/** Strict base64: the only shape a serialized Solana transaction arrives in. */
export function isBase64Payload(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 4 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
}

/**
 * Raw token units to human units.
 *
 * Through BigInt rather than `Number(raw) / 10 ** decimals` so an 18-decimal
 * amount does not lose its tail before it is ever shown: the integer part and
 * the fraction are divided separately and only the (bounded) result becomes a
 * float.
 */
export function toHumanAmount(raw: string, decimals: number): number | null {
  if (!/^\d+$/.test(raw)) return null
  const scale = 10n ** BigInt(decimals)
  const value = BigInt(raw)
  const whole = value / scale
  const frac = value % scale
  return Number(whole) + Number(frac) / Number(scale)
}

/** Sum of the `amountUSD` fields a cost list publishes. Null when none do. */
function sumUsd(
  costs: Array<{ amountUSD?: unknown }> | undefined,
): number | null {
  if (!Array.isArray(costs) || costs.length === 0) return null
  let total = 0
  let seen = false
  for (const cost of costs) {
    const usd = num(cost.amountUSD)
    if (usd === null) continue
    total += usd
    seen = true
  }
  return seen ? total : null
}

/** True when a token is the source chain's native coin under either sentinel. */
export function isNativeToken(token: BridgeToken): boolean {
  return (
    token.native ||
    token.address.toLowerCase() === LIFI_NATIVE_ADDRESS.toLowerCase() ||
    token.address === LIFI_SOLANA_NATIVE_ADDRESS
  )
}

/**
 * Pull the transaction out of a response, in the family the anchor committed to.
 *
 * Committing first is the point. Deciding "it has a `to`, so it must be EVM"
 * would let a response choose which validator it faces.
 */
function parseTransaction(
  family: BridgeChainFamily,
  tx: LifiQuoteRaw['transactionRequest'],
): { tx: LifiTransaction } | { problem: string } {
  if (family === 'svm') {
    if (str(tx?.to) !== null) {
      return { problem: 'Solana leg answered with an EVM transaction' }
    }
    if (!isBase64Payload(tx?.data)) {
      return { problem: 'Solana leg carries no serialized transaction' }
    }
    return { tx: { kind: 'svm', serializedTransaction: tx.data } }
  }
  const to = str(tx?.to)
  const data = str(tx?.data)
  if (!to || !data) return { problem: 'no transaction request' }
  return {
    tx: {
      kind: 'evm',
      to,
      data,
      value: str(tx?.value),
      chainId: num(tx?.chainId),
    },
  }
}

/**
 * Parse and anchor. Returns a `problem` string rather than throwing so the
 * caller can log exactly which field disagreed: "the aggregator changed the
 * amount" and "the aggregator answered about a different chain" are different
 * bugs, and a bare null makes them the same one.
 */
export function parseLifiQuote(raw: unknown, anchor: QuoteAnchor): ParseResult {
  if (typeof raw !== 'object' || raw === null)
    return { problem: 'not an object' }
  const quote = raw as LifiQuoteRaw
  const action = quote.action
  const estimate = quote.estimate
  if (!action || !estimate) return { problem: 'missing action or estimate' }

  const fromFamily = anchor.fromChain.family
  const toFamily = anchor.toChain.family

  if (num(action.fromChainId) !== anchor.fromChain.lifiChainId) {
    return { problem: `source chain is ${String(action.fromChainId)}` }
  }
  if (num(action.toChainId) !== anchor.toChain.lifiChainId) {
    return { problem: `destination chain is ${String(action.toChainId)}` }
  }
  if (
    !sameToken(fromFamily, action.fromToken?.address, anchor.fromToken.address)
  ) {
    return { problem: `source token is ${String(action.fromToken?.address)}` }
  }
  if (!sameToken(toFamily, action.toToken?.address, anchor.toToken.address)) {
    return {
      problem: `destination token is ${String(action.toToken?.address)}`,
    }
  }
  const echoedAmount = str(action.fromAmount) ?? str(estimate.fromAmount)
  if (echoedAmount !== anchor.fromAmountRaw.toString()) {
    return { problem: `amount is ${String(echoedAmount)}` }
  }
  // Recipient is the field a compromised or confused response would move funds
  // with, and it is encoded inside a payload this connector cannot decode. What
  // it CAN do is refuse a route whose stated sender or recipient is not the
  // wallet that asked. Each side is checked against ITS OWN chain's address.
  if (!addressesMatch(fromFamily, action.fromAddress, anchor.fromAddress)) {
    return { problem: `sender is ${String(action.fromAddress)}` }
  }
  if (!addressesMatch(toFamily, action.toAddress, anchor.toAddress)) {
    return { problem: `recipient is ${String(action.toAddress)}` }
  }

  const toDecimals = num(action.toToken?.decimals) ?? anchor.toToken.decimals
  const fromDecimals =
    num(action.fromToken?.decimals) ?? anchor.fromToken.decimals
  const amount = toHumanAmount(anchor.fromAmountRaw.toString(), fromDecimals)
  if (amount === null) return { problem: 'amount does not scale' }

  const toAmountRaw = str(estimate.toAmount)
  const toAmountMinRaw = str(estimate.toAmountMin)
  const feeCosts = estimate.feeCosts

  // An EVM source pulls ERC-20s through an allowance, so the spender has to be
  // named and checked. A Solana source has no allowance to grant, and the field
  // LI.FI fills in for it is an EVM address on the wrong chain.
  const approvalAddress =
    fromFamily === 'evm' ? str(estimate.approvalAddress) : null
  if (fromFamily === 'evm' && !approvalAddress) {
    return { problem: 'no approval address' }
  }

  const parsedTx = parseTransaction(fromFamily, quote.transactionRequest)
  if ('problem' in parsedTx) return parsedTx

  return {
    route: {
      quote: {
        fromMarket: anchor.fromChain.market,
        toMarket: anchor.toChain.market,
        symbol: anchor.fromToken.symbol,
        toSymbol: str(action.toToken?.symbol) ?? anchor.toToken.symbol,
        amount,
        amountOut:
          toAmountRaw === null ? null : toHumanAmount(toAmountRaw, toDecimals),
        amountOutMin:
          toAmountMinRaw === null
            ? null
            : toHumanAmount(toAmountMinRaw, toDecimals),
        feeUsd: sumUsd(feeCosts),
        // LI.FI flags a fee `included` when it is already taken out of
        // `toAmount`. All of them are, today; the flag is read rather than
        // assumed so a route that ever charges on top is labelled correctly
        // instead of double-counted.
        feeIncluded:
          Array.isArray(feeCosts) &&
          feeCosts.length > 0 &&
          feeCosts.every((cost) => cost.included === true),
        gasUsd: sumUsd(estimate.gasCosts),
        etaSeconds: num(estimate.executionDuration),
        tool: str(quote.tool) ?? 'unknown',
        provider: LIFI_PROVIDER,
        quotedAt: anchor.quotedAt,
      },
      tx: parsedTx.tx,
      approvalAddress,
      fromToken: anchor.fromToken,
      fromAmountRaw: anchor.fromAmountRaw,
    },
  }
}

/**
 * Fetch a route for one (chain, chain, asset, amount, sender, recipient).
 *
 * `refused` covers the two cases a pane must be able to say out loud: the
 * aggregator has no route for this size (404), and the asset does not exist on
 * one of the chains (resolved by the caller). Anything else throws, because a
 * throttle or a 500 is a failure to retry, not an answer.
 */
export async function fetchBridgeRoute(opts: {
  from: BridgeChain
  to: BridgeChain
  fromToken: BridgeToken
  toToken: BridgeToken
  amount: string
  /** Sender on the source chain. */
  fromAddress: string
  /** Recipient on the destination chain. Equal to `fromAddress` within a family. */
  toAddress: string
  now?: () => number
}): Promise<LifiRoute | BridgeRouteRefused> {
  const { from, to, fromToken, toToken, amount, fromAddress, toAddress } = opts
  const fromAmountRaw = scaleAmount(amount, fromToken.decimals)
  if (fromAmountRaw <= 0n) return refuse('no-route', from.market)

  const params = new URLSearchParams({
    fromChain: String(from.lifiChainId),
    toChain: String(to.lifiChainId),
    fromToken: fromToken.address,
    toToken: toToken.address,
    fromAmount: fromAmountRaw.toString(),
    fromAddress,
    toAddress,
  })
  const res = await lifiFetch(`/quote?${params.toString()}`)
  if (res.status === 404) return refuse('no-route', from.market)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `${LIFI_PROVIDER} quote failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const parsed = parseLifiQuote(await res.json(), {
    fromChain: from,
    toChain: to,
    fromToken,
    toToken,
    fromAmountRaw,
    fromAddress,
    toAddress,
    quotedAt: (opts.now ?? Date.now)(),
  })
  if ('problem' in parsed) {
    // Not a refusal: a response that does not describe the requested transfer
    // is a failure, and calling it "no route" would send the pane to an empty
    // state over what is really a provider or client bug.
    throw new Error(
      `${LIFI_PROVIDER} answered about a different transfer (${parsed.problem})`,
    )
  }
  return parsed.route
}

/** The native sentinels, re-exported so the executors' rules read in one place. */
export { LIFI_NATIVE_ADDRESS, LIFI_SOLANA_NATIVE_ADDRESS }
