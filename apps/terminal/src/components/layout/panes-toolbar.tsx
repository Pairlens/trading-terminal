// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useState } from 'react'
import { Columns3, Grid3X3, Plus, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { AddPaneDialog } from './add-pane-dialog'
import { GridConfirmDialog } from './grid-confirm-dialog'
import { GridPicker } from './grid-picker'
import type { GridPlacement } from './grid-confirm-dialog'
import type { ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts'
import { HEADER_CHIP } from '@/components/chrome/header-chrome'
import { useLayout } from '@/lib/layout/context'
import { useWorkspace } from '@/lib/layout/workspace-context'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import { ShortcutHint } from '@/components/shortcut-hints'
import { createGridLayout, mergeGridIntoLayout } from '@/lib/layout/presets'

/**
 * Everything that acts on the panes of the *current* layout — add one, lay them
 * out on a grid, throw the arrangement away. Workspaces (presets, screen sizes,
 * the store) live next door in `LayoutToolbar`; these used to be buried in that
 * same menu, where "add a pane" read like a workspace operation.
 */
export function PanesToolbar() {
  const { t } = useTranslation()
  const { layout, dispatch, startAddPane } = useLayout()
  const workspace = useWorkspace()
  const { defaultPreset } = workspace
  const [menuOpen, setMenuOpen] = useState(false)
  const [addPaneOpen, setAddPaneOpen] = useState(false)
  const [pendingGrid, setPendingGrid] = useState<{
    cols: number
    rows: number
  } | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  // Add-pane and the panes dropdown, on whatever chords the user bound.
  const shortcuts = useMemo<Array<ShortcutDefinition>>(
    () => [
      {
        commandId: 'workspace.addPane',
        action: () => setAddPaneOpen(true),
      },
      {
        commandId: 'workspace.panesMenu',
        action: () => setMenuOpen((prev) => !prev),
      },
    ],
    [],
  )
  useKeyboardShortcuts(shortcuts)
  const menuShortcut = useKeybindingLabel('workspace.panesMenu')
  const addPaneShortcut = useKeybindingLabel('workspace.addPane')

  const hasRealPanes = layout.columns.some((col) =>
    col.cells.some((cell) => cell.panes.some((p) => p.type !== 'empty')),
  )

  const handleReset = () => {
    if (hasRealPanes) {
      setResetConfirmOpen(true)
      setMenuOpen(false)
    } else {
      dispatch({ type: 'APPLY_PRESET', layout: structuredClone(defaultPreset) })
    }
  }

  const confirmReset = () => {
    dispatch({ type: 'APPLY_PRESET', layout: structuredClone(defaultPreset) })
    setResetConfirmOpen(false)
  }

  const handleGridSelect = (cols: number, rows: number) => {
    if (hasRealPanes) {
      setPendingGrid({ cols, rows })
    } else {
      dispatch({ type: 'APPLY_PRESET', layout: createGridLayout(cols, rows) })
    }
    setMenuOpen(false)
  }

  const handleGridConfirm = (placement: GridPlacement) => {
    if (!pendingGrid) return
    const { cols, rows } = pendingGrid
    if (placement === 'replace') {
      dispatch({ type: 'APPLY_PRESET', layout: createGridLayout(cols, rows) })
    } else {
      dispatch({
        type: 'APPLY_PRESET',
        layout: mergeGridIntoLayout(layout, cols, rows, placement),
      })
    }
    setPendingGrid(null)
  }

  // Find which pane types are already in the layout
  const existingTypes = new Set<string>()
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      for (const pane of cell.panes) {
        existingTypes.add(pane.type)
      }
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={HEADER_CHIP}
                    aria-label={t('layout.panes')}
                  />
                }
              />
            }
          >
            <Columns3 className="size-3.5" />
            {t('layout.panes')}
            <ShortcutHint keys={menuShortcut} />
          </TooltipTrigger>
          <TooltipContent>
            {t('layout.panes')}{' '}
            {menuShortcut ? <Kbd className="ml-1.5">{menuShortcut}</Kbd> : null}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setAddPaneOpen(true)}>
            <Plus className="size-3.5" />
            {t('layout.addPane')}
            {addPaneShortcut ? (
              <Kbd className="ml-auto">{addPaneShortcut}</Kbd>
            ) : null}
          </DropdownMenuItem>

          {/* Grid layout picker */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Grid3X3 className="size-3.5" />
              {t('layout.gridLayout')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <GridPicker onSelect={handleGridSelect} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleReset}>
            <RotateCcw className="size-3.5" />
            {t('layout.resetToDefault')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddPaneDialog
        open={addPaneOpen}
        onOpenChange={setAddPaneOpen}
        existingTypes={existingTypes}
        workspace={workspace}
        onSelectPane={startAddPane}
      />

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('layout.resetConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('layout.resetConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmReset}
            >
              {t('layout.resetToDefault')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingGrid && (
        <GridConfirmDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingGrid(null)
          }}
          cols={pendingGrid.cols}
          rows={pendingGrid.rows}
          onConfirm={handleGridConfirm}
        />
      )}
    </>
  )
}

/**
 * "Click a cell to place X" — the armed-placement chip. It reads placement
 * state straight off the layout context rather than living inside
 * `PanesToolbar`, so the toolbar can render it last, after the Workspaces
 * button, instead of shoving that button sideways while placement is armed.
 */
export function PendingPanePlacementHint() {
  const { t } = useTranslation()
  const { pendingAddPaneType, cancelAddPane } = useLayout()
  const registry = usePaneRegistry()
  const pendingPaneDef = pendingAddPaneType
    ? registry.getDefinition(pendingAddPaneType)
    : null

  if (!pendingPaneDef) return null

  return (
    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs">
      <span className="text-primary">
        {t('layout.clickToPlace')}{' '}
        <span className="font-medium">{t(pendingPaneDef.labelKey)}</span>
      </span>
      <button
        onClick={cancelAddPane}
        className="rounded p-0.5 text-primary/60 hover:bg-primary/20 hover:text-primary"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
