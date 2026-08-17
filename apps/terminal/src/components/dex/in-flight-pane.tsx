// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Transfers still confirming, each with the block counter it is waiting on.
 *
 * Nothing tracks one. A cross-chain transfer is watched by polling a bridge's
 * status endpoint keyed on the source transaction, and no bridge is connected
 * — so there is no confirmation count to draw. This is the pane where a
 * fabricated progress bar would do the most damage: a transfer that is
 * actually stuck would render as advancing, which is the opposite of the
 * information somebody opens this pane for.
 *
 * The pane still gates on a wallet first, because with no account connected
 * "connect an account" is both true and the thing to do. Seam:
 * `lib/dex/bridge-types.ts`.
 */
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'

import { usePanePair } from '@pairlens/plugin-sdk'

import { PaneAwaitingSource } from '@/components/dex/dex-pane-primitives'
import { useLpSourceState } from '@/components/dex/use-lp-source-state'

export function InFlightPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)

  if (state.gate) return state.gate

  return (
    <PaneAwaitingSource
      icon={Send}
      title={t('bridgePanes.inFlightTitle')}
      body={t('bridgePanes.inFlightBody')}
    />
  )
}
