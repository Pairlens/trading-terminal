// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Cloud, CloudOff, HardDrive, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'

import type {
  TerminalLayout,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'
import type { WorkspaceKind } from '@/lib/analytics-events'
import { track } from '@/lib/analytics-events'
import { workspaceParamsFromLayout } from '@/lib/layout/save-workspace'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { WorkspaceIconPicker } from '@/components/workspace/workspace-icon-picker'
import { WorkspaceLayoutPreview } from '@/components/workspace-store/workspace-layout-preview'
import { DEFAULT_WORKSPACE_ICON } from '@/components/workspace/workspace-icons'
import { hasAppServer } from '@/lib/auth-client'
import { useActivePair } from '@/lib/active-pair-context'
import { useActiveWallet } from '@/lib/active-wallet-context'
import { useCloudSyncPreferences } from '@/hooks/use-cloud-sync'
import { useOptimisticSession } from '@/lib/session'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The live layout to capture. */
  layout: TerminalLayout
  /** Variables of the surface being saved from — empty on route surfaces. */
  variables?: ReadonlyArray<WorkspaceVariableDefinition>
  /** Coarse surface kind for analytics — never an id or a name. */
  sourceKind: WorkspaceKind
  /** Prefilled name, e.g. "Scalping copy" when saving from a workspace. */
  suggestedName?: string
  suggestedIcon?: string
}

/**
 * Name the current arrangement and keep it. The result is an ordinary custom
 * workspace, which is what makes it durable: that store already rides the
 * `custom-workspaces` sync key, so a signed-in user gets it on every device
 * without this dialog knowing anything about the transport.
 */
export function SaveWorkspaceDialog({
  open,
  onOpenChange,
  layout,
  variables,
  sourceKind,
  suggestedName,
  suggestedIcon,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session } = useOptimisticSession()
  const syncPreferences = useCloudSyncPreferences()
  const registry = usePaneRegistry()
  const { activePair } = useActivePair()
  const { activeWallet } = useActiveWallet()

  const createWorkspace = useCustomWorkspacesStore((s) => s.createWorkspace)
  const loadWorkspaces = useCustomWorkspacesStore((s) => s.load)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(DEFAULT_WORKSPACE_ICON)

  // Reseed on each open — the layout and the surface may both have moved on
  // since the last time this dialog was closed.
  useEffect(() => {
    if (!open) return
    loadWorkspaces()
    setName(suggestedName ?? '')
    setDescription('')
    setIcon(suggestedIcon ?? DEFAULT_WORKSPACE_ICON)
  }, [open, suggestedName, suggestedIcon, loadWorkspaces])

  const syncsToCloud =
    Boolean(session) &&
    syncPreferences.enabled &&
    syncPreferences.domains.workspaces !== false

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = createWorkspace(
      workspaceParamsFromLayout({
        layout,
        paneDefinitions: registry.getDefinitions(),
        variables,
        name: trimmed,
        description: description.trim() || undefined,
        icon,
        activePair,
        activeWallet,
        // "Account", not "Wallet" — the variable bar labels a connected
        // exchange account here, which is what a wallet variable resolves to
        // everywhere outside the DEX connectors.
        labels: {
          pair: t('workspace.variables.typePair'),
          wallet: t('accounts.account'),
        },
      }),
    )
    track('workspace_layout_saved', { workspace: sourceKind, mode: 'new' })
    onOpenChange(false)
    toast.success(
      t('workspace.save.saved', {
        defaultValue: '“{{name}}” saved to your workspaces.',
        name: trimmed,
      }),
    )
    void navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId: id },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('workspace.save.title', 'Save workspace')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'workspace.save.description',
              'Keep this arrangement of panels as a workspace you can reopen any time.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <WorkspaceLayoutPreview layout={layout} detailed className="h-28" />

          <div className="grid gap-2">
            <Label htmlFor="save-ws-name">{t('common.name')}</Label>
            <div className="flex items-center gap-2">
              <WorkspaceIconPicker value={icon} onChange={setIcon} />
              <Input
                id="save-ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('workspace.save.namePlaceholder')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="save-ws-desc">
              {t('workspace.descriptionLabel')}
            </Label>
            <Input
              id="save-ws-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('workspace.descriptionPlaceholder')}
            />
          </div>

          {/* Where it lands, said plainly — the difference between a device
              and an account is the whole point of naming something. */}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
            {syncsToCloud ? (
              <>
                <Cloud className="mt-px size-3.5 shrink-0 text-primary" />
                <span>
                  {t(
                    'workspace.save.cloudHint',
                    'Synced to your Pairlens account, so it opens on every device you sign in to.',
                  )}
                </span>
              </>
            ) : session ? (
              <>
                <CloudOff className="mt-px size-3.5 shrink-0" />
                <span>
                  {t(
                    'workspace.save.syncOffHint',
                    'Workspace sync is off, so this stays on this device.',
                  )}
                </span>
              </>
            ) : (
              <>
                <HardDrive className="mt-px size-3.5 shrink-0" />
                <span>
                  {hasAppServer
                    ? t(
                        'workspace.save.localHint',
                        'Saved on this device. Sign in to sync it to your Pairlens account and open it anywhere.',
                      )
                    : t(
                        'workspace.save.localOnlyHint',
                        'Saved on this device.',
                      )}
                </span>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            <Save className="size-4" />
            {t('workspace.save.submit', 'Save workspace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
