// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Venue picker (blueprint §D.20 — design gap, spec'd there). Owned by WS-B —
 * replace this file's contents; the default export and its props are the
 * contract. The screen owns its own frame.
 */
import { useTranslation } from 'react-i18next'

import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

type VenuePickerScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'venuePicker' }>
  onClose: () => void
}

export default function VenuePickerScreen({ onClose }: VenuePickerScreenProps) {
  const { t } = useTranslation()
  return (
    <FullScreenOverlay
      onBack={onClose}
      opaque={false}
      title={t('mobile.shell.overlays.venuePicker')}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {t('mobile.shell.comingSoon')}
        </p>
      </div>
    </FullScreenOverlay>
  )
}
