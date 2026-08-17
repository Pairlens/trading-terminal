// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type EvmToken = {
  /** Checksummed or lowercase contract address. */
  address: string
  symbol: string
  name: string
  decimals: number
}

/**
 * One hop inside a KyberSwap route split: a single pool the router touches.
 *
 * `swapAmount` is the amount entering THIS hop, so on the first hop of a split
 * it is the slice of the user's input that split takes, and on later hops it
 * is an intermediate amount. The route preview reads the first hop for the
 * share and the last for the venue name and the output.
 */
export type KyberRouteHop = {
  pool?: string
  tokenIn?: string
  tokenOut?: string
  /** DEX the hop routes through, as KyberSwap names it. */
  exchange?: string
  poolType?: string
  swapAmount?: string
  amountOut?: string
}

/**
 * KyberSwap route summary — passed through opaquely from GET /routes to
 * POST /route/build. Only the fields we read are typed; the index signature
 * carries the rest, because `/route/build` requires the object VERBATIM and
 * anything we typed away would be silently dropped on the way back.
 */
export type KyberRoute = {
  routeSummary: {
    tokenIn: string
    amountIn: string
    tokenOut: string
    amountOut: string
    /** Both legs priced in USD — the only honest source of price impact. */
    amountInUsd?: string
    amountOutUsd?: string
    /** Estimated network fee for the whole route, in USD. */
    gasUsd?: number | string
    /** Splits of the input, each an ordered list of hops. */
    route?: Array<Array<KyberRouteHop>>
    [key: string]: unknown
  }
  routerAddress: string
}

export type WalletSlot = {
  walletId: string
  address: string
  rpcUrl: string
  slippageBps: number
  /**
   * Private-key accessor bound to THIS wallet at provisioning time.
   * Slot-scoped (rather than one shared plugin-wide retriever) so that
   * provisioning a second wallet can never re-point an earlier wallet's
   * orders at a different accessor, and so the host can hand the plugin
   * an accessor restricted to exactly the wallet being provisioned.
   */
  getPrivateKey: (() => Promise<string | null>) | null
}
