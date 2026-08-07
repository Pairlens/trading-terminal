// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Connect-an-account flow (design flow A, screens A1–A3). Owned by WS-B —
 * replace this file's contents; the default export and its props are the
 * contract. The screen owns its own frame (full-height sheet).
 */
import { useTranslation } from 'react-i18next'

import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

type ConnectAccountSheetProps = {
  overlay: Extract<MobileOverlay, { kind: 'connect' }>
  onClose: () => void
}

export default function ConnectAccountSheet({
  onClose,
}: ConnectAccountSheetProps) {
  const { t } = useTranslation()
  return (
    <FullScreenOverlay
      anchor="screen"
      dismiss="close"
      onBack={onClose}
      title={t('mobile.shell.overlays.connect')}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {t('mobile.shell.comingSoon')}
        </p>
      </div>
    </FullScreenOverlay>
  )
}
