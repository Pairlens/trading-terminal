// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'

import { Kbd } from '@pairlens/ui/components/ui/kbd'

export function SearchFooter() {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-3 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Kbd className="text-[10px]">↑↓</Kbd>
        {t('search.footer.navigate')}
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd className="text-[10px]">↵</Kbd>
        {t('search.footer.open')}
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd className="text-[10px]">Tab</Kbd>
        {t('search.footer.switchTab')}
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <Kbd className="text-[10px]">&gt;</Kbd>
        {t('search.footer.commands')}
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <Kbd className="text-[10px]">#</Kbd>
        {t('search.footer.pairs')}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Kbd className="text-[10px]">Esc</Kbd>
        {t('search.footer.close')}
      </span>
    </div>
  )
}
