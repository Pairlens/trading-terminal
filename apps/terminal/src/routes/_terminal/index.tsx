// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
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
import { LayoutProvider, useLayout } from '@/lib/layout/context'
import { WorkspaceProvider, useWorkspace } from '@/lib/layout/workspace-context'
import { useRoutePresets } from '@/lib/layout/use-route-presets'
import { track } from '@/lib/analytics-events'
import { workspaceAnalyticsKind } from '@/lib/analytics-panels'
import { DISCOVERY_WORKSPACE } from '@/lib/layout/workspaces/discovery-workspace'
import { ActivePairProvider } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { ChartTerminalAutoProvider } from '@/lib/chart-terminal-context'

/**
 * `?preset=<template id>` applies a named Discovery preset once on arrival and
 * then strips itself from the URL, so a pane elsewhere in the app can send the
 * user here WITH a board rather than dropping them on whatever Discovery
 * happened to look like. Validated to a template id shape; nothing is applied
 * unless the id is actually in this route's preset menu.
 */
const PRESET_ID_RE = /^[a-z0-9][a-z0-9:_-]{0,127}$/

type DiscoverySearch = { preset?: string }

export const Route = createFileRoute('/_terminal/')({
  component: DiscoveryPage,
  validateSearch: (search: Record<string, unknown>): DiscoverySearch => {
    const preset = search['preset']
    return typeof preset === 'string' && PRESET_ID_RE.test(preset)
      ? { preset }
      : {}
  },
})

/**
 * Applies the `?preset=` board once it is available — plugins activate after
 * first paint, so the preset the link names may arrive a beat later.
 */
function PresetFromSearch() {
  const { preset: requested } = Route.useSearch()
  const navigate = useNavigate()
  const { dispatch } = useLayout()
  const workspace = useWorkspace()
  const presets = useRoutePresets(workspace)
  const applied = useRef(false)

  const preset = requested ? presets[requested] : undefined

  useEffect(() => {
    if (!requested || !preset || applied.current) return
    applied.current = true
    track('preset_applied', {
      preset: requested,
      workspace: workspaceAnalyticsKind(workspace.storageKey),
    })
    dispatch({ type: 'APPLY_PRESET', layout: structuredClone(preset.layout) })
    void navigate({ to: '/', search: {}, replace: true })
  }, [requested, preset, dispatch, navigate, workspace.storageKey])

  return null
}

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
            nativeButton={false}
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
              <PresetFromSearch />
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
