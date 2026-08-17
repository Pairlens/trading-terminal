// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Move the range, add or pull liquidity, claim fees.
 *
 * Every one of those is a signed transaction against a position-manager
 * contract, and nothing in the app can build one: no connector exposes a
 * liquidity action, and the panes beside this one cannot even read a position.
 * So this renders no controls at all. A disabled range editor was considered
 * and rejected — a slider and an amount box, greyed out, still teach the
 * reader that the feature exists and works, and the first thing they do is
 * hunt for what unlocks it.
 *
 * Range management is also not a swap: it would go through the same guarded
 * order path an order does, never through a pane's own submit. When the seam
 * in `lib/dex/lp-types.ts` is filled, this pane gets its editor and that path
 * gets the transaction.
 */
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'

import { usePanePair } from '@pairlens/plugin-sdk'

import { PaneAwaitingSource } from '@/components/dex/dex-pane-primitives'
import { useLpSourceState } from '@/components/dex/use-lp-source-state'

export function ManageLiquidityPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)

  if (state.gate) return state.gate

  return (
    <PaneAwaitingSource
      icon={SlidersHorizontal}
      title={t('lpPanes.manageTitle')}
      body={t('lpPanes.manageBody')}
      reads={state.readsLabel}
    />
  )
}
