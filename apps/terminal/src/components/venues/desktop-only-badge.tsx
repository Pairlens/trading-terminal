// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mark a venue wears when a browser cannot reach it.
 *
 * Shared rather than inlined, because two surfaces say this about the same
 * venues and they were already drifting: the market picker drew an outlined
 * badge with a monitor glyph and a hardcoded English "Desktop", while the
 * prediction rail drew the same fact as bare grey type through a translation
 * key. Bare type beside a venue name reads as a disabled label rather than as
 * a platform fact, and a hardcoded word is a badge that stays English while
 * the rail beside it turns Japanese.
 *
 * One component, one string, so the next surface that lists venues inherits
 * both instead of picking one.
 *
 * It states a limit of THIS BUILD, never of the venue: desktop reaches every
 * venue, so the mark simply never appears there.
 */
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { cn } from '@pairlens/ui/lib/utils'

export function DesktopOnlyBadge({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge
      className={cn(
        'h-4 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground',
        className,
      )}
      variant="outline"
    >
      <Monitor />
      {t('common.desktopOnlyBadge')}
    </Badge>
  )
}
