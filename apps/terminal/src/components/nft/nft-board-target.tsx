// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a collection board pane is pointed at, and who is signing.
 *
 * The NFT route is `/nft/{chain}/{contract}`, so a pane's `market` is the CHAIN
 * and its pair key is the CONTRACT. Nine panes read that same pair the same way
 * and every one of them has to refuse a market that is not a chain we serve: a
 * board dragged onto a Coinbase pair would otherwise ask a provider for the
 * floor of "BTC-USDT" and render whatever came back. So the read happens once,
 * here, and returns null rather than a half-valid target.
 *
 * The wallet half is the same argument. An NFT order is signed by a key, and
 * one EVM key covers Ethereum, Base, Polygon, Arbitrum and Optimism, so the
 * chain a board is on maps to a SIGNING family rather than to a wallet. The
 * ticket and the holdings pane both need that mapping and neither should own
 * it.
 */
import { usePanePair } from '@pairlens/plugin-sdk'

import type { WalletChain } from '@pairlens/market-engine/adapter'
import type { NftChain } from '@pairlens/shared/nft-types'
import { isNftChain } from '@pairlens/shared/nft-types'

import type { CryptoWallet } from '@/stores/wallets-store'
import { useActiveWallet } from '@/lib/active-wallet-context'
import { useWalletsStore } from '@/stores/wallets-store'

export type NftPaneTarget = {
  chain: NftChain
  contract: string
}

/**
 * The collection this pane is bound to, or null.
 *
 * Null covers both "no pair at all" and "a pair that is not an NFT collection",
 * because a pane has the same thing to say about either: it is not pointed at a
 * collection yet.
 */
export function useNftPaneTarget(): NftPaneTarget | null {
  const pair = usePanePair()
  if (!pair?.market || !pair.pairKey) return null
  const chain = pair.market.toLowerCase()
  if (!isNftChain(chain)) return null
  return { chain, contract: pair.pairKey }
}

/** Which key family signs on this chain. One EVM key serves every EVM chain. */
export function nftWalletChain(chain: NftChain): WalletChain {
  return chain === 'solana' ? 'solana' : 'ethereum'
}

export type NftWalletState = {
  /** The wallet a write pane would sign with, or null when there is none. */
  wallet: CryptoWallet | null
  /** The vault is locked, so "no wallet" is not the same as "none stored". */
  sealed: boolean
  loaded: boolean
}

/**
 * The wallet a collection board writes with: the bound one when it signs on
 * this chain, otherwise any key of the chain's own family.
 */
export function useNftBoardWallet(chain: NftChain | undefined): NftWalletState {
  const { activeWallet } = useActiveWallet()
  const wallets = useWalletsStore((s) => s.wallets)
  const loaded = useWalletsStore((s) => s.loaded)
  const sealed = useWalletsStore((s) => s.sealed)

  const family = chain ? nftWalletChain(chain) : null
  const bound = wallets.find((w) => w.id === activeWallet?.walletId) ?? null
  const wallet =
    bound && (family === null || bound.chain === family)
      ? bound
      : (wallets.find((w) => family === null || w.chain === family) ?? null)

  return { wallet, sealed, loaded }
}
