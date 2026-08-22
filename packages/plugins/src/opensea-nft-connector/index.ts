// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The OpenSea connector: one plugin, both halves of the NFT asset class.
 *
 * ## Refusal is the contract
 *
 * Every action this provider does not serve THROWS. The plugin manager walks
 * its fallback chain on a thrown error and stops on a returned value, so a
 * `null` for something we simply do not publish ends the walk with "there is
 * nothing here" and blanks the board. That is the single rule this file exists
 * to hold: an unrecognised capability, an unrecognised action and an
 * unrecognised timeframe all refuse, and none of them falls through.
 *
 * ## Reads never touch a wallet
 *
 * Every `market-data:*` action is answered before a wallet slot is looked at,
 * so the whole read surface works with the vault sealed and no key provisioned.
 * The slot lookup itself fails CLOSED: a provided-but-unknown `walletId`
 * resolves to nothing rather than to the first slot, because an NFT buy routed
 * to the wrong account is an on-chain transfer nobody can take back.
 *
 * ## Live data
 *
 * REST polling, paced by the shared limiter in `./http`. Slowly, because a free
 * key is 600 reads an hour and a board already spends most of that on its
 * panes. OpenSea's Stream API would be the right home for the live tail (its
 * events do not count against the REST limit); it is not wired here, and the
 * poller is what the panes are built against.
 */
import {
  fetchHoldings,
  fetchItems,
  fetchSales,
  fetchTraits,
} from './activity-client'
import { fetchBook, fetchListings, fetchOffers } from './book-client'
import {
  clearCollectionCaches,
  fetchCollection,
  fetchCollections,
  fetchOverview,
} from './collections-client'
import { openSeaFetch, unsupported } from './http'
import { asArray, asObject, asString } from './parsers'
import { clearSlugCache, resolveSlug } from './slug-resolver'
import { fetchCandles, fetchSeries } from './series-client'
import { executeNftOrder } from './trading'
import { CHAIN_CURRENCY, isTradableChain, OPENSEA_CHAIN } from './types'

import { isNftChain } from '@pairlens/shared/nft-types'

import type { NftChain, NftCollectionSort } from '@pairlens/shared/nft-types'
import type { NftCollectionInstrument } from '@pairlens/shared/instrument-types'
import type { CandleUpdate, TickerUpdate } from '@pairlens/market-engine/types'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { WalletSlot } from './types'

/** Slower than any pane's own cadence. The budget is the constraint here. */
const CANDLE_POLL_MS = 90_000
const TICKER_POLL_MS = 60_000

const READ_ACTIONS = new Set([
  'collections',
  'collection',
  'book',
  'listings',
  'offers',
  'sales',
  'items',
  'traits',
  'series',
  'overview',
  'holdings',
])

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * The chain an action is for.
 *
 * `params.market` first, and this is not a nicety: the manager's shared context
 * carries the terminal's own current venue, which for an NFT board open on Base
 * while the chart sits on an Ethereum collection is the wrong chain entirely.
 */
function chainOf(params: PluginExecuteParams): NftChain | undefined {
  const raw =
    readString(params.params['market']) ?? readString(params.context.market)
  return raw && isNftChain(raw) ? raw : undefined
}

/** The collection an action is for: our identity, or the venue's own slug. */
function contractOf(params: PluginExecuteParams): string | undefined {
  return (
    readString(params.params['contract']) ??
    readString(params.params['pair']) ??
    readString(params.context.pair)
  )
}

function requireChain(params: PluginExecuteParams, action: string): NftChain {
  const chain = chainOf(params)
  if (!chain) {
    unsupported(
      action,
      readString(params.params['market']) ??
        readString(params.context.market) ??
        'an unnamed chain',
    )
  }
  return chain
}

function requireContract(params: PluginExecuteParams, action: string): string {
  const contract = contractOf(params)
  if (!contract) {
    throw new Error(`OpenSea: '${action}' needs a collection to read.`)
  }
  return contract
}

