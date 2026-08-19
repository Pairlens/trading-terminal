// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, Settings, Unplug } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { Separator } from '@pairlens/ui/components/ui/separator'

import type {
  CustomWorkspaceDefinition,
  WorkspaceConfig,
} from '@/lib/layout/types'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import { LayoutShell } from '@/components/layout/layout-shell'
import { LayoutToolbar } from '@/components/layout/layout-toolbar'
import { PageHeader } from '@/components/page-header'
import { EditWorkspaceDialog } from '@/components/workspace/edit-workspace-dialog'
import { WorkspaceAssistantSurface } from '@/components/workspace/workspace-assistant-surface'
import { WorkspaceVariableBar } from '@/components/layout/workspace-variable-bar'
import { useMarketData } from '@/lib/market-data-provider'
import { ActivePairProvider } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { ChartTerminalAutoProvider } from '@/lib/chart-terminal-context'
import { LayoutProvider } from '@/lib/layout/context'
import { WorkspaceProvider } from '@/lib/layout/workspace-context'
import { WorkspaceVariablesProvider } from '@/lib/layout/workspace-variables-context'
import { VariableBindingsReconciler } from '@/lib/layout/variable-bindings-reconciler'
import { PaneStreamRegistry } from '@/lib/layout/pane-stream-registry'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'

export const Route = createFileRoute('/_terminal/workspace/$workspaceId')({
  component: CustomWorkspacePage,
})

function CustomWorkspacePage() {
  const { t } = useTranslation()
  const { workspaceId } = Route.useParams()
  const { status: mdStatus, pluginsReady } = useMarketData()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)

  const workspace = useCustomWorkspacesStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId),
  )

  const workspaceConfig = useMemo<WorkspaceConfig | null>(() => {
    if (!workspace) return null
    return {
      id: workspace.id,
      storageKey: `pairlens:workspace.${workspace.id}.layout`,
      defaultPreset: workspace.defaultLayout,
      presets: {},
      variables: workspace.variables,
    }
  }, [workspace])

  if (mdStatus !== 'connected') {
    if (!pluginsReady) {
      return (
        <main className={PAGE_FRAME}>
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
          </div>
        </main>
      )
    }

    return (
      <main className={PAGE_FRAME}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Unplug className="size-10 opacity-40" />
          <p className="text-sm font-medium">
            {t('routes.noConnectors.title')}
          </p>
          <p className="max-w-xs text-center text-xs opacity-70">
            {t('routes.noConnectors.description')}
          </p>
          <Link
            to="/plugins"
            search={{ tab: 'markets' }}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
          >
            {t('routes.noConnectors.manage')}
          </Link>
        </div>
      </main>
    )
  }

  if (!workspace || !workspaceConfig) {
    return (
      <main className={PAGE_FRAME}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>{t('routes.workspace.notFound')}</p>
          <button
            className="text-xs underline"
            onClick={() => void navigate({ to: '/' })}
          >
            {t('routes.goHome')}
          </button>
        </div>
      </main>
    )
  }

  return (
    <ActivePairProvider initial={null}>
      <ActiveWalletProvider initial={null}>
        <ChartTerminalAutoProvider>
          <WorkspaceProvider config={workspaceConfig}>
            <WorkspaceVariablesProvider
              workspaceId={workspace.id}
              variables={workspace.variables}
            >
              <PaneStreamRegistry>
                <LayoutProvider key={workspace.id}>
                  <VariableBindingsReconciler />
                  <WorkspaceAssistantSurface workspace={workspace} />
                  <main className={PAGE_FRAME}>
                    <CustomWorkspaceTopBar
                      workspace={workspace}
                      onEdit={() => setEditOpen(true)}
                    />
                    <WorkspaceVariableBar
                      onManageVariables={() => setEditOpen(true)}
                    />
                    <LayoutShell />
                  </main>
                  <EditWorkspaceDialog
                    workspace={workspace}
                    open={editOpen}
                    onOpenChange={setEditOpen}
                  />
                </LayoutProvider>
              </PaneStreamRegistry>
            </WorkspaceVariablesProvider>
          </WorkspaceProvider>
        </ChartTerminalAutoProvider>
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}

function CustomWorkspaceTopBar({
  workspace,
  onEdit,
}: {
  workspace: CustomWorkspaceDefinition
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const [workspacesOpen, setWorkspacesOpen] = useState(false)

  return (
    <PageHeader
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onEdit}
          >
            <Settings className="size-3.5" />
            {t('routes.workspace.edit')}
          </Button>
          <Separator orientation="vertical" className="self-stretch" />
          <LayoutToolbar
            open={workspacesOpen}
            onOpenChange={setWorkspacesOpen}
          />
        </>
      }
    >
      <h1 className="text-sm font-semibold">{workspace.name}</h1>
      {workspace.description && (
        <>
          <Separator orientation="vertical" className="self-stretch" />
          <span className="truncate text-xs text-muted-foreground">
            {workspace.description}
          </span>
        </>
      )}
    </PageHeader>
  )
}
