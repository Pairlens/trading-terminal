// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the focused venue is actually allowed to do, in one word.
 *
 * The phone surfaces this constantly — the `read-only` tag on the venue chip,
 * the watchlist row's `OKX spot · trading` sub-line, the venue picker's
 * capability line, the Trade ticket's connect gate — so the join lives here
 * once instead of in four components.
 *
 * The join is the same one the desktop trade panel makes at
 * `trade-entry-panel.tsx`: the venue's adapter capabilities decide whether
 * trading is possible at all, and a stored credential (or a wallet on the
 * venue's chain, for a DEX) decides whether it is possible *for this user*.
 *
 * A sealed vault deliberately reads as `read`, not `none`: the credential
 * store is empty because it could not be read, not because there is nothing
 * in it, and the caller's copy ("connect an account") would send someone who
 * already has keys off to enter them a second time.
 */
import { useMarketData } from '@/lib/market-data-provider'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'

export type VenueTradePermission =
  /** Not reachable from this build — a desktop-only venue in a browser. */
  | 'none'
  /** Market data flows; placing an order does not. */
  | 'read'
  /** A credential (or chain wallet) exists and the connector can trade. */
  | 'trade'

export function useVenueTradePermission(market: string): VenueTradePermission {
  const { availableMarkets } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)
  const wallets = useWalletsStore((s) => s.wallets)

  const info = availableMarkets.find((m) => m.marketId === market)
  if (!info) return 'none'
  if (!info.capabilities.includes('trade')) return 'read'

  // One EVM key covers every EVM chain, so a DEX matches on the chain rather
  // than on the market id.
  const hasKey = info.walletChain
    ? wallets.some((w) => w.chain === info.walletChain)
    : credentials.some((c) => c.market === market)

  return hasKey ? 'trade' : 'read'
}
