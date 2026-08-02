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
 * KyberSwap route summary — passed through opaquely from GET /routes to
 * POST /route/build. Only the fields we read are typed.
 */
export type KyberRoute = {
  routeSummary: {
    tokenIn: string
    amountIn: string
    tokenOut: string
    amountOut: string
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
