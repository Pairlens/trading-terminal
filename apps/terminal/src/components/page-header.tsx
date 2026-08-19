// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
  HEADER_TICK,
} from '@/components/chrome/header-chrome'
import { FullscreenToggleButton } from '@/components/fullscreen-toggle'
import { useOmniSearch } from '@/components/omni-search/omni-search-provider'
import { useKeybindingLabel } from '@/hooks/use-keybindings'

type PageHeaderProps = {
  /** Left-aligned content (title, pair info, etc.) */
  children: ReactNode
  /** Optional right-aligned content rendered before the search button */
  actions?: ReactNode
}

export function PageHeader({ children, actions }: PageHeaderProps) {
  const { t } = useTranslation()
  const { open } = useOmniSearch()
  const searchShortcut = useKeybindingLabel('general.commandPalette')

  return (
    <header className={HEADER_BAR}>
      {children}
      <div className="flex-1" />
      {actions}
      {actions ? <span aria-hidden className={HEADER_TICK} /> : null}
      {/* Icon and chord only. The bar is dense with numbers a trader reads at
          a glance, and a search field carrying its own placeholder was the
          widest thing on it for a control nobody hunts for: everyone who uses
          it uses the chord. */}
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
    </header>
  )
}
