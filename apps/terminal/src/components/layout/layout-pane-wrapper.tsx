// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useMemo, useState } from 'react'
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

import { cn } from '@pairlens/ui/lib/utils'
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
import { PaneHeaderSlotProvider } from './pane-header-slot'
import { AiSpotlight } from '@/components/assistant-dock/ai-spotlight'
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
  /**
   * Where this pane's trailing metric should land when the pane draws no
   * header of its own. A tabbed cell has one header row for several panes, so
   * it owns the slot and hands it to whichever pane is on top; everything else
   * passes nothing and the metric simply has nowhere to go.
   */
  headerSlot?: HTMLElement | null
}

export const LayoutPaneWrapper = memo(function LayoutPaneWrapper({
  paneId,
  paneType,
  showHeader,
  headerSlot: inheritedSlot = null,
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

  // The header's trailing slot, handed to the pane below as a portal target.
  // State rather than a ref because the pane renders in the same pass and has
  // to be told once the node exists.
  const [ownSlot, setOwnSlot] = useState<HTMLElement | null>(null)
  const headerSlot = showHeader ? ownSlot : inheritedSlot

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

  const paneLabel = def ? t(def.labelKey) : paneType

  return (
    <div
      ref={setNodeRef}
      // `relative` is the spotlight's anchor: the glow is drawn inside
      // this box precisely because the box clips, so a pane the
      // assistant points at cannot bleed over its neighbours.
      //
      // `group/pane` is the hover reveal. The trigger is the WHOLE pane, not
      // the header and not the grip: a trader's pointer is already inside a
      // pane reading it, so the handle lights before they think about moving
      // it. Modelled in CSS rather than as a `hoveredPaneId` on the board
      // because a React state change here would re-render every pane on the
      // board each time the pointer crossed a seam.
      className="group/pane relative flex h-full flex-col overflow-hidden"
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      {showHeader && (
        <ContextMenu>
          <ContextMenuTrigger className="flex h-5 shrink-0 items-center gap-2">
            {/* Inert text, so it doubles as a wide grab target. The grip is
                the sign; this is the surface most people will actually
                grab. */}
            <span
              className="min-w-0 shrink cursor-grab truncate text-[12.5px] leading-none font-medium tracking-[-0.005em] select-none active:cursor-grabbing"
              {...listeners}
            >
              {paneLabel}
            </span>
            {/* Variable binding badge */}
            {boundVar && (
              <PaneHeaderBadge>
                <Variable className="size-2.5" />
                {variableLabel(boundVar)}
              </PaneHeaderBadge>
            )}
            {/* Override pair badge */}
            {!boundVar && hasOverride && overridePair && (
              <PaneHeaderBadge mono>{overridePair.pairKey}</PaneHeaderBadge>
            )}
            {boundWalletVar && (
              <PaneHeaderBadge>
                <Variable className="size-2.5" />
                {variableLabel(boundWalletVar)}
              </PaneHeaderBadge>
            )}
            {boundTimeframeVar && (
              <PaneHeaderBadge>
                <Variable className="size-2.5" />
                {variableLabel(boundTimeframeVar)}
              </PaneHeaderBadge>
            )}
            <span className="flex-1" />
            {/* Shrinks far faster than the title: in a narrow column the
                metric gives up its room first, and a pane never ends up
                labelled "C..." beside a full sentence of metadata. */}
            <span
              ref={setOwnSlot}
              className="flex min-w-0 shrink-[99] items-center gap-2 overflow-hidden"
            />
            {/* Laid out at rest, invisible at rest. Reserving the box is what
                keeps the trailing metric from twitching as the pointer
                crosses panes. */}
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('layout.pane.close', { pane: paneLabel })}
              className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity duration-[130ms] ease-out group-hover/pane:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
            <span
              ref={setActivatorNodeRef}
              aria-label={t('layout.pane.move', { pane: paneLabel })}
              className="-mr-1 flex size-[18px] shrink-0 cursor-grab items-center justify-center rounded-[5px] text-muted-foreground opacity-[0.28] transition-opacity duration-[130ms] ease-out group-hover/pane:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden active:cursor-grabbing"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-3" strokeWidth={2.5} />
            </span>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={handlePopToColumn}>
              <Columns3 className="size-3.5" />
              {t('layout.pane.popOutToColumn')}
            </ContextMenuItem>

            {/* Variable binding submenus */}
            {requiresPair && hasWorkspaceVars && (
              <BindToVariableSubmenu
                paneId={paneId}
                slot="active-pair"
                varType="pair"
                label={t('layout.pane.bindPairToVariable')}
                currentBinding={boundVar}
              />
            )}
            {requiresWallet && hasWorkspaceVars && (
              <BindToVariableSubmenu
                paneId={paneId}
                slot="active-wallet"
                varType="wallet"
                label={t('layout.pane.bindWalletToVariable')}
                currentBinding={boundWalletVar}
              />
            )}
            {requiresPair && hasWorkspaceVars && (
              <BindToVariableSubmenu
                paneId={paneId}
                slot="active-timeframe"
                varType="timeframe"
                label={t('layout.pane.bindTimeframeToVariable')}
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
                {t('layout.pane.clearPairOverride')}
              </ContextMenuItem>
            )}

            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={handleClose}>
              <X className="size-3.5" />
              {t('layout.pane.closePane')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
      <div
        className={cn(
          '@container/pane flex min-h-0 flex-1 flex-col overflow-hidden',
          // 6px between a pane's name and its data. The only gap in the pane.
          showHeader && 'mt-1.5',
        )}
      >
        <PaneHeaderSlotProvider value={headerSlot}>
          <LayoutPaneRenderer type={paneType} paneId={paneId} />
        </PaneHeaderSlotProvider>
      </div>
      {/* One line here is what makes EVERY pane something the assistant
          can point at, current ones and any a plugin adds later. The id
          is the pane type rather than the instance: `pane:chart` is
          what the model reads and reasons about, and two chart panes
          are one answer to "show me the chart". */}
      <AiSpotlight
        id={`pane:${paneType}`}
        label={paneLabel}
        description={`The ${paneLabel} pane.`}
      />
    </div>
  )
})

/**
 * A binding or override, said as quietly as the header allows.
 *
 * Not `<Badge>`: the design-system badge carries its own border and padding
 * scale, and at 20px of header height a bordered chip is a second box inside
 * a row that is trying to be a line of text.
 */
function PaneHeaderBadge({
  children,
  mono,
}: {
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-0.5 rounded-[4px] bg-muted px-1 text-[9.5px] leading-[14px] text-muted-foreground',
        mono && 'font-mono tabular-nums',
      )}
    >
      {children}
    </span>
  )
}

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
  const { t } = useTranslation()
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
                {t('common.active')}
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
              {t('layout.pane.unbind')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
