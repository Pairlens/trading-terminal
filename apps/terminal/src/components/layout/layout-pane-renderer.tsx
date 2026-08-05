// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Suspense } from 'react'
import { Loader2, Puzzle } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

import { Button } from '@pairlens/ui/components/ui/button'

import { PaneErrorBoundary } from './pane-error-boundary'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { PaneContextProvider } from '@/lib/layout/pane-context'
import { PluginHostProvider } from '@/lib/plugin-host-provider'

function PaneLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground/40" />
    </div>
  )
}

function MissingPaneUI({ type }: { type: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pluginId = type.includes(':') ? type.split(':')[0] : null

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <Puzzle className="size-8 text-muted-foreground/30" />
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          {pluginId
            ? t('layout.missingPane.requiresPlugin', { pluginId })
            : t('layout.missingPane.notAvailable', { type })}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          {t('layout.missingPane.description')}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-1 h-7 gap-1.5 text-xs"
        onClick={() =>
          navigate({
            to: '/plugins',
            search: pluginId ? { manage: pluginId } : {},
          })
        }
      >
        <Puzzle className="size-3" />
        {t('layout.missingPane.openPluginStore')}
      </Button>
    </div>
  )
}

export function LayoutPaneRenderer({
  type,
  paneId,
}: {
  type: string
  paneId: string
}) {
  const registry = usePaneRegistry()
  const Component = registry.getComponent(type)

  if (!Component) {
    return <MissingPaneUI type={type} />
  }

  const content = (
    <PaneErrorBoundary paneType={type}>
      <Suspense fallback={<PaneLoading />}>
        <Component />
      </Suspense>
    </PaneErrorBoundary>
  )

  return (
    <PaneContextProvider paneId={paneId} paneType={type}>
      <PluginHostProvider paneType={type}>{content}</PluginHostProvider>
    </PaneContextProvider>
  )
}
