// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Blocks, Unplug } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import { DiscoveryTopBar } from '@/components/discovery/discovery-top-bar'
import { LayoutShell } from '@/components/layout/layout-shell'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { LayoutProvider } from '@/lib/layout/context'
import { WorkspaceProvider } from '@/lib/layout/workspace-context'
import { DISCOVERY_WORKSPACE } from '@/lib/layout/workspaces/discovery-workspace'
import { ActivePairProvider } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { ChartTerminalAutoProvider } from '@/lib/chart-terminal-context'

export const Route = createFileRoute('/_terminal/')({
  component: DiscoveryPage,
})

function NoDiscoveryState() {
  const { t } = useTranslation()
  return (
    <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Unplug className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t('routes.discovery.noInstrumentCatalog')}</EmptyTitle>
            <EmptyDescription>
              {t('routes.discovery.noInstrumentCatalogDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            className="mt-4 gap-2"
            render={<Link to="/plugins" />}
          >
            <Blocks className="size-4" />
            {t('routes.discovery.goToPlugins')}
          </Button>
        </Empty>
      </div>
    </SidebarInset>
  )
}

function DiscoveryPage() {
  const { hasDiscovery, pluginsReady } = useMarketInstruments()

  if (!hasDiscovery && pluginsReady) {
    return <NoDiscoveryState />
  }

  return (
    <ActivePairProvider initial={null}>
      <ActiveWalletProvider initial={null}>
        <ChartTerminalAutoProvider>
          <WorkspaceProvider config={DISCOVERY_WORKSPACE}>
            <LayoutProvider>
              <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DiscoveryTopBar />
                <LayoutShell />
              </SidebarInset>
            </LayoutProvider>
          </WorkspaceProvider>
        </ChartTerminalAutoProvider>
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}