export function createOpenSeaNftPlugin(manifest: PluginManifest): PluginInstance {
  const walletSlots = new Map<string, WalletSlot>()
  const candlePollers = new Map<string, ReturnType<typeof setInterval>>()
  const tickerPollers = new Map<string, ReturnType<typeof setInterval>>()
  let apiKey = ''

  /**
   * The key, or a refusal that names the fix.
   *
   * There is no keyless OpenSea tier to degrade to, so a connector activated
   * without one would answer every read with the same 401 and read as broken
   * rather than as unconfigured.
   */
  function requireKey(): string {
    if (!apiKey) {
      throw new Error(
        'OpenSea needs an API key. Add one in Accounts: they are free and issued instantly.',
      )
    }
    return apiKey
  }

  function getSlot(params: PluginExecuteParams): WalletSlot | null {
    const walletId = readString(params.params['walletId'])
    // Fail closed. A wallet id we were given and do not know is an error, never
    // a licence to sign with whichever wallet happens to be first.
    if (walletId) return walletSlots.get(walletId) ?? null
    const first = walletSlots.values().next()
    return first.done ? null : first.value
  }

  async function readNft(params: PluginExecuteParams): Promise<unknown> {
    const key = requireKey()
    const p = params.params
    const action = readString(p['action']) ?? ''

    if (!READ_ACTIONS.has(action)) {
      unsupported(action || 'an unnamed NFT action')
    }

    switch (action) {
      case 'collections': {
        const sort = (readString(p['sort']) ?? 'volume24h') as NftCollectionSort
        return fetchCollections(
          key,
          chainOf(params),
          sort,
          readNumber(p['limit']) ?? 50,
        )
      }
      case 'collection':
        return fetchCollection(
          key,
          requireChain(params, action),
          requireContract(params, action),
        )
      case 'book':
        return fetchBook(
          key,
          requireChain(params, action),
          requireContract(params, action),
          readNumber(p['limit']),
        )
      case 'listings':
        return fetchListings(
          key,
          requireChain(params, action),
          requireContract(params, action),
          readNumber(p['limit']),
        )
      case 'offers':
        return fetchOffers(
          key,
          requireChain(params, action),
          requireContract(params, action),
          readNumber(p['limit']),
        )
      case 'sales': {
        const chain = requireChain(params, action)
        const contract = contractOf(params)
        const limit = readNumber(p['limit'])
        const minPriceUsd = readNumber(p['minPriceUsd'])
        return fetchSales(key, {
          chain,
          ...(contract ? { contract } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(minPriceUsd !== undefined ? { minPriceUsd } : {}),
        })
      }
      case 'items':
        return fetchItems(
          key,
          requireChain(params, action),
          requireContract(params, action),
          readNumber(p['limit']),
        )
      case 'traits':
        return fetchTraits(
          key,
          requireChain(params, action),
          requireContract(params, action),
        )
      case 'series':
        return fetchSeries(
          key,
          requireChain(params, action),
          requireContract(params, action),
          readNumber(p['days']) ?? 30,
        )
      case 'holdings': {
        const owner = readString(p['owner'])
        if (!owner) throw new Error("OpenSea: 'holdings' needs a wallet address.")
        const contract = contractOf(params)
        return fetchHoldings(
          key,
          requireChain(params, action),
          owner,
          contract,
          readNumber(p['limit']),
        )
      }
      default:
        // `overview` and nothing else reaches here, and it refuses: OpenSea
        // publishes no market aggregate, and the head of a ranking is not one.
        return fetchOverview()
    }
  }

  /**
   * Collection search.
   *
   * Scoped to ONE chain per request, because OpenSea's search publishes a slug
   * and a name per hit and no chain: an unscoped search returns rows nothing
   * can route. The chain in context wins; Ethereum is the fallback, which is
   * where the overwhelming majority of what anyone types is deployed.
   */
  async function searchCollections(
    params: PluginExecuteParams,
  ): Promise<{ items: Array<NftCollectionInstrument>; total: number; hasMore: boolean }> {
    const query =
      readString(params.params['q']) ?? readString(params.params['query'])
    if (!query) return { items: [], total: 0, hasMore: false }
    const key = requireKey()
    const chain = chainOf(params) ?? 'ethereum'
    const limit = Math.min(readNumber(params.params['limit']) ?? 20, 50)

    const raw = await openSeaFetch<unknown>(
      key,
      `/search?query=${encodeURIComponent(query)}&asset_types=collection&chains=${OPENSEA_CHAIN[chain]}&limit=${limit}`,
    )
    const items: Array<NftCollectionInstrument> = []
    for (const entry of asArray(asObject(raw)?.['results'])) {
      const result = asObject(entry)
      const hit = asObject(result?.['collection'])
      if (!hit || hit['is_disabled'] === true) continue
      const slug = asString(hit['collection'])
      if (!slug) continue
      const item: NftCollectionInstrument = {
        id: `nft:${chain}:${slug}`,
        kind: 'nft-collection',
        market: chain,
        symbol: slug,
        name: asString(hit['name']) ?? slug,
        base: slug,
        quote: CHAIN_CURRENCY[chain],
        assetClass: 'nft',
        categories: [],
        rank: 100_000,
        featured: false,
        chain,
        // The slug stands in for the address: OpenSea's search does not publish
        // a contract, and the wire type allows a marketplace slug as identity
        // precisely so a row like this can still open a board.
        address: slug,
        slug,
        priceCurrency: CHAIN_CURRENCY[chain],
      }
      const imageUrl = asString(hit['image_url'])
      if (imageUrl) item.imageUrl = imageUrl
      items.push(item)
    }
    return { items, total: items.length, hasMore: false }
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability } = params

    // ── Reads, before anything looks at a wallet ──────────────────────
    if (capability === 'market-data:nft') return readNft(params)

    if (
      capability === 'market-data:candles' ||
      capability === 'market-data:history'
    ) {
      return fetchCandles(
        requireKey(),
        requireChain(params, 'candles'),
        requireContract(params, 'candles'),
        readString(params.params['timeframe']) ??
          readString(params.context.timeframe) ??
          '1d',
        readNumber(params.params['limit']) ?? 300,
      )
    }

    if (capability === 'market-data:discovery:search') {
      return searchCollections(params)
    }

    if (capability === 'trading:orders') {
      const action = readString(params.params['action']) ?? 'place'
      if (action !== 'place') {
        // Never fall through to the signing path on an action we do not know.
        unsupported(`order action '${action}'`)
      }
      const chain = requireChain(params, 'order')
      if (!isTradableChain(chain)) {
        unsupported('order placement', chain)
      }
      const contract = requireContract(params, 'order')
      const slot = getSlot(params)
      if (!slot) {
        return {
          success: false,
          error: readString(params.params['walletId'])
            ? `Unknown wallet '${readString(params.params['walletId'])}'`
            : 'No wallet is connected for OpenSea.',
        }
      }

      const key = requireKey()
      const slug = await resolveSlug(key, chain, contract)
      const p = params.params
      return executeNftOrder(
        {
          apiKey: key,
          chain,
          slug,
          contract,
          slot,
          request: (path, init) =>
            openSeaFetch(key, path, {
              ...(init?.method ? { method: init.method } : {}),
              ...(init?.body !== undefined ? { body: init.body } : {}),
            }),
        },
        {
          action: 'place',
          side: readString(p['side']) === 'sell' ? 'sell' : 'buy',
          type: readString(p['type']) === 'limit' ? 'limit' : 'market',
          size: readNumber(p['size']) ?? 1,
          ...(readNumber(p['price']) !== undefined
            ? { price: readNumber(p['price']) as number }
            : {}),
          ...(readString(p['tokenId']) ? { tokenId: readString(p['tokenId']) as string } : {}),
          ...(readString(p['clientOrderId'])
            ? { clientOrderId: readString(p['clientOrderId']) as string }
            : {}),
        },
      )
    }

    // Not a capability this connector publishes. Refuse rather than answer
    // null, so the manager keeps walking.
    return unsupported(capability)
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    const { capability } = params
    const chain = chainOf(params)
    const contract = contractOf(params)
    if (!chain || !contract || !apiKey) return () => {}

    if (capability === 'market-data:candles') {
      const timeframe =
        readString(params.params['timeframe']) ??
        readString(params.context.timeframe) ??
        '1d'
      const key = `${chain}:${contract}:${timeframe}`

      // The snapshot is retried until one lands, then the poller switches to
      // the tail. A dropped first read must not leave the chart empty forever.
      let snapshotDelivered = false
      // One request in flight at a time: with the limiter in front, a queued
      // read can outlive the interval, and a second one behind it would spend
      // budget re-asking a question already on the wire.
      let inFlight = false

      const poll = async () => {
        if (inFlight) return
        inFlight = true
        try {
          const candles = await fetchCandles(
            apiKey,
            chain,
            contract,
            timeframe,
            snapshotDelivered ? 3 : 300,
          )
          if (candles.length === 0) return
          if (!snapshotDelivered) {
            snapshotDelivered = true
            callback({ type: 'snapshot', candles } satisfies CandleUpdate)
            return
          }
          callback({ type: 'update', candles } satisfies CandleUpdate)
        } catch {
          // Throttled or transient. The provider cool-off is already recorded
          // in ./http, and the next tick retries rather than publishing a
          // no-data verdict.
        } finally {
          inFlight = false
        }
      }

      void poll()
      const existing = candlePollers.get(key)
      if (existing) clearInterval(existing)
      const timer = setInterval(() => void poll(), CANDLE_POLL_MS)
      candlePollers.set(key, timer)

      return () => {
        clearInterval(timer)
        candlePollers.delete(key)
      }
    }

    if (capability === 'market-data:ticker') {
      const key = `${chain}:${contract}`
      let active = true
      let inFlight = false

      const poll = async () => {
        if (!active || inFlight) return
        inFlight = true
        try {
          const summary = await fetchCollection(apiKey, chain, contract)
          if (!active || summary.floorPrice === undefined) return
          callback({
            type: 'ticker',
            ticker: {
              // The floor IS the ask: it is the cheapest thing anyone can buy
              // right now. The best collection offer is the bid, and when
              // nobody is bidding the side is genuinely empty rather than a
              // spread painted around the last print.
              last: summary.floorPrice,
              bid: summary.topOffer ?? 0,
              ask: summary.floorPrice,
              high24h: 0,
              low24h: 0,
              volume24h: summary.volume24h ?? 0,
              change24h: summary.floorChange24h ?? 0,
              ts: Date.now(),
            },
          } satisfies TickerUpdate)
        } catch {
          // Retry next interval.
        } finally {
          inFlight = false
        }
      }

      const existing = tickerPollers.get(key)
      if (existing) clearInterval(existing)
      void poll()
      const timer = setInterval(() => void poll(), TICKER_POLL_MS)
      tickerPollers.set(key, timer)

      return () => {
        active = false
        clearInterval(timer)
        tickerPollers.delete(key)
      }
    }

    return () => {}
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
    subscribe,

    async initialize(config: Record<string, unknown>) {
      const key = readString(config['apiKey'])
      if (key) apiKey = key

      const getKey =
        typeof config['getPrivateKey'] === 'function'
          ? (config['getPrivateKey'] as (id: string) => Promise<string | null>)
          : null

      // Wallet provisioning. The accessor from THIS call is bound to THIS
      // wallet id: a later provisioning never re-points an existing slot.
      const walletId = readString(config['walletId'])
      const address = readString(config['address'])
      if (walletId && address) {
        walletSlots.set(walletId, {
          walletId,
          address,
          getPrivateKey: getKey ? () => getKey(walletId) : null,
        })
      }
    },

    async destroy() {
      for (const timer of candlePollers.values()) clearInterval(timer)
      candlePollers.clear()
      for (const timer of tickerPollers.values()) clearInterval(timer)
      tickerPollers.clear()
      walletSlots.clear()
      clearSlugCache()
      clearCollectionCaches()
    },
  }
}

export { openSeaNftManifest } from './manifest'
