// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset, resolved to a contract on each of the two chains.
 *
 * Cross-chain identity is the honest limit of any bridge UI: USDC on Base and
 * USDC on Arbitrum are different contracts, and there is no rule that says a
 * ticker means the same asset on two chains. What IS true is that a bridge is
 * the thing that turns one into the other, and LI.FI is the party that decides
 * whether a given pair of contracts is bridgeable. So this module resolves each
 * side independently, by ticker, on that side's own chain — and a side that does
 * not resolve becomes an `unknown-token` refusal naming the chain, never a
 * silent substitution of some other contract with the same three letters.
 *
 * Native assets are resolved locally rather than searched. LI.FI names a chain's
 * native coin by the zero address, and asking a pool directory for "ETH" comes
 * back with whichever wrapped or bridged ERC-20 happens to rank first.
 */
import { resolveToken } from '../evm-dex-connector/token-client'
import type { EvmChainConfig } from '../evm-dex-connector/chains'

/** LI.FI's sentinel for a chain's native coin. */
export const LIFI_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000'

/** KyberSwap's pseudo-address for the same thing, as the swap path writes it. */
const KYBER_NATIVE_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export type BridgeToken = {
  address: string
  symbol: string
  decimals: number
  /** True for the chain's native coin: it is sent as `value`, never approved. */
  native: boolean
}

function nativeToken(chain: EvmChainConfig): BridgeToken {
  return {
    address: LIFI_NATIVE_ADDRESS,
    symbol: chain.nativeSymbol,
    decimals: 18,
    native: true,
  }
}

/**
 * Resolve one leg. `null` means the chain has no such asset as far as the token
 * directory is concerned, which the caller turns into a refusal.
 */
export async function resolveBridgeToken(
  chain: EvmChainConfig,
  symbolOrAddress: string,
): Promise<BridgeToken | null> {
  const key = symbolOrAddress.trim()
  if (!key) return null
  const upper = key.toUpperCase()

  if (
    upper === chain.nativeSymbol.toUpperCase() ||
    upper === LIFI_NATIVE_ADDRESS.toUpperCase() ||
    upper === KYBER_NATIVE_ADDRESS.toUpperCase()
  ) {
    return nativeToken(chain)
  }

  const token = await resolveToken(chain, key)
  if (!token) return null
  return {
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
    native: false,
  }
}
