// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'

import type { CustomWorkspaceDefinition } from '@/lib/layout/types'
import type { VariableEditorRow } from '@/lib/layout/variable-utils'
import {
  collectVariableUsage,
  rowsFromVariables,
  variablesFromRows,
} from '@/lib/layout/variable-utils'
import { loadLayout } from '@/lib/layout/persistence'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import {
  WORKSPACE_ICONS,
  getWorkspaceIcon,
} from '@/components/workspace/workspace-icons'
import { VariableEditor } from '@/components/workspace/variable-editor'

type EditWorkspaceDialogProps = {
  workspace: CustomWorkspaceDefinition | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: EditWorkspaceDialogProps) {
  const { t } = useTranslation()
  const updateWorkspace = useCustomWorkspacesStore((s) => s.updateWorkspace)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [rows, setRows] = useState<Array<VariableEditorRow>>([])

  // Reset form state when workspace changes or dialog opens
  useEffect(() => {
    if (workspace && open) {
      setName(workspace.name)
      setDescription(workspace.description ?? '')
      setIcon(workspace.icon ?? 'Layers')
      setRows(rowsFromVariables(workspace.variables))
    }
  }, [workspace, open])

  // How many panes bind each variable in the live layout — powers the
  // "used by N panes" hints and the two-step delete in the editor.
  const usage = useMemo(() => {
    if (!workspace || !open) return {}
    const liveLayout = loadLayout(
      `pairlens:workspace.${workspace.id}.layout`,
      workspace.defaultLayout,
    )
    return collectVariableUsage([liveLayout], workspace.variables)
  }, [workspace, open])

  const handleSave = useCallback(() => {
    if (!workspace || !name.trim()) return
    updateWorkspace(workspace.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      icon,
      variables: variablesFromRows(rows),
    })
    onOpenChange(false)
  }, [workspace, name, description, icon, rows, updateWorkspace, onOpenChange])

  if (!workspace) return null

  const IconComp = getWorkspaceIcon(icon)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspace.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('workspace.edit.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ws-edit-name">{t('common.name')}</Label>
            <div className="flex items-center gap-2">
              <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={t('common.chooseIcon')}
                    />
                  }
                >
                  <IconComp className="size-4" />
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className="w-52 p-2"
                >
                  <div className="grid grid-cols-5 gap-1">
                    {Object.entries(WORKSPACE_ICONS).map(([iconName, Ic]) => (
                      <button
                        key={iconName}
                        type="button"
                        className={`flex size-8 items-center justify-center rounded-md transition-colors ${
                          icon === iconName
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => {
                          setIcon(iconName)
                          setIconPickerOpen(false)
                        }}
                      >
                        <Ic className="size-4" />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                id="ws-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('workspace.namePlaceholder')}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ws-edit-desc">
              {t('workspace.descriptionLabel')}
            </Label>
            <Input
              id="ws-edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('workspace.descriptionPlaceholder')}
            />
          </div>

          <VariableEditor rows={rows} onChange={setRows} usage={usage} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
