// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'
import type { ChartContextMenuPayload } from '@pairlens/fast-financial-charts/types'

type ChartContextMenuProps = {
  state: (ChartContextMenuPayload & { clientX: number; clientY: number }) | null
  onClose: () => void
  onAddIndicator: () => void
  onAddAlert: (price: number) => void
  onDrawHLine: (price: number) => void
  onDrawTrendLine: () => void
  onDrawRay: () => void
  onDrawArrow: () => void
  onDrawFibonacci: () => void
  onFitContent: () => void
  onScrollToLatest: () => void
  onDeleteDrawing: (id: string) => void
}

export function ChartContextMenu({
  state,
  onClose,
  onAddIndicator,
  onAddAlert,
  onDrawHLine,
  onDrawTrendLine,
  onDrawRay,
  onDrawArrow,
  onDrawFibonacci,
  onFitContent,
  onScrollToLatest,
  onDeleteDrawing,
}: ChartContextMenuProps) {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLDivElement>(null)

  // Programmatically open the context menu by dispatching a contextmenu event on our trigger
  useEffect(() => {
    if (!state || !triggerRef.current) return
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: state.clientX,
      clientY: state.clientY,
    })
    triggerRef.current.dispatchEvent(event)
  }, [state])

  if (!state) return null

  const nearestPrice = state.nearestBar?.close
  const hasSelection = state.selectedDrawingId !== null

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ContextMenuTrigger
        ref={triggerRef}
        className="pointer-events-none"
        style={{
          position: 'fixed',
          left: state.clientX,
          top: state.clientY,
          width: 1,
          height: 1,
        }}
      />
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onClick={() => {
            onAddIndicator()
            onClose()
          }}
        >
          {t('chart.contextMenu.addIndicator')}
          <ContextMenuShortcut>⌘I</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {nearestPrice != null && (
          <ContextMenuItem
            onClick={() => {
              onDrawHLine(nearestPrice)
              onClose()
            }}
          >
            {t('chart.contextMenu.horizontalLineAt', {
              price: nearestPrice.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              }),
            })}
            <ContextMenuShortcut>⌥H</ContextMenuShortcut>
          </ContextMenuItem>
        )}

        <ContextMenuItem
          onClick={() => {
            onDrawTrendLine()
            onClose()
          }}
        >
          {t('chart.contextMenu.trendLine')}
          <ContextMenuShortcut>⌥T</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => {
            onDrawRay()
            onClose()
          }}
        >
          {t('chart.contextMenu.ray')}
          <ContextMenuShortcut>⌥Y</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => {
            onDrawArrow()
            onClose()
          }}
        >
          {t('chart.contextMenu.arrow')}
          <ContextMenuShortcut>⌥A</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => {
            onDrawFibonacci()
            onClose()
          }}
        >
          {t('chart.contextMenu.fibonacciRetracement')}
          <ContextMenuShortcut>⌥F</ContextMenuShortcut>
        </ContextMenuItem>

        {nearestPrice != null && (
          <ContextMenuItem
            onClick={() => {
              onAddAlert(nearestPrice)
              onClose()
            }}
          >
            {t('chart.contextMenu.addAlertAt', {
              price: nearestPrice.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              }),
            })}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => {
            onFitContent()
            onClose()
          }}
        >
          {t('chart.contextMenu.fitContent')}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => {
            onScrollToLatest()
            onClose()
          }}
        >
          {t('chart.contextMenu.scrollToLatest')}
        </ContextMenuItem>

        {hasSelection && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                if (state.selectedDrawingId) {
                  onDeleteDrawing(state.selectedDrawingId)
                }
                onClose()
              }}
            >
              {t('chart.contextMenu.deleteDrawing')}
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
