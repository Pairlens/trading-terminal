// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Cable, Hammer, Package, SlidersHorizontal, Store } from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'

import { HEADER_GROUP, HEADER_TITLE } from '@/components/chrome/header-chrome'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import { PageHeader } from '@/components/page-header'
import { StoreSearchChip } from '@/components/store/store-shell'
import { usePairlens } from '@/lib/pairlens-provider'
import { PluginStore } from '@/components/plugins/plugin-store'
import { InstalledPlugins } from '@/components/plugins/installed-plugins'
import { CapabilityProviders } from '@/components/plugins/capability-providers'
import { MarketConnectors } from '@/components/plugins/market-connectors'
import { DevelopGuide } from '@/components/plugins/develop-guide'

/**
 * The tab strip in the bar's own vocabulary, the way the Discovery strip does
 * it: no container, one `--card` chip for the tab you are on, muted for the
 * rest. Every class here overrides a default from the tabs primitive: the
 * boxed `--muted` tray it ships is right for a tab strip inside a panel and
 * wrong on a bar that draws no boxes at all.
 */
const TAB_STRIP =
  'gap-1 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-[26px]'

const TAB_CHIP =
  'h-[26px] flex-none gap-1.5 rounded-[10px] border-0 px-[9px] text-xs font-normal hover:bg-card group-data-[variant=default]/tabs-list:data-active:shadow-none data-active:bg-card dark:data-active:bg-card'

/** A number the bar reports, not a control: the chip without the hover. */
const HEADER_READOUT =
  'inline-flex h-[26px] shrink-0 items-center rounded-[10px] bg-card px-[9px] font-mono text-[10px] tabular-nums text-muted-foreground'

type PluginsSearch = {
  manage?: string
  tab?: string
}

export const Route = createFileRoute('/_terminal/plugins')({
  component: PluginsPage,
  validateSearch: (search: Record<string, unknown>): PluginsSearch => ({
    manage: typeof search.manage === 'string' ? search.manage : undefined,
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
})

function PluginsPage() {
  const { t } = useTranslation()
  const { manage, tab } = Route.useSearch()
  const { pluginManager } = usePairlens()
  const navigate = useNavigate({ from: Route.fullPath })
  const activeCount = pluginManager.getActivePlugins().length
  const totalCount = pluginManager.getInstalledPlugins().length

  const [storeSearch, setStoreSearch] = useState('')

  const activeTab = tab ?? 'store'

  return (
    <main className={PAGE_FRAME}>
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          navigate({
            search: (prev) => ({ ...prev, tab: String(value) }),
            replace: true,
          })
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <PageHeader
          actions={
            <>
              <div className={HEADER_GROUP}>
                <TabsList className={TAB_STRIP}>
                  <TabsTrigger value="store" className={TAB_CHIP}>
                    <Store className="size-3.5" />
                    {t('pluginStore.backToStore')}
                  </TabsTrigger>
                  <TabsTrigger value="markets" className={TAB_CHIP}>
                    <Cable className="size-3.5" />
                    {t('panes.markets')}
                  </TabsTrigger>
                  <TabsTrigger value="installed" className={TAB_CHIP}>
                    <Package className="size-3.5" />
                    {t('pluginStore.installedLabel')}
                  </TabsTrigger>
                  <TabsTrigger value="providers" className={TAB_CHIP}>
                    <SlidersHorizontal className="size-3.5" />
                    {t('pluginStore.configuration')}
                  </TabsTrigger>
                  <TabsTrigger value="build" className={TAB_CHIP}>
                    <Hammer className="size-3.5" />
                    {t('routes.plugins.tabBuild')}
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className={HEADER_GROUP}>
                <span className={HEADER_READOUT}>
                  {t('routes.plugins.activeCount', {
                    active: activeCount,
                    total: totalCount,
                  })}
                </span>
                {activeTab === 'store' && (
                  <StoreSearchChip
                    value={storeSearch}
                    onChange={setStoreSearch}
                    placeholder={t('routes.plugins.searchPlaceholder')}
                    clearLabel={t('routes.plugins.clearSearch')}
                  />
                )}
              </div>
            </>
          }
        >
          <h1 className={HEADER_TITLE}>{t('nav.plugins')}</h1>
        </PageHeader>

        <TabsContent
          value="store"
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <PluginStore autoOpenPluginId={manage} search={storeSearch} />
        </TabsContent>
        <TabsContent value="markets" className="min-h-0 flex-1 overflow-auto">
          <MarketConnectors />
        </TabsContent>
        <TabsContent value="installed" className="min-h-0 flex-1 overflow-auto">
          <InstalledPlugins />
        </TabsContent>
        <TabsContent value="providers" className="min-h-0 flex-1 overflow-auto">
          <CapabilityProviders />
        </TabsContent>
        <TabsContent value="build" className="min-h-0 flex-1 overflow-auto">
          <DevelopGuide />
        </TabsContent>
      </Tabs>
    </main>
  )
}
