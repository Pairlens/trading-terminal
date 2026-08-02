// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@pairlens/ui'

export const CommandPalette = () => (
  <div style={{ padding: 16, minHeight: 360 }}>
    <div
      style={{
        width: 420,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
        overflow: 'hidden',
      }}
    >
      <Command>
        <CommandInput placeholder="Search pairs, workflows, actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Markets">
            <CommandItem>
              Go to BTC/USDT
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem>
              Go to ETH/USDT
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
            <CommandItem>Go to SOL/USDT</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem>
              New workflow
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem>
              Place order
              <CommandShortcut>⌘O</CommandShortcut>
            </CommandItem>
            <CommandItem>Ask AI co-pilot</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Venues">
            <CommandItem>Switch to OKX</CommandItem>
            <CommandItem>Switch to Binance</CommandItem>
            <CommandItem>Switch to Coinbase</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  </div>
)
