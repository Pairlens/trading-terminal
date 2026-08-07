// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * News reader (design flow B) — a thin host over NewsReaderDialog. Owned by
 * WS-B — replace this file's contents; the default export and its props are
 * the contract.
 */
import { useTranslation } from 'react-i18next'

import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

type NewsReaderSheetProps = {
  overlay: Extract<MobileOverlay, { kind: 'news' }>
  onClose: () => void
}

export default function NewsReaderSheet({ onClose }: NewsReaderSheetProps) {
  const { t } = useTranslation()
  return (
    <FullScreenOverlay
      anchor="screen"
      dismiss="close"
      onBack={onClose}
      title={t('mobile.shell.overlays.news')}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {t('mobile.shell.comingSoon')}
        </p>
      </div>
    </FullScreenOverlay>
  )
}
