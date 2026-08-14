// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AlpacaWsClient } from './ws-client'
import { AlpacaOrderPoller } from './order-poller'
import { fetchAlpacaCandles, missingCredentialsError } from './rest-client'
import {
  cancelAlpacaOrder,
  fetchAlpacaBalances,
  fetchAlpacaOpenOrders,
  fetchAlpacaOrderHistory,
  placeAlpacaOrder,
} from './order-executor'
import { toPairKey } from './parser'
import type { AlpacaCredentials } from './rest-client'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

const ALPACA_ICON = 'https://files.alpaca.markets/webassets/favicon.ico'

export const ALPACA_ADAPTER_INFO: MarketAdapterInfo = {
  marketId: 'alpaca',
  displayName: 'Alpaca',
  assetClasses: ['stocks'],
  capabilities: ['read', 'trade'],
  credentialSchema: [
    { key: 'apiKey', label: 'API Key ID', type: 'text', required: true },
    { key: 'apiSecret', label: 'Secret Key', type: 'secret', required: true },
  ],
  supportedTimeframes: [
    '1m',
    '5m',
    '15m',
    '30m',
    '1h',
    '2h',
    '4h',
    '1d',
    '1w',
    '1M',
  ],
  iconUrl: ALPACA_ICON,
}

export const alpacaMarketConnectorManifest: PluginManifest = {
  id: 'alpaca-market-connector',
  name: 'Alpaca Market Connector',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'US stocks and ETFs via the Alpaca broker API — real-time market data, paper and live trading',
  homepage: 'https://pairlens.finance',
  icon: ALPACA_ICON,
  capabilities: [
    {
      id: 'market-data:candles',
      singleton: false,
      markets: ['alpaca'],
      priority: 1,
      streaming: true,
    },
    {
      id: 'market-data:ticker',
      singleton: false,
      markets: ['alpaca'],
      priority: 1,
      streaming: true,
    },
    {
      id: 'market-data:orderbook',
      singleton: false,
      markets: ['alpaca'],
      priority: 1,
      streaming: true,
    },
    {
      id: 'market-data:history',
      singleton: false,
      markets: ['alpaca'],
      priority: 1,
      streaming: false,
    },
    // NOTE: no market-data:discovery here. The resolver routes discovery by
    // the ACTIVE market, so a venue-scoped discovery would hijack the global
    // Markets pane whenever Alpaca is the charted market. Stocks live in the
    // shared pairlens-core catalog instead (assetClass 'stocks').
    {
      id: 'trading:orders',
      singleton: false,
      markets: ['alpaca'],
      priority: 1,
      streaming: true,
    },
    {
      id: 'trading:balances',
      singleton: false,
      markets: ['alpaca'],
      priority: 1,
      streaming: true,
    },
  ],
  metadata: {
    assetClass: 'stocks',
    gradient: 'from-yellow-400 to-amber-500',
    abbr: 'ALP',
    logoUrl: ALPACA_ICON,
    triggerOrders: true,
    /**
     * Unlike every CEX, Alpaca gates MARKET DATA on API keys too — there is
     * no public feed to fall back on. A browser vault is sealed on load, so
     * the chart's first subscribe lands before any credential exists and
     * fails; the terminal watches for this flag and re-subscribes market data
     * once a credential is provisioned, instead of leaving the pane spinning
     * for the rest of the session.
     */
    credentialedMarketData: true,
  },
  config: {},
}

// ---------------------------------------------------------------------------
// Credential slot — one per provisioned credential
// ---------------------------------------------------------------------------

type CredentialSlot = {
  id: string
  credentials: AlpacaCredentials
  mode: 'paper' | 'live'
  poller: AlpacaOrderPoller | null
  orderCallback: ((data: unknown) => void) | null
  balanceCallback: ((data: unknown) => void) | null
}

