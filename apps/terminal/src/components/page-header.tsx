// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import { Separator } from '@pairlens/ui/components/ui/separator'
import type { ReactNode } from 'react'

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
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      {children}
      <div className="flex-1" />
      {actions && (
        <>
          {actions}
          <Separator orientation="vertical" className="self-stretch" />
        </>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-2 px-2 text-xs text-muted-foreground"
        onClick={open}
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">{t('search.placeholder')}</span>
        {searchShortcut ? <Kbd>{searchShortcut}</Kbd> : null}
      </Button>
      <FullscreenToggleButton />
    </header>
  )
}
