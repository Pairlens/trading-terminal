// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createConnector } from '../connector'
import type { OrderResult } from '@pairlens/market-engine/types'

export async function order(args: {
  market: string
  pair: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  size: string
  price?: string
  mode: 'paper' | 'live'
  country: string
  apiKey: string
  apiSecret: string
  passphrase: string
}): Promise<void> {
  const manager = await createConnector(args.market, args.country, args.mode)

  // Re-activate with credentials
  const connectorId = `${args.market}-market-connector`
  await manager.deactivatePlugin(connectorId)
  await manager.activatePlugin(connectorId, {
    apiKey: args.apiKey,
    apiSecret: args.apiSecret,
    passphrase: args.passphrase,
  })

  manager.setContext({
    market: args.market,
    pair: args.pair,
    mode: args.mode,
  })

  const result = (await manager.execute('trading:orders', {
    action: 'place',
    pair: args.pair,
    side: args.side,
    type: args.type,
    size: args.size,
    ...(args.price ? { price: args.price } : {}),
  })) as OrderResult

  if (result.success) {
    console.log(
      JSON.stringify({ status: 'accepted', orderId: result.orderId }, null, 2),
    )
  } else {
    console.error(
      JSON.stringify({ status: 'rejected', error: result.error }, null, 2),
    )
    process.exit(1)
  }

  process.exit(0)
}
