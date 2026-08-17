// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fees a position has earned, the APR that implies, and what is claimable now.
 *
 * Waiting on the same source as the rest of the LP trio: fees per day need
 * either an indexer or a fee-growth snapshot diffed over time, and nothing in
 * the app takes either. A bar chart of invented daily fees is worse than an
 * empty pane, because it looks measured. See `lib/dex/lp-types.ts` for the
 * seam and the order the pieces have to land in.
 */
import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'

import { usePanePair } from '@pairlens/plugin-sdk'

import { PaneAwaitingSource } from '@/components/dex/dex-pane-primitives'
import { useLpSourceState } from '@/components/dex/use-lp-source-state'

export function FeeAccrualPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)

  if (state.gate) return state.gate

  return (
    <PaneAwaitingSource
      icon={Coins}
      title={t('lpPanes.feesTitle')}
      body={t('lpPanes.feesBody')}
      reads={state.readsLabel}
    />
  )
}
