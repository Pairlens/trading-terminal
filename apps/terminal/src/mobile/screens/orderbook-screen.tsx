// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Full-screen order book (design screen 8). Owned by WS-C — replace this
 * file's contents; the default export and its props are the contract.
 * The screen owns its own frame (FullScreenOverlay).
 */
import { useTranslation } from 'react-i18next'

import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

type OrderbookScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'orderbook' }>
  onClose: () => void
}

export default function OrderbookScreen({ onClose }: OrderbookScreenProps) {
  const { t } = useTranslation()
  return (
    <FullScreenOverlay
      display
      onBack={onClose}
      title={t('mobile.shell.overlays.orderbook')}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {t('mobile.shell.comingSoon')}
        </p>
      </div>
    </FullScreenOverlay>
  )
}
