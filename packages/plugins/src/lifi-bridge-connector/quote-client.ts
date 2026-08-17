// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `GET /v1/quote`, parsed, and anchored to the request that asked for it.
 *
 * The response is untrusted input on the read path and load-bearing on the
 * signing path, so the parse and the anchor are one step. Anchoring means the
 * quote is only accepted when the aggregator echoed back the SAME two chains,
 * the SAME two token contracts, the SAME amount and the SAME address the
 * connector asked about. Everything downstream (the fee shown, the floor a
 * transfer is checked against, the calldata that gets signed) then describes
 * the transfer the user is looking at rather than whatever the API felt like
 * answering.
 *
 * The parse is a pure function over the raw JSON: it is the piece worth testing
 * against recorded fixtures, and it must never reach for the network or the
 * clock (`quotedAt` is passed in).
 */
import { scaleAmount } from '@pairlens/market-engine/amount'
import { LIFI_PROVIDER, lifiFetch } from './rate-limiter'
import { LIFI_NATIVE_ADDRESS } from './tokens'
import { refuse } from './routes'
import type { BridgeToken } from './tokens'
import type { EvmChainConfig } from '../evm-dex-connector/chains'
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
  fromMarket: string
  toMarket: string
  fromChainId: number
  toChainId: number
  fromToken: BridgeToken
  toToken: BridgeToken
  /** Raw source-token units the connector asked to send. */
  fromAmountRaw: bigint
  /** Sender and recipient, as the connector asked for them. */
  address: string
  /** Epoch ms to stamp the quote with. Injected so the parse stays pure. */
  quotedAt: number
}

/**
 * A parsed route: the part a pane may see, and the part only the signing path
 * may. They are separated here rather than downstream because calldata that
 * travels through React state is calldata that can be swapped between the
 * confirm and the send.
 */
export type LifiRoute = {
  quote: BridgeQuote
  tx: {
    to: string
    data: string
    /** As the API sent it: hex or decimal string. Validated before signing. */
    value: string | null
    chainId: number | null
  }
  approvalAddress: string
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

function sameAddress(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
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
  const tx = quote.transactionRequest
  if (!action || !estimate) return { problem: 'missing action or estimate' }

  if (num(action.fromChainId) !== anchor.fromChainId) {
    return { problem: `source chain is ${String(action.fromChainId)}` }
  }
  if (num(action.toChainId) !== anchor.toChainId) {
    return { problem: `destination chain is ${String(action.toChainId)}` }
  }
  if (!sameAddress(action.fromToken?.address, anchor.fromToken.address)) {
    return { problem: `source token is ${String(action.fromToken?.address)}` }
  }
  if (!sameAddress(action.toToken?.address, anchor.toToken.address)) {
    return {
      problem: `destination token is ${String(action.toToken?.address)}`,
    }
  }
  const echoedAmount = str(action.fromAmount) ?? str(estimate.fromAmount)
  if (echoedAmount !== anchor.fromAmountRaw.toString()) {
    return { problem: `amount is ${String(echoedAmount)}` }
  }
  // Recipient is the field a compromised or confused response would move funds
  // with, and it is encoded inside calldata this connector cannot decode. What
  // it CAN do is refuse a route whose stated recipient is not the sender.
  if (!sameAddress(action.fromAddress, anchor.address)) {
    return { problem: `sender is ${String(action.fromAddress)}` }
  }
  if (!sameAddress(action.toAddress, anchor.address)) {
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
  const approvalAddress = str(estimate.approvalAddress)
  if (!approvalAddress) return { problem: 'no approval address' }
  const to = str(tx?.to)
  const data = str(tx?.data)
  if (!to || !data) return { problem: 'no transaction request' }

  return {
    route: {
      quote: {
        fromMarket: anchor.fromMarket,
        toMarket: anchor.toMarket,
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
      tx: {
        to,
        data,
        value: str(tx?.value),
        chainId: num(tx?.chainId),
      },
      approvalAddress,
      fromToken: anchor.fromToken,
      fromAmountRaw: anchor.fromAmountRaw,
    },
  }
}

/**
 * Fetch a route for one (chain, chain, asset, amount, address).
 *
 * `refused` covers the two cases a pane must be able to say out loud: the
 * aggregator has no route for this size (404), and the asset does not exist on
 * one of the chains (resolved by the caller). Anything else throws, because a
 * throttle or a 500 is a failure to retry, not an answer.
 */
export async function fetchBridgeRoute(opts: {
  from: EvmChainConfig
  to: EvmChainConfig
  fromToken: BridgeToken
  toToken: BridgeToken
  amount: string
  address: string
  now?: () => number
}): Promise<LifiRoute | BridgeRouteRefused> {
  const { from, to, fromToken, toToken, amount, address } = opts
  const fromAmountRaw = scaleAmount(amount, fromToken.decimals)
  if (fromAmountRaw <= 0n) return refuse('no-route', from.market)

  const params = new URLSearchParams({
    fromChain: String(from.chainId),
    toChain: String(to.chainId),
    fromToken: fromToken.address,
    toToken: toToken.address,
    fromAmount: fromAmountRaw.toString(),
    fromAddress: address,
    toAddress: address,
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
    fromMarket: from.market,
    toMarket: to.market,
    fromChainId: from.chainId,
    toChainId: to.chainId,
    fromToken,
    toToken,
    fromAmountRaw,
    address,
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

/** The native sentinel, re-exported so the executor's rules read in one place. */
export { LIFI_NATIVE_ADDRESS }
