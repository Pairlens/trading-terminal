// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarCheckboxItem,
} from '@pairlens/ui'

// Force resting state against the frozen capture clock (zoom/fade entrance).
const freeze = `
  [data-slot='menubar-content'],
  [data-slot='menubar-sub-content'] {
    transform: none !important;
    opacity: 1 !important;
    animation: none !important;
  }
`

export const TerminalMenubar = () => (
  <div style={{ padding: 16, minHeight: 320 }}>
    <style>{freeze}</style>
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
      </MenubarMenu>
      <MenubarMenu defaultOpen modal={false}>
        <MenubarTrigger>Order</MenubarTrigger>
        <MenubarContent style={{ width: 220 }}>
          <MenubarItem>
            Market buy
            <MenubarShortcut>⌘B</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Market sell
            <MenubarShortcut>⌘S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Limit order…
            <MenubarShortcut>⌘L</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem checked>Reduce-only</MenubarCheckboxItem>
          <MenubarCheckboxItem>Post-only</MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem variant="destructive">
            Cancel all
            <MenubarShortcut>⇧⌘X</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  </div>
)
