// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LayoutTemplate, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@pairlens/ui/components/ui/input'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import { PageHeader } from '@/components/page-header'
import { WorkspaceStore } from '@/components/workspace-store/workspace-store'

type WorkspaceStoreSearch = {
  template?: string
}

export const Route = createFileRoute('/_terminal/workspace-store')({
  component: WorkspaceStorePage,
  validateSearch: (search: Record<string, unknown>): WorkspaceStoreSearch => ({
    template: typeof search.template === 'string' ? search.template : undefined,
  }),
})

function WorkspaceStorePage() {
  const { template } = Route.useSearch()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  return (
    <SidebarInset className="h-svh min-h-svh overflow-hidden">
      <div className="flex h-full flex-col">
        <PageHeader
          actions={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  'workspaceStore.searchPlaceholder',
                  'Search workspaces…',
                )}
                className="h-[30px] w-[210px] pl-8 pr-7 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={t('common.clear', 'Clear')}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          }
        >
          <LayoutTemplate className="size-4" />
          <h1 className="text-sm font-semibold">
            {t('nav.workspaceStore', 'Workspace Store')}
          </h1>
        </PageHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <WorkspaceStore autoOpenTemplateId={template} search={search} />
        </div>
      </div>
    </SidebarInset>
  )
}
