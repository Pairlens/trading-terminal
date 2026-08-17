// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Source chain, target chain, the bridge, its fee and how long it takes.
 *
 * No bridge provider is connected. The DEX connectors route WITHIN one chain
 * — KyberSwap across a chain's pools, Jupiter across Solana's — and nothing in
 * the app quotes a cross-chain transfer or watches one. A prototype's "~40s ·
 * $0.42" is the kind of number somebody moves six figures on, so the pane
 * states the gap instead and names what would fill it.
 *
 * What IS answerable today sits one pane away: the chain ladder quotes the
 * same asset on every connected chain with gas folded in, which is the
 * decision a bridge quote feeds into. The seam is `lib/dex/bridge-types.ts`.
 */
import { useTranslation } from 'react-i18next'
import { Waypoints } from 'lucide-react'

import { usePanePair } from '@pairlens/plugin-sdk'

import { PaneAwaitingSource } from '@/components/dex/dex-pane-primitives'
import { dexChain } from '@/lib/dex/chain-catalog'
import { splitPairKey } from '@/lib/dex/pair-legs'

export function RouteBridgePane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const chain = dexChain(activePair?.market)
  const legs = splitPairKey(activePair?.pairKey)

  return (
    <PaneAwaitingSource
      icon={Waypoints}
      title={t('bridgePanes.routeTitle')}
      body={t('bridgePanes.routeBody')}
      reads={
        legs && chain
          ? t('bridgePanes.wouldQuote', {
              asset: legs.base,
              chain: chain.displayName,
            })
          : null
      }
    />
  )
}
