// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Blocks,
  Cable,
  Hammer,
  Package,
  Search,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Input } from '@pairlens/ui/components/ui/input'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'

import { PageHeader } from '@/components/page-header'
import { usePairlens } from '@/lib/pairlens-provider'
import { PluginStore } from '@/components/plugins/plugin-store'
import { InstalledPlugins } from '@/components/plugins/installed-plugins'
import { CapabilityProviders } from '@/components/plugins/capability-providers'
import { MarketConnectors } from '@/components/plugins/market-connectors'
import { DevelopGuide } from '@/components/plugins/develop-guide'

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
  const { manage, tab } = Route.useSearch()
  const { pluginManager } = usePairlens()
  const navigate = useNavigate({ from: Route.fullPath })
  const activeCount = pluginManager.getActivePlugins().length
  const totalCount = pluginManager.getInstalledPlugins().length

  const [storeSearch, setStoreSearch] = useState('')

  const activeTab = tab ?? 'store'

  return (
    <SidebarInset className="h-svh min-h-svh overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          navigate({
            search: (prev) => ({ ...prev, tab: String(value) }),
            replace: true,
          })
        }
        className="flex h-full flex-col gap-0"
      >
        <PageHeader
          actions={
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="store">
                  <Store className="size-3.5" />
                  Store
                </TabsTrigger>
                <TabsTrigger value="markets">
                  <Cable className="size-3.5" />
                  Markets
                </TabsTrigger>
                <TabsTrigger value="installed">
                  <Package className="size-3.5" />
                  Installed
                </TabsTrigger>
                <TabsTrigger value="providers">
                  <SlidersHorizontal className="size-3.5" />
                  Configuration
                </TabsTrigger>
                <TabsTrigger value="build">
                  <Hammer className="size-3.5" />
                  Build
                </TabsTrigger>
              </TabsList>
              <Badge
                variant="outline"
                className="shrink-0 gap-1.5 font-mono text-[10px] tabular-nums"
              >
                {activeCount}/{totalCount} active
              </Badge>
              {activeTab === 'store' && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="Search plugins…"
                    className="h-[30px] w-[210px] pl-8 pr-7 text-xs"
                  />
                  {storeSearch && (
                    <button
                      type="button"
                      onClick={() => setStoreSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          }
        >
          <Blocks className="size-4" />
          <h1 className="text-sm font-semibold">Plugins</h1>
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
    </SidebarInset>
  )
}
