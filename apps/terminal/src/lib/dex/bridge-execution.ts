// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one path from a confirmed bridge quote to a signature.
 *
 * Deliberately NOT the guarded order path. `placeOrder` enforces risk config
 * that a transfer has no fields for: there is no side, no entry price, no
 * position and no P&L to cap, and running a transfer through a max-order-size
 * ceiling denominated in a quote currency would compare two different things.
 * What a bridge needs instead is consent to a stated outcome, and that is what
 * this function requires: the amount, the two chains and the floor the user read
 * are passed through and re-checked by the connector at signing time.
 *
 * Everything dangerous happens inside the plugin (contract allowlist, value
 * rules, address match, re-quote check). What lives here is the part the
 * terminal owns: recording the transfer so it is tracked the moment it exists,
 * before anything else can fail.
 */
import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { BridgeExecutionResult } from '@/lib/dex/bridge-types'
import { transferFromExecution } from '@/lib/dex/bridge-types'
import { useBridgeTransfersStore } from '@/lib/dex/bridge-transfers-store'
import { getCountrySetting } from '@/lib/region-settings'
import { track } from '@/lib/analytics-events'

export type BridgeExecutionRequest = {
  fromMarket: string
  toMarket: string
  symbol: string
  amount: string
  walletId: string
  walletAddress: string
  /** The guaranteed amount shown on the confirm. The connector refuses below it. */
  acceptedAmountOutMin: number
}

export async function executeBridgeTransfer(
  plugin: PluginInstance | null,
  request: BridgeExecutionRequest,
): Promise<BridgeExecutionResult> {
  if (!plugin) {
    return { success: false, error: 'No bridge connector is installed.' }
  }

  const result = (await plugin.execute({
    capability: 'trading:bridge',
    params: {
      action: 'execute',
      fromMarket: request.fromMarket,
      toMarket: request.toMarket,
      symbol: request.symbol,
      amount: request.amount,
      walletId: request.walletId,
      acceptedAmountOutMin: request.acceptedAmountOutMin,
    },
    context: {
      pair: '',
      market: request.fromMarket,
      timeframe: '',
      // A bridge has no paper mode: there is no simulated chain to send on, and
      // pretending otherwise would be a fake receipt for real funds that never
      // moved. The connector signs or refuses.
      mode: 'live' as const,
      country: getCountrySetting(),
    },
  })) as BridgeExecutionResult | null

  if (!result) {
    return { success: false, error: 'The bridge connector did not answer.' }
  }
  if (result.success && result.sourceTxHash && result.quote) {
    // Recorded before the caller sees the result: the transfer exists on-chain
    // from this point on, and a component that unmounts between the send and
    // the render must not be what decides whether it gets tracked.
    useBridgeTransfersStore.getState().record(
      transferFromExecution({
        quote: result.quote,
        sourceTxHash: result.sourceTxHash,
        walletAddress: request.walletAddress,
      }),
    )
    track('bridge_executed', {
      from_chain: request.fromMarket,
      to_chain: request.toMarket,
      tool: result.quote.tool,
    })
  }
  return result
}
