// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset, resolved to a contract (EVM) or a mint (Solana) on each of the two
 * chains.
 *
 * Cross-chain identity is the honest limit of any bridge UI: USDC on Base and
 * USDC on Solana are different tokens, and there is no rule that says a ticker
 * means the same asset on two chains. What IS true is that a bridge is the
 * thing that turns one into the other, and LI.FI is the party that decides
 * whether a given pair of tokens is bridgeable. So this module resolves each
 * side independently, by ticker, on that side's own chain, and a side that does
 * not resolve becomes an `unknown-token` refusal naming the chain, never a
 * silent substitution of some other token with the same three letters.
 *
 * The two families resolve through different directories, for the same reason
 * each is right on its own chain. EVM legs go through the EVM connector's token
 * client, so a bridge and a swap on that chain agree about what a ticker means.
 * Solana legs go through LI.FI's own `/v1/token`, because the aggregator is the
 * party that has to accept the mint anyway and asking a second directory would
 * only introduce a way for the two to disagree. It rides the same paced door as
 * every other LI.FI call.
 *
 * Native assets are resolved locally rather than searched. LI.FI names a
 * chain's native coin by a sentinel (the zero address on EVM, the system
 * program on Solana), and asking a token directory for "ETH" or "SOL" comes
 * back with whichever wrapped or bridged version happens to rank first.
 */
import { resolveToken } from '../evm-dex-connector/token-client'
import { LIFI_PROVIDER, lifiFetch } from './rate-limiter'
import type { BridgeChain } from './chains'

/** LI.FI's sentinel for an EVM chain's native coin. */
export const LIFI_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * LI.FI's sentinel for native SOL: the System Program id. Not the wrapped-SOL
 * mint (`So111…112`) — a quote built against the wrapped mint is an SPL
 * transfer, which is a different transaction and a different balance check.
 */
export const LIFI_SOLANA_NATIVE_ADDRESS = '11111111111111111111111111111111'

/** KyberSwap's pseudo-address for the same thing, as the swap path writes it. */
const KYBER_NATIVE_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export type BridgeToken = {
  /** EVM contract address, or Solana mint. */
  address: string
  symbol: string
  decimals: number
  /** True for the chain's native coin: it is sent as value, never approved. */
  native: boolean
}

function nativeToken(chain: BridgeChain): BridgeToken {
  return chain.family === 'svm'
    ? {
        address: LIFI_SOLANA_NATIVE_ADDRESS,
        symbol: chain.nativeSymbol,
        decimals: 9,
        native: true,
      }
    : {
        address: LIFI_NATIVE_ADDRESS,
        symbol: chain.nativeSymbol,
        decimals: 18,
        native: true,
      }
}

/** LI.FI's `/v1/token`, narrowed to the three fields a transfer needs. */
async function resolveViaLifi(
  lifiChainId: number,
  key: string,
): Promise<BridgeToken | null> {
  const params = new URLSearchParams({
    chain: String(lifiChainId),
    token: key,
  })
  const res = await lifiFetch(`/token?${params.toString()}`)
  // 400 and 404 are both the directory saying the chain has no such asset (it
  // answers 400 for a ticker it cannot parse), and that is an answer. Anything
  // else is a failure worth retrying, so it throws rather than being flattened
  // into "unknown token" and rendered as "this asset does not exist here".
  if (res.status === 400 || res.status === 404) return null
  if (!res.ok) {
    throw new Error(`${LIFI_PROVIDER} token lookup failed (HTTP ${res.status})`)
  }
  const body = (await res.json()) as {
    address?: unknown
    symbol?: unknown
    decimals?: unknown
  }
  const address = typeof body.address === 'string' ? body.address : null
  const symbol = typeof body.symbol === 'string' ? body.symbol : null
  const decimals =
    typeof body.decimals === 'number' && Number.isInteger(body.decimals)
      ? body.decimals
      : null
  if (!address || !symbol || decimals === null) return null
  return { address, symbol, decimals, native: false }
}

/**
 * Resolve one leg. `null` means the chain has no such asset as far as the token
 * directory is concerned, which the caller turns into a refusal.
 */
export async function resolveBridgeToken(
  chain: BridgeChain,
  symbolOrAddress: string,
): Promise<BridgeToken | null> {
  const key = symbolOrAddress.trim()
  if (!key) return null
  const upper = key.toUpperCase()

  if (chain.family === 'svm') {
    if (
      upper === chain.nativeSymbol.toUpperCase() ||
      key === LIFI_SOLANA_NATIVE_ADDRESS
    ) {
      return nativeToken(chain)
    }
    return resolveViaLifi(chain.lifiChainId, key)
  }

  if (
    upper === chain.nativeSymbol.toUpperCase() ||
    upper === LIFI_NATIVE_ADDRESS.toUpperCase() ||
    upper === KYBER_NATIVE_ADDRESS.toUpperCase()
  ) {
    return nativeToken(chain)
  }

  const token = await resolveToken(chain.evm, key)
  if (!token) return null
  return {
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
    native: false,
  }
}
