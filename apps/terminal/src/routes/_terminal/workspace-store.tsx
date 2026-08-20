// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { AssetClass } from '@/lib/workspace-store/types'
import { HEADER_GROUP, HEADER_TITLE } from '@/components/chrome/header-chrome'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import { PageHeader } from '@/components/page-header'
import { StoreSearchChip } from '@/components/store/store-shell'
import { WorkspaceStore } from '@/components/workspace-store/workspace-store'
import { ASSET_CLASSES } from '@/lib/workspace-store/catalog'

type WorkspaceStoreSearch = {
  template?: string
  /** Pre-selects the asset-class facet (links from a pair page's menu). */
  assetClass?: AssetClass
}

export const Route = createFileRoute('/_terminal/workspace-store')({
  component: WorkspaceStorePage,
  validateSearch: (search: Record<string, unknown>): WorkspaceStoreSearch => ({
    template: typeof search.template === 'string' ? search.template : undefined,
    assetClass: ASSET_CLASSES.includes(search.assetClass as AssetClass)
      ? (search.assetClass as AssetClass)
      : undefined,
  }),
})

function WorkspaceStorePage() {
  const { template, assetClass } = Route.useSearch()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  return (
    // `relative` because the bar hovers over the storefront rather than
    // stacking above it; the store reserves its 44px itself.
    <main className={cn(PAGE_FRAME, 'relative')}>
      <PageHeader
        floating
        actions={
          <div className={HEADER_GROUP}>
            <StoreSearchChip
              value={search}
              onChange={setSearch}
              placeholder={t(
                'workspaceStore.searchPlaceholder',
                'Search workspaces…',
              )}
              clearLabel={t('common.clear', 'Clear')}
            />
          </div>
        }
      >
        <h1 className={HEADER_TITLE}>
          {t('nav.workspaceStore', 'Workspace Store')}
        </h1>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceStore
          autoOpenTemplateId={template}
          initialAssetClass={assetClass}
          search={search}
        />
      </div>
    </main>
  )
}
