// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The LP side of the pool: range against price, composition, and value versus
 * simply holding.
 *
 * None of that exists yet, and this pane says so rather than drawing it. No
 * DEX connector declares `trading:positions`, nothing reads a position-manager
 * contract, and no provider serves per-wallet pool state — so every number a
 * prototype shows here (a band, a time-in-range percentage, an impermanent
 * loss) would be invented. Those are numbers people close real positions on.
 *
 * What the pane does instead: keep its frame, name the wallet and pool it
 * would read the moment a source lands, and gate on the wallet first, because
 * with nothing connected the honest answer is "connect an account", not
 * "unavailable". The typed seam is `lib/dex/lp-types.ts`.
 */
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'

import { usePanePair } from '@pairlens/plugin-sdk'

import { PaneAwaitingSource } from '@/components/dex/dex-pane-primitives'
import { useLpSourceState } from '@/components/dex/use-lp-source-state'

export function LpPositionPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)

  if (state.gate) return state.gate

  return (
    <PaneAwaitingSource
      icon={Layers}
      title={t('lpPanes.positionTitle')}
      body={t('lpPanes.positionBody')}
      reads={state.readsLabel}
    />
  )
}
