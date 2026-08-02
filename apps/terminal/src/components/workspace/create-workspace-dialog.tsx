// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
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

import type { TerminalLayout } from '@/lib/layout/types'
import type { VariableEditorRow } from '@/lib/layout/variable-utils'
import { variablesFromRows } from '@/lib/layout/variable-utils'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import {
  DEFAULT_WORKSPACE_ICON,
  WORKSPACE_ICONS,
  getWorkspaceIcon,
} from '@/components/workspace/workspace-icons'
import { VariableEditor } from '@/components/workspace/variable-editor'

type CreateWorkspaceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_LAYOUT: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'default-col',
      widthPercent: 100,
      cells: [
        {
          id: 'default-cell',
          panes: [],
          activeTabIndex: 0,
          heightPercent: 100,
        },
      ],
    },
  ],
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createWorkspace = useCustomWorkspacesStore((s) => s.createWorkspace)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(DEFAULT_WORKSPACE_ICON)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [rows, setRows] = useState<Array<VariableEditorRow>>([])

  const handleCreate = useCallback(() => {
    if (!name.trim()) return
    const id = createWorkspace({
      name: name.trim(),
      description: description.trim() || undefined,
      icon,
      variables: variablesFromRows(rows),
      defaultLayout: DEFAULT_LAYOUT,
    })
    onOpenChange(false)
    setName('')
    setDescription('')
    setIcon(DEFAULT_WORKSPACE_ICON)
    setRows([])
    void navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId: id },
    })
  }, [name, description, icon, rows, createWorkspace, onOpenChange, navigate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspace.create.title')}</DialogTitle>
          <DialogDescription>
            {t('workspace.create.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ws-name">{t('common.name')}</Label>
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
                  {(() => {
                    const Icon = getWorkspaceIcon(icon)
                    return <Icon className="size-4" />
                  })()}
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className="w-52 p-2"
                >
                  <div className="grid grid-cols-5 gap-1">
                    {Object.entries(WORKSPACE_ICONS).map(
                      ([iconName, IconComp]) => (
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
                          <IconComp className="size-4" />
                        </button>
                      ),
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('workspace.create.namePlaceholder')}
                autoFocus
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ws-desc">Description</Label>
            <Input
              id="ws-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short description"
            />
          </div>

          <VariableEditor rows={rows} onChange={setRows} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
