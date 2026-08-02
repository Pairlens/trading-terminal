// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { getViemChain } from './chains'
import { ERC20_ABI } from './swap-executor'
import { getPinnedTokens } from './token-client'
import type { NormalizedBalance } from '@pairlens/market-engine/types'
import type { EvmChainConfig } from './chains'
import type { EvmToken } from './types'

/**
 * Fetch native + ERC-20 balances for a wallet.
 *
 * Plain RPC can't enumerate a wallet's token holdings, so we check a focused
 * set: the chain's quote token, wrapped native, every pinned token (searched
 * or traded this session), plus any extra tokens the caller passes (e.g. the
 * pair currently on screen). Reads are batched through Multicall3.
 */
export async function fetchBalances(
  chain: EvmChainConfig,
  walletAddress: string,
  rpcUrl: string,
  extraTokens: Array<EvmToken> = [],
): Promise<Array<NormalizedBalance>> {
  try {
    const { createPublicClient, http, formatUnits } = await import('viem')
    const viemChain = await getViemChain(chain.market)
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    })
    const owner = walletAddress as `0x${string}`

    // Deduplicate the token set by address
    const tokens = new Map<string, EvmToken>()
    const add = (t: EvmToken) => {
      tokens.set(t.address.toLowerCase(), t)
    }
    add({
      address: chain.quote.address,
      symbol: chain.quote.symbol,
      name: chain.quote.symbol,
      decimals: chain.quote.decimals,
    })
    add({
      address: chain.wrappedNativeAddress,
      symbol: `W${chain.nativeSymbol}`,
      name: `Wrapped ${chain.nativeSymbol}`,
      decimals: 18,
    })
    for (const t of getPinnedTokens(chain.market)) add(t)
    for (const t of extraTokens) add(t)

    const tokenList = [...tokens.values()]

    const [nativeBalance, results] = await Promise.all([
      publicClient.getBalance({ address: owner }),
      publicClient.multicall({
        contracts: tokenList.map((t) => ({
          address: t.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf' as const,
          args: [owner] as const,
        })),
        allowFailure: true,
      }),
    ])

    const balances: Array<NormalizedBalance> = [
      {
        currency: chain.nativeSymbol,
        available: formatUnits(nativeBalance, 18),
        frozen: '0',
        total: formatUnits(nativeBalance, 18),
      },
    ]

    for (let i = 0; i < tokenList.length; i++) {
      const result = results[i]
      const token = tokenList[i]
      if (result?.status !== 'success') continue
      const raw = result.result
      const isQuote =
        token.address.toLowerCase() === chain.quote.address.toLowerCase()
      // Skip zero balances except the quote token (the trade form always
      // shows quote-currency availability).
      if (raw === 0n && !isQuote) continue
      const formatted = formatUnits(raw, token.decimals)
      balances.push({
        currency: token.symbol,
        available: formatted,
        frozen: '0',
        total: formatted,
      })
    }

    return balances
  } catch {
    return []
  }
}
