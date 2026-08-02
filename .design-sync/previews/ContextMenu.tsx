// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
} from '@pairlens/ui'

// Force resting state against the frozen capture clock (zoom/fade entrance).
const freeze = `
  [data-slot='context-menu-content'] {
    transform: none !important;
    opacity: 1 !important;
    animation: none !important;
  }
`

export const ChartActions = () => (
  <div style={{ padding: 16, minHeight: 380 }}>
    <style>{freeze}</style>
    <ContextMenu defaultOpen>
      <ContextMenuTrigger
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 120,
          width: 320,
          borderRadius: 'var(--radius)',
          border: '1px dashed var(--border)',
          background: 'var(--card)',
          color: 'var(--muted-foreground)',
          fontSize: 13,
        }}
      >
        BTC/USDT · Long 0.25 @ 68,430
      </ContextMenuTrigger>
      <ContextMenuContent style={{ width: 224 }}>
        <ContextMenuGroup>
          <ContextMenuLabel>BTC/USDT position</ContextMenuLabel>
          <ContextMenuItem>
            Add price alert
            <ContextMenuShortcut>⌘A</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            Set stop-loss
            <ContextMenuShortcut>⌘L</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>Take profit</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>
          Show liquidity
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>Snap to grid</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          Close position
          <ContextMenuShortcut>⇧⌘C</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  </div>
)
