// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type { ReactNode } from 'react'

import {
  HEADER_BAR,
  HEADER_CHIP_MUTED,
  HEADER_GROUP,
} from '@/components/chrome/header-chrome'
import { FullscreenToggleButton } from '@/components/fullscreen-toggle'
import { useOmniSearch } from '@/components/omni-search/omni-search-provider'
import { useKeybindingLabel } from '@/hooks/use-keybindings'

type PageHeaderProps = {
  /** Left-aligned content (title, pair info, etc.) */
  children: ReactNode
  /** Optional right-aligned content rendered before the search button */
  actions?: ReactNode
  /**
   * Hover the bar over the page instead of stacking it above.
   *
   * For surfaces that paint their own light all the way to the top edge — the
   * two storefronts — where a flat strip of chrome above the artwork read as
   * a seam. The page underneath has to reserve the 44px itself and keep its
   * own overlays clear of it; `StoreCanvas` in `components/store/store-shell`
   * does both, and the parent has to be a positioned box.
   */
  floating?: boolean
}

export function PageHeader({ children, actions, floating }: PageHeaderProps) {
  const { t } = useTranslation()
  const { open } = useOmniSearch()
  const searchShortcut = useKeybindingLabel('general.commandPalette')

  return (
    <header
      className={cn(
        HEADER_BAR,
        // Above the scrim `StoreCanvas` fades in behind it, and above the
        // product sheets that stop at the bar's lower edge.
        floating && 'absolute inset-x-0 top-0 z-50',
      )}
    >
      {children}
      <div className="flex-1" />
      {actions}
      {/* Icon and chord only. The bar is dense with numbers a trader reads at
          a glance, and a search field carrying its own placeholder was the
          widest thing on it for a control nobody hunts for: everyone who uses
          it uses the chord. */}
      <div className={HEADER_GROUP}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={open}
                aria-label={t('search.placeholder')}
                className={HEADER_CHIP_MUTED}
              />
            }
          >
            <Search className="size-3.5" />
            {searchShortcut ? (
              <Kbd className="border-0 bg-secondary px-1 font-mono text-[10px] shadow-none">
                {searchShortcut}
              </Kbd>
            ) : null}
          </TooltipTrigger>
          <TooltipContent>{t('search.placeholder')}</TooltipContent>
        </Tooltip>
        <FullscreenToggleButton />
      </div>
    </header>
  )
}
