// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AddPaneDialog } from './add-pane-dialog'
import { usePaneContext } from '@/lib/layout/pane-context'
import { useLayout } from '@/lib/layout/context'
import { useWorkspace } from '@/lib/layout/workspace-context'

export function EmptyPlaceholderPane() {
  const { t } = useTranslation()
  const { paneId } = usePaneContext()
  const { layout, dispatch } = useLayout()
  const workspace = useWorkspace()
  const [dialogOpen, setDialogOpen] = useState(false)

  // Collect existing pane types for singleton checks
  const existingTypes = new Set<string>()
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      for (const pane of cell.panes) {
        existingTypes.add(pane.type)
      }
    }
  }

  const handleSelectPane = (type: string) => {
    // Find the cell that contains this empty placeholder
    for (const col of layout.columns) {
      for (const cell of col.cells) {
        if (cell.panes.some((p) => p.id === paneId)) {
          dispatch({
            type: 'ADD_PANE',
            paneType: type,
            targetCellId: cell.id,
          })
          return
        }
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex size-full items-center justify-center"
      >
        <div className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-(--pane-rule) px-6 py-4 transition-colors hover:border-muted-foreground/40 hover:bg-muted/30">
          <Plus className="size-5 text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground">
            {t('layout.emptyPlaceholder')}
          </span>
        </div>
      </button>

      <AddPaneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingTypes={existingTypes}
        workspace={workspace}
        onSelectPane={handleSelectPane}
      />
    </>
  )
}
