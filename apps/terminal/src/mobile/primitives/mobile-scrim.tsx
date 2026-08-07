// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

export type MobileScrimProps = {
  onDismiss: () => void
  /** z-index is the caller's call — the popover and its scrim move together. */
  className?: string
}

/**
 * The dismiss scrim. Used by the timeframe popover and by full-screen
 * overlays; panels deliberately have none — the chart stays visible AND
 * tappable behind a sheet, which is the whole tap-to-dismiss gesture.
 */
export const MobileScrim = memo(function MobileScrim({
  onDismiss,
  className,
}: MobileScrimProps) {
  const { t } = useTranslation()
  return (
    <button
      aria-label={t('mobile.shell.dismiss')}
      className={cn('pl-scrim fixed inset-0', className)}
      onClick={onDismiss}
      type="button"
    />
  )
})