export function createAlpacaMarketConnectorPlugin(
  manifest: PluginManifest,
): PluginInstance {
  // Shared market-data WS. Alpaca market data itself requires API keys
  // (unlike CEX public feeds), so the client borrows the first configured
  // credential — paper keys carry the same free IEX data entitlement.
  let wsClient: AlpacaWsClient | null = null

  const slots = new Map<string, CredentialSlot>()

  function dataCredentials(): AlpacaCredentials | null {
    const first = slots.values().next()
    return first.done ? null : first.value.credentials
  }

  function getWsClient(): AlpacaWsClient {
    if (!wsClient) wsClient = new AlpacaWsClient(dataCredentials)
    return wsClient
  }

  function getSlot(params: PluginExecuteParams): CredentialSlot | null {
    const credId = params.params['credentialId'] as string | undefined
    // Fail closed: a provided-but-unknown credentialId must never fall
    // back to another slot — an order could hit the wrong account/mode.
    if (credId) return slots.get(credId) ?? null
    const first = slots.values().next()
    return first.done ? null : first.value
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p, context } = params

    if (capability === 'market-data:history') {
      const credentials = dataCredentials()
      if (!credentials) throw missingCredentialsError()
      const pair = String(p['pair'] ?? context.pair)
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      const limit = typeof p['limit'] === 'number' ? p['limit'] : 300
      const endTs = typeof p['endTs'] === 'number' ? p['endTs'] : undefined
      return fetchAlpacaCandles(pair, timeframe, limit, credentials, endTs)
    }

    if (capability === 'trading:orders') {
      const slot = getSlot(params)
      if (!slot) {
        return {
          success: false,
          error: p['credentialId']
            ? `Unknown credential '${String(p['credentialId'])}'`
            : 'No credentials configured',
        }
      }

      const action = String(p['action'] ?? 'place')

      if (action === 'list') {
        const [open, history] = await Promise.all([
          fetchAlpacaOpenOrders(slot.credentials, slot.mode),
          fetchAlpacaOrderHistory(slot.credentials, slot.mode),
        ])
        return { open, history }
      }

      if (action === 'cancel') {
        const orderId = String(p['orderId'] ?? '')
        return cancelAlpacaOrder(orderId, slot.credentials, slot.mode)
      }

      const rawTrigger = p['trigger'] as
        | { triggerPrice?: unknown; triggerType?: unknown }
        | undefined
      const triggerType: 'tp' | 'sl' | undefined =
        rawTrigger?.triggerType === 'tp' || rawTrigger?.triggerType === 'sl'
          ? rawTrigger.triggerType
          : undefined
      const trigger =
        rawTrigger?.triggerPrice && triggerType
          ? { triggerPrice: String(rawTrigger.triggerPrice), triggerType }
          : undefined

      const orderParams = {
        market: 'alpaca',
        pair: toPairKey(String(p['pair'] ?? context.pair)),
        side: String(p['side'] ?? 'buy') as 'buy' | 'sell',
        type: String(p['type'] ?? 'market') as 'market' | 'limit',
        size: String(p['size'] ?? '0'),
        price: p['price'] ? String(p['price']) : undefined,
        trigger,
        mode: slot.mode,
        extendedHours: p['extendedHours'] === true,
        tgtCcy: p['tgtCcy'] ? String(p['tgtCcy']) : undefined,
        clientOrderId: p['clientOrderId']
          ? String(p['clientOrderId'])
          : undefined,
      }
      return placeAlpacaOrder(orderParams, slot.credentials)
    }

    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return []
      return fetchAlpacaBalances(slot.credentials, slot.mode)
    }

    throw new Error(
      `alpaca-market-connector: unsupported execute capability '${capability}'`,
    )
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    const { capability, params: p, context } = params
    const pair = String(p['pair'] ?? context.pair)

    if (capability === 'market-data:candles') {
      const timeframe = String(p['timeframe'] ?? context.timeframe)
      return getWsClient().subscribeCandles(pair, timeframe, callback)
    }

    if (capability === 'market-data:ticker') {
      return getWsClient().subscribeTicker(pair, callback)
    }

    if (capability === 'market-data:orderbook') {
      return getWsClient().subscribeOrderbook(pair, callback)
    }

    if (capability === 'trading:orders') {
      const slot = getSlot(params)
      if (!slot) return () => {}
      if (!slot.poller) {
        slot.poller = new AlpacaOrderPoller()
      }
      slot.orderCallback = callback
      slot.poller.connect(
        slot.credentials,
        slot.mode === 'paper',
        (update) => {
          slot.orderCallback?.(update)
        },
        (balances) => {
          slot.balanceCallback?.({ type: 'balance', balances })
        },
      )
      return () => {
        slot.poller?.disconnect()
        slot.poller = null
        slot.orderCallback = null
      }
    }

    if (capability === 'trading:balances') {
      const slot = getSlot(params)
      if (!slot) return () => {}
      slot.balanceCallback = callback
      return () => {
        slot.balanceCallback = null
      }
    }

    throw new Error(
      `alpaca-market-connector: unsupported subscribe capability '${capability}'`,
    )
  }

  async function initialize(config: Record<string, unknown>): Promise<void> {
    const credentialId = config['credentialId']
      ? String(config['credentialId'])
      : undefined

    // Legacy path: no credentialId — update first slot or create a default
    if (!credentialId) {
      const first = slots.values().next()
      const id = first.done ? '__default__' : first.value.id
      if (config['apiKey'] && config['apiSecret']) {
        slots.set(id, {
          id,
          credentials: {
            apiKey: String(config['apiKey']),
            apiSecret: String(config['apiSecret']),
          },
          mode: (config['mode'] as 'paper' | 'live') ?? 'paper',
          poller: null,
          orderCallback: null,
          balanceCallback: null,
        })
      }
      return
    }

    if (!config['apiKey'] || !config['apiSecret']) {
      return
    }

    const existing = slots.get(credentialId)
    if (existing) {
      existing.poller?.destroy()
    }

    slots.set(credentialId, {
      id: credentialId,
      credentials: {
        apiKey: String(config['apiKey']),
        apiSecret: String(config['apiSecret']),
      },
      mode: (config['mode'] as 'paper' | 'live') ?? 'paper',
      poller: null,
      orderCallback: null,
      balanceCallback: null,
    })
  }

  async function destroy(): Promise<void> {
    wsClient?.destroy()
    wsClient = null
    for (const slot of slots.values()) {
      slot.poller?.destroy()
    }
    slots.clear()
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
    subscribe,
    initialize,
    destroy,
  }
}
