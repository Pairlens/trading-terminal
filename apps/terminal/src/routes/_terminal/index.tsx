// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef } from 'react'
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

import type { DiscoverySectionId } from '@/lib/layout/workspaces/discovery-sections'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import { DiscoveryAssistantSurface } from '@/components/discovery/discovery-assistant-surface'
import { DiscoveryTopBar } from '@/components/discovery/discovery-top-bar'
import { LayoutShell } from '@/components/layout/layout-shell'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useDiscoverySections } from '@/hooks/use-discovery-sections'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { LayoutProvider, useLayout } from '@/lib/layout/context'
import { WorkspaceProvider, useWorkspace } from '@/lib/layout/workspace-context'
import { useRoutePresets } from '@/lib/layout/use-route-presets'
import { track } from '@/lib/analytics-events'
import { workspaceAnalyticsKind } from '@/lib/analytics-panels'
import {
  DEFAULT_DISCOVERY_SECTION,
  isDiscoverySectionId,
  resolveSection,
} from '@/lib/layout/workspaces/discovery-sections'
import { discoveryWorkspaceFor } from '@/lib/layout/workspaces/discovery-workspace'
import { DiscoverySectionProvider } from '@/lib/discovery-section-context'
import { ActivePairProvider } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { ChartTerminalAutoProvider } from '@/lib/chart-terminal-context'

/**
 * `?preset=<template id>` applies a named Discovery preset once on arrival and
 * then strips itself from the URL, so a pane elsewhere in the app can send the
 * user here WITH a board rather than dropping them on whatever Discovery
 * happened to look like. Validated to a template id shape; nothing is applied
 * unless the id is actually in this route's preset menu.
 *
 * `?section=<asset class>` picks which asset-class section is open. Optional:
 * without it the route opens on the section this device used last, so the
 * param is a way to LINK to a section, not the record of which one is active.
 */
const PRESET_ID_RE = /^[a-z0-9][a-z0-9:_-]{0,127}$/

type DiscoverySearch = { preset?: string; section?: DiscoverySectionId }

/** Where this device left Discovery. Local: another screen is not this one. */
const LAST_SECTION_KEY = 'discovery.section'

export const Route = createFileRoute('/_terminal/')({
  component: DiscoveryPage,
  validateSearch: (search: Record<string, unknown>): DiscoverySearch => {
    const out: DiscoverySearch = {}
    const preset = search['preset']
    if (typeof preset === 'string' && PRESET_ID_RE.test(preset)) {
      out.preset = preset
    }
    const section = search['section']
    if (isDiscoverySectionId(section)) out.section = section
    return out
  },
})

/**
 * Applies the `?preset=` board once it is available — plugins activate after
 * first paint, so the preset the link names may arrive a beat later.
 */
function PresetFromSearch() {
  const { preset: requested, section } = Route.useSearch()
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
    // Strip the preset, keep the section: the board is a one-shot instruction,
    // the section is where the user now is.
    void navigate({
      to: '/',
      search: section ? { section } : {},
      replace: true,
    })
  }, [requested, preset, section, dispatch, navigate, workspace.storageKey])

  return null
}

function NoDiscoveryState() {
  const { t } = useTranslation()
  return (
    <main className={PAGE_FRAME}>
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
    </main>
  )
}

/**
 * One section of Discovery: its own workspace, its own persisted layout, its
 * own slice of the layouts menu.
 *
 * `key={section}` on the LayoutProvider is load-bearing, not decoration. The
 * route component survives a section change, and the provider initializes its
 * reducer lazily from the workspace's storage key — without the remount, the
 * persistence effect writes the OLD section's layout into the NEW section's
 * key on the first switch.
 */
function DiscoveryBoard() {
  const { preset, section: requestedSection } = Route.useSearch()
  const navigate = useNavigate()
  const { sections, reorder } = useDiscoverySections()
  const [remembered, setRemembered] = usePersistedState<string>(
    LAST_SECTION_KEY,
    DEFAULT_DISCOVERY_SECTION,
  )

  const active = resolveSection(sections, requestedSection, remembered)

  // A link into a section is also a choice to work there: remember it, so
  // coming back to a bare `/` lands on the same desk.
  useEffect(() => {
    if (active !== remembered) setRemembered(active)
  }, [active, remembered, setRemembered])

  // And the address says which desk that is, always — not only after the
  // user clicks a tab. A bare `/` is ambiguous the moment Discovery has
  // more than one section, to a shared link and to the assistant alike.
  //
  // Only ever FILLS IN a missing section, never corrects one. A link to a
  // section whose plugin has not activated yet resolves to the default for
  // a beat, and rewriting the address in that beat would burn the link
  // before the board it names ever appeared. Held back while a preset is
  // in flight too: that effect owns the URL until it has stripped itself.
  useEffect(() => {
    if (preset || requestedSection !== undefined) return
    void navigate({ to: '/', search: { section: active }, replace: true })
  }, [preset, requestedSection, active, navigate])

  const selectSection = useCallback(
    (id: DiscoverySectionId) => {
      setRemembered(id)
      track('discovery_section_selected', { section: id })
      void navigate({ to: '/', search: { section: id }, replace: true })
    },
    [navigate, setRemembered],
  )

  const workspace = discoveryWorkspaceFor(active)

  return (
    <DiscoverySectionProvider section={active}>
      <WorkspaceProvider config={workspace}>
        <LayoutProvider key={active}>
          <DiscoveryAssistantSurface
            section={active}
            sections={sections.map((entry) => entry.id)}
          />
          {preset ? <PresetFromSearch /> : null}
          <main className={PAGE_FRAME}>
            <DiscoveryTopBar
              sections={sections}
              activeSection={active}
              onSelectSection={selectSection}
              onReorderSections={reorder}
            />
            <LayoutShell />
          </main>
        </LayoutProvider>
      </WorkspaceProvider>
    </DiscoverySectionProvider>
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
          <DiscoveryBoard />
        </ChartTerminalAutoProvider>
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}
