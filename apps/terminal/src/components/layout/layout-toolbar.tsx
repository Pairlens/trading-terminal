// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Grid3X3,
  Laptop,
  Layout,
  LayoutGrid,
  LayoutTemplate,
  Monitor,
  MonitorPlay,
  Plus,
  RotateCcw,
  Tv,
  X,
} from 'lucide-react'

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
import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { AddPaneDialog } from './add-pane-dialog'
import { GridConfirmDialog } from './grid-confirm-dialog'
import { GridPicker } from './grid-picker'
import type { ScreenPresetGroup } from '@/lib/layout/types'
import type { GridPlacement } from './grid-confirm-dialog'
import type { ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts'
import { workspaceAnalyticsKind } from '@/lib/analytics-panels'
import { track } from '@/lib/analytics-events'
import { useLayout } from '@/lib/layout/context'
import { useWorkspace } from '@/lib/layout/workspace-context'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import { ShortcutHint } from '@/components/shortcut-hints'
import { createGridLayout, mergeGridIntoLayout } from '@/lib/layout/presets'

const SCREEN_ICONS: Record<string, typeof Laptop> = {
  Laptop,
  LayoutGrid,
  Monitor,
  MonitorPlay,
  Tv,
}

type LayoutToolbarProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function LayoutToolbar({ open, onOpenChange }: LayoutToolbarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { layout, dispatch, pendingAddPaneType, startAddPane, cancelAddPane } =
    useLayout()
  const workspace = useWorkspace()
  const [addPaneOpen, setAddPaneOpen] = useState(false)
  const [pendingGrid, setPendingGrid] = useState<{
    cols: number
    rows: number
  } | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const { presets, screenPresets, defaultPreset } = workspace

  // Add-pane and the workspaces dropdown, on whatever chords the user bound.
  const shortcuts = useMemo<Array<ShortcutDefinition>>(() => {
    const defs: Array<ShortcutDefinition> = [
      {
        commandId: 'workspace.addPane',
        action: () => setAddPaneOpen(true),
      },
    ]
    if (onOpenChange) {
      defs.push({
        commandId: 'workspace.menu',
        action: () => onOpenChange(!open),
      })
    }
    return defs
  }, [onOpenChange, open])
  useKeyboardShortcuts(shortcuts)
  const menuShortcut = useKeybindingLabel('workspace.menu')
  const addPaneShortcut = useKeybindingLabel('workspace.addPane')

  const workspaceKind = workspaceAnalyticsKind(workspace.storageKey)

  const handlePreset = (key: string) => {
    const preset = presets[key]
    if (!preset) return
    track('preset_applied', { preset: key, workspace: workspaceKind })
    dispatch({
      type: 'APPLY_PRESET',
      layout: structuredClone(preset.layout),
    })
  }

  const handleScreenPreset = (preset: ScreenPresetGroup['presets'][number]) => {
    track('preset_applied', { preset: preset.key, workspace: workspaceKind })
    dispatch({
      type: 'APPLY_PRESET',
      layout: structuredClone(preset.layout),
    })
  }

  const handleAddPane = (type: string) => {
    startAddPane(type)
  }

  const hasRealPanes = layout.columns.some((col) =>
    col.cells.some((cell) => cell.panes.some((p) => p.type !== 'empty')),
  )

  const handleReset = () => {
    if (hasRealPanes) {
      setResetConfirmOpen(true)
      onOpenChange?.(false)
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
    onOpenChange?.(false)
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

  const registry = usePaneRegistry()
  const pendingPaneDef = pendingAddPaneType
    ? registry.getDefinition(pendingAddPaneType)
    : null

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    aria-label={t('layout.workspaces')}
                  />
                }
              />
            }
          >
            <Layout className="size-3.5" />
            {t('layout.workspaces')}
            <ShortcutHint keys={menuShortcut} />
          </TooltipTrigger>
          <TooltipContent>
            {t('layout.workspaces')}{' '}
            {menuShortcut ? <Kbd className="ml-1.5">{menuShortcut}</Kbd> : null}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          {/* Existing presets — quick access */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('layout.presets')}</DropdownMenuLabel>
          </DropdownMenuGroup>
          {Object.entries(presets).map(([key, preset]) => (
            <DropdownMenuItem key={key} onClick={() => handlePreset(key)}>
              <Layout className="size-3.5" />
              {preset.label}
            </DropdownMenuItem>
          ))}

          {/* Workspace Store — featured CTA, in the language of the
              user-menu / sign-in CTAs: tinted card, iris glow, badge. */}
          <div className="px-1 py-1">
            <DropdownMenuItem
              aria-label={t('layout.browseStore', 'Browse Workspace Store')}
              onClick={() => {
                onOpenChange?.(false)
                void navigate({ to: '/workspace-store' })
              }}
              className="group/store relative cursor-pointer gap-2.5 overflow-hidden rounded-[10px] border border-primary/15 bg-gradient-to-b from-primary/[0.09] via-primary/[0.03] to-transparent p-2 focus:border-primary/25 focus:bg-primary/[0.12] focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground"
            >
              {/* soft iris glow behind the badge */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-8 -right-5 size-20 rounded-full bg-primary/20 opacity-70 blur-2xl transition-opacity duration-200 group-focus/store:opacity-100"
              />
              <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-inset ring-primary/15">
                <LayoutTemplate className="size-4" />
              </div>
              <div className="relative grid flex-1 gap-0.5 leading-tight">
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                  {t('layout.workspaceStore', 'Workspace Store')}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {t('layout.browseStoreSubtitle', 'Ready-made layouts')}
                </span>
              </div>
              <ArrowRight className="relative size-3.5 shrink-0 self-center text-primary/70 transition-transform duration-200 group-focus/store:translate-x-0.5" />
            </DropdownMenuItem>
          </div>

          {screenPresets && screenPresets.length > 0 && (
            <>
              <DropdownMenuSeparator />

              {/* Screen-size submenus */}
              {screenPresets.map((group) => {
                const Icon = SCREEN_ICONS[group.icon] ?? Monitor
                return (
                  <DropdownMenuSub key={group.label}>
                    <DropdownMenuSubTrigger>
                      <Icon className="size-3.5" />
                      {group.label}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-40">
                      {group.presets.map((preset) => (
                        <DropdownMenuItem
                          key={preset.key}
                          onClick={() => handleScreenPreset(preset)}
                        >
                          {preset.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })}
            </>
          )}

          <DropdownMenuSeparator />

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

          {/* Add pane */}
          <DropdownMenuItem onClick={() => setAddPaneOpen(true)}>
            <Plus className="size-3.5" />
            {t('layout.addPane')}
            {addPaneShortcut ? (
              <Kbd className="ml-auto">{addPaneShortcut}</Kbd>
            ) : null}
          </DropdownMenuItem>

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
        onSelectPane={handleAddPane}
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

      {pendingPaneDef && (
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
      )}
    </>
  )
}
