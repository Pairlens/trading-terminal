// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  Columns3,
  GripVertical,
  Link2,
  Unlink,
  Variable,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'

import { LayoutPaneRenderer } from './layout-pane-renderer'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { useLayout } from '@/lib/layout/context'
import {
  useHasWorkspaceVariables,
  useOptionalWorkspaceVariables,
  useWorkspaceVariables,
} from '@/lib/layout/workspace-variables-context'

type LayoutPaneWrapperProps = {
  paneId: string
  paneType: string
  showHeader: boolean
}

export const LayoutPaneWrapper = memo(function LayoutPaneWrapper({
  paneId,
  paneType,
  showHeader,
}: LayoutPaneWrapperProps) {
  const { t } = useTranslation()
  const { layout, dispatch } = useLayout()
  const registry = usePaneRegistry()
  const def = registry.getDefinition(paneType)
  const hasWorkspaceVars = useHasWorkspaceVariables()

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: paneId,
      data: { paneId, paneType },
    })

  const handleClose = () => dispatch({ type: 'REMOVE_PANE', paneId })

  const handlePopToColumn = () => {
    const colIndex = layout.columns.findIndex((col) =>
      col.cells.some((cell) => cell.panes.some((p) => p.id === paneId)),
    )
    dispatch({
      type: 'MOVE_PANE_NEW_COLUMN',
      paneId,
      columnIndex: colIndex + 1,
    })
  }

  // Find pane instance for binding/override info
  const pane = useMemo(() => {
    for (const col of layout.columns) {
      for (const cell of col.cells) {
        const found = cell.panes.find((p) => p.id === paneId)
        if (found) return found
      }
    }
    return null
  }, [layout, paneId])

  // Resolve human-readable labels for bound variables (badges show labels,
  // never internal $names)
  const varCtx = useOptionalWorkspaceVariables()
  const variableLabel = (name: string) =>
    varCtx?.variables.find((v) => v.name === name)?.label ?? name

  const boundVar = pane?.bindings?.['active-pair']
  const hasOverride = Boolean(pane?.overrides?.['active-pair'])
  const overridePair = pane?.overrides?.['active-pair'] as
    | { pairKey: string }
    | undefined
  const requiresPair = def?.requires?.includes('workspace:active-pair')
  const requiresWallet = def?.requires?.includes('workspace:active-wallet')
  const boundWalletVar = pane?.bindings?.['active-wallet']
  const boundTimeframeVar = pane?.bindings?.['active-timeframe']

  return (
    <div
      ref={setNodeRef}
      className="flex h-full flex-col overflow-hidden"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
    >
      {showHeader && (
        <ContextMenu>
          <ContextMenuTrigger className="group/header flex h-7 shrink-0 items-center gap-1 border-b bg-muted/30 px-1.5 transition-colors hover:bg-muted/50">
            {/* The whole title region is the drag handle for a large, intuitive grab target */}
            <span
              ref={setActivatorNodeRef}
              className="flex min-w-0 flex-1 cursor-grab items-center gap-1 select-none active:cursor-grabbing"
              {...listeners}
            >
              <GripVertical className="size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover/header:text-muted-foreground/70" />
              <span className="flex-1 truncate text-xs font-medium text-muted-foreground transition-colors group-hover/header:text-foreground">
                {def ? t(def.labelKey) : paneType}
              </span>
            </span>
            {/* Variable binding badge */}
            {boundVar && (
              <Badge
                variant="outline"
                className="h-4 gap-0.5 px-1 py-0 text-[9px] text-muted-foreground/70"
              >
                <Variable className="size-2.5" />
                {variableLabel(boundVar)}
              </Badge>
            )}
            {/* Override pair badge */}
            {!boundVar && hasOverride && overridePair && (
              <Badge
                variant="secondary"
                className="h-4 px-1 py-0 text-[9px] font-mono"
              >
                {overridePair.pairKey}
              </Badge>
            )}
            {boundWalletVar && (
              <Badge
                variant="outline"
                className="h-4 gap-0.5 px-1 py-0 text-[9px] text-muted-foreground/70"
              >
                <Variable className="size-2.5" />
                {variableLabel(boundWalletVar)}
              </Badge>
            )}
            {boundTimeframeVar && (
              <Badge
                variant="outline"
                className="h-4 gap-0.5 px-1 py-0 text-[9px] text-muted-foreground/70"
              >
                <Variable className="size-2.5" />
                {variableLabel(boundTimeframeVar)}
              </Badge>
            )}
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-5 text-muted-foreground/50 hover:text-destructive"
              onClick={handleClose}
              aria-label={`Close ${def ? t(def.labelKey) : paneType}`}
            >
              <X className="size-3" />
            </Button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={handlePopToColumn}>
              <Columns3 className="size-3.5" />
              Pop Out to Column
            </ContextMenuItem>

            {/* Variable binding submenus */}
            {requiresPair && hasWorkspaceVars && (
              <BindToVariableSubmenu
                paneId={paneId}
                slot="active-pair"
                varType="pair"
                label="Bind Pair to Variable"
                currentBinding={boundVar}
              />
            )}
            {requiresWallet && hasWorkspaceVars && (
              <BindToVariableSubmenu
                paneId={paneId}
                slot="active-wallet"
                varType="wallet"
                label="Bind Wallet to Variable"
                currentBinding={boundWalletVar}
              />
            )}
            {requiresPair && hasWorkspaceVars && (
              <BindToVariableSubmenu
                paneId={paneId}
                slot="active-timeframe"
                varType="timeframe"
                label="Bind Timeframe to Variable"
                currentBinding={boundTimeframeVar}
              />
            )}

            {/* Override controls */}
            {requiresPair && hasOverride && (
              <ContextMenuItem
                onClick={() =>
                  dispatch({
                    type: 'CLEAR_PANE_OVERRIDE',
                    paneId,
                    slot: 'active-pair',
                  })
                }
              >
                <Unlink className="size-3.5" />
                Clear Pair Override
              </ContextMenuItem>
            )}

            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={handleClose}>
              <X className="size-3.5" />
              Close Pane
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
      <div className="@container/pane flex min-h-0 flex-1 flex-col overflow-hidden">
        <LayoutPaneRenderer type={paneType} paneId={paneId} />
      </div>
    </div>
  )
})

/** Submenu listing workspace variables to bind a pane to. Only rendered when hasWorkspaceVars is true. */
function BindToVariableSubmenu({
  paneId,
  slot,
  varType,
  label,
  currentBinding,
}: {
  paneId: string
  slot: string
  varType: string
  label: string
  currentBinding: string | undefined
}) {
  const { dispatch } = useLayout()
  const { variables: allVars } = useWorkspaceVariables()
  const variables = allVars.filter((v) => v.type === varType)

  if (variables.length === 0) return null

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Link2 className="size-3.5" />
        {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {variables.map((v) => (
          <ContextMenuItem
            key={v.name}
            onClick={() =>
              dispatch({
                type: 'SET_PANE_BINDING',
                paneId,
                slot,
                variableName: v.name,
              })
            }
          >
            <span className="text-xs">{v.label}</span>
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              {v.name}
            </span>
            {currentBinding === v.name && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                active
              </span>
            )}
          </ContextMenuItem>
        ))}
        {currentBinding && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() =>
                dispatch({
                  type: 'CLEAR_PANE_BINDING',
                  paneId,
                  slot,
                })
              }
            >
              <Unlink className="size-3.5" />
              Unbind
            </ContextMenuItem>
          </>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
