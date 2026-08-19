// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { getViemChain } from './chains'
import type { EvmChainConfig } from './chains'
import type { KyberRoute } from './types'

// KyberSwap Aggregator API — free, no API key, routes across every major DEX
// (Uniswap, PancakeSwap, Curve, Balancer, …) per chain.
// https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator
const KYBER_API = 'https://aggregator-api.kyberswap.com'
const CLIENT_ID = 'pairlens'

/** Aggregator pseudo-address for the chain's native token. */
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

// ── Trusted router allowlist ─────────────────────────────────────────
// KyberSwap's MetaAggregationRouterV2 — the contract that receives the
// user's ERC-20 approval, native `value`, and swap calldata. It is deployed
// at the same vanity address on every EVM chain KyberSwap supports (see
// https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/contracts).
// The aggregator API response is UNTRUSTED input: if it names any other
// router we fail closed rather than approve or send funds to an unknown
// contract. Extend this list only after verifying a new deployment against
// KyberSwap's published contract addresses. Entries must be lowercase.
export const KYBER_ALLOWED_ROUTERS: ReadonlySet<string> = new Set([
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5', // MetaAggregationRouterV2 (all chains)
])

/** True when `address` is a known-good KyberSwap router deployment. */
export function isAllowedRouter(address: unknown): boolean {
  return (
    typeof address === 'string' &&
    KYBER_ALLOWED_ROUTERS.has(address.toLowerCase())
  )
}

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export { scaleAmount } from '@pairlens/market-engine/amount'

