// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Opening a collection from a Discovery pane.
 *
 * The chain rides in the address rather than being re-derived at the far end.
 * The route can otherwise only re-home the contract onto "the first chain that
 * serves NFTs", which is a coin flip once two providers are installed, and the
 * same contract address genuinely exists on several EVM chains: a deployment
 * that landed on Base and on Ethereum is two collections with two floors.
 *
 * The row's own label and image are pinned into the directory on the way out,
 * so the board that opens already knows what it is showing instead of
 * flickering an address while the first read lands. Same reasoning as the DEX
 * panes teaching the token directory on a cold link.
 */
import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

import type { NftChain, NftCollectionSummary } from '@pairlens/shared/nft-types'

import { registerNftCollection } from '@/stores/nft-directory-store'

export type NftSelection = {
  chain: NftChain
  contract: string
  /** The row that was clicked, when the caller has one. Pinned for the board. */
  summary?: NftCollectionSummary
}

export function useNftSelect(): (selection: NftSelection) => void {
  const navigate = useNavigate()

  return useCallback(
    ({ chain, contract, summary }: NftSelection) => {
      if (summary) registerNftCollection(chain, contract, summary)
      void navigate({
        to: '/$cls/$market/$id',
        params: { cls: 'nft', market: chain, id: contract },
        search: {},
      })
    },
    [navigate],
  )
}
