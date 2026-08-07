// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pair picker (design flow D). Owned by WS-B — replace this file's contents;
 * the default export and its props are the contract. Per the design (09-row)
 * this is a near-full-height sheet with a Cancel button, chart visible behind;
 * the screen owns its own chrome.
 */
import { useTranslation } from 'react-i18next'

import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

type PairPickerScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'pairPicker' }>
  onClose: () => void
}

export default function PairPickerScreen({ onClose }: PairPickerScreenProps) {
  const { t } = useTranslation()
  return (
    <FullScreenOverlay
      onBack={onClose}
      opaque={false}
      title={t('mobile.shell.overlays.pairPicker')}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {t('mobile.shell.comingSoon')}
        </p>
      </div>
    </FullScreenOverlay>
  )
}