/** Get the best swap route from the KyberSwap aggregator. */
export async function getRoute(
  chain: EvmChainConfig,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<KyberRoute | null> {
  try {
    const params = new URLSearchParams({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
    })
    const res = await fetch(
      `${KYBER_API}/${chain.kyberSlug}/api/v1/routes?${params}`,
      { headers: { 'x-client-id': CLIENT_ID } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      code?: number
      data?: KyberRoute
    }
    if (json.code !== 0 || !json.data?.routeSummary || !json.data.routerAddress)
      return null
    // The route is untrusted input — anchor it to the exact swap the user
    // asked for (tokens + amount) and to a known router before it can reach
    // the signing path. Fail closed on any mismatch.
    const summary = json.data.routeSummary
    if (
      String(summary.tokenIn).toLowerCase() !== tokenIn.toLowerCase() ||
      String(summary.tokenOut).toLowerCase() !== tokenOut.toLowerCase() ||
      String(summary.amountIn) !== amountIn.toString() ||
      !isAllowedRouter(json.data.routerAddress)
    ) {
      console.warn(
        '[evm-dex] rejected aggregator route: response does not match the requested swap or names an unknown router',
      )
      return null
    }
    return json.data
  } catch {
    return null
  }
}

/**
 * Execute a swap along a KyberSwap route: build calldata, approve the router
 * if needed (ERC-20 input), sign locally with the wallet's private key, and
 * send. Dynamically imports viem (code-split — only loaded on first swap).
 */
export async function executeSwap(opts: {
  chain: EvmChainConfig
  route: KyberRoute
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
  rpcUrl: string
  slippageBps: number
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const { chain, route, walletAddress, getPrivateKey, rpcUrl, slippageBps } =
    opts
  try {
    // Build the swap transaction calldata
    const buildRes = await fetch(
      `${KYBER_API}/${chain.kyberSlug}/api/v1/route/build`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': CLIENT_ID,
        },
        body: JSON.stringify({
          routeSummary: route.routeSummary,
          sender: walletAddress,
          recipient: walletAddress,
          slippageTolerance: slippageBps,
          source: CLIENT_ID,
        }),
      },
    )
    if (!buildRes.ok) {
      const err = await buildRes.text()
      return { success: false, error: `KyberSwap build error: ${err}` }
    }
    const buildJson = (await buildRes.json()) as {
      code?: number
      message?: string
      data?: {
        data?: string
        routerAddress?: string
        amountIn?: string
        amountOut?: string
        amountOutMin?: string
      }
    }
    const calldata = buildJson.data?.data
    if (buildJson.code !== 0 || !calldata) {
      return {
        success: false,
        error: `KyberSwap build error: ${buildJson.message ?? 'no calldata'}`,
      }
    }

    // ── Local validation of the built transaction ────────────────────
    // The /route/build response is untrusted. What we CAN verify locally:
    //   1. the target router is a known KyberSwap deployment — this pins
    //      where the ERC-20 approval and the native `value` below go,
    //   2. the calldata is well-formed hex,
    //   3. the echoed amountIn still matches the quote the user accepted
    //      (getRoute already anchored the quote to the user's request),
    //   4. the echoed amountOut / amountOutMin has not collapsed below the
    //      user's slippage floor.
    // What we CANNOT verify without an ABI decoder for router calldata:
    // the minReturn actually encoded inside `data`. That value is enforced
    // on-chain by the (pinned, audited) router contract, so the residual
    // trust is in the router contract — not in the aggregator API.
    if (!/^0x[0-9a-fA-F]+$/.test(calldata)) {
      return {
        success: false,
        error:
          'Refusing to sign: the KyberSwap build returned malformed calldata',
      }
    }
    const routerAddress = (buildJson.data?.routerAddress ??
      route.routerAddress) as `0x${string}`
    if (!isAllowedRouter(routerAddress)) {
      return {
        success: false,
        error: `Refusing to sign: the KyberSwap build returned unknown router ${routerAddress}`,
      }
    }
    const quotedAmountIn = BigInt(route.routeSummary.amountIn)
    if (
      buildJson.data?.amountIn != null &&
      BigInt(buildJson.data.amountIn) !== quotedAmountIn
    ) {
      return {
        success: false,
        error: 'Refusing to sign: the KyberSwap build changed amountIn',
      }
    }
    const expectedOut = BigInt(route.routeSummary.amountOut)
    const builtOutRaw =
      buildJson.data?.amountOutMin ?? buildJson.data?.amountOut
    if (builtOutRaw != null && expectedOut > 0n && slippageBps < 9_990) {
      // Floor = expectedOut * (1 - slippage), minus a 10 bps epsilon for
      // re-pricing jitter between /routes and /route/build.
      const floor = (expectedOut * BigInt(10_000 - slippageBps - 10)) / 10_000n
      if (BigInt(builtOutRaw) < floor) {
        return {
          success: false,
          error:
            'Refusing to sign: the KyberSwap build output is below the accepted slippage floor',
        }
      }
    }

    const privateKey = await getPrivateKey()
    if (!privateKey) {
      return { success: false, error: 'Wallet private key not found' }
    }

    // Dynamic imports — EVM libs only loaded on first swap
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
    const publicClient = createPublicClient({
      chain: viemChain,
      transport,
    })
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport,
    })

    const tokenIn = route.routeSummary.tokenIn as `0x${string}`
    const amountIn = BigInt(route.routeSummary.amountIn)
    const isNativeIn =
      tokenIn.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()

    // ERC-20 input: ensure the router is approved to pull the input amount
    if (!isNativeIn) {
      const allowance = await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, routerAddress],
      })
      if (allowance < amountIn) {
        const approveHash = await walletClient.writeContract({
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [routerAddress, amountIn],
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveHash,
        })
        if (approveReceipt.status !== 'success') {
          return { success: false, error: 'Token approval failed' }
        }
      }
    }

    // Send the swap. `value` is computed locally — exactly amountIn for
    // native-input swaps, 0 for ERC-20 input (the router pulls tokens via
    // the allowance granted above) — never taken from the API response.
    // Both amountIn and tokenIn were pinned to the user's request in
    // getRoute.
    const hash = await walletClient.sendTransaction({
      to: routerAddress,
      data: calldata as `0x${string}`,
      value: isNativeIn ? amountIn : 0n,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      return { success: false, error: `Swap reverted on-chain (tx ${hash})` }
    }

    return { success: true, orderId: hash }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Swap failed',
    }
  }
}
