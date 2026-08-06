// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'

import {
  WORKSPACE_ICONS,
  getWorkspaceIcon,
} from '@/components/workspace/workspace-icons'

/** The square icon button + grid popover used beside a workspace name field. */
export function WorkspaceIconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (icon: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const Icon = getWorkspaceIcon(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        <Icon className="size-4" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-52 p-2">
        <div className="grid grid-cols-5 gap-1">
          {Object.entries(WORKSPACE_ICONS).map(([iconName, IconComp]) => (
            <button
              key={iconName}
              type="button"
              aria-label={iconName}
              className={`flex size-8 items-center justify-center rounded-md transition-colors ${
                value === iconName
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
              onClick={() => {
                onChange(iconName)
                setOpen(false)
              }}
            >
              <IconComp className="size-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
