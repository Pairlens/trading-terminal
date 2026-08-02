// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@pairlens/ui'

// Force resting state against the frozen capture clock (zoom/fade entrance).
const freeze = `
  [data-slot='dropdown-menu-content'] {
    transform: none !important;
    opacity: 1 !important;
    animation: none !important;
  }
`

export const VenueMenu = () => (
  <div style={{ padding: 16, minHeight: 360 }}>
    <style>{freeze}</style>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 32,
          padding: '0 12px',
          fontSize: 14,
          fontWeight: 500,
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        OKX · Global
      </DropdownMenuTrigger>
      <DropdownMenuContent style={{ width: 240 }}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Account · ai.agent</DropdownMenuLabel>
          <DropdownMenuItem>
            Switch venue
            <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Command palette
            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Account settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Preferences</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>
            Paper trading
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>
            Confirm each order
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          Disconnect keys
          <DropdownMenuShortcut>⇧⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
